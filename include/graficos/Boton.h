// =============================================================================
// Tetris con IA Evolutiva - Clase Botón
// Autor: Joan L.
// Descripción: Botón genérico para la interfaz gráfica con estados de hover,
//              click y normal. Soporta callbacks mediante std::function.
// =============================================================================
#pragma once

#include "../juego/Constantes.h"
#include <SFML/Graphics.hpp>
#include <functional>
#include <string>
#include <optional>

namespace tetris {

class Boton {
public:
    Boton();
    Boton(const std::string& texto, const sf::Font& fuente,
          sf::Vector2f posicion, sf::Vector2f tamano);

    // Configura el botón
    void configurar(const std::string& texto, const sf::Font& fuente,
                    sf::Vector2f posicion, sf::Vector2f tamano);

    // Procesa un evento de SFML y devuelve true si fue clickeado
    bool procesarEvento(const sf::Event& evento, const sf::RenderWindow& ventana);

    // Dibuja el botón en el objetivo de renderizado
    void dibujar(sf::RenderTarget& objetivo) const;

    // Establece la función callback al hacer click
    void alHacerClick(std::function<void()> callback) { callback_ = callback; }

    // ---- Personalización ----
    void establecerColorNormal(sf::Color color) { colorNormal_ = color; }
    void establecerColorHover(sf::Color color) { colorHover_ = color; }
    void establecerColorClick(sf::Color color) { colorClick_ = color; }
    void establecerColorTexto(sf::Color color) { if (textoSFML_) textoSFML_->setFillColor(color); }
    void establecerTamanoTexto(unsigned int tam) { if (textoSFML_) { textoSFML_->setCharacterSize(tam); actualizarTexto(); } }
    void establecerActivo(bool activo) { activo_ = activo; }
    void establecerVisible(bool visible) { visible_ = visible; }
    void establecerTexto(const std::string& texto);

    bool estaActivo() const { return activo_; }
    bool estaVisible() const { return visible_; }
    sf::FloatRect obtenerBounds() const { return forma_.getGlobalBounds(); }

private:
    sf::RectangleShape forma_;
    std::optional<sf::Text> textoSFML_;
    std::function<void()> callback_;

    sf::Color colorNormal_;
    sf::Color colorHover_;
    sf::Color colorClick_;

    bool hover_;
    bool pulsado_;
    bool activo_;
    bool visible_;

    void actualizarTexto();
};

} // namespace tetris
