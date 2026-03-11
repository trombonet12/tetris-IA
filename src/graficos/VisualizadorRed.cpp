// =============================================================================
// Tetris con IA Evolutiva - Implementación del Visualizador de Red Neuronal
// Autor: Joan L.
// Descripción: Dibuja la topología de la red neuronal en tiempo real.
//              Neuronas coloreadas por activación, conexiones por peso.
//              Permite observar cómo se configuran los perceptrones durante
//              el entrenamiento y la ejecución.
// =============================================================================
#include "graficos/VisualizadorRed.h"
#include "juego/Constantes.h"
#include <cmath>
#include <algorithm>
#include <sstream>
#include <iomanip>
#include <numeric>

namespace tetris {

const std::array<std::string, NUM_ACCIONES> VisualizadorRed::NOMBRES_ACCIONES = {
    "Izquierda", "Derecha", "Rotar H", "Rotar AH", "Bajar", "Caer", "Hold"
};

VisualizadorRed::VisualizadorRed(const sf::Font& fuente)
    : fuente_(fuente)
{
}

void VisualizadorRed::renderizar(sf::RenderTarget& objetivo, const RedNeuronal& red,
                                   const ActivacionesRed& activaciones,
                                   sf::FloatRect area) const {
    const auto& arq = red.obtenerArquitectura();
    auto layout = calcularLayout(arq, area);
    auto pesos = red.obtenerPesos();

    // Dibujar conexiones entre capas
    int offsetPeso = 0;
    for (size_t capa = 0; capa + 1 < layout.size(); ++capa) {
        int tamActual = arq[capa];
        int tamSiguiente = arq[capa + 1];

        // Limitar conexiones dibujadas para capas grandes (rendimiento)
        int maxConexiones = 500;
        int paso = std::max(1, (tamActual * tamSiguiente) / maxConexiones);

        for (int i = 0; i < tamActual; i += std::max(1, tamActual / 20)) {
            for (int j = 0; j < tamSiguiente; j += std::max(1, tamSiguiente / 20)) {
                int idxPeso = offsetPeso + i * tamSiguiente + j;
                if (idxPeso >= static_cast<int>(pesos.size())) continue;

                float peso = pesos[idxPeso];
                sf::Color colorLinea = colorPeso(peso);
                float grosor = grosorConexion(peso);

                if (grosor < 0.3f) continue; // No dibujar conexiones insignificantes

                // Dibujar línea (usando un rectángulo fino para el grosor)
                sf::Vector2f p1 = layout[capa][i % layout[capa].size()];
                sf::Vector2f p2 = layout[capa + 1][j % layout[capa + 1].size()];

                sf::Vertex linea[] = {
                    sf::Vertex{p1, colorLinea},
                    sf::Vertex{p2, colorLinea}
                };
                objetivo.draw(linea, 2, sf::PrimitiveType::Lines);
            }
        }

        offsetPeso += tamActual * tamSiguiente + tamSiguiente;
    }

    // Dibujar neuronas
    for (size_t capa = 0; capa < layout.size(); ++capa) {
        for (size_t neurona = 0; neurona < layout[capa].size(); ++neurona) {
            sf::Vector2f pos = layout[capa][neurona];

            // Radio según la capa (entrada más pequeña)
            float radio = (capa == 0) ? 3.0f : 5.0f;
            if (capa == layout.size() - 1) radio = 8.0f; // Salida más grande

            // Color según activación
            sf::Color color = sf::Color(100, 100, 120);
            if (capa < activaciones.capas.size() &&
                neurona < activaciones.capas[capa].size()) {
                color = colorActivacion(activaciones.capas[capa][neurona]);
            }

            sf::CircleShape circulo(radio);
            circulo.setOrigin({radio, radio});
            circulo.setPosition(pos);
            circulo.setFillColor(color);
            circulo.setOutlineColor(sf::Color(180, 180, 200));
            circulo.setOutlineThickness(0.5f);
            objetivo.draw(circulo);
        }
    }

    // Etiquetas de capas
    sf::Text etiqueta(fuente_, "", 11);
    etiqueta.setFillColor(sf::Color(130, 130, 160));

    std::vector<std::string> nombreCapas;
    nombreCapas.push_back("Entrada (" + std::to_string(arq[0]) + ")");
    for (size_t i = 1; i < arq.size() - 1; ++i) {
        nombreCapas.push_back("Oculta " + std::to_string(i) + " (" + std::to_string(arq[i]) + ")");
    }
    nombreCapas.push_back("Salida (" + std::to_string(arq.back()) + ")");

    for (size_t capa = 0; capa < layout.size(); ++capa) {
        if (layout[capa].empty()) continue;
        float x = layout[capa][0].x;
        etiqueta.setString(nombreCapas[capa]);
        sf::FloatRect bounds = etiqueta.getLocalBounds();
        etiqueta.setOrigin({bounds.position.x + bounds.size.x / 2.0f, 0});
        etiqueta.setPosition({x, area.position.y + area.size.y - 15});
        objetivo.draw(etiqueta);
    }

    // Etiquetas de la capa de salida
    if (!layout.empty()) {
        etiqueta.setCharacterSize(12);
        etiqueta.setFillColor(COLOR_TEXTO);
        if (arq.back() == 1) {
            // Evaluador de posiciones: una sola salida "Score"
            sf::Vector2f pos = layout.back()[0];
            etiqueta.setString("Score");
            sf::FloatRect bounds = etiqueta.getLocalBounds();
            etiqueta.setOrigin({0, bounds.position.y + bounds.size.y / 2.0f});
            etiqueta.setPosition({pos.x + 12, pos.y});
            objetivo.draw(etiqueta);
        } else if (layout.back().size() <= static_cast<size_t>(NUM_ACCIONES)) {
            for (size_t i = 0; i < layout.back().size() && i < NOMBRES_ACCIONES.size(); ++i) {
                sf::Vector2f pos = layout.back()[i];
                etiqueta.setString(NOMBRES_ACCIONES[i]);
                sf::FloatRect bounds = etiqueta.getLocalBounds();
                etiqueta.setOrigin({0, bounds.position.y + bounds.size.y / 2.0f});
                etiqueta.setPosition({pos.x + 12, pos.y});
                objetivo.draw(etiqueta);
            }
        }
    }
}

void VisualizadorRed::renderizarCompacto(sf::RenderTarget& objetivo, const RedNeuronal& red,
                                           const ActivacionesRed& activaciones,
                                           sf::FloatRect area) const {
    const auto& arq = red.obtenerArquitectura();
    auto layout = calcularLayout(arq, area);

    // Solo dibujar neuronas (sin conexiones para velocidad)
    for (size_t capa = 0; capa < layout.size(); ++capa) {
        for (size_t neurona = 0; neurona < layout[capa].size(); ++neurona) {
            sf::Vector2f pos = layout[capa][neurona];
            float radio = 2.0f;

            sf::Color color = sf::Color(80, 80, 100);
            if (capa < activaciones.capas.size() &&
                neurona < activaciones.capas[capa].size()) {
                color = colorActivacion(activaciones.capas[capa][neurona]);
            }

            sf::CircleShape circulo(radio);
            circulo.setOrigin({radio, radio});
            circulo.setPosition(pos);
            circulo.setFillColor(color);
            objetivo.draw(circulo);
        }
    }
}

void VisualizadorRed::renderizarBarrasAccion(sf::RenderTarget& objetivo,
                                               const std::vector<float>& salida,
                                               sf::Vector2f posicion,
                                               sf::Vector2f tamano) const {
    if (salida.empty()) return;

    // Normalizar salida raw de la NN a rango 0-1 para visualización (softmax)
    std::vector<float> probabilidades(salida.size());
    float maxVal = *std::max_element(salida.begin(), salida.end());
    float sumaExp = 0.0f;
    for (size_t i = 0; i < salida.size(); ++i) {
        probabilidades[i] = std::exp(salida[i] - maxVal);
        sumaExp += probabilidades[i];
    }
    for (auto& v : probabilidades) v /= sumaExp;

    int numAcciones = static_cast<int>(salida.size());
    float alturaBarra = (tamano.y - (numAcciones - 1) * 5.0f) / numAcciones;

    // Encontrar acción máxima
    int mejorAccion = 0;
    float mejorValor = salida[0];
    for (int i = 1; i < numAcciones; ++i) {
        if (salida[i] > mejorValor) {
            mejorValor = salida[i];
            mejorAccion = i;
        }
    }

    for (int i = 0; i < numAcciones && i < static_cast<int>(NOMBRES_ACCIONES.size()); ++i) {
        float y = posicion.y + i * (alturaBarra + 5.0f);

        // Etiqueta
        sf::Text etiqueta(fuente_, NOMBRES_ACCIONES[i], 13);
        etiqueta.setFillColor(i == mejorAccion ? COLOR_TEXTO_TITULO : COLOR_TEXTO);
        etiqueta.setPosition({posicion.x, y});
        objetivo.draw(etiqueta);

        // Fondo de la barra
        float barraX = posicion.x + 80;
        float barraAncho = tamano.x - 120;

        sf::RectangleShape fondoBarra(sf::Vector2f(barraAncho, alturaBarra));
        fondoBarra.setPosition({barraX, y});
        fondoBarra.setFillColor(sf::Color(40, 40, 50));
        objetivo.draw(fondoBarra);

        // Barra de probabilidad
        sf::Color colorBarra = (i == mejorAccion)
            ? sf::Color(80, 200, 80) : sf::Color(80, 80, 140);
        float anchoBarra = barraAncho * probabilidades[i];

        sf::RectangleShape barra(sf::Vector2f(anchoBarra, alturaBarra));
        barra.setPosition({barraX, y});
        barra.setFillColor(colorBarra);
        objetivo.draw(barra);

        // Porcentaje
        std::ostringstream ss;
        ss << std::fixed << std::setprecision(1) << (probabilidades[i] * 100) << "%";
        sf::Text porcentaje(fuente_, ss.str(), 11);
        porcentaje.setFillColor(COLOR_TEXTO);
        porcentaje.setPosition({barraX + barraAncho + 5, y});
        objetivo.draw(porcentaje);
    }
}

void VisualizadorRed::renderizarInfoPesos(sf::RenderTarget& objetivo, const RedNeuronal& red,
                                            sf::Vector2f posicion) const {
    auto pesos = red.obtenerPesos();
    if (pesos.empty()) return;

    float y = posicion.y;

    sf::Text texto(fuente_, "", 13);

    auto dibujarLinea = [&](const std::string& etiqueta, const std::string& valor) {
        texto.setFillColor(COLOR_TEXTO_TITULO);
        texto.setString(etiqueta);
        texto.setPosition({posicion.x, y});
        objetivo.draw(texto);

        texto.setFillColor(COLOR_TEXTO);
        texto.setString(valor);
        texto.setPosition({posicion.x + 130, y});
        objetivo.draw(texto);
        y += 18;
    };

    // Estadísticas globales de los pesos
    float media = std::accumulate(pesos.begin(), pesos.end(), 0.0f) / pesos.size();
    float maxPeso = *std::max_element(pesos.begin(), pesos.end());
    float minPeso = *std::min_element(pesos.begin(), pesos.end());

    float varianza = 0.0f;
    for (float p : pesos) {
        float diff = p - media;
        varianza += diff * diff;
    }
    float desviacion = std::sqrt(varianza / pesos.size());

    std::ostringstream ss;
    ss << std::fixed << std::setprecision(4);

    dibujarLinea("Total parametros:", std::to_string(red.obtenerTotalParametros()));

    ss.str(""); ss << media;
    dibujarLinea("Media pesos:", ss.str());

    ss.str(""); ss << desviacion;
    dibujarLinea("Desv. estandar:", ss.str());

    ss.str(""); ss << minPeso;
    dibujarLinea("Peso minimo:", ss.str());

    ss.str(""); ss << maxPeso;
    dibujarLinea("Peso maximo:", ss.str());

    // Arquitectura
    const auto& arq = red.obtenerArquitectura();
    std::string arqStr;
    for (size_t i = 0; i < arq.size(); ++i) {
        arqStr += std::to_string(arq[i]);
        if (i < arq.size() - 1) arqStr += " -> ";
    }
    dibujarLinea("Arquitectura:", arqStr);
}

sf::Color VisualizadorRed::colorActivacion(float valor) const {
    // Azul (negativo) → Blanco (cero) → Rojo (positivo)
    valor = std::max(-1.0f, std::min(1.0f, valor));

    if (valor >= 0) {
        int intensidad = static_cast<int>(valor * 255);
        return sf::Color(255, 255 - intensidad, 255 - intensidad);
    } else {
        int intensidad = static_cast<int>(-valor * 255);
        return sf::Color(255 - intensidad, 255 - intensidad, 255);
    }
}

sf::Color VisualizadorRed::colorPeso(float peso) const {
    // Verde (positivo) / Rojo (negativo) con alfa proporcional
    float abs_peso = std::min(std::abs(peso), 2.0f) / 2.0f;
    uint8_t alfa = static_cast<uint8_t>(abs_peso * 180);

    if (peso >= 0) {
        return sf::Color(50, 200, 50, alfa);
    } else {
        return sf::Color(200, 50, 50, alfa);
    }
}

float VisualizadorRed::grosorConexion(float peso) const {
    return std::min(std::abs(peso), 2.0f);
}

std::vector<std::vector<sf::Vector2f>> VisualizadorRed::calcularLayout(
    const std::vector<int>& arquitectura, sf::FloatRect area) const {

    std::vector<std::vector<sf::Vector2f>> layout;
    int numCapas = static_cast<int>(arquitectura.size());

    float margenX = 40.0f;
    float margenY = 25.0f;
    float espacioX = (area.size.x - 2 * margenX) / std::max(1, numCapas - 1);

    for (int capa = 0; capa < numCapas; ++capa) {
        std::vector<sf::Vector2f> posiciones;
        int numNeuronas = arquitectura[capa];

        // Para capas grandes, limitar el número de neuronas mostradas
        int maxMostrar = 30;
        int mostrar = std::min(numNeuronas, maxMostrar);

        float x = area.position.x + margenX + capa * espacioX;
        float espacioY = (area.size.y - 2 * margenY) / std::max(1, mostrar + 1);

        for (int n = 0; n < mostrar; ++n) {
            float y = area.position.y + margenY + (n + 1) * espacioY;
            // Mapear la neurona mostrada a la neurona real (sampling uniforme)
            posiciones.push_back(sf::Vector2f(x, y));
        }

        layout.push_back(posiciones);
    }

    return layout;
}

} // namespace tetris
