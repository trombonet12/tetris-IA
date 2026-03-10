// =============================================================================
// Tetris con IA Evolutiva - Implementación Modo Normal (jugado por usuario)
// Autor: Joan L.
// Descripción: Modo de juego manual con controles de teclado y click.
//              Flechas/WASD para mover, Espacio para hard drop, C para hold.
//              HUD completo con puntuación, nivel, siguientes piezas y stats.
// =============================================================================
#include "modos/ModoNormal.h"
#include <sstream>

namespace tetris {

ModoNormal::ModoNormal(const sf::Font& fuente)
    : tetris_()
    , renderizador_(fuente)
    , ui_(fuente)
    , fuente_(fuente)
    , timerDAS_(0.0f)
    , timerRepeticion_(0.0f)
    , accionDAS_(Accion::MOVER_IZQUIERDA)
    , dasActivo_(false)
{
    configurarBotones();
}

void ModoNormal::procesarEvento(const sf::Event& evento, const sf::RenderWindow& ventana) {
    // Botones de la interfaz
    botonPausa_.procesarEvento(evento, ventana);
    botonReiniciar_.procesarEvento(evento, ventana);
    botonVolver_.procesarEvento(evento, ventana);

    if (const auto* keyEvent = evento.getIf<sf::Event::KeyPressed>()) {
        switch (keyEvent->code) {
            // Movimiento izquierda
            case sf::Keyboard::Key::Left:
            case sf::Keyboard::Key::A:
                tetris_.ejecutarAccion(Accion::MOVER_IZQUIERDA);
                accionDAS_ = Accion::MOVER_IZQUIERDA;
                timerDAS_ = 0.0f;
                dasActivo_ = true;
                break;

            // Movimiento derecha
            case sf::Keyboard::Key::Right:
            case sf::Keyboard::Key::D:
                tetris_.ejecutarAccion(Accion::MOVER_DERECHA);
                accionDAS_ = Accion::MOVER_DERECHA;
                timerDAS_ = 0.0f;
                dasActivo_ = true;
                break;

            // Bajar suave
            case sf::Keyboard::Key::Down:
            case sf::Keyboard::Key::S:
                tetris_.ejecutarAccion(Accion::BAJAR_SUAVE);
                accionDAS_ = Accion::BAJAR_SUAVE;
                timerDAS_ = 0.0f;
                dasActivo_ = true;
                break;

            // Rotación horaria
            case sf::Keyboard::Key::Up:
            case sf::Keyboard::Key::W:
            case sf::Keyboard::Key::X:
                tetris_.ejecutarAccion(Accion::ROTAR_HORARIO);
                break;

            // Rotación antihoraria
            case sf::Keyboard::Key::Z:
                tetris_.ejecutarAccion(Accion::ROTAR_ANTIHORARIO);
                break;

            // Caída dura (hard drop)
            case sf::Keyboard::Key::Space:
                tetris_.ejecutarAccion(Accion::CAIDA_DURA);
                break;

            // Hold
            case sf::Keyboard::Key::C:
            case sf::Keyboard::Key::LShift:
                tetris_.realizarHold();
                break;

            // Pausa
            case sf::Keyboard::Key::P:
                if (tetris_.obtenerEstado() == EstadoJuego::JUGANDO)
                    tetris_.pausar();
                else if (tetris_.obtenerEstado() == EstadoJuego::PAUSA)
                    tetris_.reanudar();
                break;

            // Reiniciar
            case sf::Keyboard::Key::R:
                tetris_.reiniciar();
                break;

            // Volver al menú
            case sf::Keyboard::Key::Escape:
                solicitarCambio(EstadoApp::MENU);
                break;

            default:
                break;
        }
    }

    // Soltar tecla: desactivar DAS
    if (const auto* keyRelease = evento.getIf<sf::Event::KeyReleased>()) {
        sf::Keyboard::Key tecla = keyRelease->code;
        bool soltoDAS = false;

        if ((tecla == sf::Keyboard::Key::Left || tecla == sf::Keyboard::Key::A) &&
            accionDAS_ == Accion::MOVER_IZQUIERDA) soltoDAS = true;
        if ((tecla == sf::Keyboard::Key::Right || tecla == sf::Keyboard::Key::D) &&
            accionDAS_ == Accion::MOVER_DERECHA) soltoDAS = true;
        if ((tecla == sf::Keyboard::Key::Down || tecla == sf::Keyboard::Key::S) &&
            accionDAS_ == Accion::BAJAR_SUAVE) soltoDAS = true;

        if (soltoDAS) dasActivo_ = false;
    }
}

void ModoNormal::actualizar(float dt) {
    // DAS (Delayed Auto Shift): repetición automática al mantener tecla pulsada
    if (dasActivo_ && tetris_.obtenerEstado() == EstadoJuego::JUGANDO) {
        timerDAS_ += dt;
        if (timerDAS_ >= DAS_DELAY) {
            timerRepeticion_ += dt;
            while (timerRepeticion_ >= DAS_REPEAT) {
                timerRepeticion_ -= DAS_REPEAT;
                tetris_.ejecutarAccion(accionDAS_);
            }
        }
    }

    tetris_.actualizar(dt);
}

void ModoNormal::renderizar(sf::RenderTarget& objetivo) {
    // Fondo
    sf::RectangleShape fondo(sf::Vector2f(
        static_cast<float>(VENTANA_ANCHO),
        static_cast<float>(VENTANA_ALTO)));
    fondo.setFillColor(COLOR_FONDO);
    objetivo.draw(fondo);

    // Título
    ui_.dibujarTitulo(objetivo, "MODO NORMAL", 30);

    // Tablero centrado
    float tableroX = (VENTANA_ANCHO - TABLERO_ANCHO * TAM_CELDA) / 2.0f - 80;
    float tableroY = 80;

    renderizador_.renderizarTablero(objetivo, tetris_,
                                     sf::Vector2f(tableroX, tableroY));

    // Botones
    botonPausa_.dibujar(objetivo);
    botonReiniciar_.dibujar(objetivo);
    botonVolver_.dibujar(objetivo);

    // Game over overlay
    if (tetris_.estaGameOver()) {
        renderizarGameOver(objetivo);
    }

    // Pausa overlay
    if (tetris_.obtenerEstado() == EstadoJuego::PAUSA) {
        sf::RectangleShape overlay(sf::Vector2f(
            static_cast<float>(VENTANA_ANCHO),
            static_cast<float>(VENTANA_ALTO)));
        overlay.setFillColor(sf::Color(0, 0, 0, 150));
        objetivo.draw(overlay);

        ui_.dibujarTexto(objetivo, "PAUSA",
                          sf::Vector2f(VENTANA_ANCHO / 2.0f - 60, VENTANA_ALTO / 2.0f - 30),
                          48, COLOR_TEXTO_TITULO);
        ui_.dibujarTexto(objetivo, "Pulsa P para continuar",
                          sf::Vector2f(VENTANA_ANCHO / 2.0f - 110, VENTANA_ALTO / 2.0f + 30),
                          20, COLOR_TEXTO);
    }
}

void ModoNormal::renderizarGameOver(sf::RenderTarget& objetivo) const {
    // Overlay semi-transparente
    sf::RectangleShape overlay(sf::Vector2f(
        static_cast<float>(VENTANA_ANCHO),
        static_cast<float>(VENTANA_ALTO)));
    overlay.setFillColor(sf::Color(0, 0, 0, 180));
    objetivo.draw(overlay);

    const auto& stats = tetris_.obtenerEstadisticas();

    // Panel central
    float panelAncho = 400;
    float panelAlto = 350;
    float panelX = (VENTANA_ANCHO - panelAncho) / 2.0f;
    float panelY = (VENTANA_ALTO - panelAlto) / 2.0f;

    ui_.dibujarPanel(objetivo,
                      sf::FloatRect({panelX, panelY}, {panelAncho, panelAlto}),
                      "");

    float y = panelY + 20;
    float x = panelX + 30;

    ui_.dibujarTexto(objetivo, "GAME OVER",
                      sf::Vector2f(panelX + 100, y), 36, sf::Color(255, 80, 80));
    y += 60;

    ui_.dibujarEtiquetaValor(objetivo, "Puntuacion:", std::to_string(stats.puntuacion),
                              sf::Vector2f(x, y), 20);
    y += 30;
    ui_.dibujarEtiquetaValor(objetivo, "Nivel:", std::to_string(stats.nivel),
                              sf::Vector2f(x, y), 20);
    y += 30;
    ui_.dibujarEtiquetaValor(objetivo, "Lineas:", std::to_string(stats.lineasTotales),
                              sf::Vector2f(x, y), 20);
    y += 30;
    ui_.dibujarEtiquetaValor(objetivo, "Tetris:", std::to_string(stats.tetrisCount),
                              sf::Vector2f(x, y), 20);
    y += 30;
    ui_.dibujarEtiquetaValor(objetivo, "Piezas:", std::to_string(stats.piezasColocadas),
                              sf::Vector2f(x, y), 20);
    y += 50;

    ui_.dibujarTexto(objetivo, "Pulsa R para reiniciar o ESC para volver",
                      sf::Vector2f(x - 10, y), 16, sf::Color(150, 150, 180));
}

void ModoNormal::configurarBotones() {
    float btnX = VENTANA_ANCHO - 200.0f;
    float btnY = 80.0f;
    sf::Vector2f btnTam(160, 40);

    botonPausa_.configurar("Pausa (P)", fuente_, sf::Vector2f(btnX, btnY), btnTam);
    botonPausa_.alHacerClick([this]() {
        if (tetris_.obtenerEstado() == EstadoJuego::JUGANDO)
            tetris_.pausar();
        else if (tetris_.obtenerEstado() == EstadoJuego::PAUSA)
            tetris_.reanudar();
    });

    botonReiniciar_.configurar("Reiniciar (R)", fuente_,
                                sf::Vector2f(btnX, btnY + 55), btnTam);
    botonReiniciar_.alHacerClick([this]() {
        tetris_.reiniciar();
    });

    botonVolver_.configurar("Volver (ESC)", fuente_,
                             sf::Vector2f(btnX, btnY + 110), btnTam);
    botonVolver_.alHacerClick([this]() {
        solicitarCambio(EstadoApp::MENU);
    });
}

} // namespace tetris
