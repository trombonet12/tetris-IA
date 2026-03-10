// =============================================================================
// Tetris con IA Evolutiva - Constantes y tipos globales
// Autor: Joan L.
// Descripción: Define todas las constantes del juego, enumeraciones de piezas,
//              acciones, colores, y dimensiones del tablero.
// =============================================================================
#pragma once

#include <SFML/Graphics.hpp>
#include <array>
#include <vector>
#include <cstdint>

namespace tetris {

// ---- Dimensiones del tablero ----
constexpr int TABLERO_ANCHO = 10;
constexpr int TABLERO_ALTO = 20;
constexpr int TABLERO_ALTO_OCULTO = 4; // Filas ocultas por encima del tablero visible
constexpr int TABLERO_ALTO_TOTAL = TABLERO_ALTO + TABLERO_ALTO_OCULTO;

// ---- Dimensiones visuales ----
constexpr int TAM_CELDA = 30;           // Píxeles por celda en modo normal
constexpr int TAM_CELDA_MINI = 6;       // Píxeles por celda en mini-tableros de entrenamiento
constexpr int VENTANA_ANCHO = 1920;
constexpr int VENTANA_ALTO = 1080;

// ---- Velocidad del juego ----
constexpr float GRAVEDAD_INICIAL = 1.0f;    // Celdas por segundo al nivel 0
constexpr float LOCK_DELAY = 0.5f;          // Segundos antes de fijar la pieza
constexpr float DAS_DELAY = 0.17f;          // Delayed Auto Shift - retardo inicial (segundos)
constexpr float DAS_REPEAT = 0.05f;         // DAS - velocidad de repetición (segundos)
constexpr int FPS_OBJETIVO = 60;

// ---- Puntuación ----
constexpr int PUNTOS_UNA_LINEA = 100;
constexpr int PUNTOS_DOS_LINEAS = 300;
constexpr int PUNTOS_TRES_LINEAS = 500;
constexpr int PUNTOS_TETRIS = 800;          // ¡Bonus masivo por limpiar 4 líneas!
constexpr int LINEAS_POR_NIVEL = 10;

// ---- Tipos de pieza (Tetriminos) ----
enum class TipoPieza : uint8_t {
    I = 0, O, T, S, Z, J, L,
    NINGUNA  // Celda vacía
};
constexpr int NUM_TIPOS_PIEZA = 7;

// ---- Acciones posibles ----
enum class Accion : uint8_t {
    MOVER_IZQUIERDA = 0,
    MOVER_DERECHA,
    ROTAR_HORARIO,
    ROTAR_ANTIHORARIO,
    BAJAR_SUAVE,
    CAIDA_DURA,    // Hard drop
    NUM_ACCIONES
};
constexpr int NUM_ACCIONES = static_cast<int>(Accion::NUM_ACCIONES);

// ---- Estados del juego ----
enum class EstadoJuego : uint8_t {
    JUGANDO,
    PAUSA,
    GAME_OVER
};

// ---- Estados de la aplicación ----
enum class EstadoApp : uint8_t {
    MENU,
    MODO_NORMAL,
    MODO_ENTRENAMIENTO,
    MODO_IA_ENTRENADA,
    CONFIGURACION,
    SALIR
};

// ---- Coordenada de celda ----
struct Coord {
    int fila; // Y (0 = arriba)
    int col;  // X (0 = izquierda)
};

// ---- Colores por tipo de pieza (esquema moderno de Tetris) ----
inline const std::array<sf::Color, NUM_TIPOS_PIEZA> COLORES_PIEZA = {
    sf::Color(0, 240, 240),     // I - Cian
    sf::Color(240, 240, 0),     // O - Amarillo
    sf::Color(160, 0, 240),     // T - Púrpura
    sf::Color(0, 240, 0),       // S - Verde
    sf::Color(240, 0, 0),       // Z - Rojo
    sf::Color(0, 0, 240),       // J - Azul
    sf::Color(240, 160, 0)      // L - Naranja
};

// Color para celdas vacías y bordes
inline const sf::Color COLOR_VACIO(40, 40, 40);
inline const sf::Color COLOR_BORDE(80, 80, 80);
inline const sf::Color COLOR_FANTASMA(255, 255, 255, 60);
inline const sf::Color COLOR_FONDO(20, 20, 30);
inline const sf::Color COLOR_PANEL(30, 30, 45);
inline const sf::Color COLOR_TEXTO(220, 220, 220);
inline const sf::Color COLOR_TEXTO_TITULO(255, 200, 50);
inline const sf::Color COLOR_BOTON(60, 60, 90);
inline const sf::Color COLOR_BOTON_HOVER(80, 80, 120);
inline const sf::Color COLOR_BOTON_CLICK(100, 100, 150);
inline const sf::Color COLOR_DORADO(255, 215, 0);

// =============================================================================
// Datos de las piezas - Sistema de Rotación Super (SRS)
// Cada pieza tiene 4 rotaciones, cada rotación define 4 celdas (fila, columna)
// relativas a una caja delimitadora de 4x4 (o 3x3 para la mayoría).
// =============================================================================

// Definición de formas: FORMAS[tipo][rotacion][celda] = {fila, col}
inline const std::array<std::array<std::array<Coord, 4>, 4>, NUM_TIPOS_PIEZA> FORMAS = {{
    // I
    {{
        {{ {1,0}, {1,1}, {1,2}, {1,3} }},  // Rotación 0
        {{ {0,2}, {1,2}, {2,2}, {3,2} }},  // Rotación 1
        {{ {2,0}, {2,1}, {2,2}, {2,3} }},  // Rotación 2
        {{ {0,1}, {1,1}, {2,1}, {3,1} }}   // Rotación 3
    }},
    // O
    {{
        {{ {0,1}, {0,2}, {1,1}, {1,2} }},
        {{ {0,1}, {0,2}, {1,1}, {1,2} }},
        {{ {0,1}, {0,2}, {1,1}, {1,2} }},
        {{ {0,1}, {0,2}, {1,1}, {1,2} }}
    }},
    // T
    {{
        {{ {0,1}, {1,0}, {1,1}, {1,2} }},
        {{ {0,1}, {1,1}, {1,2}, {2,1} }},
        {{ {1,0}, {1,1}, {1,2}, {2,1} }},
        {{ {0,1}, {1,0}, {1,1}, {2,1} }}
    }},
    // S
    {{
        {{ {0,1}, {0,2}, {1,0}, {1,1} }},
        {{ {0,1}, {1,1}, {1,2}, {2,2} }},
        {{ {1,1}, {1,2}, {2,0}, {2,1} }},
        {{ {0,0}, {1,0}, {1,1}, {2,1} }}
    }},
    // Z
    {{
        {{ {0,0}, {0,1}, {1,1}, {1,2} }},
        {{ {0,2}, {1,1}, {1,2}, {2,1} }},
        {{ {1,0}, {1,1}, {2,1}, {2,2} }},
        {{ {0,1}, {1,0}, {1,1}, {2,0} }}
    }},
    // J
    {{
        {{ {0,0}, {1,0}, {1,1}, {1,2} }},
        {{ {0,1}, {0,2}, {1,1}, {2,1} }},
        {{ {1,0}, {1,1}, {1,2}, {2,2} }},
        {{ {0,1}, {1,1}, {2,0}, {2,1} }}
    }},
    // L
    {{
        {{ {0,2}, {1,0}, {1,1}, {1,2} }},
        {{ {0,1}, {1,1}, {2,1}, {2,2} }},
        {{ {1,0}, {1,1}, {1,2}, {2,0} }},
        {{ {0,0}, {0,1}, {1,1}, {2,1} }}
    }}
}};

// =============================================================================
// Tabla de Wall Kicks (SRS) - Offsets para intentar rotación
// Cuando una rotación falla, se prueban estos desplazamientos en orden.
// =============================================================================

// Wall kicks para piezas J, L, S, T, Z (3x3)
// Índice: [rotacion_origen * 2 + (sentido_horario ? 0 : 1)][intento]
// sentido_horario: 0→1, 1→2, 2→3, 3→0
// sentido_antihorario: 1→0, 2→1, 3→2, 0→3
inline const std::array<std::array<Coord, 5>, 8> WALL_KICKS_NORMAL = {{
    // 0→1 (horario desde rotación 0)
    {{ {0,0}, {0,-1}, {-1,-1}, {2,0}, {2,-1} }},
    // 1→0 (antihorario desde rotación 1)
    {{ {0,0}, {0,1}, {1,1}, {-2,0}, {-2,1} }},
    // 1→2
    {{ {0,0}, {0,1}, {1,1}, {-2,0}, {-2,1} }},
    // 2→1
    {{ {0,0}, {0,-1}, {-1,-1}, {2,0}, {2,-1} }},
    // 2→3
    {{ {0,0}, {0,1}, {-1,1}, {2,0}, {2,1} }},
    // 3→2
    {{ {0,0}, {0,-1}, {1,-1}, {-2,0}, {-2,-1} }},
    // 3→0
    {{ {0,0}, {0,-1}, {1,-1}, {-2,0}, {-2,-1} }},
    // 0→3
    {{ {0,0}, {0,1}, {-1,1}, {2,0}, {2,1} }}
}};

// Wall kicks para pieza I (4x4)
inline const std::array<std::array<Coord, 5>, 8> WALL_KICKS_I = {{
    // 0→1
    {{ {0,0}, {0,-2}, {0,1}, {-1,-2}, {2,1} }},
    // 1→0
    {{ {0,0}, {0,2}, {0,-1}, {1,2}, {-2,-1} }},
    // 1→2
    {{ {0,0}, {0,-1}, {0,2}, {2,-1}, {-1,2} }},
    // 2→1
    {{ {0,0}, {0,1}, {0,-2}, {-2,1}, {1,-2} }},
    // 2→3
    {{ {0,0}, {0,2}, {0,-1}, {1,2}, {-2,-1} }},
    // 3→2
    {{ {0,0}, {0,-2}, {0,1}, {-1,-2}, {2,1} }},
    // 3→0
    {{ {0,0}, {0,1}, {0,-2}, {-2,1}, {1,-2} }},
    // 0→3
    {{ {0,0}, {0,-1}, {0,2}, {2,-1}, {-1,2} }}
}};

// ---- Tamaños de entrada/salida de la red neuronal ----
// Entrada: tablero aplanado (200) + tipo pieza actual one-hot (7) + alturas por
//          columna normalizadas (10) + número de huecos normalizado (1) = 218
constexpr int NN_TAM_TABLERO = TABLERO_ANCHO * TABLERO_ALTO;     // 200
constexpr int NN_TAM_PIEZA_ONEHOT = NUM_TIPOS_PIEZA;              // 7
constexpr int NN_TAM_ALTURAS = TABLERO_ANCHO;                     // 10
constexpr int NN_TAM_HUECOS = 1;                                  // 1
constexpr int NN_TAM_ENTRADA = NN_TAM_TABLERO + NN_TAM_PIEZA_ONEHOT
                             + NN_TAM_ALTURAS + NN_TAM_HUECOS;   // 218
constexpr int NN_TAM_SALIDA = NUM_ACCIONES;                       // 6

// Arquitectura por defecto de la red neuronal (capas ocultas)
inline const std::vector<int> NN_ARQUITECTURA_DEFECTO = { 218, 128, 64, 32, 16, 6 };

// ---- Parámetros del algoritmo genético (por defecto) ----
constexpr int AG_POBLACION_DEFECTO = 100;
constexpr float AG_TASA_MUTACION = 0.1f;
constexpr float AG_SIGMA_MUTACION = 0.3f;
constexpr float AG_PORCENTAJE_ELITISMO = 0.1f;
constexpr int AG_TAMANO_TORNEO = 5;

// ---- Fitness ----
constexpr float FITNESS_POR_LINEA = 1.0f;
constexpr float FITNESS_POR_TETRIS = 800.0f;
constexpr float FITNESS_POR_PIEZA = 0.01f;
constexpr float FITNESS_PENALIZACION_GAME_OVER = -5.0f;
constexpr float FITNESS_PENALIZACION_ALTURA = -0.05f;
constexpr int FITNESS_PIEZAS_MINIMAS = 50;

// ---- Velocidades de simulación ----
constexpr float VELOCIDAD_X1 = 1.0f;
constexpr float VELOCIDAD_X2 = 2.0f;
constexpr float VELOCIDAD_X5 = 5.0f;
constexpr float VELOCIDAD_X10 = 10.0f;
constexpr float VELOCIDAD_MAX = 1000.0f;

} // namespace tetris
