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

int Tablero::calcularTransicionesColumna() const {
    int transiciones = 0;
    for (int col = 0; col < TABLERO_ANCHO; ++col) {
        // La celda por encima del tablero se considera vacía
        bool anteriorLlena = false;
        for (int fila = TABLERO_ALTO_OCULTO; fila < TABLERO_ALTO_TOTAL; ++fila) {
            bool llena = (grid_[fila][col] != TipoPieza::NINGUNA);
            if (llena != anteriorLlena) ++transiciones;
            anteriorLlena = llena;
        }
        // La celda por debajo del tablero se considera llena (suelo)
        if (!anteriorLlena) ++transiciones;
    }
    return transiciones;
}

int Tablero::calcularTransicionesFila() const {
    int transiciones = 0;
    for (int fila = TABLERO_ALTO_OCULTO; fila < TABLERO_ALTO_TOTAL; ++fila) {
        // El borde izquierdo se considera lleno (pared)
        bool anteriorLlena = true;
        for (int col = 0; col < TABLERO_ANCHO; ++col) {
            bool llena = (grid_[fila][col] != TipoPieza::NINGUNA);
            if (llena != anteriorLlena) ++transiciones;
            anteriorLlena = llena;
        }
        // El borde derecho se considera lleno (pared)
        if (!anteriorLlena) ++transiciones;
    }
    return transiciones;
}

int Tablero::calcularPozos() const {
    auto alturas = obtenerAlturas();
    int sumaPozos = 0;
    for (int col = 0; col < TABLERO_ANCHO; ++col) {
        int altIzq = (col > 0) ? alturas[col - 1] : TABLERO_ALTO;
        int altDer = (col < TABLERO_ANCHO - 1) ? alturas[col + 1] : TABLERO_ALTO;
        int minAdyacente = std::min(altIzq, altDer);
        int profundidad = minAdyacente - alturas[col];
        if (profundidad > 0) sumaPozos += profundidad;
    }
    return sumaPozos;
}

CaracteristicasTablero Tablero::simularColocacion(TipoPieza tipo, int rotacion, int columna) const {
    CaracteristicasTablero features;
    if (tipo == TipoPieza::NINGUNA) return features;

    // Obtener huecos antes de colocar
    int huecosAntes = contarHuecos();

    // Obtener celdas de la pieza en la rotación pedida
    int rot = ((rotacion % 4) + 4) % 4;
    const auto& forma = FORMAS[static_cast<int>(tipo)][rot];

    // Calcular fila de aterrizaje (hard drop simulado)
    // Empezar desde arriba e ir bajando
    int filaBase = 0;
    bool colisionado = false;
    while (!colisionado) {
        ++filaBase;
        for (const auto& celda : forma) {
            int f = celda.fila + filaBase;
            int c = celda.col + columna;
            if (c < 0 || c >= TABLERO_ANCHO || f >= TABLERO_ALTO_TOTAL) {
                colisionado = true; break;
            }
            if (f >= 0 && grid_[f][c] != TipoPieza::NINGUNA) {
                colisionado = true; break;
            }
        }
    }
    --filaBase; // Retroceder al último estado válido

    // Verificar que la posición es válida
    for (const auto& celda : forma) {
        int f = celda.fila + filaBase;
        int c = celda.col + columna;
        if (c < 0 || c >= TABLERO_ANCHO || f < 0 || f >= TABLERO_ALTO_TOTAL) return features;
        if (grid_[f][c] != TipoPieza::NINGUNA) return features;
    }

    // Crear copia del tablero y colocar la pieza
    auto gridCopia = grid_;
    for (const auto& celda : forma) {
        int f = celda.fila + filaBase;
        int c = celda.col + columna;
        gridCopia[f][c] = tipo;
    }

    // Limpiar líneas completas en la copia
    int lineasLimpiadas = 0;
    for (int fila = TABLERO_ALTO_TOTAL - 1; fila >= 0; --fila) {
        bool completa = true;
        for (int col = 0; col < TABLERO_ANCHO; ++col) {
            if (gridCopia[fila][col] == TipoPieza::NINGUNA) { completa = false; break; }
        }
        if (completa) {
            ++lineasLimpiadas;
            for (int f2 = fila; f2 > 0; --f2) gridCopia[f2] = gridCopia[f2 - 1];
            gridCopia[0].fill(TipoPieza::NINGUNA);
            ++fila; // Re-check this row
        }
    }

    // Calcular features sobre el tablero resultante (gridCopia)

    // Alturas
    std::array<int, TABLERO_ANCHO> alturas;
    alturas.fill(0);
    for (int col = 0; col < TABLERO_ANCHO; ++col) {
        for (int fila = TABLERO_ALTO_OCULTO; fila < TABLERO_ALTO_TOTAL; ++fila) {
            if (gridCopia[fila][col] != TipoPieza::NINGUNA) {
                alturas[col] = TABLERO_ALTO_TOTAL - fila;
                break;
            }
        }
    }

    int alturaAgregada = 0, alturaMax = 0;
    for (int col = 0; col < TABLERO_ANCHO; ++col) {
        alturaAgregada += alturas[col];
        if (alturas[col] > alturaMax) alturaMax = alturas[col];
    }

    // Huecos
    int huecosDespues = 0;
    for (int col = 0; col < TABLERO_ANCHO; ++col) {
        bool encontrado = false;
        for (int fila = TABLERO_ALTO_OCULTO; fila < TABLERO_ALTO_TOTAL; ++fila) {
            if (gridCopia[fila][col] != TipoPieza::NINGUNA) encontrado = true;
            else if (encontrado) ++huecosDespues;
        }
    }

    // Bumpiness
    int bumpiness = 0;
    for (int col = 0; col < TABLERO_ANCHO - 1; ++col) {
        bumpiness += std::abs(alturas[col] - alturas[col + 1]);
    }

    // Transiciones columna
    int transCol = 0;
    for (int col = 0; col < TABLERO_ANCHO; ++col) {
        bool anteriorLlena = false;
        for (int fila = TABLERO_ALTO_OCULTO; fila < TABLERO_ALTO_TOTAL; ++fila) {
            bool llena = (gridCopia[fila][col] != TipoPieza::NINGUNA);
            if (llena != anteriorLlena) ++transCol;
            anteriorLlena = llena;
        }
        if (!anteriorLlena) ++transCol;
    }

    // Transiciones fila
    int transFila = 0;
    for (int fila = TABLERO_ALTO_OCULTO; fila < TABLERO_ALTO_TOTAL; ++fila) {
        bool anteriorLlena = true;
        for (int col = 0; col < TABLERO_ANCHO; ++col) {
            bool llena = (gridCopia[fila][col] != TipoPieza::NINGUNA);
            if (llena != anteriorLlena) ++transFila;
            anteriorLlena = llena;
        }
        if (!anteriorLlena) ++transFila;
    }

    // Pozos
    int pozos = 0;
    for (int col = 0; col < TABLERO_ANCHO; ++col) {
        int altIzq = (col > 0) ? alturas[col - 1] : TABLERO_ALTO;
        int altDer = (col < TABLERO_ANCHO - 1) ? alturas[col + 1] : TABLERO_ALTO;
        int prof = std::min(altIzq, altDer) - alturas[col];
        if (prof > 0) pozos += prof;
    }

    // Filas casi completas
    int filasCasi = 0;
    for (int fila = TABLERO_ALTO_OCULTO; fila < TABLERO_ALTO_TOTAL; ++fila) {
        int celdas = 0;
        for (int col = 0; col < TABLERO_ANCHO; ++col) {
            if (gridCopia[fila][col] != TipoPieza::NINGUNA) ++celdas;
        }
        if (celdas >= 8 && celdas < TABLERO_ANCHO) ++filasCasi;
    }

    // Densidad inferior (4 filas inferiores)
    int celdasInf = 0;
    for (int fila = TABLERO_ALTO_TOTAL - 4; fila < TABLERO_ALTO_TOTAL; ++fila) {
        for (int col = 0; col < TABLERO_ANCHO; ++col) {
            if (gridCopia[fila][col] != TipoPieza::NINGUNA) ++celdasInf;
        }
    }

    // Normalizar y rellenar features
    features.lineasCompletadas = static_cast<float>(lineasLimpiadas) / 4.0f;
    features.alturaAgregada = static_cast<float>(alturaAgregada) / 200.0f;
    features.alturaMaxima = static_cast<float>(alturaMax) / 20.0f;
    features.huecos = static_cast<float>(huecosDespues) / 200.0f;
    features.huecosCreados = static_cast<float>(huecosDespues - huecosAntes) / 20.0f;
    features.bumpiness = static_cast<float>(bumpiness) / 180.0f;
    features.transicionesColumna = static_cast<float>(transCol) / 200.0f;
    features.transicionesFila = static_cast<float>(transFila) / 200.0f;
    features.pozos = static_cast<float>(pozos) / 200.0f;
    features.alturaAterrizaje = static_cast<float>(TABLERO_ALTO_TOTAL - filaBase) / 20.0f;
    features.filasCasiCompletas = static_cast<float>(filasCasi) / 20.0f;
    features.densidadInferior = static_cast<float>(celdasInf) / 40.0f;

    return features;
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
