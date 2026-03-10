// =============================================================================
// Tetris con IA Evolutiva - Implementación de Agente
// Autor: Joan L.
// Descripción: Combina una red neuronal con una instancia de Tetris.
//              En cada paso observa, decide y actúa.
// =============================================================================
#include "ia/Agente.h"
#include <algorithm>

namespace tetris {

Agente::Agente(const std::vector<int>& arquitecturaRed, unsigned int semilla)
    : red_(arquitecturaRed)
    , tetris_(semilla)
    , ultimaAccion_(Accion::BAJAR_SUAVE)
{
}

void Agente::jugarPaso() {
    if (!estaActivo()) return;

    // 1. Obtener el estado actual del juego como vector de entrada
    auto entrada = tetris_.obtenerEntradaIA();

    // 2. Evaluar la red neuronal
    ultimaSalida_ = red_.evaluar(entrada);

    // 3. Elegir la acción con mayor probabilidad
    int mejorAccion = 0;
    float mejorValor = ultimaSalida_[0];
    for (int i = 1; i < static_cast<int>(ultimaSalida_.size()); ++i) {
        if (ultimaSalida_[i] > mejorValor) {
            mejorValor = ultimaSalida_[i];
            mejorAccion = i;
        }
    }

    ultimaAccion_ = static_cast<Accion>(mejorAccion);

    // 4. Ejecutar la acción en el juego
    tetris_.ejecutarAccion(ultimaAccion_);

    // 5. Avanzar un paso lógico (gravedad)
    tetris_.ejecutarPasoLogico();
}

void Agente::reiniciar(unsigned int semilla) {
    tetris_.reiniciar();
    ultimaSalida_.clear();
    ultimaAccion_ = Accion::BAJAR_SUAVE;
}

} // namespace tetris
