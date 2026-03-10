// =============================================================================
// Tetris con IA Evolutiva - Clase RedNeuronal (acelerada por CUDA)
// Autor: Joan L.
// Descripción: Red neuronal feedforward multicapa con propagación hacia adelante
//              ejecutada en la GPU (CUDA). Soporta evaluación individual y por
//              lotes para máximo rendimiento con la RTX 4080 Super. Los pesos
//              son gestionados por el algoritmo genético (sin backpropagación).
// =============================================================================
#pragma once

#include <vector>
#include <string>
#include <memory>
#include <mutex>

namespace tetris {

// Estructura con las activaciones de cada capa (para visualización)
struct ActivacionesRed {
    std::vector<std::vector<float>> capas; // activaciones[capa][neurona]
};

class RedNeuronal {
public:
    // Crea una red con la arquitectura dada (ej: {218, 128, 64, 32, 16, 6})
    // El primer valor es el tamaño de entrada, el último el de salida.
    explicit RedNeuronal(const std::vector<int>& arquitectura);

    // Constructor de copia (copia pesos)
    RedNeuronal(const RedNeuronal& otra);
    RedNeuronal& operator=(const RedNeuronal& otra);

    // Destructor - libera memoria GPU
    ~RedNeuronal();

    // ---- Inicialización estática de CUDA ----
    static void inicializarCUDA();
    static void finalizarCUDA();
    static bool cudaDisponible();

    // ---- Evaluación ----

    // Evalúa la red con una entrada y devuelve la salida (softmax)
    std::vector<float> evaluar(const std::vector<float>& entrada) const;

    // Evaluación por lotes en GPU: evalúa múltiples redes con sus respectivas entradas
    // Devuelve las salidas de cada red. Altamente eficiente en GPU.
    static std::vector<std::vector<float>> evaluarLote(
        const std::vector<RedNeuronal*>& redes,
        const std::vector<std::vector<float>>& entradas
    );

    // Obtiene las activaciones de todas las capas (para visualización del perceptrón)
    ActivacionesRed obtenerActivaciones(const std::vector<float>& entrada) const;

    // ---- Gestión de pesos ----

    // Obtiene todos los pesos como vector plano (pesos + sesgos de todas las capas)
    std::vector<float> obtenerPesos() const;

    // Establece todos los pesos desde un vector plano
    void establecerPesos(const std::vector<float>& pesos);

    // Inicializa pesos aleatorios (distribución Xavier/Glorot)
    void inicializarAleatorio(unsigned int semilla = 0);

    // ---- Información de la red ----
    const std::vector<int>& obtenerArquitectura() const { return arquitectura_; }
    int obtenerTotalParametros() const { return totalParametros_; }
    int obtenerNumCapas() const { return static_cast<int>(arquitectura_.size() - 1); }

    // ---- Serialización ----
    bool guardar(const std::string& ruta) const;
    bool cargar(const std::string& ruta);

private:
    std::vector<int> arquitectura_;   // Tamaño de cada capa (incluyendo entrada y salida)
    std::vector<float> pesosHost_;    // Copia de pesos en CPU (para serialización y visualización)
    int totalParametros_;             // Número total de pesos + sesgos

    // Punteros a memoria GPU (gestionados en el .cu)
    float* d_pesos_;                  // Pesos en memoria de dispositivo
    mutable float* d_entrada_;        // Buffer de entrada en GPU
    mutable float* d_salida_;         // Buffer de salida en GPU
    mutable float* d_intermedio1_;    // Buffer intermedio 1
    mutable float* d_intermedio2_;    // Buffer intermedio 2

    bool gpuInicializada_;

    // Calcula el total de parámetros según la arquitectura
    int calcularTotalParametros() const;

    // Sincroniza pesos de CPU a GPU
    void sincronizarPesosAGPU() const;

    // Tamaño máximo de capa (para buffers intermedios)
    int tamMaxCapa() const;

    // Estado global de CUDA
    static bool s_cudaIniciado;
    static std::mutex s_mutexCuda;
};

} // namespace tetris
