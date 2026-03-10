// =============================================================================
// Tetris con IA Evolutiva - Implementación de Pieza
// Autor: Joan L.
// Descripción: Lógica de las piezas del Tetris con sistema SRS y wall kicks.
// =============================================================================
#include "juego/Pieza.h"

namespace tetris {

Pieza::Pieza(TipoPieza tipo)
    : tipo_(tipo)
    , rotacion_(0)
    , fila_(0)
    , col_(3)  // Centrada horizontalmente en un tablero de 10 columnas
{
}

std::array<Coord, 4> Pieza::obtenerCeldas() const {
    if (tipo_ == TipoPieza::NINGUNA) {
        return {{ {0,0}, {0,0}, {0,0}, {0,0} }};
    }
    auto celdas = FORMAS[static_cast<int>(tipo_)][rotacion_];
    // Convertir coordenadas relativas a absolutas
    for (auto& c : celdas) {
        c.fila += fila_;
        c.col += col_;
    }
    return celdas;
}

std::array<Coord, 4> Pieza::obtenerCeldasConRotacion(int rotacion) const {
    if (tipo_ == TipoPieza::NINGUNA) {
        return {{ {0,0}, {0,0}, {0,0}, {0,0} }};
    }
    int rot = ((rotacion % 4) + 4) % 4;
    auto celdas = FORMAS[static_cast<int>(tipo_)][rot];
    for (auto& c : celdas) {
        c.fila += fila_;
        c.col += col_;
    }
    return celdas;
}

void Pieza::rotar(int sentido) {
    rotacion_ = ((rotacion_ + sentido) % 4 + 4) % 4;
}

void Pieza::mover(int df, int dc) {
    fila_ += df;
    col_ += dc;
}

void Pieza::establecerPosicion(int fila, int col) {
    fila_ = fila;
    col_ = col;
}

void Pieza::reiniciar() {
    rotacion_ = 0;
    fila_ = 0;
    col_ = 3;
}

sf::Color Pieza::obtenerColor() const {
    if (tipo_ == TipoPieza::NINGUNA) return COLOR_VACIO;
    return COLORES_PIEZA[static_cast<int>(tipo_)];
}

const std::array<Coord, 5>& Pieza::obtenerWallKicks(int rotacionOrigen, int sentido) const {
    // Calcular índice en la tabla de wall kicks
    // sentido: +1 = horario, -1 = antihorario
    // Índices: horario: rot*2, antihorario: rot*2+1
    // Para horario: 0→1 (idx 0), 1→2 (idx 2), 2→3 (idx 4), 3→0 (idx 6)
    // Para antihorario: 1→0 (idx 1), 2→1 (idx 3), 3→2 (idx 5), 0→3 (idx 7)
    int idx;
    if (sentido > 0) {
        // Horario
        idx = rotacionOrigen * 2;
    } else {
        // Antihorario: la rotación destino es (origen - 1 + 4) % 4
        int destino = (rotacionOrigen - 1 + 4) % 4;
        idx = destino * 2 + 1;
    }

    if (tipo_ == TipoPieza::I) {
        return WALL_KICKS_I[idx];
    } else {
        return WALL_KICKS_NORMAL[idx];
    }
}

} // namespace tetris
