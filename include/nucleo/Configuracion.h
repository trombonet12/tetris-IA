// =============================================================================
// Tetris con IA Evolutiva - Configuración
// Autor: Joan L.
// Descripción: Almacena y gestiona la configuración de la aplicación:
//              resolución, parámetros de IA, rutas, etc.
// =============================================================================
#pragma once

#include <string>
#include <vector>

namespace tetris {

struct Configuracion {
    // Ventana
    int anchoVentana = 1920;
    int altoVentana = 1080;
    bool pantallaCompleta = false;
    int fpsObjetivo = 60;

    // Rutas
    std::string directorioModelos = "modelos";
    std::string rutaFuente;  // Se auto-detecta

    // IA
    std::vector<int> arquitecturaRed = { 218, 128, 64, 32, 16, 6 };
    int tamPoblacion = 100;
    float tasaMutacion = 0.1f;
    float sigmaMutacion = 0.3f;
    float porcentajeElitismo = 0.1f;
    int tamTorneo = 5;

    // Guardado automático
    bool autoGuardado = true;
    int generacionesAutoGuardado = 10;  // Guardar cada N generaciones

    // Intenta detectar una fuente del sistema
    bool detectarFuente();
};

} // namespace tetris
