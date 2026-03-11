// =============================================================================
// Tetris con IA Evolutiva - Implementación del Entrenador
// Autor: Joan L.
// Descripción: Gestiona el ciclo evolutivo completo: crea generaciones,
//              cada agente juega una partida completa evaluando posiciones,
//              calcula fitness y evoluciona la población. Se ejecuta en su
//              propio hilo para no bloquear la interfaz gráfica.
// =============================================================================
#include "ia/Entrenador.h"
#include "ia/RedNeuronal.h"
#include "nucleo/GestorModelos.h"
#include <algorithm>
#include <chrono>
#include <numeric>
#include <ctime>
#include <sstream>
#include <iomanip>

namespace tetris {

Entrenador::Entrenador()
    : tamPoblacion_(AG_POBLACION_DEFECTO)
    , arquitecturaRed_(NN_ARQUITECTURA_DEFECTO)
    , velocidadSimulacion_(VELOCIDAD_X1)
    , estado_(EstadoEntrenamiento::DETENIDO)
    , generacionActual_(0)
    , mejorFitnessGlobal_(0.0f)
{
    unsigned int semilla = static_cast<unsigned int>(
        std::chrono::steady_clock::now().time_since_epoch().count());
    rng_.seed(semilla);
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

    // En el nuevo sistema, un "paso" = un agente activo coloca una pieza
    bool todosTerminaron = true;
    for (auto& agente : agentes_) {
        if (agente.estaActivo()) {
            agente.colocarPieza();
            todosTerminaron = false;
        }
    }

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

    // Usar GestorModelos para guardar con metadatos
    MetadatosModelo meta;
    meta.arquitectura = arquitecturaRed_;
    meta.generacion = generacionActual_.load();
    meta.fitness = mejorFit;
    meta.piezasColocadas = agentes_[mejorIdx].obtenerTetris().obtenerEstadisticas().piezasColocadas;
    meta.tetrisCount = agentes_[mejorIdx].obtenerTetris().obtenerEstadisticas().tetrisCount;

    // Fecha actual
    std::time_t ahora = std::time(nullptr);
    std::tm tm_local;
#ifdef _WIN32
    localtime_s(&tm_local, &ahora);
#else
    localtime_r(&ahora, &tm_local);
#endif
    std::ostringstream ss;
    ss << std::put_time(&tm_local, "%Y-%m-%d %H:%M:%S");
    meta.fecha = ss.str();

    return GestorModelos::guardar(ruta, agentes_[mejorIdx].obtenerRed(), meta);
}

bool Entrenador::cargarModelo(const std::string& ruta) {
    std::lock_guard<std::mutex> lock(mutexDatos_);
    if (agentes_.empty()) return false;

    // Intentar cargar con GestorModelos primero
    MetadatosModelo meta;
    bool cargado = GestorModelos::cargar(ruta, agentes_[0].obtenerRed(), meta);

    if (!cargado) {
        // Fallback: intentar con RedNeuronal::cargar (formato antiguo)
        cargado = agentes_[0].obtenerRed().cargar(ruta);
    }

    if (!cargado) return false;

    // Distribuir pesos con diversidad
    auto pesosBase = agentes_[0].obtenerRed().obtenerPesos();
    int numElite = std::max(1, tamPoblacion_ / 10); // 10% copia exacta

    // Agente 0: pesos originales (sin mutación)
    // Agentes 1..numElite: mutación leve
    // Agentes numElite..N: mutación fuerte
    std::normal_distribution<float> mutacionLeve(0.0f, AG_SIGMA_MUTACION);
    std::normal_distribution<float> mutacionFuerte(0.0f, AG_SIGMA_MUTACION * 3.0f);
    std::uniform_real_distribution<float> prob(0.0f, 1.0f);

    for (int i = 1; i < static_cast<int>(agentes_.size()); ++i) {
        auto pesos = pesosBase;
        if (i < numElite) {
            // Mutación leve
            for (auto& p : pesos) {
                if (prob(rng_) < AG_TASA_MUTACION) p += mutacionLeve(rng_);
            }
        } else {
            // Mutación fuerte
            for (auto& p : pesos) {
                if (prob(rng_) < 0.3f) p += mutacionFuerte(rng_);
            }
        }
        agentes_[i].obtenerRed().establecerPesos(pesos);
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

        // Auto-guardado cada N generaciones
        int gen = generacionActual_.load();
        if (gen > 0 && gen % GENERACIONES_AUTO_GUARDADO == 0) {
            std::string ruta = GestorModelos::generarNombreModelo(
                gen, mejorFitnessGlobal_.load());
            guardarMejorModelo(ruta);
        }

        // Comprobar si debemos detenernos
        if (estado_.load() == EstadoEntrenamiento::DETENIDO) break;
    }
}

void Entrenador::simularGeneracion() {
    // Modo animado (x1..x5): las piezas caen fila a fila para visualización
    // Modo rápido (x10+): placement instantáneo, máxima velocidad

    bool todosTerminaron = false;

    while (!todosTerminaron && estado_.load() == EstadoEntrenamiento::EJECUTANDO) {
        float vel = velocidadSimulacion_;

        if (vel < VELOCIDAD_X10) {
            // --- MODO ANIMADO: piezas caen visualmente ---
            {
                std::lock_guard<std::mutex> lock(mutexDatos_);

                todosTerminaron = true;
                for (auto& agente : agentes_) {
                    if (!agente.estaActivo()) continue;
                    todosTerminaron = false;

                    if (!agente.estaAnimando()) {
                        // IA decide y prepara la pieza (rotación + columna, sin drop)
                        agente.decidirSiguientePieza();
                    } else {
                        // Bajar la pieza una fila
                        agente.avanzarCaida();
                    }
                }
            }

            // Delay proporcional a la velocidad: x1=50ms, x2=25ms, x5=10ms
            int delayMs = std::max(2, static_cast<int>(50.0f / vel));
            std::this_thread::sleep_for(std::chrono::milliseconds(delayMs));

        } else {
            // --- MODO RÁPIDO: placement instantáneo ---
            int piezasPorLote = static_cast<int>(vel);
            if (piezasPorLote > 500) piezasPorLote = 500;

            {
                std::lock_guard<std::mutex> lock(mutexDatos_);

                todosTerminaron = true;
                for (auto& agente : agentes_) {
                    if (!agente.estaActivo()) continue;

                    for (int p = 0; p < piezasPorLote; ++p) {
                        if (!agente.colocarPieza()) break;
                    }
                    if (agente.estaActivo()) todosTerminaron = false;
                }
            }

            std::this_thread::sleep_for(std::chrono::microseconds(200));
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

    // Aplicar nuevos pesos y reiniciar partidas con seeds aleatorias
    for (int i = 0; i < static_cast<int>(agentes_.size()); ++i) {
        agentes_[i].obtenerRed().establecerPesos(nuevosPesos[i]);
        agentes_[i].reiniciar(rng_());
    }

    generacionActual_.fetch_add(1);
}

void Entrenador::inicializarPoblacion() {
    agentes_.clear();
    agentes_.reserve(tamPoblacion_);

    for (int i = 0; i < tamPoblacion_; ++i) {
        agentes_.emplace_back(arquitecturaRed_, rng_());
    }
}

} // namespace tetris
