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
    std::vector<int> arquitecturaRed = { 237, 128, 64, 7 };
    int tamPoblacion = 100;
    float tasaMutacion = 0.10f;
    float sigmaMutacion = 0.05f;
    float porcentajeElitismo = 0.10f;
    int tamTorneo = 3;

    // Guardado automático
    bool autoGuardado = true;
    int generacionesAutoGuardado = 10;  // Guardar cada N generaciones

    // Intenta detectar una fuente del sistema
    bool detectarFuente();
};

} // namespace tetris
