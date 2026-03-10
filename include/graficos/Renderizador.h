// =============================================================================
// Tetris con IA Evolutiva - Clase Renderizador
// Autor: Joan L.
// Descripción: Responsable de dibujar todos los elementos del juego: tablero,
//              piezas, pieza fantasma, hold, siguientes piezas. Soporta
//              renderizado a tamaño normal y en miniatura (entrenamiento).
// =============================================================================
#pragma once

#include "../juego/Constantes.h"
#include "../juego/Tablero.h"
#include "../juego/Pieza.h"
#include "../juego/Tetris.h"
#include <SFML/Graphics.hpp>

namespace tetris {

class Renderizador {
public:
    explicit Renderizador(const sf::Font& fuente);

    // Dibuja un tablero de Tetris completo a tamaño normal
    void renderizarTablero(sf::RenderTarget& objetivo, const Tetris& tetris,
                           sf::Vector2f posicion) const;

    // Dibuja un tablero en miniatura (para las instancias de entrenamiento)
    void renderizarTableroMini(sf::RenderTarget& objetivo, const Tetris& tetris,
                                sf::Vector2f posicion, float escala = 1.0f,
                                bool destacado = false) const;

    // Dibuja la pieza fantasma (semi-transparente donde caería)
    void renderizarPiezaFantasma(sf::RenderTarget& objetivo, const Pieza& fantasma,
                                  sf::Vector2f origenTablero) const;

    // Dibuja el panel lateral con información del juego
    void renderizarPanelInfo(sf::RenderTarget& objetivo, const Tetris& tetris,
                             sf::Vector2f posicion) const;

    // Dibuja la previsualización de una pieza (para siguientes y hold)
    void renderizarPrevisualizacion(sf::RenderTarget& objetivo, TipoPieza tipo,
                                     sf::Vector2f posicion, float escala = 1.0f) const;

    // Dibuja el fondo con grid
    void renderizarFondo(sf::RenderTarget& objetivo, sf::Vector2f posicion,
                          int ancho, int alto, int tamCelda) const;

private:
    const sf::Font& fuente_;

    // Dibuja una celda individual del tablero
    void dibujarCelda(sf::RenderTarget& objetivo, int fila, int col,
                       TipoPieza tipo, sf::Vector2f origen, int tamCelda) const;

    // Dibuja una celda con color personalizado
    void dibujarCeldaColor(sf::RenderTarget& objetivo, float x, float y,
                            int tamCelda, sf::Color color) const;
};

} // namespace tetris
