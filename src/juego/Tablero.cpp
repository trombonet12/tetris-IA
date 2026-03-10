// =============================================================================
// Tetris con IA Evolutiva - Implementación de Tablero
// Autor: Joan L.
// Descripción: Grid de juego con detección de colisiones, limpieza de líneas
//              y extracción de estado para la red neuronal de la IA.
// =============================================================================
#include "juego/Tablero.h"
#include <algorithm>
#include <cstdlib>

namespace tetris {

Tablero::Tablero() {
    reiniciar();
}

void Tablero::reiniciar() {
    for (auto& fila : grid_) {
        fila.fill(TipoPieza::NINGUNA);
    }
}

bool Tablero::verificarColision(const Pieza& pieza) const {
    auto celdas = pieza.obtenerCeldas();
    for (const auto& c : celdas) {
        // Fuera de los límites horizontales
        if (c.col < 0 || c.col >= TABLERO_ANCHO) return true;
        // Fuera del límite inferior
        if (c.fila >= TABLERO_ALTO_TOTAL) return true;
        // Fuera del límite superior (permitido, las piezas empiezan arriba)
        if (c.fila < 0) continue;
        // Colisión con celda ocupada
        if (grid_[c.fila][c.col] != TipoPieza::NINGUNA) return true;
    }
    return false;
}

bool Tablero::verificarColisionEn(const Pieza& pieza, int fila, int col, int rotacion) const {
    if (pieza.obtenerTipo() == TipoPieza::NINGUNA) return true;

    int rot = ((rotacion % 4) + 4) % 4;
    const auto& forma = FORMAS[static_cast<int>(pieza.obtenerTipo())][rot];

    for (const auto& celda : forma) {
        int f = celda.fila + fila;
        int c = celda.col + col;
        if (c < 0 || c >= TABLERO_ANCHO) return true;
        if (f >= TABLERO_ALTO_TOTAL) return true;
        if (f < 0) continue;
        if (grid_[f][c] != TipoPieza::NINGUNA) return true;
    }
    return false;
}

void Tablero::colocarPieza(const Pieza& pieza) {
    auto celdas = pieza.obtenerCeldas();
    for (const auto& c : celdas) {
        if (c.fila >= 0 && c.fila < TABLERO_ALTO_TOTAL &&
            c.col >= 0 && c.col < TABLERO_ANCHO) {
            grid_[c.fila][c.col] = pieza.obtenerTipo();
        }
    }
}

int Tablero::limpiarLineas() {
    int lineasEliminadas = 0;

    // Recorrer de abajo a arriba
    for (int fila = TABLERO_ALTO_TOTAL - 1; fila >= 0; --fila) {
        if (filaCompleta(fila)) {
            eliminarFila(fila);
            ++lineasEliminadas;
            ++fila; // Volver a comprobar esta fila (las superiores han bajado)
        }
    }

    return lineasEliminadas;
}

bool Tablero::estaDesbordado() const {
    // El tablero está desbordado si hay piezas en las filas ocultas superiores
    for (int fila = 0; fila < TABLERO_ALTO_OCULTO; ++fila) {
        for (int col = 0; col < TABLERO_ANCHO; ++col) {
            if (grid_[fila][col] != TipoPieza::NINGUNA) return true;
        }
    }
    return false;
}

TipoPieza Tablero::obtenerCelda(int fila, int col) const {
    if (fila < 0 || fila >= TABLERO_ALTO_TOTAL ||
        col < 0 || col >= TABLERO_ANCHO) {
        return TipoPieza::NINGUNA;
    }
    return grid_[fila][col];
}

int Tablero::calcularFilaFantasma(const Pieza& pieza) const {
    Pieza fantasma = pieza;
    // Ir bajando hasta que colisione
    while (true) {
        fantasma.mover(1, 0);
        if (verificarColision(fantasma)) {
            fantasma.mover(-1, 0);
            break;
        }
    }
    return fantasma.obtenerFila();
}

std::vector<float> Tablero::obtenerEstado() const {
    std::vector<float> estado;
    estado.reserve(NN_TAM_TABLERO + NN_TAM_ALTURAS + NN_TAM_HUECOS + NN_TAM_BUMPINESS);

    // Tablero aplanado (solo las filas visibles): 0.0 vacía, 1.0 ocupada
    for (int fila = TABLERO_ALTO_OCULTO; fila < TABLERO_ALTO_TOTAL; ++fila) {
        for (int col = 0; col < TABLERO_ANCHO; ++col) {
            estado.push_back(grid_[fila][col] != TipoPieza::NINGUNA ? 1.0f : 0.0f);
        }
    }

    // Alturas por columna normalizadas (0 a 1)
    auto alturas = obtenerAlturas();
    for (int col = 0; col < TABLERO_ANCHO; ++col) {
        estado.push_back(static_cast<float>(alturas[col]) / TABLERO_ALTO);
    }

    // Número de huecos normalizado
    int huecos = contarHuecos();
    estado.push_back(static_cast<float>(huecos) / (TABLERO_ANCHO * TABLERO_ALTO));

    // Bumpiness normalizada
    int bumpiness = calcularBumpiness();
    estado.push_back(static_cast<float>(bumpiness) / (TABLERO_ALTO * (TABLERO_ANCHO - 1)));

    return estado;
}

std::array<int, TABLERO_ANCHO> Tablero::obtenerAlturas() const {
    std::array<int, TABLERO_ANCHO> alturas;
    alturas.fill(0);

    for (int col = 0; col < TABLERO_ANCHO; ++col) {
        for (int fila = TABLERO_ALTO_OCULTO; fila < TABLERO_ALTO_TOTAL; ++fila) {
            if (grid_[fila][col] != TipoPieza::NINGUNA) {
                alturas[col] = TABLERO_ALTO_TOTAL - fila;
                break;
            }
        }
    }
    return alturas;
}

int Tablero::contarHuecos() const {
    int huecos = 0;
    for (int col = 0; col < TABLERO_ANCHO; ++col) {
        bool encontradoBloque = false;
        for (int fila = TABLERO_ALTO_OCULTO; fila < TABLERO_ALTO_TOTAL; ++fila) {
            if (grid_[fila][col] != TipoPieza::NINGUNA) {
                encontradoBloque = true;
            } else if (encontradoBloque) {
                ++huecos;
            }
        }
    }
    return huecos;
}

float Tablero::obtenerAlturaMedia() const {
    auto alturas = obtenerAlturas();
    float suma = 0.0f;
    for (int a : alturas) {
        suma += static_cast<float>(a);
    }
    return suma / TABLERO_ANCHO;
}

int Tablero::calcularBumpiness() const {
    auto alturas = obtenerAlturas();
    int bumpiness = 0;
    for (int col = 0; col < TABLERO_ANCHO - 1; ++col) {
        bumpiness += std::abs(alturas[col] - alturas[col + 1]);
    }
    return bumpiness;
}

int Tablero::contarFilasCasiCompletas(int minCeldas) const {
    int count = 0;
    for (int fila = TABLERO_ALTO_OCULTO; fila < TABLERO_ALTO_TOTAL; ++fila) {
        int celdas = 0;
        for (int col = 0; col < TABLERO_ANCHO; ++col) {
            if (grid_[fila][col] != TipoPieza::NINGUNA) ++celdas;
        }
        if (celdas >= minCeldas && celdas < TABLERO_ANCHO) ++count;
    }
    return count;
}

bool Tablero::filaCompleta(int fila) const {
    for (int col = 0; col < TABLERO_ANCHO; ++col) {
        if (grid_[fila][col] == TipoPieza::NINGUNA) return false;
    }
    return true;
}

void Tablero::eliminarFila(int filaEliminar) {
    // Desplazar todas las filas superiores una posición hacia abajo
    for (int fila = filaEliminar; fila > 0; --fila) {
        grid_[fila] = grid_[fila - 1];
    }
    // La fila superior queda vacía
    grid_[0].fill(TipoPieza::NINGUNA);
}

} // namespace tetris
