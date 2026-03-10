// =============================================================================
// Tetris con IA Evolutiva - Implementación Gestor de Modelos
// Autor: Joan L.
// Descripción: Formato binario propio para guardar/cargar redes neuronales.
//              Cabecera: magic number, versión, arquitectura, metadatos.
//              Cuerpo: pesos de la red en formato float.
// =============================================================================
#include "nucleo/GestorModelos.h"
#include <fstream>
#include <filesystem>
#include <ctime>
#include <sstream>
#include <iomanip>
#include <algorithm>

namespace tetris {

bool GestorModelos::guardar(const std::string& ruta, const RedNeuronal& red,
                              const MetadatosModelo& metadatos) {
    // Asegurar que el directorio existe
    auto dirPadre = std::filesystem::path(ruta).parent_path();
    if (!dirPadre.empty()) {
        std::filesystem::create_directories(dirPadre);
    }

    std::ofstream archivo(ruta, std::ios::binary);
    if (!archivo.is_open()) return false;

    // Cabecera
    uint32_t magic = MAGIC_NUMBER;
    uint32_t version = VERSION;
    archivo.write(reinterpret_cast<const char*>(&magic), sizeof(magic));
    archivo.write(reinterpret_cast<const char*>(&version), sizeof(version));

    // Arquitectura
    uint32_t numCapas = static_cast<uint32_t>(metadatos.arquitectura.size());
    archivo.write(reinterpret_cast<const char*>(&numCapas), sizeof(numCapas));
    for (int tam : metadatos.arquitectura) {
        int32_t v = tam;
        archivo.write(reinterpret_cast<const char*>(&v), sizeof(v));
    }

    // Metadatos
    int32_t gen = metadatos.generacion;
    archivo.write(reinterpret_cast<const char*>(&gen), sizeof(gen));

    float fit = metadatos.fitness;
    archivo.write(reinterpret_cast<const char*>(&fit), sizeof(fit));

    int32_t piezas = metadatos.piezasColocadas;
    archivo.write(reinterpret_cast<const char*>(&piezas), sizeof(piezas));

    int32_t tetris = metadatos.tetrisCount;
    archivo.write(reinterpret_cast<const char*>(&tetris), sizeof(tetris));

    // Fecha como string con longitud
    uint32_t lenFecha = static_cast<uint32_t>(metadatos.fecha.size());
    archivo.write(reinterpret_cast<const char*>(&lenFecha), sizeof(lenFecha));
    archivo.write(metadatos.fecha.c_str(), lenFecha);

    // Pesos de la red
    const auto& pesos = red.obtenerPesos();
    uint32_t numPesos = static_cast<uint32_t>(pesos.size());
    archivo.write(reinterpret_cast<const char*>(&numPesos), sizeof(numPesos));
    archivo.write(reinterpret_cast<const char*>(pesos.data()),
                   numPesos * sizeof(float));

    return archivo.good();
}

bool GestorModelos::cargar(const std::string& ruta, RedNeuronal& red,
                             MetadatosModelo& metadatos) {
    std::ifstream archivo(ruta, std::ios::binary);
    if (!archivo.is_open()) return false;

    // Verificar cabecera
    uint32_t magic, version;
    archivo.read(reinterpret_cast<char*>(&magic), sizeof(magic));
    archivo.read(reinterpret_cast<char*>(&version), sizeof(version));

    if (magic != MAGIC_NUMBER || version != VERSION) return false;

    // Arquitectura
    uint32_t numCapas;
    archivo.read(reinterpret_cast<char*>(&numCapas), sizeof(numCapas));

    // Validar número razonable de capas
    if (numCapas > 100) return false;

    metadatos.arquitectura.resize(numCapas);
    for (uint32_t i = 0; i < numCapas; ++i) {
        int32_t v;
        archivo.read(reinterpret_cast<char*>(&v), sizeof(v));
        if (v <= 0 || v > 10000) return false;
        metadatos.arquitectura[i] = v;
    }

    // Metadatos
    int32_t gen;
    archivo.read(reinterpret_cast<char*>(&gen), sizeof(gen));
    metadatos.generacion = gen;

    float fit;
    archivo.read(reinterpret_cast<char*>(&fit), sizeof(fit));
    metadatos.fitness = fit;

    int32_t piezas;
    archivo.read(reinterpret_cast<char*>(&piezas), sizeof(piezas));
    metadatos.piezasColocadas = piezas;

    int32_t tetris;
    archivo.read(reinterpret_cast<char*>(&tetris), sizeof(tetris));
    metadatos.tetrisCount = tetris;

    // Fecha
    uint32_t lenFecha;
    archivo.read(reinterpret_cast<char*>(&lenFecha), sizeof(lenFecha));
    if (lenFecha > 1000) return false;
    metadatos.fecha.resize(lenFecha);
    archivo.read(metadatos.fecha.data(), lenFecha);

    // Pesos
    uint32_t numPesos;
    archivo.read(reinterpret_cast<char*>(&numPesos), sizeof(numPesos));

    if (numPesos > 10000000) return false;  // Limitar a ~40MB

    std::vector<float> pesos(numPesos);
    archivo.read(reinterpret_cast<char*>(pesos.data()), numPesos * sizeof(float));

    if (!archivo.good()) return false;

    red.establecerPesos(pesos);
    return true;
}

std::vector<std::string> GestorModelos::listarModelos(const std::string& directorio) {
    std::vector<std::string> modelos;

    try {
        for (const auto& entry : std::filesystem::directory_iterator(directorio)) {
            if (entry.path().extension() == ".bin") {
                // Verificar que es un modelo válido (comprobar magic number)
                std::ifstream archivo(entry.path(), std::ios::binary);
                uint32_t magic;
                archivo.read(reinterpret_cast<char*>(&magic), sizeof(magic));
                if (magic == MAGIC_NUMBER) {
                    modelos.push_back(entry.path().string());
                }
            }
        }
    } catch (...) {
        // Directorio no existe o error de acceso
    }

    std::sort(modelos.begin(), modelos.end());
    return modelos;
}

bool GestorModelos::leerMetadatos(const std::string& ruta, MetadatosModelo& metadatos) {
    std::ifstream archivo(ruta, std::ios::binary);
    if (!archivo.is_open()) return false;

    uint32_t magic, version;
    archivo.read(reinterpret_cast<char*>(&magic), sizeof(magic));
    archivo.read(reinterpret_cast<char*>(&version), sizeof(version));

    if (magic != MAGIC_NUMBER || version != VERSION) return false;

    uint32_t numCapas;
    archivo.read(reinterpret_cast<char*>(&numCapas), sizeof(numCapas));
    if (numCapas > 100) return false;

    metadatos.arquitectura.resize(numCapas);
    for (uint32_t i = 0; i < numCapas; ++i) {
        int32_t v;
        archivo.read(reinterpret_cast<char*>(&v), sizeof(v));
        metadatos.arquitectura[i] = v;
    }

    int32_t gen;
    archivo.read(reinterpret_cast<char*>(&gen), sizeof(gen));
    metadatos.generacion = gen;

    float fit;
    archivo.read(reinterpret_cast<char*>(&fit), sizeof(fit));
    metadatos.fitness = fit;

    int32_t piezas;
    archivo.read(reinterpret_cast<char*>(&piezas), sizeof(piezas));
    metadatos.piezasColocadas = piezas;

    int32_t tetris;
    archivo.read(reinterpret_cast<char*>(&tetris), sizeof(tetris));
    metadatos.tetrisCount = tetris;

    uint32_t lenFecha;
    archivo.read(reinterpret_cast<char*>(&lenFecha), sizeof(lenFecha));
    if (lenFecha > 1000) return false;
    metadatos.fecha.resize(lenFecha);
    archivo.read(metadatos.fecha.data(), lenFecha);

    return archivo.good();
}

std::string GestorModelos::generarNombreModelo(int generacion, float fitness) {
    // Obtener fecha y hora actual
    std::time_t ahora = std::time(nullptr);
    std::tm tm_local;
#ifdef _WIN32
    localtime_s(&tm_local, &ahora);
#else
    localtime_r(&ahora, &tm_local);
#endif

    std::ostringstream ss;
    ss << "modelos/modelo_gen" << generacion
       << "_fit" << static_cast<int>(fitness)
       << "_" << std::put_time(&tm_local, "%Y%m%d_%H%M%S")
       << ".bin";

    return ss.str();
}

} // namespace tetris
