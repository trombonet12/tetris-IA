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
    , accionesPiezaActual_(0)
    , piezasAlInicioAccion_(0)
{
}

void Agente::jugarPaso() {
    if (!estaActivo()) return;

    // Detectar si se colocó una nueva pieza (reiniciar contador)
    int piezasAhora = tetris_.obtenerEstadisticas().piezasColocadas;
    if (piezasAhora != piezasAlInicioAccion_) {
        accionesPiezaActual_ = 0;
        piezasAlInicioAccion_ = piezasAhora;
    }

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

    // 4. Si se excede el límite de acciones por pieza, forzar caída dura
    ++accionesPiezaActual_;
    if (accionesPiezaActual_ > MAX_ACCIONES_POR_PIEZA) {
        mejorAccion = static_cast<int>(Accion::CAIDA_DURA);
    }

    ultimaAccion_ = static_cast<Accion>(mejorAccion);

    // 5. Ejecutar la acción en el juego
    tetris_.ejecutarAccion(ultimaAccion_);

    // 6. Solo aplicar gravedad cada IA_ACCIONES_POR_GRAVEDAD acciones
    //    Esto da tiempo a la IA para rotar y posicionar antes de que caiga
    if (accionesPiezaActual_ % IA_ACCIONES_POR_GRAVEDAD == 0) {
        tetris_.ejecutarPasoLogico();
    }
}

void Agente::reiniciar(unsigned int semilla) {
    tetris_.reiniciar();
    ultimaSalida_.clear();
    ultimaAccion_ = Accion::BAJAR_SUAVE;
    accionesPiezaActual_ = 0;
    piezasAlInicioAccion_ = 0;
}

} // namespace tetris
