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
    HOLD,          // Intercambiar pieza con hold
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

// ---- Características del tablero para evaluación de posiciones IA ----
// La IA evalúa placements candidatos, no acciones individuales.
// Cada placement produce un vector de 12 features normalizadas.
struct CaracteristicasTablero {
    float lineasCompletadas = 0.0f;    // Líneas limpiadas por esta colocación (0-4, /4)
    float alturaAgregada = 0.0f;       // Suma de alturas de todas las columnas (/200)
    float alturaMaxima = 0.0f;         // Altura de la columna más alta (/20)
    float huecos = 0.0f;              // Número total de huecos (/200)
    float huecosCreados = 0.0f;       // Delta de huecos respecto al tablero antes (/20, signed)
    float bumpiness = 0.0f;           // Suma dif. absolutas alturas adyacentes (/180)
    float transicionesColumna = 0.0f; // Cambios lleno<->vacío en vertical (/200)
    float transicionesFila = 0.0f;    // Cambios lleno<->vacío en horizontal (/200)
    float pozos = 0.0f;              // Suma profundidades de pozos (/200)
    float alturaAterrizaje = 0.0f;    // Fila donde aterriza la pieza (/20)
    float filasCasiCompletas = 0.0f;  // Filas con >=8 de 10 celdas llenas (/20)
    float densidadInferior = 0.0f;    // Proporción celdas llenas en 4 filas inferiores (0-1)

    // Convierte a vector normalizado para la red neuronal
    std::vector<float> aVector() const {
        return { lineasCompletadas, alturaAgregada, alturaMaxima, huecos,
                 huecosCreados, bumpiness, transicionesColumna, transicionesFila,
                 pozos, alturaAterrizaje, filasCasiCompletas, densidadInferior };
    }
};
constexpr int NUM_FEATURES_TABLERO = 12;

// Posición candidata para la IA (resultado de enumerarPosiciones)
struct PosicionIA {
    int rotacion = 0;
    int columna = 0;
    bool usarHold = false;
    CaracteristicasTablero features;
};

// ---- Tamaños de entrada/salida de la red neuronal ----
// Evaluador de posiciones: entrada = 12 features, salida = 1 score
constexpr int NN_TAM_ENTRADA = NUM_FEATURES_TABLERO;               // 12
constexpr int NN_TAM_SALIDA = 1;                                   // 1 (score del placement)

// Constantes antiguas mantenidas para compatibilidad de Tablero::obtenerEstado
constexpr int NN_TAM_TABLERO = TABLERO_ANCHO * TABLERO_ALTO;       // 200
constexpr int NN_TAM_ALTURAS = TABLERO_ANCHO;                      // 10
constexpr int NN_TAM_HUECOS = 1;                                   // 1
constexpr int NN_TAM_BUMPINESS = 1;                                // 1

// Arquitectura por defecto de la red neuronal (evaluador de posiciones)
inline const std::vector<int> NN_ARQUITECTURA_DEFECTO = { 12, 32, 16, 1 };

// ---- Parámetros del algoritmo genético (por defecto) ----
constexpr int AG_POBLACION_DEFECTO = 100;
constexpr float AG_TASA_MUTACION = 0.10f;       // Proporcional para acumular mejoras
constexpr float AG_SIGMA_MUTACION = 0.08f;      // Ajustado a red pequeña (~600 params)
constexpr float AG_PORCENTAJE_ELITISMO = 0.10f;
constexpr int AG_TAMANO_TORNEO = 2;              // Menos presión de selección, más diversidad
constexpr float AG_PROBABILIDAD_CRUCE = 0.60f;  // Crossover rate

// ---- Fitness (evaluador de posiciones) ----
// La red evalúa la calidad del tablero internamente, el fitness externo mide resultados
constexpr float FITNESS_POR_PIEZA = 1.0f;                         // Supervivencia: señal principal
constexpr float FITNESS_POR_LINEA = 10.0f;                        // Líneas limpiadas
constexpr float FITNESS_POR_TETRIS = 100.0f;                      // Tetris (4 líneas)
constexpr float FITNESS_PENALIZACION_GAME_OVER = -50.0f;          // Muerte prematura (<20 piezas)
constexpr int FITNESS_PIEZAS_MINIMAS = 20;
constexpr float FITNESS_BONUS_SUPERVIVENCIA_100 = 0.5f;           // Extra por pieza después de 100

// ---- Velocidades de simulación ----
constexpr float VELOCIDAD_X1 = 1.0f;
constexpr float VELOCIDAD_X2 = 2.0f;
constexpr float VELOCIDAD_X5 = 5.0f;
constexpr float VELOCIDAD_X10 = 10.0f;
constexpr float VELOCIDAD_MAX = 1000.0f;

// ---- Límite de piezas por partida (IA) ----
constexpr int MAX_PIEZAS_POR_PARTIDA = 5000;

// ---- Auto-guardado ----
constexpr int GENERACIONES_AUTO_GUARDADO = 10;

} // namespace tetris
