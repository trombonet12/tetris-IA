// =============================================================================
// Tetris con IA Evolutiva - Implementación del Entrenador
// Autor: Joan L.
// Descripción: Gestiona el ciclo evolutivo completo: crea generaciones,
//              simula partidas en paralelo, calcula fitness y evoluciona
//              la población. Se ejecuta en su propio hilo para no bloquear
//              la interfaz gráfica.
// =============================================================================
#include "ia/Entrenador.h"
#include "ia/RedNeuronal.h"
#include <algorithm>
#include <chrono>
#include <numeric>

namespace tetris {

Entrenador::Entrenador()
    : tamPoblacion_(AG_POBLACION_DEFECTO)
    , arquitecturaRed_(NN_ARQUITECTURA_DEFECTO)
    , velocidadSimulacion_(VELOCIDAD_X1)
    , estado_(EstadoEntrenamiento::DETENIDO)
    , generacionActual_(0)
    , mejorFitnessGlobal_(0.0f)
{
}

Entrenador::~Entrenador() {
    detener();
}

void Entrenador::configurar(int tamPoblacion, const std::vector<int>& arquitecturaRed) {
    if (estado_.load() != EstadoEntrenamiento::DETENIDO) return;
    tamPoblacion_ = tamPoblacion;
    arquitecturaRed_ = arquitecturaRed;
}

void Entrenador::iniciar() {
    if (estado_.load() != EstadoEntrenamiento::DETENIDO) return;

    estado_.store(EstadoEntrenamiento::EJECUTANDO);
    generacionActual_.store(0);
    mejorFitnessGlobal_.store(0.0f);

    {
        std::lock_guard<std::mutex> lock(mutexDatos_);
        historial_.clear();
        inicializarPoblacion();
    }

    // Lanzar hilo de entrenamiento
    hiloEntrenamiento_ = std::make_unique<std::thread>(&Entrenador::bucleEntrenamiento, this);
}

void Entrenador::pausar() {
    if (estado_.load() == EstadoEntrenamiento::EJECUTANDO) {
        estado_.store(EstadoEntrenamiento::PAUSADO);
    }
}

void Entrenador::reanudar() {
    if (estado_.load() == EstadoEntrenamiento::PAUSADO) {
        estado_.store(EstadoEntrenamiento::EJECUTANDO);
    }
}

void Entrenador::detener() {
    auto estadoAnterior = estado_.load();
    estado_.store(EstadoEntrenamiento::DETENIDO);

    if (hiloEntrenamiento_ && hiloEntrenamiento_->joinable()) {
        hiloEntrenamiento_->join();
    }
    hiloEntrenamiento_.reset();
}

void Entrenador::ejecutarPaso() {
    std::lock_guard<std::mutex> lock(mutexDatos_);

    // Avanzar un paso para cada agente activo
    bool todosTerminaron = true;
    for (auto& agente : agentes_) {
        if (agente.estaActivo()) {
            agente.jugarPaso();
            todosTerminaron = false;
        }
    }

    // Si todos terminaron, evolucionar
    if (todosTerminaron) {
        evolucionarGeneracion();
    }
}

std::vector<EstadisticasGeneracion> Entrenador::obtenerHistorial() const {
    std::lock_guard<std::mutex> lock(mutexDatos_);
    return historial_;
}

EstadisticasGeneracion Entrenador::obtenerEstadisticasActuales() const {
    std::lock_guard<std::mutex> lock(mutexDatos_);
    return statsActuales_;
}

int Entrenador::obtenerAgentesActivos() const {
    std::lock_guard<std::mutex> lock(mutexDatos_);
    int activos = 0;
    for (const auto& a : agentes_) {
        if (a.estaActivo()) ++activos;
    }
    return activos;
}

std::vector<Agente>& Entrenador::obtenerAgentes() {
    return agentes_;
}

const std::vector<Agente>& Entrenador::obtenerAgentes() const {
    return agentes_;
}

bool Entrenador::guardarMejorModelo(const std::string& ruta) const {
    std::lock_guard<std::mutex> lock(mutexDatos_);
    if (agentes_.empty()) return false;

    // Encontrar el mejor agente
    int mejorIdx = 0;
    float mejorFit = agentes_[0].obtenerFitness();
    for (int i = 1; i < static_cast<int>(agentes_.size()); ++i) {
        float fit = agentes_[i].obtenerFitness();
        if (fit > mejorFit) {
            mejorFit = fit;
            mejorIdx = i;
        }
    }

    return agentes_[mejorIdx].obtenerRed().guardar(ruta);
}

bool Entrenador::cargarModelo(const std::string& ruta) {
    std::lock_guard<std::mutex> lock(mutexDatos_);
    if (agentes_.empty()) return false;

    // Cargar pesos en el primer agente
    if (!agentes_[0].obtenerRed().cargar(ruta)) return false;

    // Copiar la arquitectura y pesos a todos los demás agentes (con mutación)
    auto pesosBase = agentes_[0].obtenerRed().obtenerPesos();
    for (int i = 1; i < static_cast<int>(agentes_.size()); ++i) {
        agentes_[i].obtenerRed().establecerPesos(pesosBase);
    }

    return true;
}

float Entrenador::obtenerProgreso() const {
    std::lock_guard<std::mutex> lock(mutexDatos_);
    if (agentes_.empty()) return 0.0f;

    int muertos = 0;
    for (const auto& a : agentes_) {
        if (!a.estaActivo()) ++muertos;
    }
    return static_cast<float>(muertos) / agentes_.size();
}

void Entrenador::bucleEntrenamiento() {
    while (estado_.load() != EstadoEntrenamiento::DETENIDO) {
        // Si está pausado, esperar
        if (estado_.load() == EstadoEntrenamiento::PAUSADO) {
            std::this_thread::sleep_for(std::chrono::milliseconds(50));
            continue;
        }

        // Simular la generación actual
        simularGeneracion();

        // Evolucionar a la siguiente generación
        {
            std::lock_guard<std::mutex> lock(mutexDatos_);
            evolucionarGeneracion();
        }

        // Comprobar si debemos detenernos
        if (estado_.load() == EstadoEntrenamiento::DETENIDO) break;
    }
}

void Entrenador::simularGeneracion() {
    // Simular hasta que todos los agentes hayan terminado
    bool todosTerminaron = false;

    // Lote máximo por adquisición de mutex para no bloquear el hilo de render
    constexpr int PASOS_POR_LOTE = 50;

    while (!todosTerminaron && estado_.load() == EstadoEntrenamiento::EJECUTANDO) {
        todosTerminaron = true;

        // Determinar cuántos pasos totales queremos este ciclo
        int pasosRestantes = static_cast<int>(velocidadSimulacion_);
        if (pasosRestantes < 1) pasosRestantes = 1;

        while (pasosRestantes > 0 && estado_.load() == EstadoEntrenamiento::EJECUTANDO) {
            int pasosLote = std::min(pasosRestantes, PASOS_POR_LOTE);
            pasosRestantes -= pasosLote;

            {
                std::lock_guard<std::mutex> lock(mutexDatos_);

                for (int paso = 0; paso < pasosLote; ++paso) {
                    // Recopilar entradas de agentes activos para evaluación por lotes
                    std::vector<RedNeuronal*> redesActivas;
                    std::vector<std::vector<float>> entradasActivas;
                    std::vector<int> indicesActivos;

                    for (int i = 0; i < static_cast<int>(agentes_.size()); ++i) {
                        if (agentes_[i].estaActivo()) {
                            redesActivas.push_back(&agentes_[i].obtenerRed());
                            entradasActivas.push_back(
                                agentes_[i].obtenerTetris().obtenerEntradaIA());
                            indicesActivos.push_back(i);
                        }
                    }

                    if (redesActivas.empty()) { pasosRestantes = 0; break; }

                    // Evaluación por lotes en GPU
                    auto salidas = RedNeuronal::evaluarLote(redesActivas, entradasActivas);

                    // Aplicar acciones
                    for (size_t j = 0; j < indicesActivos.size(); ++j) {
                        int idx = indicesActivos[j];
                        const auto& salida = salidas[j];

                        // Detectar si se colocó una nueva pieza (reiniciar contador)
                        int piezasAhora = agentes_[idx].obtenerTetris().obtenerEstadisticas().piezasColocadas;
                        if (piezasAhora != agentes_[idx].piezasAlInicioAccion_) {
                            agentes_[idx].accionesPiezaActual_ = 0;
                            agentes_[idx].piezasAlInicioAccion_ = piezasAhora;
                        }

                        // Encontrar mejor acción
                        int mejorAccion = 0;
                        float mejorValor = salida[0];
                        for (int a = 1; a < static_cast<int>(salida.size()); ++a) {
                            if (salida[a] > mejorValor) {
                                mejorValor = salida[a];
                                mejorAccion = a;
                            }
                        }

                        // Si se excede el límite, forzar caída dura
                        ++agentes_[idx].accionesPiezaActual_;
                        if (agentes_[idx].accionesPiezaActual_ > MAX_ACCIONES_POR_PIEZA) {
                            mejorAccion = static_cast<int>(Accion::CAIDA_DURA);
                        }

                        agentes_[idx].obtenerTetris().ejecutarAccion(
                            static_cast<Accion>(mejorAccion));
                        // Solo aplicar gravedad cada N acciones para dar tiempo a rotar/posicionar
                        if (agentes_[idx].accionesPiezaActual_ % IA_ACCIONES_POR_GRAVEDAD == 0) {
                            agentes_[idx].obtenerTetris().ejecutarPasoLogico();
                        }
                    }
                }

                // Verificar si todos terminaron
                todosTerminaron = true;
                for (const auto& a : agentes_) {
                    if (a.estaActivo()) {
                        todosTerminaron = false;
                        break;
                    }
                }
            } // mutex liberado aquí

            // Ceder tiempo al hilo principal para que pueda renderizar
            std::this_thread::sleep_for(std::chrono::microseconds(200));
        }

        // Pausa adicional a velocidades bajas para mantener framerate visual
        if (velocidadSimulacion_ < VELOCIDAD_X5) {
            std::this_thread::sleep_for(std::chrono::milliseconds(8));
        }
    }
}

void Entrenador::evolucionarGeneracion() {
    // Calcular fitness de cada agente
    std::vector<float> fitnesses(agentes_.size());
    std::vector<std::pair<std::vector<float>, float>> poblacionConFitness;

    for (int i = 0; i < static_cast<int>(agentes_.size()); ++i) {
        fitnesses[i] = agentes_[i].obtenerFitness();
        poblacionConFitness.push_back({
            agentes_[i].obtenerRed().obtenerPesos(),
            fitnesses[i]
        });
    }

    // Calcular estadísticas
    int gen = generacionActual_.load();
    statsActuales_ = ag_.calcularEstadisticas(fitnesses, gen);
    historial_.push_back(statsActuales_);

    // Actualizar mejor fitness global
    if (statsActuales_.mejorFitness > mejorFitnessGlobal_.load()) {
        mejorFitnessGlobal_.store(statsActuales_.mejorFitness);
    }

    // Evolucionar
    auto nuevosPesos = ag_.evolucionar(poblacionConFitness);

    // Aplicar nuevos pesos y reiniciar partidas
    for (int i = 0; i < static_cast<int>(agentes_.size()); ++i) {
        agentes_[i].obtenerRed().establecerPesos(nuevosPesos[i]);
        agentes_[i].reiniciar();
    }

    generacionActual_.fetch_add(1);
}

void Entrenador::inicializarPoblacion() {
    agentes_.clear();
    agentes_.reserve(tamPoblacion_);

    for (int i = 0; i < tamPoblacion_; ++i) {
        agentes_.emplace_back(arquitecturaRed_, static_cast<unsigned int>(i + 1));
    }
}

} // namespace tetris
