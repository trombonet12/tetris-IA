// =============================================================================
// Tetris con IA Evolutiva - Implementación Configuración
// Autor: Joan L.
// Descripción: Detección automática de fuentes del sistema en Windows/Linux
//              y gestión de parámetros de configuración.
// =============================================================================
#include "nucleo/Configuracion.h"
#include <filesystem>

namespace tetris {

bool Configuracion::detectarFuente() {
    // Lista de fuentes a intentar, en orden de preferencia
    // Priorizamos fuentes monoespaciadas y de buena legibilidad
    std::vector<std::string> candidatas;

#ifdef _WIN32
    std::string winDir = "C:/Windows/Fonts/";
    candidatas = {
        winDir + "consola.ttf",     // Consolas - excelente para juegos
        winDir + "arial.ttf",       // Arial - siempre disponible
        winDir + "segoeui.ttf",     // Segoe UI
        winDir + "calibri.ttf",     // Calibri
        winDir + "verdana.ttf",     // Verdana
        winDir + "cour.ttf",        // Courier New
        winDir + "times.ttf",       // Times New Roman
    };
#else
    // Linux: buscar en rutas estándar
    candidatas = {
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/ubuntu/Ubuntu-R.ttf",
        "/usr/share/fonts/TTF/DejaVuSans.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans.ttf",
    };
#endif

    for (const auto& ruta : candidatas) {
        if (std::filesystem::exists(ruta)) {
            rutaFuente = ruta;
            return true;
        }
    }

    return false;
}

} // namespace tetris
