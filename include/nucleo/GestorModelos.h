// =============================================================================
// Tetris con IA Evolutiva - Gestor de Modelos
// Autor: Joan L.
// Descripción: Gestiona el guardado y carga de modelos de redes neuronales
//              entrenadas. Formato binario propio con cabecera de metadatos.
// =============================================================================
#pragma once

#include "../ia/RedNeuronal.h"
#include <string>
#include <vector>

namespace tetris {

// Metadatos del modelo guardado
struct MetadatosModelo {
    std::vector<int> arquitectura;
    int generacion = 0;
    float fitness = 0.0f;
    int piezasColocadas = 0;
    int tetrisCount = 0;
    std::string fecha;
};

class GestorModelos {
public:
    // Guarda un modelo con sus metadatos
    static bool guardar(const std::string& ruta, const RedNeuronal& red,
                         const MetadatosModelo& metadatos);

    // Carga un modelo y sus metadatos
    static bool cargar(const std::string& ruta, RedNeuronal& red,
                        MetadatosModelo& metadatos);

    // Lista los archivos de modelo en un directorio
    static std::vector<std::string> listarModelos(const std::string& directorio);

    // Obtiene los metadatos de un modelo sin cargar los pesos
    static bool leerMetadatos(const std::string& ruta, MetadatosModelo& metadatos);

    // Genera un nombre de archivo único para el modelo
    static std::string generarNombreModelo(int generacion, float fitness);

private:
    // Número mágico para identificar archivos de modelo
    static constexpr uint32_t MAGIC_NUMBER = 0x54455452; // "TETR" en ASCII
    static constexpr uint32_t VERSION = 1;
};

} // namespace tetris
