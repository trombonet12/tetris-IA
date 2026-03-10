// =============================================================================
// Tetris con IA Evolutiva - Clase Agente
// Autor: Joan L.
// Descripción: Un agente combina una red neuronal con una instancia de Tetris.
//              En cada paso, observa el estado del tablero, lo pasa por la red
//              y ejecuta la acción con mayor probabilidad.
// =============================================================================
#pragma once

#include "RedNeuronal.h"
#include "../juego/Tetris.h"
#include <memory>

namespace tetris {

class Agente {
public:
    // Crea un agente con una red neuronal y una partida de Tetris
    Agente(const std::vector<int>& arquitecturaRed, unsigned int semilla = 0);

    // Ejecuta un paso: observar estado → evaluar red → ejecutar acción
    void jugarPaso();

    // Reinicia la partida del agente (mantiene la red neuronal)
    void reiniciar(unsigned int semilla = 0);

    // ---- Estado ----
    bool estaActivo() const { return !tetris_.estaGameOver(); }
    float obtenerFitness() const { return tetris_.calcularFitness(); }

    // ---- Acceso a componentes ----
    RedNeuronal& obtenerRed() { return red_; }
    const RedNeuronal& obtenerRed() const { return red_; }
    Tetris& obtenerTetris() { return tetris_; }
    const Tetris& obtenerTetris() const { return tetris_; }

    // Obtiene la última salida de la red (probabilidades de acción)
    const std::vector<float>& obtenerUltimaSalida() const { return ultimaSalida_; }

    // Obtiene la última acción ejecutada
    Accion obtenerUltimaAccion() const { return ultimaAccion_; }

    // El Entrenador accede a los contadores de acciones para el bucle batch GPU
    friend class Entrenador;

private:
    RedNeuronal red_;
    Tetris tetris_;
    std::vector<float> ultimaSalida_;
    Accion ultimaAccion_;
    int accionesPiezaActual_;      // Contador de acciones en la pieza actual
    int piezasAlInicioAccion_;     // Piezas colocadas al inicio de la acción
};

} // namespace tetris
