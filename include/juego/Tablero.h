// =============================================================================
// Tetris con IA Evolutiva - Clase Tablero
// Autor: Joan L.
// Descripción: Representa el tablero de juego (grid 10x20 + 4 filas ocultas).
//              Gestiona la colocación de piezas, detección de colisiones,
//              limpieza de líneas y extracción de estado para la IA.
// =============================================================================
#pragma once

#include "Constantes.h"
#include "Pieza.h"
#include <array>
#include <vector>

namespace tetris {

class Tablero {
public:
    Tablero();

    // Verifica si la pieza colisiona en su posición actual
    bool verificarColision(const Pieza& pieza) const;

    // Verifica si la pieza colisionaría en una posición dada
    bool verificarColisionEn(const Pieza& pieza, int fila, int col, int rotacion) const;

    // Coloca la pieza fijándola en el tablero
    void colocarPieza(const Pieza& pieza);

    // Limpia las líneas completas y devuelve el número de líneas eliminadas
    int limpiarLineas();

    // Comprueba si el tablero está desbordado (game over)
    bool estaDesbordado() const;

    // Obtiene el valor de una celda (tipo de pieza o NINGUNA)
    TipoPieza obtenerCelda(int fila, int col) const;

    // Calcula la fila fantasma (dónde caería la pieza con hard drop)
    int calcularFilaFantasma(const Pieza& pieza) const;

    // Reinicia el tablero dejándolo vacío
    void reiniciar();

    // ---- Funciones para la IA ----

    // Obtiene el estado del tablero como vector normalizado para la red neuronal
    std::vector<float> obtenerEstado() const;

    // Calcula la altura de cada columna
    std::array<int, TABLERO_ANCHO> obtenerAlturas() const;

    // Cuenta el número total de huecos (celdas vacías bajo celdas llenas)
    int contarHuecos() const;

    // Calcula la altura media del tablero
    float obtenerAlturaMedia() const;

    // Obtiene el grid completo (para renderizado)
    const std::array<std::array<TipoPieza, TABLERO_ANCHO>, TABLERO_ALTO_TOTAL>& obtenerGrid() const {
        return grid_;
    }

private:
    // Grid del tablero: grid_[fila][col], fila 0 = parte superior oculta
    std::array<std::array<TipoPieza, TABLERO_ANCHO>, TABLERO_ALTO_TOTAL> grid_;

    // Verifica si una fila está completa
    bool filaCompleta(int fila) const;

    // Elimina una fila y baja las superiores
    void eliminarFila(int fila);
};

} // namespace tetris
