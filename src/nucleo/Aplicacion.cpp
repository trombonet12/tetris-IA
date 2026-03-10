// =============================================================================
// Tetris con IA Evolutiva - Implementación Aplicación
// Autor: Joan L.
// Descripción: Bucle principal de la aplicación, gestión de ventana SFML,
//              transiciones entre modos y carga de recursos.
// =============================================================================
#include "nucleo/Aplicacion.h"
#include "modos/ModoNormal.h"
#include "modos/ModoEntrenamiento.h"
#include "modos/ModoIAEntrenada.h"
#include "graficos/InterfazUsuario.h"
#include <iostream>

namespace tetris {

Aplicacion::Aplicacion()
    : estadoActual_(EstadoApp::MENU)
{
}

Aplicacion::~Aplicacion() {
    modoActual_.reset();
}

int Aplicacion::ejecutar() {
    if (!inicializar()) return 1;

    while (ventana_.isOpen()) {
        float dt = reloj_.restart().asSeconds();

        // Limitar delta time para evitar saltos (ej. al mover ventana)
        if (dt > 0.1f) dt = 0.1f;

        procesarEventos();
        actualizar(dt);
        renderizar();
    }

    return 0;
}

bool Aplicacion::inicializar() {
    // Detectar fuente del sistema
    if (!config_.detectarFuente()) {
        std::cerr << "Error: No se pudo encontrar una fuente del sistema." << std::endl;
        return false;
    }

    if (!cargarFuente()) {
        std::cerr << "Error: No se pudo cargar la fuente." << std::endl;
        return false;
    }

    // Crear ventana (redimensionable)
    ventana_.create(sf::VideoMode({static_cast<unsigned>(config_.anchoVentana),
                                    static_cast<unsigned>(config_.altoVentana)}),
                    "Tetris IA - Joan L.",
                    config_.pantallaCompleta ? sf::Style::None : sf::Style::Default);
    if (config_.pantallaCompleta) {
        ventana_.create(sf::VideoMode::getDesktopMode(), "Tetris IA - Joan L.",
                        sf::Style::None, sf::State::Fullscreen);
    }

    ventana_.setFramerateLimit(config_.fpsObjetivo);

    // Establecer vista con resolución de diseño (1920x1080) con letterbox
    actualizarVista(ventana_.getSize());

    // Crear menú principal
    crearMenuPrincipal();

    return true;
}

void Aplicacion::cambiarModo(EstadoApp nuevoEstado) {
    modoActual_.reset();
    estadoActual_ = nuevoEstado;

    switch (nuevoEstado) {
        case EstadoApp::MENU:
            crearMenuPrincipal();
            break;

        case EstadoApp::MODO_NORMAL:
            modoActual_ = std::make_unique<ModoNormal>(fuente_);
            break;

        case EstadoApp::MODO_ENTRENAMIENTO:
            modoActual_ = std::make_unique<ModoEntrenamiento>(fuente_);
            break;

        case EstadoApp::MODO_IA_ENTRENADA:
            modoActual_ = std::make_unique<ModoIAEntrenada>(fuente_);
            break;

        case EstadoApp::SALIR:
            ventana_.close();
            break;

        default:
            break;
    }
}

void Aplicacion::crearMenuPrincipal() {
    estadoActual_ = EstadoApp::MENU;

    // Crear botones persistentes del menú
    botonesMenu_.clear();

    float btnX = (VENTANA_ANCHO - 300) / 2.0f;
    float btnY = 280;
    sf::Vector2f tamBtn(300, 55);
    float sep = 70;

    Boton btnJugar("1 - Jugar", fuente_, sf::Vector2f(btnX, btnY), tamBtn);
    btnJugar.alHacerClick([this]() { cambiarModo(EstadoApp::MODO_NORMAL); });
    botonesMenu_.push_back(std::move(btnJugar));

    Boton btnEntrenar("2 - Entrenar IA", fuente_,
                       sf::Vector2f(btnX, btnY + sep), tamBtn);
    btnEntrenar.alHacerClick([this]() { cambiarModo(EstadoApp::MODO_ENTRENAMIENTO); });
    botonesMenu_.push_back(std::move(btnEntrenar));

    Boton btnVerIA("3 - Ver IA Entrenada", fuente_,
                    sf::Vector2f(btnX, btnY + sep * 2), tamBtn);
    btnVerIA.alHacerClick([this]() { cambiarModo(EstadoApp::MODO_IA_ENTRENADA); });
    botonesMenu_.push_back(std::move(btnVerIA));

    Boton btnSalir("ESC - Salir", fuente_,
                    sf::Vector2f(btnX, btnY + sep * 3), tamBtn);
    btnSalir.alHacerClick([this]() { ventana_.close(); });
    botonesMenu_.push_back(std::move(btnSalir));
}

void Aplicacion::procesarEventos() {
    while (const auto evento = ventana_.pollEvent()) {
        if (evento->is<sf::Event::Closed>()) {
            ventana_.close();
            return;
        }

        // Redimensionar: actualizar la vista para mantener aspecto
        if (const auto* resized = evento->getIf<sf::Event::Resized>()) {
            actualizarVista(resized->size);
        }

        if (estadoActual_ == EstadoApp::MENU) {
            // Procesar botones del menú
            for (auto& btn : botonesMenu_) {
                btn.procesarEvento(*evento, ventana_);
            }

            // Los atajos de teclado del menú
            if (const auto* keyEvent = evento->getIf<sf::Event::KeyPressed>()) {
                switch (keyEvent->code) {
                    case sf::Keyboard::Key::Num1:
                        cambiarModo(EstadoApp::MODO_NORMAL);
                        break;
                    case sf::Keyboard::Key::Num2:
                        cambiarModo(EstadoApp::MODO_ENTRENAMIENTO);
                        break;
                    case sf::Keyboard::Key::Num3:
                        cambiarModo(EstadoApp::MODO_IA_ENTRENADA);
                        break;
                    case sf::Keyboard::Key::Escape:
                        ventana_.close();
                        return;
                    default:
                        break;
                }
            }
        } else if (modoActual_) {
            modoActual_->procesarEvento(*evento, ventana_);
        }
    }
}

void Aplicacion::actualizar(float dt) {
    if (modoActual_) {
        modoActual_->actualizar(dt);

        // Comprobar si el modo ha solicitado un cambio de estado
        if (modoActual_->quiereCambiar()) {
            cambiarModo(modoActual_->siguienteEstado());
        }
    }
}

void Aplicacion::renderizar() {
    ventana_.clear(COLOR_FONDO);

    if (estadoActual_ == EstadoApp::MENU) {
        // Renderizar menú principal
        InterfazUsuario ui(fuente_);

        // Título
        ui.dibujarTitulo(ventana_, "TETRIS IA", 80);

        // Subtítulo
        sf::Text subtitulo(fuente_, "IA Evolutiva con CUDA - por Joan L.", 20);
        subtitulo.setFillColor(sf::Color(150, 150, 200));
        auto subtBounds = subtitulo.getLocalBounds();
        subtitulo.setPosition({(VENTANA_ANCHO - subtBounds.size.x) / 2, 170});
        ventana_.draw(subtitulo);

        // Botones del menú
        for (const auto& btn : botonesMenu_) {
            btn.dibujar(ventana_);
        }

        // Info al pie
        sf::Text info(fuente_, "Controles menu: 1/2/3 + Enter o click | ESC = Salir", 14);
        info.setFillColor(sf::Color(100, 100, 130));
        auto infoBounds = info.getLocalBounds();
        info.setPosition({(VENTANA_ANCHO - infoBounds.size.x) / 2,
                          VENTANA_ALTO - 40.0f});
        ventana_.draw(info);

    } else if (modoActual_) {
        modoActual_->renderizar(ventana_);
    }

    ventana_.display();
}

bool Aplicacion::cargarFuente() {
    return fuente_.openFromFile(config_.rutaFuente);
}

void Aplicacion::actualizarVista(sf::Vector2u tamanoVentana) {
    // Resolución de diseño fija
    constexpr float disenoAncho = static_cast<float>(VENTANA_ANCHO);
    constexpr float disenoAlto = static_cast<float>(VENTANA_ALTO);
    constexpr float aspectoDiseno = disenoAncho / disenoAlto;

    float ventanaAncho = static_cast<float>(tamanoVentana.x);
    float ventanaAlto = static_cast<float>(tamanoVentana.y);
    float aspectoVentana = ventanaAncho / ventanaAlto;

    sf::View vista(sf::FloatRect({0, 0}, {disenoAncho, disenoAlto}));

    // Letterbox: ajustar viewport para mantener aspecto
    float viewportAncho = 1.0f;
    float viewportAlto = 1.0f;
    float viewportX = 0.0f;
    float viewportY = 0.0f;

    if (aspectoVentana > aspectoDiseno) {
        // Ventana más ancha → barras laterales
        viewportAncho = aspectoDiseno / aspectoVentana;
        viewportX = (1.0f - viewportAncho) / 2.0f;
    } else {
        // Ventana más alta → barras arriba/abajo
        viewportAlto = aspectoVentana / aspectoDiseno;
        viewportY = (1.0f - viewportAlto) / 2.0f;
    }

    vista.setViewport(sf::FloatRect({viewportX, viewportY}, {viewportAncho, viewportAlto}));
    ventana_.setView(vista);
}

} // namespace tetris
