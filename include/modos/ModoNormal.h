// =============================================================================
// Tetris con IA Evolutiva - Modo Normal (jugado por usuario)
// Autor: Joan L.
// Descripción: Modo de juego con control manual por teclado y click.
//              Incluye HUD completo con puntuación, nivel, siguientes piezas,
//              hold, pieza fantasma y pantalla de game over.
// =============================================================================
#pragma once

#include "ModoJuego.h"
#include "../juego/Tetris.h"
#include "../graficos/Renderizador.h"
#include "../graficos/InterfazUsuario.h"
#include "../graficos/Boton.h"
#include <SFML/Graphics.hpp>
#include <vector>

namespace tetris {

class ModoNormal : public ModoJuego {
public:
    ModoNormal(const sf::Font& fuente);

    void procesarEvento(const sf::Event& evento, const sf::RenderWindow& ventana) override;
    void actualizar(float dt) override;
    void renderizar(sf::RenderTarget& objetivo) override;

private:
    Tetris tetris_;
    Renderizador renderizador_;
    InterfazUsuario ui_;
    const sf::Font& fuente_;

    // Botones de la interfaz
    Boton botonPausa_;
    Boton botonReiniciar_;
    Boton botonVolver_;

    // Control DAS (Delayed Auto Shift) para movimiento continuo
    float timerDAS_;
    float timerRepeticion_;
    Accion accionDAS_;
    bool dasActivo_;

    // Renderiza la pantalla de game over
    void renderizarGameOver(sf::RenderTarget& objetivo) const;

    // Renderiza el HUD lateral
    void renderizarHUD(sf::RenderTarget& objetivo) const;

    // Configura los botones
    void configurarBotones();
};

} // namespace tetris
