# Tetris con IA Heurística

Un juego completo de Tetris en Python con interfaz gráfica y sistema de IA basado en heurísticas.

## Características

- Juego Tetris completo con todas las mecánicas clásicas
- Interfaz gráfica usando Pygame
- Sistema de IA Heurística inteligente
- Visualizador para ver la IA jugando en tiempo real
- Sistema de estadísticas detallado

## Estructura del Proyecto

```
tetris/
├── main.py                        # MENU PRINCIPAL
├── requirements.txt               # Dependencias
├── README.md                      # Este archivo
│
├── src/                           # Código fuente
│   ├── game/                      # Motor del juego e interfaz
│   │   ├── tetris_game.py        # Lógica del juego
│   │   └── tetris_ui.py          # Interfaz gráfica
│   ├── ai/                        # IA heurística
│   │   └── tetris_ai.py          # Sistema de IA
│   └── visualization/             # Visualizadores
│       └── tetris_ai_viewer.py   # Ver IA jugando
│
├── models/                        # Modelos guardados
└── results/                       # Resultados
```

## Instalación

### 1. Clona el repositorio
```bash
cd c:\Github\tetris
```

### 2. Instala las dependencias
```bash
pip install -r requirements.txt
```

## Inicio Rápido

### Menú Principal (RECOMENDADO)

Ejecuta el menú interactivo:

```bash
python main.py
```

El menú te permite:
- Jugar Tetris manualmente
- Ver IA heurística jugando
- Ver información del proyecto

## Cómo Jugar

### Modo Manual

**Controles:**
- **Flecha Izquierda**: Mover pieza a la izquierda
- **Flecha Derecha**: Mover pieza a la derecha
- **Flecha Abajo**: Caída suave (soft drop)
- **Flecha Arriba / Espacio**: Rotar pieza
- **Enter**: Caída dura (hard drop)
- **R**: Reiniciar juego (cuando termina)

### Modo IA Heurística

Ve cómo la IA juega automáticamente:

```bash
python -m src.visualization.tetris_ai_viewer
```

**Controles del Visualizador:**
- **Espacio**: Pausar/Reanudar
- **R**: Reiniciar juego actual
- **Flecha Arriba**: Aumentar velocidad
- **Flecha Abajo**: Reducir velocidad

## Sistema de Evaluación de la IA

La IA evalúa el tablero usando 4 características heurísticas:

1. **Aggregate Height** (Altura agregada): Suma de alturas de todas las columnas
   - Peso negativo: preferir tableros más bajos

2. **Complete Lines** (Líneas completas): Número de líneas que se pueden completar
   - Peso positivo: preferir movimientos que completen líneas

3. **Holes** (Huecos): Espacios vacíos debajo de bloques
   - Peso negativo: evitar crear huecos

4. **Bumpiness** (Irregularidad): Diferencias de altura entre columnas adyacentes
   - Peso negativo: preferir tableros más uniformes

## Estadísticas

Las estadísticas incluyen:
- **Puntuación**: Sistema de puntuación clásico de Tetris
- **Líneas eliminadas**: Total de líneas completadas
- **Nivel**: Aumenta cada 10 líneas
- **Altura máxima**: Altura del bloque más alto
- **Huecos**: Espacios vacíos problemáticos
- **Irregularidad**: Medida de uniformidad del tablero

## Personalización

### Modificar los Pesos de la IA

En `src/visualization/tetris_ai_viewer.py`:

```python
custom_weights = {
    'aggregate_height': -0.510066,
    'complete_lines': 0.760666,
    'holes': -0.35663,
    'bumpiness': -0.184483
}

viewer = TetrisAIViewer(ai_weights=custom_weights, speed=2.0)
```

### Ajustar Parámetros del Juego

En `src/game/tetris_game.py`:

```python
BOARD_WIDTH = 10      # Ancho del tablero
BOARD_HEIGHT = 20     # Alto del tablero
BLOCK_SIZE = 30       # Tamaño de cada bloque en píxeles
```

## Solución de Problemas

**Error: No se encuentra pygame/numpy**
```bash
pip install -r requirements.txt
```

**La IA juega muy lento**
- Aumenta la velocidad con la tecla de flecha arriba en el visualizador

## Archivos del Proyecto

### Archivos Principales
- `main.py` - Menú principal interactivo

### Código Fuente (src/)
- `src/game/tetris_game.py` - Lógica del juego
- `src/game/tetris_ui.py` - Interfaz gráfica
- `src/ai/tetris_ai.py` - IA heurística
- `src/visualization/tetris_ai_viewer.py` - Visualizador

## Entrenamiento de IA

### Algoritmo Genético Heurístico

Ejecuta el algoritmo genético para evolucionar los pesos de la IA heurística:

```bash
python -m src.ai.tetris_ai
```

Este proceso:
1. Crea una población inicial de individuos con pesos aleatorios
2. Evalúa cada individuo jugando múltiples partidas
3. Selecciona los mejores individuos
4. Crea nuevas generaciones mediante crossover y mutación
5. Repite el proceso durante varias generaciones

**Parámetros ajustables** en `src/ai/tetris_ai.py`:
- `population_size`: Tamaño de la población (default: 20)
- `mutation_rate`: Tasa de mutación (default: 0.15)
- `num_generations`: Número de generaciones (default: 10)
- `num_games`: Juegos por evaluación (default: 5)

## Conceptos de IA Aplicados

1. **Algoritmo Genético**: Evolución de parámetros mediante selección natural
2. **Función de Fitness**: Evaluación de rendimiento basada en puntuación y líneas
3. **Crossover**: Combinación de características de padres exitosos
4. **Mutación**: Introducción de variación aleatoria para exploración
5. **Elitismo**: Preservación de los mejores individuos

## Notas Técnicas

- El juego usa **Pygame** para la interfaz gráfica
- **NumPy** para operaciones eficientes con matrices
- El código está modularizado para fácil extensión

## Inicio Rápido

Experimenta con diferentes configuraciones, entrena tu propia IA y observa cómo evoluciona a través de las generaciones.

```bash
python main.py
```

---

Desarrollado usando Python y Pygame

