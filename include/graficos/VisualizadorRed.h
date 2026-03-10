// =============================================================================
// Tetris con IA Evolutiva - Visualizador de Red Neuronal
// Autor: Joan L.
// Descripción: Dibuja la topología de la red neuronal en tiempo real con las
//              activaciones de cada neurona y los pesos de las conexiones.
//              Las neuronas se colorean según su activación (azul → blanco → rojo)
//              y las conexiones por su peso (verde positivo, rojo negativo).
// =============================================================================
#pragma once

#include "../ia/RedNeuronal.h"
#include <SFML/Graphics.hpp>
#include <vector>

namespace tetris {

class VisualizadorRed {
public:
    explicit VisualizadorRed(const sf::Font& fuente);

    // Renderiza la red neuronal completa dentro del área especificada
    void renderizar(sf::RenderTarget& objetivo, const RedNeuronal& red,
                    const ActivacionesRed& activaciones,
                    sf::FloatRect area) const;

    // Renderiza una versión compacta (solo neuronas, sin etiquetas)
    void renderizarCompacto(sf::RenderTarget& objetivo, const RedNeuronal& red,
                             const ActivacionesRed& activaciones,
                             sf::FloatRect area) const;

    // Renderiza las barras de probabilidad de las acciones de salida
    void renderizarBarrasAccion(sf::RenderTarget& objetivo,
                                 const std::vector<float>& salida,
                                 sf::Vector2f posicion, sf::Vector2f tamano) const;

    // Renderiza información estadística de los pesos
    void renderizarInfoPesos(sf::RenderTarget& objetivo, const RedNeuronal& red,
                              sf::Vector2f posicion) const;

private:
    const sf::Font& fuente_;

    // Nombres de las acciones para las etiquetas de salida
    static const std::array<std::string, 6> NOMBRES_ACCIONES;

    // Convierte un valor de activación a color (azul negativo → blanco cero → rojo positivo)
    sf::Color colorActivacion(float valor) const;

    // Convierte un peso a color (verde positivo, rojo negativo) con alfa proporcional al valor
    sf::Color colorPeso(float peso) const;

    // Calcula el grosor de una conexión según el peso absoluto
    float grosorConexion(float peso) const;

    // Calcula las posiciones de las neuronas para el layout
    std::vector<std::vector<sf::Vector2f>> calcularLayout(
        const std::vector<int>& arquitectura, sf::FloatRect area) const;
};

} // namespace tetris
