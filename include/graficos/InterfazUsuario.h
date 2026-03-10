// =============================================================================
// Tetris con IA Evolutiva - Interfaz de Usuario
// Autor: Joan L.
// Descripción: Gestiona todos los elementos de la interfaz gráfica: menú
//              principal, paneles de información, controles interactivos.
//              Todo interactuable por teclado y ratón (click).
// =============================================================================
#pragma once

#include "../juego/Constantes.h"
#include "Boton.h"
#include <SFML/Graphics.hpp>
#include <vector>
#include <string>
#include <functional>

namespace tetris {

class InterfazUsuario {
public:
    explicit InterfazUsuario(const sf::Font& fuente);

    // ---- Menú principal ----
    void crearMenuPrincipal(std::function<void(EstadoApp)> callback);
    void renderizarMenuPrincipal(sf::RenderTarget& objetivo) const;
    bool procesarEventoMenu(const sf::Event& evento, const sf::RenderWindow& ventana);

    // ---- Panel de texto genérico ----
    void dibujarPanel(sf::RenderTarget& objetivo, sf::FloatRect area,
                       const std::string& titulo) const;

    // Dibuja texto simple en una posición
    void dibujarTexto(sf::RenderTarget& objetivo, const std::string& texto,
                       sf::Vector2f posicion, unsigned int tamano = 18,
                       sf::Color color = COLOR_TEXTO) const;

    // Dibuja texto con valor (etiqueta: valor)
    void dibujarEtiquetaValor(sf::RenderTarget& objetivo,
                               const std::string& etiqueta, const std::string& valor,
                               sf::Vector2f posicion, unsigned int tamano = 18) const;

    // Dibuja una barra de progreso
    void dibujarBarraProgreso(sf::RenderTarget& objetivo, sf::Vector2f posicion,
                               sf::Vector2f tamano, float progreso,
                               sf::Color color = sf::Color::Green) const;

    // Dibuja la gráfica de fitness por generación
    void dibujarGraficaFitness(sf::RenderTarget& objetivo, sf::FloatRect area,
                                const std::vector<float>& mejores,
                                const std::vector<float>& medias,
                                const std::vector<float>& peores) const;

    // Dibuja un título centrado en la parte superior
    void dibujarTitulo(sf::RenderTarget& objetivo, const std::string& titulo,
                        float y = 30.0f) const;

    // Acceso a la fuente
    const sf::Font& obtenerFuente() const { return fuente_; }

private:
    const sf::Font& fuente_;

    // Botones del menú principal
    std::vector<Boton> botonesMenu_;
};

} // namespace tetris
