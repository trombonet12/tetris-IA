// =============================================================================
// Tetris con IA Evolutiva - Implementación de Agente
// Autor: Joan L.
// Descripción: Combina una red neuronal con una instancia de Tetris.
//              Evalúa todas las posiciones posibles y elige la mejor.
// =============================================================================
#include "ia/Agente.h"
#include <algorithm>
#include <limits>

namespace tetris {

Agente::Agente(const std::vector<int>& arquitecturaRed, unsigned int semilla)
    : red_(arquitecturaRed)
    , tetris_(semilla)
    , ultimoScore_(-std::numeric_limits<float>::max())
{
}

bool Agente::colocarPieza() {
    if (!estaActivo()) return false;

    // 1. Enumerar todas las posiciones posibles
    auto posiciones = tetris_.enumerarPosiciones();
    if (posiciones.empty()) return false;

    // 2. Preparar entradas para evaluación batch
    std::vector<std::vector<float>> entradas;
    entradas.reserve(posiciones.size());
    for (const auto& pos : posiciones) {
        entradas.push_back(pos.features.aVector());
    }

    // 3. Evaluar todas las posiciones con la red neuronal
    // Para evaluación batch necesitamos punteros a la misma red
    std::vector<RedNeuronal*> redes(posiciones.size(), &red_);
    auto salidas = RedNeuronal::evaluarLote(redes, entradas);

    // 4. Encontrar la mejor posición
    posicionesEvaluadas_.clear();
    posicionesEvaluadas_.reserve(posiciones.size());

    int mejorIdx = 0;
    float mejorScore = -std::numeric_limits<float>::max();

    for (int i = 0; i < static_cast<int>(posiciones.size()); ++i) {
        float score = salidas[i].empty() ? -1e10f : salidas[i][0];
        posicionesEvaluadas_.push_back({posiciones[i], score});

        if (score > mejorScore) {
            mejorScore = score;
            mejorIdx = i;
        }
    }

    // 5. Ejecutar la mejor colocación
    ultimoScore_ = mejorScore;
    ultimaPosicion_ = posiciones[mejorIdx];

    return tetris_.ejecutarColocacion(
        posiciones[mejorIdx].rotacion,
        posiciones[mejorIdx].columna,
        posiciones[mejorIdx].usarHold
    );
}

bool Agente::decidirSiguientePieza() {
    if (!estaActivo()) return false;

    auto posiciones = tetris_.enumerarPosiciones();
    if (posiciones.empty()) return false;

    // Evaluar todas las posiciones con la red neuronal
    std::vector<std::vector<float>> entradas;
    entradas.reserve(posiciones.size());
    for (const auto& pos : posiciones) {
        entradas.push_back(pos.features.aVector());
    }

    std::vector<RedNeuronal*> redes(posiciones.size(), &red_);
    auto salidas = RedNeuronal::evaluarLote(redes, entradas);

    posicionesEvaluadas_.clear();
    posicionesEvaluadas_.reserve(posiciones.size());

    int mejorIdx = 0;
    float mejorScore = -std::numeric_limits<float>::max();

    for (int i = 0; i < static_cast<int>(posiciones.size()); ++i) {
        float score = salidas[i].empty() ? -1e10f : salidas[i][0];
        posicionesEvaluadas_.push_back({posiciones[i], score});
        if (score > mejorScore) {
            mejorScore = score;
            mejorIdx = i;
        }
    }

    ultimoScore_ = mejorScore;
    ultimaPosicion_ = posiciones[mejorIdx];

    // Preparar la pieza en posición (rotada y en columna) sin hard-drop
    bool ok = tetris_.prepararColocacion(
        posiciones[mejorIdx].rotacion,
        posiciones[mejorIdx].columna,
        posiciones[mejorIdx].usarHold
    );

    animando_ = ok;
    return ok;
}

bool Agente::avanzarCaida() {
    if (!animando_ || !estaActivo()) {
        animando_ = false;
        return false;
    }

    if (!tetris_.descenderUnPaso()) {
        // Pieza aterrizó
        animando_ = false;
        return false;
    }
    return true; // sigue cayendo
}

void Agente::jugarPartida(int maxPiezas) {
    while (estaActivo() && tetris_.obtenerEstadisticas().piezasColocadas < maxPiezas) {
        if (!colocarPieza()) break;
    }
}

void Agente::reiniciar(unsigned int semilla) {
    tetris_.reiniciar();
    ultimoScore_ = -std::numeric_limits<float>::max();
    ultimaPosicion_ = PosicionIA{};
    posicionesEvaluadas_.clear();
    animando_ = false;
}

} // namespace tetris
