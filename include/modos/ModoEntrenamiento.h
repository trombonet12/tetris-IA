// =============================================================================
// Tetris con IA Evolutiva - Modo Entrenamiento
// Autor: Joan L.
// Descripción: Modo de visualización del entrenamiento evolutivo con N
//              instancias de Tetris jugadas por IAs simultáneamente. Muestra
//              parámetros configurables, estadísticas, gráficas de evolución
//              y la red neuronal del agente seleccionado.
// =============================================================================
#pragma once

#include "ModoJuego.h"
#include "../ia/Entrenador.h"
#include "../graficos/Renderizador.h"
#include "../graficos/InterfazUsuario.h"
#include "../graficos/VisualizadorRed.h"
#include "../graficos/Boton.h"
#include <SFML/Graphics.hpp>
#include <vector>

namespace tetris {

class ModoEntrenamiento : public ModoJuego {
public:
    ModoEntrenamiento(const sf::Font& fuente);
    ~ModoEntrenamiento();

    void procesarEvento(const sf::Event& evento, const sf::RenderWindow& ventana) override;
    void actualizar(float dt) override;
    void renderizar(sf::RenderTarget& objetivo) override;

private:
    Entrenador entrenador_;
    Renderizador renderizador_;
    InterfazUsuario ui_;
    VisualizadorRed vizRed_;
    const sf::Font& fuente_;

    // Agente seleccionado para ver su red neuronal (-1 = ninguno)
    int agenteSeleccionado_;
    bool mostrarRedNeuronal_;

    // Botones de control
    Boton botonIniciar_;
    Boton botonPausar_;
    Boton botonGuardar_;
    Boton botonVolver_;
    std::vector<Boton> botonesVelocidad_;

    // Configuración pre-inicio
    int poblacionConfig_;           // Población editable antes de iniciar
    float velocidadInicialConfig_;  // Velocidad seleccionada antes de iniciar
    Boton botonPoblacionMas_;
    Boton botonPoblacionMenos_;
    std::vector<Boton> botonesVelocidadInicial_;

    // Historial para gráficas
    std::vector<float> historialMejor_;
    std::vector<float> historialMedia_;
    std::vector<float> historialPeor_;

    // Configurar los botones de la interfaz
    void configurarBotones();

    // Renderiza el grid de mini-tableros
    void renderizarGridEntrenamiento(sf::RenderTarget& objetivo) const;

    // Renderiza el panel de parámetros (izquierda)
    void renderizarPanelParametros(sf::RenderTarget& objetivo) const;

    // Renderiza el panel de estadísticas (derecha)
    void renderizarPanelEstadisticas(sf::RenderTarget& objetivo) const;

    // Renderiza la red neuronal del agente seleccionado
    void renderizarRedSeleccionada(sf::RenderTarget& objetivo) const;

    // Renderiza los controles inferiores
    void renderizarControles(sf::RenderTarget& objetivo) const;

    // Detecta click en un mini-tablero
    int detectarClickTablero(sf::Vector2f posRaton) const;

    // Actualiza el historial de estadísticas
    void actualizarHistorial();
};

} // namespace tetris
