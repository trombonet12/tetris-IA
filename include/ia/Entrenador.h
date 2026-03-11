// =============================================================================
// Tetris con IA Evolutiva - Clase Entrenador
// Autor: Joan L.
// Descripción: Gestiona el ciclo de entrenamiento evolutivo. Crea generaciones
//              de agentes, simula partidas en paralelo (CPU + GPU), calcula
//              fitness y evoluciona la población. Puede ejecutarse en su propio
//              hilo para no bloquear la interfaz gráfica.
// =============================================================================
#pragma once

#include "AlgoritmoGenetico.h"
#include "Agente.h"
#include "../juego/Constantes.h"
#include <vector>
#include <memory>
#include <thread>
#include <atomic>
#include <mutex>
#include <functional>
#include <random>

namespace tetris {

// Estado del entrenamiento
enum class EstadoEntrenamiento : uint8_t {
    DETENIDO,
    EJECUTANDO,
    PAUSADO
};

class Entrenador {
public:
    Entrenador();
    ~Entrenador();

    // Configura el entrenamiento
    void configurar(int tamPoblacion, const std::vector<int>& arquitecturaRed);

    // Inicia el entrenamiento en un hilo separado
    void iniciar();

    // Pausa/reanuda el entrenamiento
    void pausar();
    void reanudar();

    // Detiene el entrenamiento completamente
    void detener();

    // Ejecuta un solo paso de simulación (para control manual de velocidad)
    void ejecutarPaso();

    // ---- Estado ----
    EstadoEntrenamiento obtenerEstado() const { return estado_.load(); }
    int obtenerGeneracion() const { return generacionActual_.load(); }
    float obtenerMejorFitness() const { return mejorFitnessGlobal_.load(); }

    // ---- Acceso a datos (protegido por mutex) ----

    // Obtiene una copia de las estadísticas de todas las generaciones
    std::vector<EstadisticasGeneracion> obtenerHistorial() const;

    // Obtiene la estadística de la generación actual
    EstadisticasGeneracion obtenerEstadisticasActuales() const;

    // Obtiene el número de agentes activos (no game over)
    int obtenerAgentesActivos() const;

    // Obtiene referencia a los agentes (para renderizado). ¡Bloquea mutex!
    // Usar con cuidado desde el hilo de renderizado.
    std::vector<Agente>& obtenerAgentes();
    const std::vector<Agente>& obtenerAgentes() const;

    // Bloqueo manual para acceso seguro desde el hilo de renderizado
    void bloquear() const { mutexDatos_.lock(); }
    void desbloquear() const { mutexDatos_.unlock(); }

    // ---- Algoritmo genético ----
    AlgoritmoGenetico& obtenerAlgoritmoGenetico() { return ag_; }
    const AlgoritmoGenetico& obtenerAlgoritmoGenetico() const { return ag_; }

    // ---- Guardado ----
    // Guarda los pesos del mejor agente de la generación actual (con metadatos)
    bool guardarMejorModelo(const std::string& ruta) const;

    // Carga pesos y los aplica a toda la población (con diversidad por mutación)
    bool cargarModelo(const std::string& ruta);

    // ---- Velocidad de simulación ----
    void establecerVelocidad(float velocidad) { velocidadSimulacion_ = velocidad; }
    float obtenerVelocidad() const { return velocidadSimulacion_; }

    // Progreso de la generación actual (0.0 a 1.0)
    float obtenerProgreso() const;

    // Número total de agentes
    int obtenerTamPoblacion() const { return tamPoblacion_; }

private:
    // Parámetros
    int tamPoblacion_;
    std::vector<int> arquitecturaRed_;
    float velocidadSimulacion_;

    // Agentes de la generación actual
    std::vector<Agente> agentes_;
    AlgoritmoGenetico ag_;

    // Estado atómico para comunicación entre hilos
    std::atomic<EstadoEntrenamiento> estado_;
    std::atomic<int> generacionActual_;
    std::atomic<float> mejorFitnessGlobal_;

    // Historial de estadísticas
    std::vector<EstadisticasGeneracion> historial_;
    EstadisticasGeneracion statsActuales_;

    // Hilo de entrenamiento
    std::unique_ptr<std::thread> hiloEntrenamiento_;
    mutable std::mutex mutexDatos_;

    // RNG para seeds aleatorias de cada generación
    std::mt19937 rng_;

    // Bucle principal del hilo de entrenamiento
    void bucleEntrenamiento();

    // Simula una generación completa
    void simularGeneracion();

    // Evoluciona a la siguiente generación
    void evolucionarGeneracion();

    // Inicializa la primera generación con pesos aleatorios
    void inicializarPoblacion();
};

} // namespace tetris
