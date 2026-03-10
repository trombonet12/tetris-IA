// =============================================================================
// Tetris con IA Evolutiva - Implementación del Renderizador
// Autor: Joan L.
// Descripción: Dibuja todos los elementos visuales del juego: tablero, piezas,
//              pieza fantasma, hold, siguientes piezas, tanto en tamaño normal
//              como en miniatura para la vista de entrenamiento.
// =============================================================================
#include "graficos/Renderizador.h"
#include <sstream>
#include <iomanip>

namespace tetris {

Renderizador::Renderizador(const sf::Font& fuente)
    : fuente_(fuente)
{
}

void Renderizador::renderizarTablero(sf::RenderTarget& objetivo, const Tetris& tetris,
                                      sf::Vector2f posicion) const {
    const auto& tablero = tetris.obtenerTablero();

    // Fondo del tablero
    renderizarFondo(objetivo, posicion, TABLERO_ANCHO, TABLERO_ALTO, TAM_CELDA);

    // Dibujar celdas ocupadas (solo las filas visibles)
    const auto& grid = tablero.obtenerGrid();
    for (int fila = TABLERO_ALTO_OCULTO; fila < TABLERO_ALTO_TOTAL; ++fila) {
        for (int col = 0; col < TABLERO_ANCHO; ++col) {
            if (grid[fila][col] != TipoPieza::NINGUNA) {
                dibujarCelda(objetivo, fila - TABLERO_ALTO_OCULTO, col,
                             grid[fila][col], posicion, TAM_CELDA);
            }
        }
    }

    // Dibujar pieza fantasma (semi-transparente)
    if (!tetris.estaGameOver()) {
        renderizarPiezaFantasma(objetivo, tetris.obtenerPiezaFantasma(), posicion);
    }

    // Dibujar pieza actual
    if (!tetris.estaGameOver()) {
        const auto& pieza = tetris.obtenerPiezaActual();
        auto celdas = pieza.obtenerCeldas();
        sf::Color color = pieza.obtenerColor();

        for (const auto& c : celdas) {
            int filaVisible = c.fila - TABLERO_ALTO_OCULTO;
            if (filaVisible >= 0 && filaVisible < TABLERO_ALTO) {
                dibujarCeldaColor(objetivo,
                    posicion.x + c.col * TAM_CELDA,
                    posicion.y + filaVisible * TAM_CELDA,
                    TAM_CELDA, color);
            }
        }
    }

    // Panel de información lateral
    renderizarPanelInfo(objetivo, tetris,
                        sf::Vector2f(posicion.x + TABLERO_ANCHO * TAM_CELDA + 20, posicion.y));
}

void Renderizador::renderizarTableroMini(sf::RenderTarget& objetivo, const Tetris& tetris,
                                           sf::Vector2f posicion, float escala,
                                           bool destacado) const {
    int tamCelda = static_cast<int>(TAM_CELDA_MINI * escala);
    if (tamCelda < 2) tamCelda = 2;

    int anchoTotal = TABLERO_ANCHO * tamCelda;
    int altoTotal = TABLERO_ALTO * tamCelda;

    // Fondo del mini-tablero
    sf::RectangleShape fondo(sf::Vector2f(
        static_cast<float>(anchoTotal),
        static_cast<float>(altoTotal)));
    fondo.setPosition(posicion);
    fondo.setFillColor(sf::Color(25, 25, 35));

    if (destacado) {
        fondo.setOutlineColor(COLOR_DORADO);
        fondo.setOutlineThickness(2.0f);
    } else {
        fondo.setOutlineColor(sf::Color(60, 60, 80));
        fondo.setOutlineThickness(1.0f);
    }

    objetivo.draw(fondo);

    // Dibujar celdas (simplificado, sin bordes internos)
    const auto& grid = tetris.obtenerTablero().obtenerGrid();
    for (int fila = TABLERO_ALTO_OCULTO; fila < TABLERO_ALTO_TOTAL; ++fila) {
        for (int col = 0; col < TABLERO_ANCHO; ++col) {
            if (grid[fila][col] != TipoPieza::NINGUNA) {
                int filaVisible = fila - TABLERO_ALTO_OCULTO;
                sf::RectangleShape celda(sf::Vector2f(
                    static_cast<float>(tamCelda - 1),
                    static_cast<float>(tamCelda - 1)));
                celda.setPosition({
                    posicion.x + col * tamCelda,
                    posicion.y + filaVisible * tamCelda});
                celda.setFillColor(COLORES_PIEZA[static_cast<int>(grid[fila][col])]);
                objetivo.draw(celda);
            }
        }
    }

    // Dibujar pieza actual (si está activa)
    if (!tetris.estaGameOver()) {
        const auto& pieza = tetris.obtenerPiezaActual();
        auto celdas = pieza.obtenerCeldas();
        sf::Color color = pieza.obtenerColor();

        for (const auto& c : celdas) {
            int filaVisible = c.fila - TABLERO_ALTO_OCULTO;
            if (filaVisible >= 0 && filaVisible < TABLERO_ALTO &&
                c.col >= 0 && c.col < TABLERO_ANCHO) {
                sf::RectangleShape celda(sf::Vector2f(
                    static_cast<float>(tamCelda - 1),
                    static_cast<float>(tamCelda - 1)));
                celda.setPosition({
                    posicion.x + c.col * tamCelda,
                    posicion.y + filaVisible * tamCelda});
                celda.setFillColor(color);
                objetivo.draw(celda);
            }
        }
    }

    // Si está en game over, oscurecer
    if (tetris.estaGameOver()) {
        sf::RectangleShape overlay(sf::Vector2f(
            static_cast<float>(anchoTotal),
            static_cast<float>(altoTotal)));
        overlay.setPosition(posicion);
        overlay.setFillColor(sf::Color(0, 0, 0, 150));
        objetivo.draw(overlay);
    }
}

void Renderizador::renderizarPiezaFantasma(sf::RenderTarget& objetivo, const Pieza& fantasma,
                                             sf::Vector2f origenTablero) const {
    auto celdas = fantasma.obtenerCeldas();

    for (const auto& c : celdas) {
        int filaVisible = c.fila - TABLERO_ALTO_OCULTO;
        if (filaVisible >= 0 && filaVisible < TABLERO_ALTO) {
            sf::RectangleShape celda(sf::Vector2f(TAM_CELDA - 2.0f, TAM_CELDA - 2.0f));
            celda.setPosition({
                origenTablero.x + c.col * TAM_CELDA + 1,
                origenTablero.y + filaVisible * TAM_CELDA + 1});
            celda.setFillColor(sf::Color::Transparent);
            celda.setOutlineColor(COLOR_FANTASMA);
            celda.setOutlineThickness(1.5f);
            objetivo.draw(celda);
        }
    }
}

void Renderizador::renderizarPanelInfo(sf::RenderTarget& objetivo, const Tetris& tetris,
                                         sf::Vector2f posicion) const {
    const auto& stats = tetris.obtenerEstadisticas();
    float y = posicion.y;
    float x = posicion.x;

    // Siguiente pieza
    sf::Text titulo(fuente_, "SIGUIENTE", 18);
    titulo.setFillColor(COLOR_TEXTO_TITULO);
    titulo.setPosition({x, y});
    objetivo.draw(titulo);
    y += 25;

    const auto& siguientes = tetris.obtenerSiguientes();
    for (int i = 0; i < std::min(3, static_cast<int>(siguientes.size())); ++i) {
        renderizarPrevisualizacion(objetivo, siguientes[i],
                                    sf::Vector2f(x, y), 0.8f);
        y += 70;
    }

    y += 10;

    // Hold
    titulo.setString("HOLD");
    titulo.setPosition({x, y});
    objetivo.draw(titulo);
    y += 25;

    if (tetris.obtenerPiezaHold() != TipoPieza::NINGUNA) {
        renderizarPrevisualizacion(objetivo, tetris.obtenerPiezaHold(),
                                    sf::Vector2f(x, y), 0.8f);
    }
    y += 80;

    // Puntuación
    sf::Text texto(fuente_, "", 16);
    texto.setFillColor(COLOR_TEXTO);

    auto dibujarLinea = [&](const std::string& etiqueta, const std::string& valor) {
        texto.setFillColor(COLOR_TEXTO_TITULO);
        texto.setString(etiqueta);
        texto.setPosition({x, y});
        objetivo.draw(texto);

        texto.setFillColor(COLOR_TEXTO);
        texto.setString(valor);
        texto.setPosition({x + 100, y});
        objetivo.draw(texto);
        y += 22;
    };

    dibujarLinea("Puntos:", std::to_string(stats.puntuacion));
    dibujarLinea("Nivel:", std::to_string(stats.nivel));
    dibujarLinea("Lineas:", std::to_string(stats.lineasTotales));
    dibujarLinea("Tetris:", std::to_string(stats.tetrisCount));
    dibujarLinea("Piezas:", std::to_string(stats.piezasColocadas));

    y += 10;
    // Estadísticas de líneas
    titulo.setCharacterSize(14);
    titulo.setString("ESTADISTICAS");
    titulo.setPosition({x, y});
    objetivo.draw(titulo);
    y += 20;

    texto.setCharacterSize(14);
    dibujarLinea("1 linea:", std::to_string(stats.lineasPorTipo[0]));
    dibujarLinea("2 lineas:", std::to_string(stats.lineasPorTipo[1]));
    dibujarLinea("3 lineas:", std::to_string(stats.lineasPorTipo[2]));
    dibujarLinea("4 lineas:", std::to_string(stats.lineasPorTipo[3]));
}

void Renderizador::renderizarPrevisualizacion(sf::RenderTarget& objetivo, TipoPieza tipo,
                                                sf::Vector2f posicion, float escala) const {
    if (tipo == TipoPieza::NINGUNA) return;

    float tamCelda = TAM_CELDA * escala;
    const auto& celdas = FORMAS[static_cast<int>(tipo)][0]; // Rotación 0
    sf::Color color = COLORES_PIEZA[static_cast<int>(tipo)];

    for (const auto& c : celdas) {
        dibujarCeldaColor(objetivo,
            posicion.x + c.col * tamCelda,
            posicion.y + c.fila * tamCelda,
            static_cast<int>(tamCelda), color);
    }
}

void Renderizador::renderizarFondo(sf::RenderTarget& objetivo, sf::Vector2f posicion,
                                     int ancho, int alto, int tamCelda) const {
    float anchoPixels = static_cast<float>(ancho * tamCelda);
    float altoPixels = static_cast<float>(alto * tamCelda);

    // Fondo oscuro
    sf::RectangleShape fondo(sf::Vector2f(anchoPixels, altoPixels));
    fondo.setPosition(posicion);
    fondo.setFillColor(COLOR_VACIO);
    fondo.setOutlineColor(COLOR_BORDE);
    fondo.setOutlineThickness(2.0f);
    objetivo.draw(fondo);

    // Grid
    sf::VertexArray lineas(sf::PrimitiveType::Lines);

    // Líneas verticales
    for (int col = 1; col < ancho; ++col) {
        float x = posicion.x + col * tamCelda;
        lineas.append(sf::Vertex{sf::Vector2f(x, posicion.y), sf::Color(50, 50, 60)});
        lineas.append(sf::Vertex{sf::Vector2f(x, posicion.y + altoPixels), sf::Color(50, 50, 60)});
    }

    // Líneas horizontales
    for (int fila = 1; fila < alto; ++fila) {
        float y = posicion.y + fila * tamCelda;
        lineas.append(sf::Vertex{sf::Vector2f(posicion.x, y), sf::Color(50, 50, 60)});
        lineas.append(sf::Vertex{sf::Vector2f(posicion.x + anchoPixels, y), sf::Color(50, 50, 60)});
    }

    objetivo.draw(lineas);
}

void Renderizador::dibujarCelda(sf::RenderTarget& objetivo, int fila, int col,
                                  TipoPieza tipo, sf::Vector2f origen, int tamCelda) const {
    if (tipo == TipoPieza::NINGUNA) return;
    sf::Color color = COLORES_PIEZA[static_cast<int>(tipo)];
    dibujarCeldaColor(objetivo,
        origen.x + col * tamCelda,
        origen.y + fila * tamCelda,
        tamCelda, color);
}

void Renderizador::dibujarCeldaColor(sf::RenderTarget& objetivo, float x, float y,
                                       int tamCelda, sf::Color color) const {
    sf::RectangleShape celda(sf::Vector2f(tamCelda - 1.0f, tamCelda - 1.0f));
    celda.setPosition({x, y});
    celda.setFillColor(color);

    // Efecto 3D sutil: borde superior/izquierdo más claro, inferior/derecho más oscuro
    sf::Color claro(
        std::min(255, color.r + 40),
        std::min(255, color.g + 40),
        std::min(255, color.b + 40));
    sf::Color oscuro(
        static_cast<uint8_t>(color.r * 0.6f),
        static_cast<uint8_t>(color.g * 0.6f),
        static_cast<uint8_t>(color.b * 0.6f));

    // Borde superior
    sf::RectangleShape bordeUp(sf::Vector2f(tamCelda - 1.0f, 2.0f));
    bordeUp.setPosition({x, y});
    bordeUp.setFillColor(claro);
    objetivo.draw(bordeUp);

    // Borde izquierdo
    sf::RectangleShape bordeLeft(sf::Vector2f(2.0f, tamCelda - 1.0f));
    bordeLeft.setPosition({x, y});
    bordeLeft.setFillColor(claro);
    objetivo.draw(bordeLeft);

    objetivo.draw(celda);

    // Borde inferior
    sf::RectangleShape bordeDown(sf::Vector2f(tamCelda - 1.0f, 2.0f));
    bordeDown.setPosition({x, y + tamCelda - 3.0f});
    bordeDown.setFillColor(oscuro);
    objetivo.draw(bordeDown);

    // Borde derecho
    sf::RectangleShape bordeRight(sf::Vector2f(2.0f, tamCelda - 1.0f));
    bordeRight.setPosition({x + tamCelda - 3.0f, y});
    bordeRight.setFillColor(oscuro);
    objetivo.draw(bordeRight);
}

} // namespace tetris
