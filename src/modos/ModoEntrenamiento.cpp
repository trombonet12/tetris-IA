// =============================================================================
// Tetris con IA Evolutiva - Implementación Modo Entrenamiento
// Autor: Joan L.
// Descripción: Visualización del entrenamiento evolutivo con 50+ instancias
//              de Tetris simultáneas. Grid de mini-tableros, panel de parámetros
//              configurables, estadísticas en tiempo real, gráfica de fitness
//              y visualización de la red neuronal del agente seleccionado.
// =============================================================================
#include "modos/ModoEntrenamiento.h"
#include <sstream>
#include <iomanip>
#include <cmath>

namespace tetris {

ModoEntrenamiento::ModoEntrenamiento(const sf::Font& fuente)
    : entrenador_()
    , renderizador_(fuente)
    , ui_(fuente)
    , vizRed_(fuente)
    , fuente_(fuente)
    , agenteSeleccionado_(-1)
    , mostrarRedNeuronal_(false)
    , poblacionConfig_(AG_POBLACION_DEFECTO)
    , velocidadInicialConfig_(VELOCIDAD_X10)
{
    // Configurar el entrenador con valores por defecto
    entrenador_.configurar(AG_POBLACION_DEFECTO, NN_ARQUITECTURA_DEFECTO);
    configurarBotones();
}

ModoEntrenamiento::~ModoEntrenamiento() {
    entrenador_.detener();
}

void ModoEntrenamiento::procesarEvento(const sf::Event& evento,
                                         const sf::RenderWindow& ventana) {
    // Procesar botones
    botonIniciar_.procesarEvento(evento, ventana);
    botonPausar_.procesarEvento(evento, ventana);
    botonGuardar_.procesarEvento(evento, ventana);
    botonVolver_.procesarEvento(evento, ventana);

    for (auto& btn : botonesVelocidad_) {
        btn.procesarEvento(evento, ventana);
    }

    // Botones de configuración pre-inicio
    botonPoblacionMas_.procesarEvento(evento, ventana);
    botonPoblacionMenos_.procesarEvento(evento, ventana);
    for (auto& btn : botonesVelocidadInicial_) {
        btn.procesarEvento(evento, ventana);
    }

    // Click en mini-tablero para seleccionar agente
    if (const auto* mouseEvent = evento.getIf<sf::Event::MouseButtonPressed>()) {
        if (mouseEvent->button == sf::Mouse::Button::Left) {
            sf::Vector2f posRaton = ventana.mapPixelToCoords(
                sf::Vector2i(mouseEvent->position.x, mouseEvent->position.y));
            int idx = detectarClickTablero(posRaton);
            if (idx >= 0) {
                if (agenteSeleccionado_ == idx) {
                    // Deseleccionar
                    agenteSeleccionado_ = -1;
                    mostrarRedNeuronal_ = false;
                } else {
                    agenteSeleccionado_ = idx;
                    mostrarRedNeuronal_ = true;
                }
            }
        }
    }

    // Teclas rápidas
    if (const auto* keyEvent = evento.getIf<sf::Event::KeyPressed>()) {
        switch (keyEvent->code) {
            case sf::Keyboard::Key::Escape:
                entrenador_.detener();
                solicitarCambio(EstadoApp::MENU);
                break;
            case sf::Keyboard::Key::Space:
                if (entrenador_.obtenerEstado() == EstadoEntrenamiento::DETENIDO)
                    entrenador_.iniciar();
                else if (entrenador_.obtenerEstado() == EstadoEntrenamiento::EJECUTANDO)
                    entrenador_.pausar();
                else if (entrenador_.obtenerEstado() == EstadoEntrenamiento::PAUSADO)
                    entrenador_.reanudar();
                break;
            default:
                break;
        }
    }
}

void ModoEntrenamiento::actualizar(float dt) {
    actualizarHistorial();
}

void ModoEntrenamiento::renderizar(sf::RenderTarget& objetivo) {
    // Fondo
    sf::RectangleShape fondo(sf::Vector2f(
        static_cast<float>(VENTANA_ANCHO),
        static_cast<float>(VENTANA_ALTO)));
    fondo.setFillColor(COLOR_FONDO);
    objetivo.draw(fondo);

    // Layout:
    // [Panel parametros (250px)] [Grid mini-tableros (variable)] [Panel stats (350px)]
    // [Controles inferiores (full width, 120px)]

    renderizarPanelParametros(objetivo);
    renderizarGridEntrenamiento(objetivo);
    renderizarPanelEstadisticas(objetivo);
    renderizarControles(objetivo);

    // Si hay un agente seleccionado, mostrar su red neuronal
    if (mostrarRedNeuronal_ && agenteSeleccionado_ >= 0) {
        renderizarRedSeleccionada(objetivo);
    }
}

void ModoEntrenamiento::configurarBotones() {
    float y = VENTANA_ALTO - 110.0f;
    sf::Vector2f tamBtn(120, 35);

    botonIniciar_.configurar("Iniciar", fuente_, sf::Vector2f(270, y), tamBtn);
    botonIniciar_.alHacerClick([this]() {
        if (entrenador_.obtenerEstado() == EstadoEntrenamiento::DETENIDO) {
            entrenador_.configurar(poblacionConfig_, NN_ARQUITECTURA_DEFECTO);
            entrenador_.establecerVelocidad(velocidadInicialConfig_);
            entrenador_.iniciar();
        }
    });

    botonPausar_.configurar("Pausar", fuente_, sf::Vector2f(400, y), tamBtn);
    botonPausar_.alHacerClick([this]() {
        if (entrenador_.obtenerEstado() == EstadoEntrenamiento::EJECUTANDO)
            entrenador_.pausar();
        else if (entrenador_.obtenerEstado() == EstadoEntrenamiento::PAUSADO)
            entrenador_.reanudar();
    });

    botonGuardar_.configurar("Guardar", fuente_, sf::Vector2f(530, y), tamBtn);
    botonGuardar_.alHacerClick([this]() {
        int gen = entrenador_.obtenerGeneracion();
        float fit = entrenador_.obtenerMejorFitness();
        std::ostringstream ss;
        ss << "modelos/modelo_gen" << gen << "_fit" << static_cast<int>(fit) << ".bin";
        entrenador_.guardarMejorModelo(ss.str());
    });

    botonVolver_.configurar("Volver (ESC)", fuente_, sf::Vector2f(VENTANA_ANCHO - 160.0f, y),
                             sf::Vector2f(140, 35));
    botonVolver_.alHacerClick([this]() {
        entrenador_.detener();
        solicitarCambio(EstadoApp::MENU);
    });

    // Botones de velocidad
    std::vector<std::pair<std::string, float>> velocidades = {
        {"x1", VELOCIDAD_X1}, {"x2", VELOCIDAD_X2}, {"x5", VELOCIDAD_X5},
        {"x10", VELOCIDAD_X10}, {"Max", VELOCIDAD_MAX}
    };

    float velX = 700;
    for (const auto& [nombre, vel] : velocidades) {
        Boton btn(nombre, fuente_, sf::Vector2f(velX, y), sf::Vector2f(60, 35));
        float velocidad = vel;
        btn.alHacerClick([this, velocidad]() {
            entrenador_.establecerVelocidad(velocidad);
        });
        botonesVelocidad_.push_back(std::move(btn));
        velX += 70;
    }

    // ---- Botones de configuración pre-inicio (panel izquierdo) ----
    sf::Vector2f tamBtnPeq(30, 22);

    botonPoblacionMenos_.configurar("-", fuente_, sf::Vector2f(155, 30), tamBtnPeq);
    botonPoblacionMenos_.establecerTamanoTexto(14);
    botonPoblacionMenos_.alHacerClick([this]() {
        if (entrenador_.obtenerEstado() == EstadoEntrenamiento::DETENIDO && poblacionConfig_ > 10) {
            poblacionConfig_ -= 10;
        }
    });

    botonPoblacionMas_.configurar("+", fuente_, sf::Vector2f(190, 30), tamBtnPeq);
    botonPoblacionMas_.establecerTamanoTexto(14);
    botonPoblacionMas_.alHacerClick([this]() {
        if (entrenador_.obtenerEstado() == EstadoEntrenamiento::DETENIDO && poblacionConfig_ < 500) {
            poblacionConfig_ += 10;
        }
    });

    // Botones de velocidad inicial (en el panel izquierdo)
    std::vector<std::pair<std::string, float>> velIniciales = {
        {"x1", VELOCIDAD_X1}, {"x2", VELOCIDAD_X2}, {"x5", VELOCIDAD_X5},
        {"x10", VELOCIDAD_X10}, {"Max", VELOCIDAD_MAX}
    };

    float velIniX = 10;
    for (const auto& [nombre, vel] : velIniciales) {
        Boton btn(nombre, fuente_, sf::Vector2f(velIniX, 78), sf::Vector2f(44, 22));
        btn.establecerTamanoTexto(12);
        float velocidad = vel;
        btn.alHacerClick([this, velocidad]() {
            if (entrenador_.obtenerEstado() == EstadoEntrenamiento::DETENIDO) {
                velocidadInicialConfig_ = velocidad;
                entrenador_.establecerVelocidad(velocidad);
            }
        });
        botonesVelocidadInicial_.push_back(std::move(btn));
        velIniX += 48;
    }
}

void ModoEntrenamiento::renderizarGridEntrenamiento(sf::RenderTarget& objetivo) const {
    // Área del grid: entre panel izquierdo (250) y panel derecho (350)
    float gridX = 260.0f;
    float gridY = 10.0f;
    float gridAncho = VENTANA_ANCHO - 260.0f - 360.0f;
    float gridAlto = VENTANA_ALTO - 130.0f;

    entrenador_.bloquear();
    const auto& agentes = entrenador_.obtenerAgentes();
    int numAgentes = static_cast<int>(agentes.size());

    if (numAgentes == 0) {
        entrenador_.desbloquear();
        ui_.dibujarTexto(const_cast<sf::RenderTarget&>(objetivo),
                          "Pulsa 'Iniciar' para comenzar el entrenamiento",
                          sf::Vector2f(gridX + 80, gridY + gridAlto / 2), 20, COLOR_TEXTO);
        return;
    }

    // Calcular grid óptimo
    int cols = static_cast<int>(std::ceil(std::sqrt(numAgentes * gridAncho / gridAlto)));
    int filas = static_cast<int>(std::ceil(static_cast<float>(numAgentes) / cols));

    float anchoMini = gridAncho / cols;
    float altoMini = gridAlto / filas;

    // Calcular escala para que el tablero quepa
    float escalaAncho = (anchoMini - 4) / (TABLERO_ANCHO * TAM_CELDA_MINI);
    float escalaAlto = (altoMini - 4) / (TABLERO_ALTO * TAM_CELDA_MINI);
    float escala = std::min(escalaAncho, escalaAlto);

    // Encontrar mejor agente
    int mejorIdx = 0;
    float mejorFit = -1e10f;
    for (int i = 0; i < numAgentes; ++i) {
        float fit = agentes[i].obtenerFitness();
        if (fit > mejorFit) {
            mejorFit = fit;
            mejorIdx = i;
        }
    }

    for (int i = 0; i < numAgentes; ++i) {
        int fila = i / cols;
        int col = i % cols;

        float x = gridX + col * anchoMini + 2;
        float y = gridY + fila * altoMini + 2;

        bool destacado = (i == mejorIdx) || (i == agenteSeleccionado_);

        renderizador_.renderizarTableroMini(
            const_cast<sf::RenderTarget&>(objetivo),
            agentes[i].obtenerTetris(),
            sf::Vector2f(x, y), escala, destacado);
    }

    entrenador_.desbloquear();
}

void ModoEntrenamiento::renderizarPanelParametros(sf::RenderTarget& objetivo) const {
    sf::FloatRect area({0, 0}, {250, VENTANA_ALTO - 120.0f});
    ui_.dibujarPanel(objetivo, area, "PARAMETROS");

    float x = 10;
    float y = 30;
    float sep = 22;

    bool detenido = (entrenador_.obtenerEstado() == EstadoEntrenamiento::DETENIDO);

    const auto& ag = entrenador_.obtenerAlgoritmoGenetico();

    std::ostringstream ss;
    ss << std::fixed << std::setprecision(3);

    // Población: editable si detenido
    if (detenido) {
        ui_.dibujarEtiquetaValor(objetivo, "Poblacion:",
                                  std::to_string(poblacionConfig_),
                                  sf::Vector2f(x, y), 14);
        botonPoblacionMenos_.dibujar(const_cast<sf::RenderTarget&>(objetivo));
        botonPoblacionMas_.dibujar(const_cast<sf::RenderTarget&>(objetivo));
    } else {
        ui_.dibujarEtiquetaValor(objetivo, "Poblacion:",
                                  std::to_string(entrenador_.obtenerTamPoblacion()),
                                  sf::Vector2f(x, y), 14);
    }
    y += sep;

    // Velocidad inicial: selector si detenido
    if (detenido) {
        std::string velStr;
        if (velocidadInicialConfig_ >= VELOCIDAD_MAX) velStr = "Max";
        else { std::ostringstream vs; vs << "x" << static_cast<int>(velocidadInicialConfig_); velStr = vs.str(); }
        ui_.dibujarEtiquetaValor(objetivo, "Velocidad:", velStr,
                                  sf::Vector2f(x, y), 14);
        y += 18;
        for (const auto& btn : botonesVelocidadInicial_) {
            btn.dibujar(const_cast<sf::RenderTarget&>(objetivo));
        }
        y += 30;
    } else {
        y += sep;
    }

    ss.str(""); ss << ag.obtenerTasaMutacion();
    ui_.dibujarEtiquetaValor(objetivo, "Tasa mutacion:", ss.str(),
                              sf::Vector2f(x, y), 14);
    y += sep;

    ss.str(""); ss << ag.obtenerSigmaMutacion();
    ui_.dibujarEtiquetaValor(objetivo, "Sigma:", ss.str(),
                              sf::Vector2f(x, y), 14);
    y += sep;

    ss.str(""); ss << ag.obtenerPorcentajeElitismo() * 100 << "%";
    ui_.dibujarEtiquetaValor(objetivo, "Elitismo:", ss.str(),
                              sf::Vector2f(x, y), 14);
    y += sep;

    ui_.dibujarEtiquetaValor(objetivo, "Torneo:",
                              std::to_string(ag.obtenerTamTorneo()),
                              sf::Vector2f(x, y), 14);
    y += sep * 2;

    // Arquitectura de red
    ui_.dibujarTexto(objetivo, "Arquitectura red:", sf::Vector2f(x, y), 14, COLOR_TEXTO_TITULO);
    y += 18;

    const auto& arq = NN_ARQUITECTURA_DEFECTO;
    std::string arqStr;
    for (size_t i = 0; i < arq.size(); ++i) {
        arqStr += std::to_string(arq[i]);
        if (i < arq.size() - 1) arqStr += " > ";
    }
    ui_.dibujarTexto(objetivo, arqStr, sf::Vector2f(x, y), 12, COLOR_TEXTO);
    y += sep * 2;

    // Información de fitness
    ui_.dibujarTexto(objetivo, "Funcion fitness:", sf::Vector2f(x, y), 14, COLOR_TEXTO_TITULO);
    y += 18;
    ui_.dibujarTexto(objetivo, "+1/pieza colocada", sf::Vector2f(x, y), 12, COLOR_TEXTO);
    y += 16;
    ui_.dibujarTexto(objetivo, "+10/linea", sf::Vector2f(x, y), 12, COLOR_TEXTO);
    y += 16;
    ui_.dibujarTexto(objetivo, "+400/tetris (4 lineas)", sf::Vector2f(x, y), 12,
                      sf::Color(100, 255, 100));
    y += 16;
    ui_.dibujarTexto(objetivo, "-20 game over prematuro", sf::Vector2f(x, y), 12,
                      sf::Color(255, 100, 100));
    y += 16;
    ui_.dibujarTexto(objetivo, "-0.5 * alt. media", sf::Vector2f(x, y), 12, COLOR_TEXTO);
    y += 16;
    ui_.dibujarTexto(objetivo, "-0.3 * huecos", sf::Vector2f(x, y), 12, COLOR_TEXTO);
}

void ModoEntrenamiento::renderizarPanelEstadisticas(sf::RenderTarget& objetivo) const {
    float panelX = VENTANA_ANCHO - 350.0f;
    sf::FloatRect area({panelX, 0}, {350, VENTANA_ALTO - 120.0f});
    ui_.dibujarPanel(objetivo, area, "ESTADISTICAS");

    float x = panelX + 10;
    float y = 30;
    float sep = 22;

    auto stats = entrenador_.obtenerEstadisticasActuales();
    std::ostringstream ss;
    ss << std::fixed << std::setprecision(2);

    // Estado
    std::string estadoStr;
    switch (entrenador_.obtenerEstado()) {
        case EstadoEntrenamiento::DETENIDO: estadoStr = "Detenido"; break;
        case EstadoEntrenamiento::EJECUTANDO: estadoStr = "Ejecutando"; break;
        case EstadoEntrenamiento::PAUSADO: estadoStr = "Pausado"; break;
    }
    ui_.dibujarEtiquetaValor(objetivo, "Estado:", estadoStr, sf::Vector2f(x, y), 16);
    y += sep;

    ui_.dibujarEtiquetaValor(objetivo, "Generacion:",
                              std::to_string(entrenador_.obtenerGeneracion()),
                              sf::Vector2f(x, y), 16);
    y += sep;

    ui_.dibujarEtiquetaValor(objetivo, "Agentes activos:",
                              std::to_string(entrenador_.obtenerAgentesActivos()),
                              sf::Vector2f(x, y), 16);
    y += sep;

    // Barra de progreso
    ui_.dibujarTexto(objetivo, "Progreso:", sf::Vector2f(x, y), 14, COLOR_TEXTO_TITULO);
    y += 18;
    ui_.dibujarBarraProgreso(objetivo, sf::Vector2f(x, y),
                              sf::Vector2f(330, 18), entrenador_.obtenerProgreso());
    y += 30;

    ss.str(""); ss << stats.mejorFitness;
    ui_.dibujarEtiquetaValor(objetivo, "Mejor fitness:", ss.str(),
                              sf::Vector2f(x, y), 16);
    y += sep;

    ss.str(""); ss << stats.mediaFitness;
    ui_.dibujarEtiquetaValor(objetivo, "Media fitness:", ss.str(),
                              sf::Vector2f(x, y), 16);
    y += sep;

    ss.str(""); ss << stats.peorFitness;
    ui_.dibujarEtiquetaValor(objetivo, "Peor fitness:", ss.str(),
                              sf::Vector2f(x, y), 16);
    y += sep;

    ss.str(""); ss << entrenador_.obtenerMejorFitness();
    ui_.dibujarEtiquetaValor(objetivo, "Mejor global:", ss.str(),
                              sf::Vector2f(x, y), 16);
    y += sep;

    ss.str(""); ss << entrenador_.obtenerVelocidad() << "x";
    ui_.dibujarEtiquetaValor(objetivo, "Velocidad:", ss.str(),
                              sf::Vector2f(x, y), 16);
    y += sep * 2;

    // Gráfica de fitness
    float grafAlto = area.position.y + area.size.y - y - 10;
    if (grafAlto > 100 && !historialMejor_.empty()) {
        ui_.dibujarGraficaFitness(objetivo,
                                   sf::FloatRect({x, y}, {330, grafAlto}),
                                   historialMejor_, historialMedia_, historialPeor_);
    }
}

void ModoEntrenamiento::renderizarRedSeleccionada(sf::RenderTarget& objetivo) const {
    // Overlay semi-transparente
    sf::RectangleShape overlay(sf::Vector2f(
        static_cast<float>(VENTANA_ANCHO),
        static_cast<float>(VENTANA_ALTO)));
    overlay.setFillColor(sf::Color(0, 0, 0, 200));
    objetivo.draw(overlay);

    entrenador_.bloquear();
    const auto& agentes = entrenador_.obtenerAgentes();

    if (agenteSeleccionado_ < 0 ||
        agenteSeleccionado_ >= static_cast<int>(agentes.size())) {
        entrenador_.desbloquear();
        return;
    }

    const auto& agente = agentes[agenteSeleccionado_];

    // Tablero del agente seleccionado (tamaño grande)
    float tableroX = 50;
    float tableroY = 50;
    renderizador_.renderizarTablero(
        const_cast<sf::RenderTarget&>(objetivo),
        agente.obtenerTetris(),
        sf::Vector2f(tableroX, tableroY));

    // Información del agente
    float infoX = tableroX + TABLERO_ANCHO * TAM_CELDA + 230;
    float infoY = 50;

    ui_.dibujarTexto(const_cast<sf::RenderTarget&>(objetivo),
                      "Agente #" + std::to_string(agenteSeleccionado_),
                      sf::Vector2f(infoX, infoY), 24, COLOR_TEXTO_TITULO);
    infoY += 35;

    std::ostringstream ss;
    ss << std::fixed << std::setprecision(2) << agente.obtenerFitness();
    ui_.dibujarEtiquetaValor(const_cast<sf::RenderTarget&>(objetivo),
                              "Fitness:", ss.str(), sf::Vector2f(infoX, infoY));
    infoY += 25;

    ui_.dibujarEtiquetaValor(const_cast<sf::RenderTarget&>(objetivo),
                              "Lineas:", std::to_string(agente.obtenerTetris().obtenerLineas()),
                              sf::Vector2f(infoX, infoY));
    infoY += 25;

    // Barras de acción
    ui_.dibujarTexto(const_cast<sf::RenderTarget&>(objetivo),
                      "Acciones:", sf::Vector2f(infoX, infoY), 16, COLOR_TEXTO_TITULO);
    infoY += 22;

    vizRed_.renderizarBarrasAccion(
        const_cast<sf::RenderTarget&>(objetivo),
        agente.obtenerUltimaSalida(),
        sf::Vector2f(infoX, infoY),
        sf::Vector2f(350, 160));
    infoY += 180;

    // Red neuronal
    auto entradaIA = agente.obtenerTetris().obtenerEntradaIA();
    auto activaciones = agente.obtenerRed().obtenerActivaciones(entradaIA);

    vizRed_.renderizar(
        const_cast<sf::RenderTarget&>(objetivo),
        agente.obtenerRed(),
        activaciones,
        sf::FloatRect({infoX, infoY}, {VENTANA_ANCHO - infoX - 20,
                       VENTANA_ALTO - infoY - 50}));

    // Info de pesos
    vizRed_.renderizarInfoPesos(
        const_cast<sf::RenderTarget&>(objetivo),
        agente.obtenerRed(),
        sf::Vector2f(tableroX, VENTANA_ALTO - 160.0f));

    entrenador_.desbloquear();

    // Texto de ayuda
    ui_.dibujarTexto(const_cast<sf::RenderTarget&>(objetivo),
                      "Click en el mismo agente o ESC para cerrar",
                      sf::Vector2f(VENTANA_ANCHO / 2.0f - 150, VENTANA_ALTO - 25.0f),
                      14, sf::Color(120, 120, 150));
}

void ModoEntrenamiento::renderizarControles(sf::RenderTarget& objetivo) const {
    // Fondo de controles
    sf::FloatRect area({0, VENTANA_ALTO - 120.0f}, {static_cast<float>(VENTANA_ANCHO), 120});
    ui_.dibujarPanel(const_cast<sf::RenderTarget&>(objetivo), area, "");

    botonIniciar_.dibujar(const_cast<sf::RenderTarget&>(objetivo));
    botonPausar_.dibujar(const_cast<sf::RenderTarget&>(objetivo));
    botonGuardar_.dibujar(const_cast<sf::RenderTarget&>(objetivo));
    botonVolver_.dibujar(const_cast<sf::RenderTarget&>(objetivo));

    for (const auto& btn : botonesVelocidad_) {
        btn.dibujar(const_cast<sf::RenderTarget&>(objetivo));
    }

    // Etiqueta de velocidad
    ui_.dibujarTexto(const_cast<sf::RenderTarget&>(objetivo),
                      "Velocidad:", sf::Vector2f(640, VENTANA_ALTO - 107.0f),
                      14, COLOR_TEXTO_TITULO);
}

int ModoEntrenamiento::detectarClickTablero(sf::Vector2f posRaton) const {
    float gridX = 260.0f;
    float gridY = 10.0f;
    float gridAncho = VENTANA_ANCHO - 260.0f - 360.0f;
    float gridAlto = VENTANA_ALTO - 130.0f;

    int numAgentes = entrenador_.obtenerTamPoblacion();
    if (numAgentes == 0) return -1;

    int cols = static_cast<int>(std::ceil(std::sqrt(numAgentes * gridAncho / gridAlto)));
    int filas = static_cast<int>(std::ceil(static_cast<float>(numAgentes) / cols));

    float anchoMini = gridAncho / cols;
    float altoMini = gridAlto / filas;

    // Verificar si el click está dentro del grid
    if (posRaton.x < gridX || posRaton.x > gridX + gridAncho ||
        posRaton.y < gridY || posRaton.y > gridY + gridAlto) {
        return -1;
    }

    int col = static_cast<int>((posRaton.x - gridX) / anchoMini);
    int fila = static_cast<int>((posRaton.y - gridY) / altoMini);

    int idx = fila * cols + col;
    if (idx >= 0 && idx < numAgentes) return idx;
    return -1;
}

void ModoEntrenamiento::actualizarHistorial() {
    auto historial = entrenador_.obtenerHistorial();

    historialMejor_.clear();
    historialMedia_.clear();
    historialPeor_.clear();

    for (const auto& stats : historial) {
        historialMejor_.push_back(stats.mejorFitness);
        historialMedia_.push_back(stats.mediaFitness);
        historialPeor_.push_back(stats.peorFitness);
    }
}

} // namespace tetris
