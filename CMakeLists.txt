# =============================================================================
# Tetris con IA Evolutiva - Sistema de compilación
# Autor: Joan L.
# Descripción: Configuración CMake con soporte para SFML, CUDA y cuBLAS
# =============================================================================
cmake_minimum_required(VERSION 3.18)

# Habilitar CUDA como lenguaje del proyecto
project(TetrisIA VERSION 1.0.0 LANGUAGES CXX CUDA)

# Estándar C++17 obligatorio
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CUDA_STANDARD 17)
set(CMAKE_CUDA_STANDARD_REQUIRED ON)

# Buscar dependencias externas
find_package(SFML 3 COMPONENTS Graphics Window System REQUIRED)
find_package(CUDAToolkit REQUIRED)

# =============================================================================
# Biblioteca estática CUDA - Redes neuronales aceleradas por GPU
# =============================================================================
add_library(tetris_cuda STATIC
    src/ia/RedNeuronal.cu
)
target_include_directories(tetris_cuda PUBLIC include)
target_link_libraries(tetris_cuda PUBLIC
    CUDA::cudart
    CUDA::cublas
)
# Ada Lovelace = arquitectura 89 (RTX 4080 Super)
set_target_properties(tetris_cuda PROPERTIES
    CUDA_SEPARABLE_COMPILATION ON
    CUDA_RESOLVE_DEVICE_SYMBOLS ON
    CUDA_ARCHITECTURES "89"
)

# =============================================================================
# Ejecutable principal - Tetris con interfaz gráfica SFML
# =============================================================================
add_executable(tetris
    src/main.cpp
    src/juego/Pieza.cpp
    src/juego/Tablero.cpp
    src/juego/Tetris.cpp
    src/ia/AlgoritmoGenetico.cpp
    src/ia/Agente.cpp
    src/ia/Entrenador.cpp
    src/graficos/Renderizador.cpp
    src/graficos/InterfazUsuario.cpp
    src/graficos/VisualizadorRed.cpp
    src/graficos/Boton.cpp
    src/modos/ModoNormal.cpp
    src/modos/ModoEntrenamiento.cpp
    src/modos/ModoIAEntrenada.cpp
    src/nucleo/Aplicacion.cpp
    src/nucleo/GestorModelos.cpp
    src/nucleo/Configuracion.cpp
)

target_include_directories(tetris PRIVATE include)
target_link_libraries(tetris PRIVATE
    tetris_cuda
    SFML::Graphics
    SFML::Window
    SFML::System
    CUDA::cudart
)

# En Windows, copiar las DLLs de SFML al directorio de salida
if(WIN32)
    add_custom_command(TARGET tetris POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            $<TARGET_FILE:SFML::Graphics>
            $<TARGET_FILE:SFML::Window>
            $<TARGET_FILE:SFML::System>
            $<TARGET_FILE_DIR:tetris>
        COMMENT "Copiando DLLs de SFML al directorio de salida..."
    )
endif()

# Crear directorio para guardar modelos entrenados
add_custom_command(TARGET tetris POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory
        "${CMAKE_BINARY_DIR}/modelos"
    COMMENT "Creando directorio de modelos..."
)
