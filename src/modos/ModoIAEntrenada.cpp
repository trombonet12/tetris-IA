// =============================================================================
// Tetris con IA Evolutiva - Implementación Modo IA Entrenada
// Autor: Joan L.
// Descripción: Modo para observar una IA previamente entrenada jugando.
//              Tablero a tamaño completo, visualización de la red neuronal
//              en tiempo real y barras de confianza por acción.
// =============================================================================
#include "modos/ModoIAEntrenada.h"
#include "nucleo/GestorModelos.h"
#include <sstream>
#include <iomanip>
#include <filesystem>

namespace tetris {

ModoIAEntrenada::ModoIAEntrenada(const sf::Font& fuente)
    : renderizador_(fuente)
    , ui_(fuente)
    , vizRed_(fuente)
    , fuente_(fuente)
    , velocidad_(5.0f)
    , timerPaso_(0.0f)
    , modeloCargado_(false)
    , modeloSeleccionado_(-1)
{
    configurarBotones();
    buscarModelos();
}

void ModoIAEntrenada::procesarEvento(const sf::Event& evento,
                                       const sf::RenderWindow& ventana) {
    botonCargar_.procesarEvento(evento, ventana);
    botonReiniciar_.procesarEvento(evento, ventana);
    botonVolver_.procesarEvento(evento, ventana);

    for (auto& btn : botonesVelocidad_) {
        btn.procesarEvento(evento, ventana);
    }

    if (const auto* keyEvent = evento.getIf<sf::Event::KeyPressed>()) {
        switch (keyEvent->code) {
            case sf::Keyboard::Key::Escape:
                solicitarCambio(EstadoApp::MENU);
                break;

            case sf::Keyboard::Key::R:
                if (agente_) {
                    agente_->reiniciar();
                }
                break;

            // Navegar lista de modelos
            case sf::Keyboard::Key::Up:
                if (!modelosDisponibles_.empty()) {
                    modeloSeleccionado_ = std::max(0, modeloSeleccionado_ - 1);
                }
                break;

            case sf::Keyboard::Key::Down:
                if (!modelosDisponibles_.empty()) {
                    modeloSeleccionado_ = std::min(
                        static_cast<int>(modelosDisponibles_.size()) - 1,
                        modeloSeleccionado_ + 1);
                }
                break;

            case sf::Keyboard::Key::Enter:
                if (modeloSeleccionado_ >= 0 &&
                    modeloSeleccionado_ < static_cast<int>(modelosDisponibles_.size())) {
                    cargarModelo(modelosDisponibles_[modeloSeleccionado_]);
                }
                break;

            default:
                break;
        }
    }

    // Click en modelo de la lista
    if (const auto* mouseEvent = evento.getIf<sf::Event::MouseButtonPressed>()) {
        if (mouseEvent->button == sf::Mouse::Button::Left) {
            float listaX = VENTANA_ANCHO - 350.0f;
            float listaY = 250.0f;
            float alturaItem = 25.0f;

            float mouseX = static_cast<float>(mouseEvent->position.x);
            float mouseY = static_cast<float>(mouseEvent->position.y);

            if (mouseX >= listaX && mouseX <= listaX + 330) {
                int idx = static_cast<int>((mouseY - listaY) / alturaItem);
                if (idx >= 0 && idx < static_cast<int>(modelosDisponibles_.size())) {
                    modeloSeleccionado_ = idx;
                    cargarModelo(modelosDisponibles_[idx]);
                }
            }
        }
    }
}

void ModoIAEntrenada::actualizar(float dt) {
    if (!agente_ || !modeloCargado_) return;

    timerPaso_ += dt;
    float intervalo = 1.0f / velocidad_;

    while (timerPaso_ >= intervalo) {
        timerPaso_ -= intervalo;

        if (agente_->estaActivo()) {
            agente_->jugarPaso();

            // Actualizar activaciones para visualización
            auto entrada = agente_->obtenerTetris().obtenerEntradaIA();
            activacionesActuales_ = agente_->obtenerRed().obtenerActivaciones(entrada);
        }
    }
}

void ModoIAEntrenada::renderizar(sf::RenderTarget& objetivo) {
    // Fondo
    sf::RectangleShape fondo(sf::Vector2f(
        static_cast<float>(VENTANA_ANCHO),
        static_cast<float>(VENTANA_ALTO)));
    fondo.setFillColor(COLOR_FONDO);
    objetivo.draw(fondo);

    ui_.dibujarTitulo(objetivo, "IA ENTRENADA", 30);

    if (!modeloCargado_ || !agente_) {
        // Mostrar lista de modelos para cargar
        ui_.dibujarTexto(objetivo,
                          "Selecciona un modelo para cargar:",
                          sf::Vector2f(50, 80), 22, COLOR_TEXTO);

        renderizarListaModelos(objetivo);

        ui_.dibujarTexto(objetivo,
                          "Usa flechas arriba/abajo y Enter para seleccionar, o haz click en un modelo",
                          sf::Vector2f(50, VENTANA_ALTO - 40.0f), 14, sf::Color(120, 120, 150));
    } else {
        // Tablero del agente
        float tableroX = 80;
        float tableroY = 80;

        renderizador_.renderizarTablero(objetivo, agente_->obtenerTetris(),
                                         sf::Vector2f(tableroX, tableroY));

        // Panel de IA a la derecha
        renderizarPanelIA(objetivo);
    }

    // Botones
    botonCargar_.dibujar(objetivo);
    botonReiniciar_.dibujar(objetivo);
    botonVolver_.dibujar(objetivo);

    for (const auto& btn : botonesVelocidad_) {
        btn.dibujar(objetivo);
    }
}

void ModoIAEntrenada::configurarBotones() {
    float btnX = 50;
    float btnY = VENTANA_ALTO - 60.0f;
    sf::Vector2f tamBtn(130, 35);

    botonCargar_.configurar("Recargar lista", fuente_, sf::Vector2f(btnX, btnY), tamBtn);
    botonCargar_.alHacerClick([this]() {
        buscarModelos();
    });

    botonReiniciar_.configurar("Reiniciar (R)", fuente_,
                                sf::Vector2f(btnX + 145, btnY), tamBtn);
    botonReiniciar_.alHacerClick([this]() {
        if (agente_) agente_->reiniciar();
    });

    botonVolver_.configurar("Volver (ESC)", fuente_,
                             sf::Vector2f(VENTANA_ANCHO - 160.0f, btnY), sf::Vector2f(140, 35));
    botonVolver_.alHacerClick([this]() {
        solicitarCambio(EstadoApp::MENU);
    });

    // Botones de velocidad
    std::vector<std::pair<std::string, float>> velocidades = {
        {"Lenta", 2.0f}, {"Normal", 5.0f}, {"Rapida", 15.0f}, {"x50", 50.0f}
    };

    float velX = btnX + 300;
    for (const auto& [nombre, vel] : velocidades) {
        Boton btn(nombre, fuente_, sf::Vector2f(velX, btnY), sf::Vector2f(80, 35));
        float velocidad = vel;
        btn.alHacerClick([this, velocidad]() {
            velocidad_ = velocidad;
        });
        botonesVelocidad_.push_back(std::move(btn));
        velX += 90;
    }
}

void ModoIAEntrenada::buscarModelos() {
    modelosDisponibles_.clear();

    try {
        for (const auto& entry : std::filesystem::directory_iterator("modelos")) {
            if (entry.path().extension() == ".bin") {
                modelosDisponibles_.push_back(entry.path().string());
            }
        }
    } catch (...) {
        // El directorio puede no existir aún
    }

    std::sort(modelosDisponibles_.begin(), modelosDisponibles_.end());
}

void ModoIAEntrenada::cargarModelo(const std::string& ruta) {
    agente_ = std::make_unique<Agente>(NN_ARQUITECTURA_DEFECTO);

    if (agente_->obtenerRed().cargar(ruta)) {
        rutaModelo_ = ruta;
        modeloCargado_ = true;
        timerPaso_ = 0.0f;
    } else {
        agente_.reset();
        modeloCargado_ = false;
    }
}

void ModoIAEntrenada::renderizarPanelIA(sf::RenderTarget& objetivo) const {
    if (!agente_) return;

    float panelX = 80 + TABLERO_ANCHO * TAM_CELDA + 230;
    float panelY = 80;

    // Info del modelo
    ui_.dibujarTexto(objetivo, "Modelo: " + rutaModelo_,
                      sf::Vector2f(panelX, panelY), 14, sf::Color(150, 150, 180));
    panelY += 25;

    const auto& stats = agente_->obtenerTetris().obtenerEstadisticas();
    std::ostringstream ss;
    ss << std::fixed << std::setprecision(2);

    ss.str(""); ss << agente_->obtenerFitness();
    ui_.dibujarEtiquetaValor(objetivo, "Fitness:", ss.str(),
                              sf::Vector2f(panelX, panelY));
    panelY += 22;

    ui_.dibujarEtiquetaValor(objetivo, "Puntos:", std::to_string(stats.puntuacion),
                              sf::Vector2f(panelX, panelY));
    panelY += 22;

    ui_.dibujarEtiquetaValor(objetivo, "Lineas:", std::to_string(stats.lineasTotales),
                              sf::Vector2f(panelX, panelY));
    panelY += 22;

    ui_.dibujarEtiquetaValor(objetivo, "Tetris:", std::to_string(stats.tetrisCount),
                              sf::Vector2f(panelX, panelY));
    panelY += 22;

    ui_.dibujarEtiquetaValor(objetivo, "Piezas:", std::to_string(stats.piezasColocadas),
                              sf::Vector2f(panelX, panelY));
    panelY += 22;

    ss.str(""); ss << velocidad_ << " pasos/s";
    ui_.dibujarEtiquetaValor(objetivo, "Velocidad:", ss.str(),
                              sf::Vector2f(panelX, panelY));
    panelY += 35;

    // Barras de acción
    ui_.dibujarTexto(objetivo, "Decisiones de la IA:",
                      sf::Vector2f(panelX, panelY), 16, COLOR_TEXTO_TITULO);
    panelY += 22;

    vizRed_.renderizarBarrasAccion(objetivo, agente_->obtenerUltimaSalida(),
                                    sf::Vector2f(panelX, panelY),
                                    sf::Vector2f(400, 170));
    panelY += 190;

    // Red neuronal
    float redAlto = VENTANA_ALTO - panelY - 80;
    if (redAlto > 150) {
        ui_.dibujarTexto(objetivo, "Red neuronal:",
                          sf::Vector2f(panelX, panelY), 16, COLOR_TEXTO_TITULO);
        panelY += 22;

        vizRed_.renderizar(objetivo, agente_->obtenerRed(), activacionesActuales_,
                           sf::FloatRect({panelX, panelY},
                                          {VENTANA_ANCHO - panelX - 20, redAlto - 30}));
    }

    // Game over
    if (agente_->obtenerTetris().estaGameOver()) {
        ui_.dibujarTexto(objetivo, "GAME OVER - Pulsa R para reiniciar",
                          sf::Vector2f(panelX, VENTANA_ALTO - 90.0f),
                          18, sf::Color(255, 100, 100));
    }
}

void ModoIAEntrenada::renderizarListaModelos(sf::RenderTarget& objetivo) const {
    float x = 50;
    float y = 120;

    if (modelosDisponibles_.empty()) {
        ui_.dibujarTexto(objetivo,
                          "No se encontraron modelos en el directorio 'modelos/'.",
                          sf::Vector2f(x, y), 18, sf::Color(200, 100, 100));
        ui_.dibujarTexto(objetivo,
                          "Entrena una IA primero en el modo 'Entrenar IA'.",
                          sf::Vector2f(x, y + 30), 16, COLOR_TEXTO);
        return;
    }

    for (int i = 0; i < static_cast<int>(modelosDisponibles_.size()); ++i) {
        sf::Color color = COLOR_TEXTO;
        if (i == modeloSeleccionado_) {
            color = COLOR_TEXTO_TITULO;

            // Fondo de selección
            sf::RectangleShape seleccion(sf::Vector2f(500, 22));
            seleccion.setPosition({x - 5, y - 2});
            seleccion.setFillColor(sf::Color(50, 50, 80));
            objetivo.draw(seleccion);
        }

        // Extraer solo el nombre del archivo
        std::string nombre = modelosDisponibles_[i];
        auto pos = nombre.find_last_of("/\\");
        if (pos != std::string::npos) nombre = nombre.substr(pos + 1);

        ui_.dibujarTexto(objetivo, nombre, sf::Vector2f(x, y), 16, color);
        y += 25;
    }
}

} // namespace tetris
