// =============================================================================
// Tetris con IA Evolutiva - Implementación de Tetris (Lógica principal)
// Autor: Joan L.
// Descripción: Motor completo de una partida de Tetris con 7-bag, gravedad
//              progresiva, lock delay, DAS, hold, pieza fantasma y puntuación
//              con bonus por Tetris. Interfaz compartida jugador/IA.
// =============================================================================
#include "juego/Tetris.h"
#include <algorithm>
#include <numeric>
#include <cmath>
#include <chrono>

namespace tetris {

Tetris::Tetris(unsigned int semilla)
    : piezaHold_(TipoPieza::NINGUNA)
    , holdUsado_(false)
    , estado_(EstadoJuego::JUGANDO)
    , timerGravedad_(0.0f)
    , timerLock_(0.0f)
    , lockActivo_(false)
{
    if (semilla == 0) {
        semilla = static_cast<unsigned int>(
            std::chrono::steady_clock::now().time_since_epoch().count());
    }
    rng_.seed(semilla);

    rellenarBolsa();
    piezaActual_ = generarSiguientePieza();
    actualizarFantasma();
}

void Tetris::ejecutarAccion(Accion accion) {
    if (estado_ != EstadoJuego::JUGANDO) return;

    switch (accion) {
        case Accion::MOVER_IZQUIERDA:
            piezaActual_.mover(0, -1);
            if (tablero_.verificarColision(piezaActual_)) {
                piezaActual_.mover(0, 1); // Deshacer
            } else {
                // Si el movimiento lateral resuelve la colisión abajo, reiniciar lock
                if (lockActivo_) timerLock_ = 0.0f;
            }
            break;

        case Accion::MOVER_DERECHA:
            piezaActual_.mover(0, 1);
            if (tablero_.verificarColision(piezaActual_)) {
                piezaActual_.mover(0, -1);
            } else {
                if (lockActivo_) timerLock_ = 0.0f;
            }
            break;

        case Accion::ROTAR_HORARIO:
            if (intentarRotacion(1)) {
                if (lockActivo_) timerLock_ = 0.0f;
            }
            break;

        case Accion::ROTAR_ANTIHORARIO:
            if (intentarRotacion(-1)) {
                if (lockActivo_) timerLock_ = 0.0f;
            }
            break;

        case Accion::BAJAR_SUAVE:
            piezaActual_.mover(1, 0);
            if (tablero_.verificarColision(piezaActual_)) {
                piezaActual_.mover(-1, 0);
            } else {
                stats_.puntuacion += 1; // Punto por bajar manualmente
                timerGravedad_ = 0.0f;
            }
            break;

        case Accion::CAIDA_DURA: {
            // Calcular distancia de caída para puntos
            int filaInicial = piezaActual_.obtenerFila();
            int filaFantasma = tablero_.calcularFilaFantasma(piezaActual_);
            stats_.puntuacion += (filaFantasma - filaInicial) * 2;
            piezaActual_.establecerPosicion(filaFantasma, piezaActual_.obtenerColumna());
            fijarPieza();
            break;
        }

        case Accion::HOLD:
            realizarHold();
            break;

        default:
            break;
    }

    actualizarFantasma();
}

void Tetris::actualizar(float dt) {
    if (estado_ != EstadoJuego::JUGANDO) return;

    stats_.tiempoSupervivencia += dt;

    float velocidad = obtenerVelocidadGravedad();
    timerGravedad_ += dt;

    // Gravedad: bajar la pieza automáticamente
    float intervaloGravedad = 1.0f / velocidad;
    while (timerGravedad_ >= intervaloGravedad) {
        timerGravedad_ -= intervaloGravedad;

        piezaActual_.mover(1, 0);
        if (tablero_.verificarColision(piezaActual_)) {
            piezaActual_.mover(-1, 0);

            // Activar lock delay si la pieza está apoyada
            if (!lockActivo_) {
                lockActivo_ = true;
                timerLock_ = 0.0f;
            }
        } else {
            // La pieza ha bajado: desactivar lock si estaba activo
            lockActivo_ = false;
        }
    }

    // Lock delay: fijar pieza si ha pasado el tiempo
    if (lockActivo_) {
        timerLock_ += dt;
        if (timerLock_ >= LOCK_DELAY) {
            fijarPieza();
        }
    }

    actualizarFantasma();
}

void Tetris::ejecutarPasoLogico() {
    if (estado_ != EstadoJuego::JUGANDO) return;

    // Un paso lógico: bajar la pieza una posición
    piezaActual_.mover(1, 0);
    if (tablero_.verificarColision(piezaActual_)) {
        piezaActual_.mover(-1, 0);
        // Fijar inmediatamente en modo lógico (sin lock delay para la IA)
        fijarPieza();
    }
    actualizarFantasma();
}

void Tetris::reiniciar() {
    tablero_.reiniciar();
    bolsa_.clear();
    rellenarBolsa();

    piezaActual_ = generarSiguientePieza();
    piezaHold_ = TipoPieza::NINGUNA;
    holdUsado_ = false;
    estado_ = EstadoJuego::JUGANDO;
    stats_ = EstadisticasPartida{};
    timerGravedad_ = 0.0f;
    timerLock_ = 0.0f;
    lockActivo_ = false;

    actualizarFantasma();
}

void Tetris::pausar() {
    if (estado_ == EstadoJuego::JUGANDO)
        estado_ = EstadoJuego::PAUSA;
}

void Tetris::reanudar() {
    if (estado_ == EstadoJuego::PAUSA)
        estado_ = EstadoJuego::JUGANDO;
}

void Tetris::realizarHold() {
    if (estado_ != EstadoJuego::JUGANDO || holdUsado_) return;

    TipoPieza tipoActual = piezaActual_.obtenerTipo();

    if (piezaHold_ == TipoPieza::NINGUNA) {
        // Primera vez que se usa hold: guardar pieza y sacar la siguiente
        piezaHold_ = tipoActual;
        piezaActual_ = generarSiguientePieza();
    } else {
        // Intercambiar pieza actual con la del hold
        TipoPieza tipoHold = piezaHold_;
        piezaHold_ = tipoActual;
        piezaActual_ = Pieza(tipoHold);
    }

    holdUsado_ = true;
    lockActivo_ = false;
    timerGravedad_ = 0.0f;
    actualizarFantasma();
}

std::vector<float> Tetris::obtenerEntradaIA() const {
    std::vector<float> entrada;
    entrada.reserve(NN_TAM_ENTRADA);

    // 1. Estado del tablero (200 valores)
    auto estadoTablero = tablero_.obtenerEstado();
    // obtenerEstado() ya incluye tablero + alturas + huecos = 200 + 10 + 1 = 211
    // Necesitamos separar para añadir la pieza one-hot en medio

    // Tablero aplanado (200)
    for (int i = 0; i < NN_TAM_TABLERO; ++i) {
        entrada.push_back(estadoTablero[i]);
    }

    // 2. Tipo de pieza actual (one-hot, 7 valores)
    for (int i = 0; i < NUM_TIPOS_PIEZA; ++i) {
        entrada.push_back(static_cast<int>(piezaActual_.obtenerTipo()) == i ? 1.0f : 0.0f);
    }

    // 3. Posición de la pieza actual (3 valores normalizados)
    entrada.push_back(static_cast<float>(piezaActual_.obtenerColumna()) / TABLERO_ANCHO);
    entrada.push_back(static_cast<float>(piezaActual_.obtenerFila()) / TABLERO_ALTO_TOTAL);
    entrada.push_back(static_cast<float>(piezaActual_.obtenerRotacion()) / 4.0f);

    // 4. Pieza siguiente (one-hot, 7 valores)
    TipoPieza siguiente = bolsa_.empty() ? TipoPieza::NINGUNA : bolsa_.front();
    for (int i = 0; i < NUM_TIPOS_PIEZA; ++i) {
        entrada.push_back(static_cast<int>(siguiente) == i ? 1.0f : 0.0f);
    }

    // 5. Pieza en hold (one-hot, 7 valores; todos 0 si no hay pieza en hold)
    for (int i = 0; i < NUM_TIPOS_PIEZA; ++i) {
        entrada.push_back(
            (piezaHold_ != TipoPieza::NINGUNA && static_cast<int>(piezaHold_) == i)
            ? 1.0f : 0.0f);
    }

    // 6. Hold disponible este turno (1 = puede hacer hold, 0 = ya se usó)
    entrada.push_back(holdUsado_ ? 0.0f : 1.0f);

    // 7. Alturas por columna normalizadas (10)
    for (int i = 0; i < NN_TAM_ALTURAS; ++i) {
        entrada.push_back(estadoTablero[NN_TAM_TABLERO + i]);
    }

    // 8. Huecos normalizado (1)
    entrada.push_back(estadoTablero[NN_TAM_TABLERO + NN_TAM_ALTURAS]);

    // 9. Bumpiness normalizada (1)
    entrada.push_back(estadoTablero[NN_TAM_TABLERO + NN_TAM_ALTURAS + NN_TAM_HUECOS]);

    return entrada;
}

float Tetris::calcularFitness() const {
    float fitness = 0.0f;

    // Recompensa por supervivencia (piezas colocadas) — señal principal temprana
    fitness += stats_.piezasColocadas * FITNESS_POR_PIEZA;

    // Bonus progresivo por supervivencia: recompensar partidas largas
    if (stats_.piezasColocadas > 50) {
        fitness += (stats_.piezasColocadas - 50) * FITNESS_BONUS_SUPERVIVENCIA_50;
    }
    if (stats_.piezasColocadas > 200) {
        fitness += (stats_.piezasColocadas - 200) * FITNESS_BONUS_SUPERVIVENCIA_200;
    }

    // Recompensa por líneas limpiadas
    fitness += stats_.lineasTotales * FITNESS_POR_LINEA;

    // Recompensa masiva por Tetris (4 líneas a la vez)
    fitness += stats_.tetrisCount * FITNESS_POR_TETRIS;

    // Penalización por game over prematuro
    if (estado_ == EstadoJuego::GAME_OVER && stats_.piezasColocadas < FITNESS_PIEZAS_MINIMAS) {
        fitness += FITNESS_PENALIZACION_GAME_OVER;
    }

    // Penalizaciones basadas en PROMEDIOS REALES durante la partida
    // Un agente que mantiene altura promedio 5 recibe siempre la misma penalización,
    // sin importar cuántas piezas colocó. Así no se penaliza la supervivencia.
    if (stats_.piezasColocadas > 0) {
        float invPiezas = 1.0f / stats_.piezasColocadas;
        float avgAltura = stats_.sumaAltura * invPiezas;
        float avgHuecos = stats_.sumaHuecos * invPiezas;
        float avgBumpiness = stats_.sumaBumpiness * invPiezas;

        fitness += avgAltura * FITNESS_PENALIZACION_ALTURA;
        fitness += avgHuecos * FITNESS_POR_HUECO;
        fitness += avgBumpiness * FITNESS_PENALIZACION_BUMPINESS;
    }

    // Recompensa por filas casi completas (estado actual del tablero)
    fitness += tablero_.contarFilasCasiCompletas() * FITNESS_POR_FILA_CASI_COMPLETA;

    return fitness;
}

float Tetris::obtenerVelocidadGravedad() const {
    // Fórmula de gravedad del Tetris NES modificada
    // Velocidad aumenta exponencialmente con el nivel
    float nivel = static_cast<float>(stats_.nivel);
    return GRAVEDAD_INICIAL * std::pow(1.3f, nivel);
}

Pieza Tetris::generarSiguientePieza() {
    if (bolsa_.size() <= NUM_TIPOS_PIEZA) {
        rellenarBolsa();
    }

    TipoPieza tipo = bolsa_.front();
    bolsa_.pop_front();

    return Pieza(tipo);
}

void Tetris::rellenarBolsa() {
    // Sistema de bolsa de 7: todas las piezas aparecen una vez por bolsa
    std::array<TipoPieza, NUM_TIPOS_PIEZA> nuevaBolsa;
    for (int i = 0; i < NUM_TIPOS_PIEZA; ++i) {
        nuevaBolsa[i] = static_cast<TipoPieza>(i);
    }
    std::shuffle(nuevaBolsa.begin(), nuevaBolsa.end(), rng_);

    for (auto tipo : nuevaBolsa) {
        bolsa_.push_back(tipo);
    }
}

bool Tetris::intentarRotacion(int sentido) {
    int rotacionOriginal = piezaActual_.obtenerRotacion();
    const auto& kicks = piezaActual_.obtenerWallKicks(rotacionOriginal, sentido);

    piezaActual_.rotar(sentido);

    // Probar cada offset de wall kick
    for (const auto& kick : kicks) {
        piezaActual_.mover(kick.fila, kick.col);
        if (!tablero_.verificarColision(piezaActual_)) {
            return true; // Rotación exitosa con este kick
        }
        piezaActual_.mover(-kick.fila, -kick.col); // Deshacer offset
    }

    // Ningún kick funcionó: deshacer rotación
    piezaActual_.rotar(-sentido);
    return false;
}

void Tetris::fijarPieza() {
    tablero_.colocarPieza(piezaActual_);
    stats_.piezasColocadas++;

    // Limpiar líneas completas
    int lineas = tablero_.limpiarLineas();

    // Acumular métricas del tablero DESPUÉS de limpiar líneas
    // (refleja la calidad real del tablero tras cada pieza)
    stats_.sumaHuecos += static_cast<float>(tablero_.contarHuecos());
    stats_.sumaAltura += tablero_.obtenerAlturaMedia();
    stats_.sumaBumpiness += static_cast<float>(tablero_.calcularBumpiness());

    if (lineas > 0) {
        stats_.lineasTotales += lineas;

        // Puntuación según el número de líneas
        int puntos = 0;
        switch (lineas) {
            case 1: puntos = PUNTOS_UNA_LINEA; break;
            case 2: puntos = PUNTOS_DOS_LINEAS; break;
            case 3: puntos = PUNTOS_TRES_LINEAS; break;
            case 4:
                puntos = PUNTOS_TETRIS;
                stats_.tetrisCount++;
                break;
        }
        stats_.puntuacion += puntos * (stats_.nivel + 1);

        // Registrar tipo de limpieza
        if (lineas >= 1 && lineas <= 4) {
            stats_.lineasPorTipo[lineas - 1]++;
        }

        // Subir de nivel
        stats_.nivel = stats_.lineasTotales / LINEAS_POR_NIVEL;
    }

    // Comprobar game over
    if (tablero_.estaDesbordado()) {
        estado_ = EstadoJuego::GAME_OVER;
        return;
    }

    // Generar siguiente pieza
    piezaActual_ = generarSiguientePieza();
    holdUsado_ = false;
    lockActivo_ = false;
    timerGravedad_ = 0.0f;

    // Comprobar si la nueva pieza colisiona inmediatamente (game over)
    if (tablero_.verificarColision(piezaActual_)) {
        estado_ = EstadoJuego::GAME_OVER;
    }
}

void Tetris::actualizarFantasma() {
    fantasma_ = piezaActual_;
    int filaFantasma = tablero_.calcularFilaFantasma(piezaActual_);
    fantasma_.establecerPosicion(filaFantasma, piezaActual_.obtenerColumna());
}

} // namespace tetris
