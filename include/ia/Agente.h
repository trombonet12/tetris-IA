// =============================================================================
// Tetris con IA Evolutiva - Clase Agente
// Autor: Joan L.
// Descripción: Un agente combina una red neuronal con una instancia de Tetris.
//              Evalúa todas las posiciones posibles para cada pieza y elige
//              la que obtiene mayor puntuación de la red neuronal.
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

    // Coloca la mejor pieza evaluando todas las posiciones posibles
    // Devuelve false si la partida ha terminado o no hay posiciones válidas
    bool colocarPieza();

    // --- Colocación animada (para visualizar la caída) ---

    // Decide la mejor posición y prepara la pieza (sin drop). Devuelve false si no puede.
    bool decidirSiguientePieza();

    // Baja la pieza un paso. Devuelve false si aterrizó o la partida terminó.
    bool avanzarCaida();

    // Indica si hay una pieza cayendo (animación en curso)
    bool estaAnimando() const { return animando_; }

    // Juega una partida completa hasta game over o límite de piezas
    void jugarPartida(int maxPiezas = MAX_PIEZAS_POR_PARTIDA);

    // Reinicia la partida del agente (mantiene la red neuronal)
    void reiniciar(unsigned int semilla = 0);

    // ---- Estado ----
    bool estaActivo() const {
        return !tetris_.estaGameOver() &&
               tetris_.obtenerEstadisticas().piezasColocadas < MAX_PIEZAS_POR_PARTIDA;
    }
    float obtenerFitness() const { return tetris_.calcularFitness(); }

    // ---- Acceso a componentes ----
    RedNeuronal& obtenerRed() { return red_; }
    const RedNeuronal& obtenerRed() const { return red_; }
    Tetris& obtenerTetris() { return tetris_; }
    const Tetris& obtenerTetris() const { return tetris_; }

    // Score del último placement elegido
    float obtenerUltimoScore() const { return ultimoScore_; }

    // Última posición elegida
    const PosicionIA& obtenerUltimaPosicion() const { return ultimaPosicion_; }

    // Todas las posiciones evaluadas del último turno (para visualización)
    const std::vector<std::pair<PosicionIA, float>>& obtenerPosicionesEvaluadas() const {
        return posicionesEvaluadas_;
    }

private:
    RedNeuronal red_;
    Tetris tetris_;
    float ultimoScore_;
    PosicionIA ultimaPosicion_;
    std::vector<std::pair<PosicionIA, float>> posicionesEvaluadas_;
    bool animando_ = false;
};

} // namespace tetris
