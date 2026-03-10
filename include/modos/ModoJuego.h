// =============================================================================
// Tetris con IA Evolutiva - Interfaz base ModoJuego
// Autor: Joan L.
// Descripción: Clase base abstracta para todos los modos de la aplicación
//              (menú, juego normal, entrenamiento, IA entrenada, configuración).
// =============================================================================
#pragma once

#include "../juego/Constantes.h"
#include <SFML/Graphics.hpp>

namespace tetris {

class ModoJuego {
public:
    virtual ~ModoJuego() = default;

    // Procesa un evento de SFML (teclado, ratón, etc.)
    virtual void procesarEvento(const sf::Event& evento, const sf::RenderWindow& ventana) = 0;

    // Actualiza la lógica del modo. dt en segundos.
    virtual void actualizar(float dt) = 0;

    // Dibuja todo el contenido del modo
    virtual void renderizar(sf::RenderTarget& objetivo) = 0;

    // Devuelve true si este modo quiere cambiar de estado
    bool quiereCambiar() const { return cambiarEstado_; }

    // Devuelve el siguiente estado al que cambiar
    EstadoApp siguienteEstado() const { return siguienteEstado_; }

protected:
    bool cambiarEstado_ = false;
    EstadoApp siguienteEstado_ = EstadoApp::MENU;

    // Solicitar cambio de estado
    void solicitarCambio(EstadoApp estado) {
        cambiarEstado_ = true;
        siguienteEstado_ = estado;
    }
};

} // namespace tetris
