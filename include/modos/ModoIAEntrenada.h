// =============================================================================
// Tetris con IA Evolutiva - Modo IA Entrenada
// Autor: Joan L.
// Descripción: Modo para observar a una IA previamente entrenada jugando al
//              Tetris. Muestra el tablero a tamaño completo junto con la
//              visualización de la red neuronal y las barras de confianza
//              de cada acción.
// =============================================================================
#pragma once

#include "ModoJuego.h"
#include "../ia/Agente.h"
#include "../graficos/Renderizador.h"
#include "../graficos/InterfazUsuario.h"
#include "../graficos/VisualizadorRed.h"
#include "../graficos/Boton.h"
#include <SFML/Graphics.hpp>
#include <string>

namespace tetris {

class ModoIAEntrenada : public ModoJuego {
public:
    ModoIAEntrenada(const sf::Font& fuente);

    void procesarEvento(const sf::Event& evento, const sf::RenderWindow& ventana) override;
    void actualizar(float dt) override;
    void renderizar(sf::RenderTarget& objetivo) override;

private:
    std::unique_ptr<Agente> agente_;
    Renderizador renderizador_;
    InterfazUsuario ui_;
    VisualizadorRed vizRed_;
    const sf::Font& fuente_;

    // Velocidad de juego
    float velocidad_;
    float timerPaso_;

    // Modelo actualmente cargado
    std::string rutaModelo_;
    bool modeloCargado_;

    // Activaciones actuales para visualización
    ActivacionesRed activacionesActuales_;

    // Botones
    Boton botonCargar_;
    Boton botonReiniciar_;
    Boton botonVolver_;
    std::vector<Boton> botonesVelocidad_;

    // Lista de modelos disponibles
    std::vector<std::string> modelosDisponibles_;
    int modeloSeleccionado_;

    // Configura los botones
    void configurarBotones();

    // Busca modelos en el directorio de modelos
    void buscarModelos();

    // Carga el modelo seleccionado
    void cargarModelo(const std::string& ruta);

    // Renderiza el panel de información de la IA
    void renderizarPanelIA(sf::RenderTarget& objetivo) const;

    // Renderiza la lista de modelos disponibles
    void renderizarListaModelos(sf::RenderTarget& objetivo) const;
};

} // namespace tetris
