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

    // Crear ventana
    ventana_.create(sf::VideoMode({static_cast<unsigned>(config_.anchoVentana),
                                    static_cast<unsigned>(config_.altoVentana)}),
                    "Tetris IA - Joan L.",
                    config_.pantallaCompleta ? sf::Style::None : sf::Style::Close);
    if (config_.pantallaCompleta) {
        ventana_.create(sf::VideoMode::getDesktopMode(), "Tetris IA - Joan L.",
                        sf::Style::None, sf::State::Fullscreen);
    }

    ventana_.setFramerateLimit(config_.fpsObjetivo);

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
    // El menú se renderiza directamente con InterfazUsuario
    estadoActual_ = EstadoApp::MENU;
}

void Aplicacion::procesarEventos() {
    while (const auto evento = ventana_.pollEvent()) {
        if (evento->is<sf::Event::Closed>()) {
            ventana_.close();
            return;
        }

        if (estadoActual_ == EstadoApp::MENU) {
            // Los botones del menú se gestionan aquí
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
        float btnX = (VENTANA_ANCHO - 300) / 2.0f;
        float btnY = 280;
        sf::Vector2f tamBtn(300, 55);
        float sep = 70;

        // Crear botones temporales para el menú
        Boton btnJugar("1 - Jugar", fuente_, sf::Vector2f(btnX, btnY), tamBtn);
        btnJugar.alHacerClick([this]() { cambiarModo(EstadoApp::MODO_NORMAL); });
        btnJugar.dibujar(ventana_);

        Boton btnEntrenar("2 - Entrenar IA", fuente_,
                           sf::Vector2f(btnX, btnY + sep), tamBtn);
        btnEntrenar.alHacerClick([this]() { cambiarModo(EstadoApp::MODO_ENTRENAMIENTO); });
        btnEntrenar.dibujar(ventana_);

        Boton btnVerIA("3 - Ver IA Entrenada", fuente_,
                        sf::Vector2f(btnX, btnY + sep * 2), tamBtn);
        btnVerIA.alHacerClick([this]() { cambiarModo(EstadoApp::MODO_IA_ENTRENADA); });
        btnVerIA.dibujar(ventana_);

        Boton btnSalir("ESC - Salir", fuente_,
                        sf::Vector2f(btnX, btnY + sep * 3), tamBtn);
        btnSalir.alHacerClick([this]() { ventana_.close(); });
        btnSalir.dibujar(ventana_);

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

} // namespace tetris
