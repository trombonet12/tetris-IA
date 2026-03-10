// =============================================================================
// Tetris con IA Evolutiva - Clase Aplicación
// Autor: Joan L.
// Descripción: Punto de entrada de la aplicación. Crea la ventana SFML,
//              gestiona el game loop principal (eventos → actualizar → dibujar)
//              y controla las transiciones entre modos de juego.
// =============================================================================
#pragma once

#include "../juego/Constantes.h"
#include "../modos/ModoJuego.h"
#include "../graficos/Boton.h"
#include "Configuracion.h"
#include <SFML/Graphics.hpp>
#include <memory>
#include <vector>

namespace tetris {

class Aplicacion {
public:
    Aplicacion();
    ~Aplicacion();

    // Ejecuta la aplicación (bucle principal). Devuelve código de salida.
    int ejecutar();

private:
    sf::RenderWindow ventana_;
    sf::Font fuente_;
    sf::Clock reloj_;

    Configuracion config_;

    // Modo de juego actual
    std::unique_ptr<ModoJuego> modoActual_;
    EstadoApp estadoActual_;

    // Inicializa la ventana, fuentes y recursos
    bool inicializar();

    // Cambia al modo indicado
    void cambiarModo(EstadoApp nuevoEstado);

    // Crea el menú principal
    void crearMenuPrincipal();

    // Procesa eventos de la ventana
    void procesarEventos();

    // Actualiza el modo activo
    void actualizar(float dt);

    // Renderiza el frame actual
    void renderizar();

    // Carga una fuente del sistema
    bool cargarFuente();

    // Actualiza la vista para mantener aspecto 16:9 con letterbox
    void actualizarVista(sf::Vector2u tamanoVentana);

    // Botones del menú principal (persistentes para recibir eventos de ratón)
    std::vector<Boton> botonesMenu_;
};

} // namespace tetris
