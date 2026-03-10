// =============================================================================
// Tetris con IA Evolutiva - Clase Tetris (Lógica principal del juego)
// Autor: Joan L.
// Descripción: Gestiona una partida completa de Tetris incluyendo generación
//              de piezas (7-bag), gravedad, puntuación, nivel, hold, pieza
//              fantasma, lock delay y DAS. Interfaz compartida entre jugador e IA.
// =============================================================================
#pragma once

#include "Constantes.h"
#include "Tablero.h"
#include "Pieza.h"
#include <vector>
#include <deque>
#include <random>

namespace tetris {

// Estadísticas de una partida
struct EstadisticasPartida {
    int puntuacion = 0;
    int nivel = 0;
    int lineasTotales = 0;
    int tetrisCount = 0;           // Número de Tetrises (4 líneas a la vez)
    int piezasColocadas = 0;
    float tiempoSupervivencia = 0.0f;
    std::array<int, 4> lineasPorTipo = {0, 0, 0, 0}; // 1, 2, 3, 4 líneas
};

class Tetris {
public:
    // Semilla aleatoria (0 = aleatoria auto)
    explicit Tetris(unsigned int semilla = 0);

    // Ejecuta una acción en el juego (movimiento del jugador o la IA)
    void ejecutarAccion(Accion accion);

    // Actualiza el estado del juego (gravedad, timers). dt en segundos.
    void actualizar(float dt);

    // Reinicia la partida completamente
    void reiniciar();

    // ---- Estado del juego ----
    EstadoJuego obtenerEstado() const { return estado_; }
    bool estaGameOver() const { return estado_ == EstadoJuego::GAME_OVER; }
    void pausar();
    void reanudar();

    // ---- Getters principales ----
    const Tablero& obtenerTablero() const { return tablero_; }
    const Pieza& obtenerPiezaActual() const { return piezaActual_; }
    const Pieza& obtenerPiezaFantasma() const { return fantasma_; }
    TipoPieza obtenerPiezaHold() const { return piezaHold_; }
    const std::deque<TipoPieza>& obtenerSiguientes() const { return bolsa_; }
    const EstadisticasPartida& obtenerEstadisticas() const { return stats_; }
    int obtenerPuntuacion() const { return stats_.puntuacion; }
    int obtenerNivel() const { return stats_.nivel; }
    int obtenerLineas() const { return stats_.lineasTotales; }

    // ---- Para la IA ----

    // Obtiene el vector de entrada completo para la red neuronal
    std::vector<float> obtenerEntradaIA() const;

    // Calcula la aptitud (fitness) acumulada de esta partida
    float calcularFitness() const;

    // Ejecuta un solo paso lógico (para simulación rápida sin dt real)
    void ejecutarPasoLogico();

    // Activa/desactiva el hold de pieza
    void realizarHold();

private:
    Tablero tablero_;
    Pieza piezaActual_;
    Pieza fantasma_;         // Pieza fantasma (previsualización de caída)
    TipoPieza piezaHold_;    // Pieza almacenada con hold
    bool holdUsado_;         // Indica si ya se usó hold en este turno

    EstadoJuego estado_;
    EstadisticasPartida stats_;

    // Sistema de bolsa de 7 piezas
    std::deque<TipoPieza> bolsa_;
    std::mt19937 rng_;

    // Temporizadores
    float timerGravedad_;
    float timerLock_;
    bool lockActivo_;

    // Velocidad de caída según nivel
    float obtenerVelocidadGravedad() const;

    // Genera la siguiente pieza de la bolsa
    Pieza generarSiguientePieza();

    // Rellena la bolsa cuando quedan pocas piezas
    void rellenarBolsa();

    // Intenta rotar con wall kicks (SRS)
    bool intentarRotacion(int sentido);

    // Fija la pieza actual y genera la siguiente
    void fijarPieza();

    // Actualiza la posición de la pieza fantasma
    void actualizarFantasma();
};

} // namespace tetris
