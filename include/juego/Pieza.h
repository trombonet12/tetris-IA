// =============================================================================
// Tetris con IA Evolutiva - Clase Pieza (Tetrimino)
// Autor: Joan L.
// Descripción: Representa una pieza de Tetris con su tipo, rotación y posición.
//              Implementa el Sistema de Rotación Super (SRS) con wall kicks.
// =============================================================================
#pragma once

#include "Constantes.h"
#include <vector>

namespace tetris {

class Pieza {
public:
    // Constructor: crea una pieza del tipo indicado en la posición inicial
    explicit Pieza(TipoPieza tipo = TipoPieza::NINGUNA);

    // Obtiene las coordenadas absolutas de las 4 celdas de la pieza en el tablero
    std::array<Coord, 4> obtenerCeldas() const;

    // Obtiene las celdas de la pieza en una rotación específica (para previsualización)
    std::array<Coord, 4> obtenerCeldasConRotacion(int rotacion) const;

    // Rota la pieza en sentido horario (+1) o antihorario (-1)
    void rotar(int sentido);

    // Mueve la pieza en la dirección indicada
    void mover(int df, int dc);

    // Establece la posición de la pieza directamente
    void establecerPosicion(int fila, int col);

    // Reinicia la pieza a su posición y rotación inicial
    void reiniciar();

    // Getters
    TipoPieza obtenerTipo() const { return tipo_; }
    int obtenerRotacion() const { return rotacion_; }
    int obtenerFila() const { return fila_; }
    int obtenerColumna() const { return col_; }
    sf::Color obtenerColor() const;

    // Obtiene los offsets de wall kick para la transición de rotación actual
    const std::array<Coord, 5>& obtenerWallKicks(int rotacionOrigen, int sentido) const;

private:
    TipoPieza tipo_;
    int rotacion_;  // 0-3
    int fila_;      // Posición Y en el tablero (fila superior de la caja 4x4)
    int col_;       // Posición X en el tablero (columna izquierda de la caja 4x4)
};

} // namespace tetris
