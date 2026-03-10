# Tetris con IA Evolutiva (CUDA + SFML)

**Autor:** Joan L.

Un juego de Tetris completo en C++ con inteligencia artificial evolutiva acelerada por GPU mediante CUDA. Incluye visualización en tiempo real de las redes neuronales y entrenamiento de múltiples agentes simultáneos.

## Características

- **Tetris completo** con SRS (Super Rotation System), wall kicks, hold, ghost piece, 7-bag randomizer
- **IA Evolutiva** con redes neuronales feedforward evaluadas en GPU (CUDA)
- **Tres modos de juego:**
  - **Normal:** Juega tú con teclado
  - **Entrenamiento:** Observa 50-200+ agentes evolucionando en tiempo real
  - **IA Entrenada:** Carga un modelo guardado y mira cómo juega
- **Visualización de red neuronal** con activaciones en tiempo real
- **Gráficas de fitness** por generación (mejor, media, peor)
- **Guardado/carga de modelos** en formato binario propio

## Requisitos

- **Windows 10/11** (probado) o Linux
- **GPU NVIDIA** con Compute Capability ≥ 8.9 (RTX 4080 Super o similar)
- **CUDA Toolkit** 12.x
- **CMake** 3.24+
- **vcpkg** (gestor de paquetes C++)
- **Visual Studio 2022** con soporte CUDA

## Compilación

### 1. Instalar vcpkg (si no lo tienes)

```powershell
git clone https://github.com/microsoft/vcpkg.git C:\vcpkg
cd C:\vcpkg
.\bootstrap-vcpkg.bat
```

### 2. Instalar SFML

```powershell
C:\vcpkg\vcpkg install sfml:x64-windows
```

### 3. Compilar el proyecto

```powershell
cd tetris
$env:VCPKG_ROOT = "C:\vcpkg"
$env:PATH = "C:\Program Files\CMake\bin;" + $env:PATH
cmake --preset windows-release
cmake --build build/release --config Release
```

El ejecutable se generará en `build/release/Release/tetris.exe`.

### Compilación Debug

```powershell
cmake --preset windows-debug
cmake --build build/debug --config Debug
```

## Controles

### Modo Normal

| Tecla | Acción |
|-------|--------|
| ← / A | Mover izquierda |
| → / D | Mover derecha |
| ↓ / S | Bajar suave |
| ↑ / W / X | Rotar horario |
| Z | Rotar antihorario |
| Espacio | Caída dura (hard drop) |
| C / Shift | Hold (guardar pieza) |
| P | Pausa |
| R | Reiniciar |
| ESC | Volver al menú |

### Modo Entrenamiento

| Tecla | Acción |
|-------|--------|
| Espacio | Iniciar/Pausar entrenamiento |
| Click en agente | Ver red neuronal del agente |
| ESC | Volver al menú |

### Modo IA Entrenada

| Tecla | Acción |
|-------|--------|
| ↑/↓ | Navegar lista de modelos |
| Enter | Cargar modelo seleccionado |
| R | Reiniciar partida |
| ESC | Volver al menú |

## Arquitectura del Proyecto

```
tetris/
├── CMakeLists.txt          # Sistema de build
├── vcpkg.json              # Dependencias
├── CMakePresets.json        # Presets de CMake
├── modelos/                 # Modelos guardados (.bin)
├── include/
│   ├── juego/
│   │   ├── Constantes.h    # Constantes del juego, piezas SRS, colores
│   │   ├── Pieza.h         # Pieza de Tetris con rotación SRS
│   │   ├── Tablero.h       # Tablero 10x20 con lógica de colisión
│   │   └── Tetris.h        # Motor completo del juego
│   ├── ia/
│   │   ├── RedNeuronal.h   # Red neuronal con CUDA
│   │   ├── AlgoritmoGenetico.h  # Algoritmo genético
│   │   ├── Agente.h        # Agente = Red + Tetris
│   │   └── Entrenador.h    # Gestor de entrenamiento multihilo
│   ├── graficos/
│   │   ├── Boton.h         # Botón interactivo
│   │   ├── Renderizador.h  # Renderizado de tableros
│   │   ├── InterfazUsuario.h # UI: menú, paneles, gráficas
│   │   └── VisualizadorRed.h # Visualización de red neuronal
│   ├── modos/
│   │   ├── ModoJuego.h     # Clase base abstracta
│   │   ├── ModoNormal.h    # Modo manual
│   │   ├── ModoEntrenamiento.h # Modo entrenamiento evolutivo
│   │   └── ModoIAEntrenada.h   # Modo espectador IA
│   └── nucleo/
│       ├── Aplicacion.h    # Clase principal
│       ├── GestorModelos.h # Guardado/carga de modelos
│       └── Configuracion.h # Configuración de la app
└── src/
    ├── main.cpp            # Punto de entrada
    ├── juego/              # Implementaciones del motor
    ├── ia/                 # Implementaciones de IA (incluye .cu)
    ├── graficos/           # Implementaciones gráficas
    ├── modos/              # Implementaciones de modos
    └── nucleo/             # Implementaciones del núcleo
```

## Red Neuronal

- **Arquitectura:** 218 → 128 → 64 → 32 → 16 → 6
- **Entrada (218 neuronas):**
  - Estado del tablero (10×20 = 200 celdas normalizadas)
  - Tipo de pieza actual (7 one-hot)
  - Tipo de pieza siguiente (7 one-hot)
  - Alturas de cada columna normalizada (4 floats adicionales)
- **Salida (6 neuronas, softmax):**
  - Mover izquierda, Mover derecha, Rotar horario, Rotar antihorario, Bajar suave, Caída dura
- **Activación oculta:** ReLU
- **Inicialización:** Xavier/Glorot

## Algoritmo Genético

- **Selección:** Torneo (tamaño 5)
- **Cruce:** Uniforme
- **Mutación:** Gaussiana (σ = 0.3, tasa = 10%)
- **Elitismo:** 10% de la población
- **Evaluación:** Batch en GPU con un bloque CUDA por agente

## Función de Fitness

```
fitness = Σ(líneas limpiadas × bonus_línea)
        + tetris_count × 800
        + piezas_colocadas × 0.01
        - penalización_gameover
        - 0.05 × altura_media
```

## Formato de Modelo (.bin)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| Magic | uint32 | 0x54455452 ("TETR") |
| Versión | uint32 | 1 |
| Num. capas | uint32 | Número de capas |
| Tamaños | int32[] | Tamaño de cada capa |
| Generación | int32 | Generación del modelo |
| Fitness | float | Mejor fitness alcanzado |
| Piezas | int32 | Piezas colocadas |
| Tetris | int32 | Número de Tetris |
| Fecha | string | Fecha de guardado |
| Num. pesos | uint32 | Total de pesos |
| Pesos | float[] | Vector de pesos |

## Licencia

Proyecto educativo - Joan L.
