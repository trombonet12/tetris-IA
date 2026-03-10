// =============================================================================
// Tetris con IA Evolutiva - Punto de entrada
// Autor: Joan L.
// Descripción: Inicializa CUDA y ejecuta la aplicación Tetris con IA.
// =============================================================================
#include "nucleo/Aplicacion.h"
#include "ia/RedNeuronal.h"
#include <iostream>

int main() {
    // Inicializar CUDA (calentar la GPU)
    tetris::RedNeuronal::inicializarCUDA();

    // Crear y ejecutar la aplicación
    tetris::Aplicacion app;
    int resultado = app.ejecutar();

    return resultado;
}
