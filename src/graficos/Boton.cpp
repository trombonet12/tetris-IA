// =============================================================================
// Tetris con IA Evolutiva - Implementación de Botón
// Autor: Joan L.
// Descripción: Botón interactivo con estados hover/click para la interfaz.
// =============================================================================
#include "graficos/Boton.h"

namespace tetris {

Boton::Boton()
    : colorNormal_(COLOR_BOTON)
    , colorHover_(COLOR_BOTON_HOVER)
    , colorClick_(COLOR_BOTON_CLICK)
    , hover_(false)
    , pulsado_(false)
    , activo_(true)
    , visible_(true)
{
}

Boton::Boton(const std::string& texto, const sf::Font& fuente,
             sf::Vector2f posicion, sf::Vector2f tamano)
    : colorNormal_(COLOR_BOTON)
    , colorHover_(COLOR_BOTON_HOVER)
    , colorClick_(COLOR_BOTON_CLICK)
    , hover_(false)
    , pulsado_(false)
    , activo_(true)
    , visible_(true)
{
    configurar(texto, fuente, posicion, tamano);
}

void Boton::configurar(const std::string& texto, const sf::Font& fuente,
                        sf::Vector2f posicion, sf::Vector2f tamano) {
    forma_.setSize(tamano);
    forma_.setPosition(posicion);
    forma_.setFillColor(colorNormal_);
    forma_.setOutlineColor(sf::Color(100, 100, 140));
    forma_.setOutlineThickness(2.0f);

    textoSFML_.emplace(fuente, texto, 20u);
    textoSFML_->setFillColor(COLOR_TEXTO);

    actualizarTexto();
}

bool Boton::procesarEvento(const sf::Event& evento, const sf::RenderWindow& ventana) {
    if (!activo_ || !visible_) return false;

    sf::Vector2i posRaton = sf::Mouse::getPosition(ventana);
    sf::Vector2f posRatonMundo = ventana.mapPixelToCoords(posRaton);
    sf::FloatRect bounds = forma_.getGlobalBounds();

    bool dentroDelBoton = bounds.contains(posRatonMundo);

    // Actualizar estado hover
    hover_ = dentroDelBoton;

    if (const auto* mousePress = evento.getIf<sf::Event::MouseButtonPressed>()) {
        if (mousePress->button == sf::Mouse::Button::Left) {
            if (dentroDelBoton) {
                pulsado_ = true;
                forma_.setFillColor(colorClick_);
            }
        }
    }

    if (const auto* mouseRelease = evento.getIf<sf::Event::MouseButtonReleased>()) {
        if (mouseRelease->button == sf::Mouse::Button::Left) {
            if (pulsado_ && dentroDelBoton) {
                pulsado_ = false;
                forma_.setFillColor(hover_ ? colorHover_ : colorNormal_);
                if (callback_) callback_();
                return true;
            }
            pulsado_ = false;
        }
    }

    // Actualizar color según estado
    if (!pulsado_) {
        forma_.setFillColor(hover_ ? colorHover_ : colorNormal_);
    }

    return false;
}

void Boton::dibujar(sf::RenderTarget& objetivo) const {
    if (!visible_) return;

    objetivo.draw(forma_);
    if (textoSFML_) objetivo.draw(*textoSFML_);
}

void Boton::establecerTexto(const std::string& texto) {
    if (textoSFML_) {
        textoSFML_->setString(texto);
        actualizarTexto();
    }
}

void Boton::actualizarTexto() {
    if (!textoSFML_) return;
    // Centrar el texto dentro del botón
    sf::FloatRect boundsTexto = textoSFML_->getLocalBounds();
    sf::FloatRect boundsForma = forma_.getGlobalBounds();

    textoSFML_->setOrigin({
        boundsTexto.position.x + boundsTexto.size.x / 2.0f,
        boundsTexto.position.y + boundsTexto.size.y / 2.0f
    });
    textoSFML_->setPosition({
        boundsForma.position.x + boundsForma.size.x / 2.0f,
        boundsForma.position.y + boundsForma.size.y / 2.0f
    });
}

} // namespace tetris
