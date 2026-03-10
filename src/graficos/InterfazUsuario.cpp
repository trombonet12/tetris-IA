// =============================================================================
// Tetris con IA Evolutiva - Implementación de la Interfaz de Usuario
// Autor: Joan L.
// Descripción: Menú principal, paneles de información, gráficas de fitness
//              y elementos de UI genéricos para toda la aplicación.
// =============================================================================
#include "graficos/InterfazUsuario.h"
#include <sstream>
#include <iomanip>
#include <algorithm>
#include <cmath>

namespace tetris {

InterfazUsuario::InterfazUsuario(const sf::Font& fuente)
    : fuente_(fuente)
{
}

void InterfazUsuario::crearMenuPrincipal(std::function<void(EstadoApp)> callback) {
    botonesMenu_.clear();

    float centroX = VENTANA_ANCHO / 2.0f - 150;
    float inicioY = 350;
    float separacion = 80;
    sf::Vector2f tamBoton(300, 55);

    struct OpcionMenu {
        std::string texto;
        EstadoApp estado;
    };

    std::vector<OpcionMenu> opciones = {
        {"Jugar", EstadoApp::MODO_NORMAL},
        {"Entrenar IA", EstadoApp::MODO_ENTRENAMIENTO},
        {"Ver IA Entrenada", EstadoApp::MODO_IA_ENTRENADA},
        {"Salir", EstadoApp::SALIR}
    };

    for (size_t i = 0; i < opciones.size(); ++i) {
        sf::Vector2f pos(centroX, inicioY + i * separacion);
        Boton boton(opciones[i].texto, fuente_, pos, tamBoton);
        boton.establecerTamanoTexto(24);

        EstadoApp estado = opciones[i].estado;
        boton.alHacerClick([callback, estado]() {
            callback(estado);
        });

        botonesMenu_.push_back(std::move(boton));
    }
}

void InterfazUsuario::renderizarMenuPrincipal(sf::RenderTarget& objetivo) const {
    // Fondo
    sf::RectangleShape fondo(sf::Vector2f(
        static_cast<float>(VENTANA_ANCHO),
        static_cast<float>(VENTANA_ALTO)));
    fondo.setFillColor(COLOR_FONDO);
    objetivo.draw(fondo);

    // Título
    sf::Text titulo(fuente_, "TETRIS IA", 72);
    titulo.setFillColor(COLOR_TEXTO_TITULO);
    titulo.setStyle(sf::Text::Bold);

    // Centrar título
    sf::FloatRect bounds = titulo.getLocalBounds();
    titulo.setOrigin({bounds.position.x + bounds.size.x / 2.0f,
                      bounds.position.y + bounds.size.y / 2.0f});
    titulo.setPosition({VENTANA_ANCHO / 2.0f, 150});
    objetivo.draw(titulo);

    // Subtítulo
    sf::Text subtitulo(fuente_, "IA Evolutiva con CUDA - por Joan L.", 22);
    subtitulo.setFillColor(sf::Color(150, 150, 180));

    bounds = subtitulo.getLocalBounds();
    subtitulo.setOrigin({bounds.position.x + bounds.size.x / 2.0f,
                         bounds.position.y + bounds.size.y / 2.0f});
    subtitulo.setPosition({VENTANA_ANCHO / 2.0f, 240});
    objetivo.draw(subtitulo);

    // Botones
    for (const auto& boton : botonesMenu_) {
        boton.dibujar(objetivo);
    }

    // Pie de página
    sf::Text pie(fuente_, "Controles: Flechas/WASD = Mover | Espacio = Caida | C = Hold | ESC = Volver", 14);
    pie.setFillColor(sf::Color(100, 100, 130));
    bounds = pie.getLocalBounds();
    pie.setOrigin({bounds.position.x + bounds.size.x / 2.0f, 0});
    pie.setPosition({VENTANA_ANCHO / 2.0f, VENTANA_ALTO - 40.0f});
    objetivo.draw(pie);
}

bool InterfazUsuario::procesarEventoMenu(const sf::Event& evento,
                                          const sf::RenderWindow& ventana) {
    for (auto& boton : botonesMenu_) {
        if (boton.procesarEvento(evento, ventana)) {
            return true;
        }
    }
    return false;
}

void InterfazUsuario::dibujarPanel(sf::RenderTarget& objetivo, sf::FloatRect area,
                                     const std::string& titulo) const {
    // Fondo del panel
    sf::RectangleShape fondo(sf::Vector2f(area.size.x, area.size.y));
    fondo.setPosition({area.position.x, area.position.y});
    fondo.setFillColor(COLOR_PANEL);
    fondo.setOutlineColor(sf::Color(70, 70, 100));
    fondo.setOutlineThickness(1.0f);
    objetivo.draw(fondo);

    // Título del panel
    if (!titulo.empty()) {
        sf::Text textoTitulo(fuente_, titulo, 16);
        textoTitulo.setFillColor(COLOR_TEXTO_TITULO);
        textoTitulo.setStyle(sf::Text::Bold);
        textoTitulo.setPosition({area.position.x + 10, area.position.y + 5});
        objetivo.draw(textoTitulo);
    }
}

void InterfazUsuario::dibujarTexto(sf::RenderTarget& objetivo, const std::string& texto,
                                     sf::Vector2f posicion, unsigned int tamano,
                                     sf::Color color) const {
    sf::Text t(fuente_, texto, tamano);
    t.setFillColor(color);
    t.setPosition(posicion);
    objetivo.draw(t);
}

void InterfazUsuario::dibujarEtiquetaValor(sf::RenderTarget& objetivo,
                                             const std::string& etiqueta,
                                             const std::string& valor,
                                             sf::Vector2f posicion,
                                             unsigned int tamano) const {
    sf::Text t(fuente_, etiqueta, tamano);
    t.setFillColor(COLOR_TEXTO_TITULO);
    t.setPosition(posicion);
    objetivo.draw(t);

    float anchoEtiqueta = t.getLocalBounds().size.x;

    t.setFillColor(COLOR_TEXTO);
    t.setString(valor);
    t.setPosition({posicion.x + anchoEtiqueta + 8, posicion.y});
    objetivo.draw(t);
}

void InterfazUsuario::dibujarBarraProgreso(sf::RenderTarget& objetivo, sf::Vector2f posicion,
                                             sf::Vector2f tamano, float progreso,
                                             sf::Color color) const {
    progreso = std::max(0.0f, std::min(1.0f, progreso));

    // Fondo
    sf::RectangleShape fondo(tamano);
    fondo.setPosition(posicion);
    fondo.setFillColor(sf::Color(40, 40, 50));
    fondo.setOutlineColor(sf::Color(80, 80, 100));
    fondo.setOutlineThickness(1.0f);
    objetivo.draw(fondo);

    // Barra de progreso
    if (progreso > 0.0f) {
        sf::RectangleShape barra(sf::Vector2f(tamano.x * progreso, tamano.y));
        barra.setPosition(posicion);
        barra.setFillColor(color);
        objetivo.draw(barra);
    }

    // Porcentaje centrado
    std::ostringstream ss;
    ss << static_cast<int>(progreso * 100) << "%";
    sf::Text texto(fuente_, ss.str(), 12);
    texto.setFillColor(COLOR_TEXTO);
    sf::FloatRect bounds = texto.getLocalBounds();
    texto.setOrigin({bounds.position.x + bounds.size.x / 2.0f,
                     bounds.position.y + bounds.size.y / 2.0f});
    texto.setPosition({posicion.x + tamano.x / 2.0f,
                       posicion.y + tamano.y / 2.0f});
    objetivo.draw(texto);
}

void InterfazUsuario::dibujarGraficaFitness(sf::RenderTarget& objetivo, sf::FloatRect area,
                                              const std::vector<float>& mejores,
                                              const std::vector<float>& medias,
                                              const std::vector<float>& peores) const {
    // Fondo de la gráfica
    dibujarPanel(objetivo, area, "Fitness por Generacion");

    if (mejores.empty()) return;

    float margen = 30.0f;
    float grafX = area.position.x + margen;
    float grafY = area.position.y + margen;
    float grafAncho = area.size.x - 2 * margen;
    float grafAlto = area.size.y - 2 * margen;

    // Encontrar rango de valores
    float maxVal = *std::max_element(mejores.begin(), mejores.end());
    float minVal = 0.0f;
    if (!peores.empty()) {
        minVal = *std::min_element(peores.begin(), peores.end());
    }
    if (maxVal <= minVal) maxVal = minVal + 1.0f;

    float rangoY = maxVal - minVal;
    int numPuntos = static_cast<int>(mejores.size());
    float pasoX = (numPuntos > 1) ? grafAncho / (numPuntos - 1) : grafAncho;

    auto dibujarLinea = [&](const std::vector<float>& datos, sf::Color color) {
        if (datos.size() < 2) return;
        sf::VertexArray linea(sf::PrimitiveType::LineStrip, datos.size());
        for (size_t i = 0; i < datos.size(); ++i) {
            float x = grafX + i * pasoX;
            float y = grafY + grafAlto - ((datos[i] - minVal) / rangoY) * grafAlto;
            linea[i] = sf::Vertex{sf::Vector2f(x, y), color};
        }
        objetivo.draw(linea);
    };

    // Dibujar líneas: peor (rojo), media (amarillo), mejor (verde)
    dibujarLinea(peores, sf::Color(200, 60, 60));
    dibujarLinea(medias, sf::Color(200, 200, 60));
    dibujarLinea(mejores, sf::Color(60, 200, 60));

    // Leyenda
    float leyX = area.position.x + area.size.x - 120;
    float leyY = area.position.y + 8;
    auto dibujarLeyenda = [&](const std::string& nombre, sf::Color color) {
        sf::RectangleShape rect(sf::Vector2f(12, 12));
        rect.setPosition({leyX, leyY});
        rect.setFillColor(color);
        objetivo.draw(rect);

        sf::Text t(fuente_, nombre, 11);
        t.setFillColor(COLOR_TEXTO);
        t.setPosition({leyX + 16, leyY - 2});
        objetivo.draw(t);
        leyY += 16;
    };

    dibujarLeyenda("Mejor", sf::Color(60, 200, 60));
    dibujarLeyenda("Media", sf::Color(200, 200, 60));
    dibujarLeyenda("Peor", sf::Color(200, 60, 60));

    // Etiquetas de eje Y
    sf::Text etiqueta(fuente_, "", 10);
    etiqueta.setFillColor(sf::Color(120, 120, 150));

    std::ostringstream ss;
    ss << std::fixed << std::setprecision(1) << maxVal;
    etiqueta.setString(ss.str());
    etiqueta.setPosition({grafX - 25, grafY - 5});
    objetivo.draw(etiqueta);

    ss.str("");
    ss << std::fixed << std::setprecision(1) << minVal;
    etiqueta.setString(ss.str());
    etiqueta.setPosition({grafX - 25, grafY + grafAlto - 5});
    objetivo.draw(etiqueta);
}

void InterfazUsuario::dibujarTitulo(sf::RenderTarget& objetivo, const std::string& titulo,
                                      float y) const {
    sf::Text t(fuente_, titulo, 32);
    t.setFillColor(COLOR_TEXTO_TITULO);
    t.setStyle(sf::Text::Bold);

    sf::FloatRect bounds = t.getLocalBounds();
    t.setOrigin({bounds.position.x + bounds.size.x / 2.0f,
                 bounds.position.y + bounds.size.y / 2.0f});
    t.setPosition({VENTANA_ANCHO / 2.0f, y});
    objetivo.draw(t);
}

} // namespace tetris
