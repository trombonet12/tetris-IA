// =============================================================================
// Tetris con IA Evolutiva - Red Neuronal con CUDA
// Autor: Joan L.
// Descripción: Implementación de la red neuronal feedforward con propagación
//              hacia adelante ejecutada en la GPU mediante CUDA. Diseñada para
//              evaluación masiva en paralelo de múltiples redes (una por agente)
//              aprovechando la RTX 4080 Super (arquitectura Ada Lovelace).
//
//              Cada bloque CUDA procesa un agente. Los hilos del bloque
//              colaboran para calcular el producto matriz-vector de cada capa.
// =============================================================================
#include "ia/RedNeuronal.h"

#include <cuda_runtime.h>
#include <cmath>
#include <random>
#include <fstream>
#include <algorithm>
#include <numeric>
#include <iostream>
#include <cstring>
#include <chrono>

namespace tetris {

// ===========================================================================
// Variables estáticas
// ===========================================================================
bool RedNeuronal::s_cudaIniciado = false;
std::mutex RedNeuronal::s_mutexCuda;

// ===========================================================================
// Kernel CUDA: propagación hacia adelante para un solo agente
// Cada bloque procesa un agente. Los hilos del bloque calculan las neuronas
// de salida de cada capa cooperativamente.
// ===========================================================================
__global__ void kernelPropagacionAdelante(
    const float* __restrict__ entradas,     // [N, tamEntrada]
    const float* __restrict__ todosPesos,   // [N, totalParametros]
    float* __restrict__ salidas,            // [N, tamSalida]
    float* __restrict__ activaciones,       // [N, maxNeuronas * numCapas] (para visualización, puede ser nullptr)
    const int* __restrict__ arquitectura,   // [numCapas + 1] tamaños de capa
    int numCapas,
    int totalParametros,
    int tamEntrada,
    int tamSalida,
    int maxNeuronas,
    int N
) {
    int agenteIdx = blockIdx.x;
    if (agenteIdx >= N) return;

    // Memoria compartida: dos buffers para ping-pong entre capas
    extern __shared__ float compartida[];
    float* bufferA = compartida;                        // Activaciones capa actual
    float* bufferB = compartida + maxNeuronas;          // Activaciones capa siguiente

    // Punteros específicos de este agente
    const float* miEntrada = entradas + agenteIdx * tamEntrada;
    const float* misPesos = todosPesos + agenteIdx * totalParametros;
    float* miSalida = salidas + agenteIdx * tamSalida;

    // Copiar entrada al buffer A
    for (int i = threadIdx.x; i < tamEntrada; i += blockDim.x) {
        bufferA[i] = miEntrada[i];
    }
    __syncthreads();

    // Guardar activaciones de la capa de entrada (si se solicita)
    if (activaciones != nullptr) {
        float* misActivaciones = activaciones + agenteIdx * maxNeuronas * numCapas;
        // No guardamos la entrada, solo las capas ocultas y salida
    }

    int offsetPeso = 0;
    float* actual = bufferA;
    float* siguiente = bufferB;

    // Propagar por cada capa
    for (int capa = 0; capa < numCapas; ++capa) {
        int tamActual = arquitectura[capa];
        int tamSiguiente = arquitectura[capa + 1];

        // Pesos y sesgos de esta capa
        const float* W = misPesos + offsetPeso;
        const float* b = W + tamActual * tamSiguiente;

        // Cada hilo calcula una o más neuronas de salida
        for (int j = threadIdx.x; j < tamSiguiente; j += blockDim.x) {
            float suma = b[j];
            for (int i = 0; i < tamActual; ++i) {
                suma += actual[i] * W[i * tamSiguiente + j];
            }

            // Función de activación: ReLU para capas ocultas
            if (capa < numCapas - 1) {
                suma = fmaxf(0.0f, suma);
            }
            siguiente[j] = suma;
        }
        __syncthreads();

        // Guardar activaciones para visualización (si se solicita)
        if (activaciones != nullptr) {
            float* misAct = activaciones + agenteIdx * maxNeuronas * numCapas + capa * maxNeuronas;
            for (int j = threadIdx.x; j < tamSiguiente; j += blockDim.x) {
                misAct[j] = siguiente[j];
            }
            __syncthreads();
        }

        // Intercambiar buffers
        float* temp = actual;
        actual = siguiente;
        siguiente = temp;

        offsetPeso += tamActual * tamSiguiente + tamSiguiente;
    }

    // Aplicar softmax a la capa de salida (hilo 0 solo, salida es pequeña)
    if (threadIdx.x == 0) {
        // Encontrar máximo para estabilidad numérica
        float maxVal = actual[0];
        for (int i = 1; i < tamSalida; ++i) {
            if (actual[i] > maxVal) maxVal = actual[i];
        }

        // Calcular exponenciales y sumar
        float sumaExp = 0.0f;
        for (int i = 0; i < tamSalida; ++i) {
            float exp_val = expf(actual[i] - maxVal);
            miSalida[i] = exp_val;
            sumaExp += exp_val;
        }

        // Normalizar
        float invSuma = 1.0f / sumaExp;
        for (int i = 0; i < tamSalida; ++i) {
            miSalida[i] *= invSuma;
        }
    }
}

// ===========================================================================
// Macro para verificar errores de CUDA
// ===========================================================================
#define VERIFICAR_CUDA(llamada) do { \
    cudaError_t err = (llamada); \
    if (err != cudaSuccess) { \
        std::cerr << "[CUDA ERROR] " << cudaGetErrorString(err) \
                  << " en " << __FILE__ << ":" << __LINE__ << std::endl; \
    } \
} while(0)

// ===========================================================================
// Implementación de RedNeuronal
// ===========================================================================

RedNeuronal::RedNeuronal(const std::vector<int>& arquitectura)
    : arquitectura_(arquitectura)
    , totalParametros_(0)
    , d_pesos_(nullptr)
    , d_entrada_(nullptr)
    , d_salida_(nullptr)
    , d_intermedio1_(nullptr)
    , d_intermedio2_(nullptr)
    , gpuInicializada_(false)
{
    totalParametros_ = calcularTotalParametros();
    pesosHost_.resize(totalParametros_, 0.0f);

    // Inicializar pesos aleatorios por defecto
    inicializarAleatorio();

    // Asignar memoria GPU si CUDA está disponible
    if (s_cudaIniciado) {
        VERIFICAR_CUDA(cudaMalloc(&d_pesos_, totalParametros_ * sizeof(float)));
        VERIFICAR_CUDA(cudaMalloc(&d_entrada_, arquitectura_.front() * sizeof(float)));
        VERIFICAR_CUDA(cudaMalloc(&d_salida_, arquitectura_.back() * sizeof(float)));

        int maxCapa = tamMaxCapa();
        VERIFICAR_CUDA(cudaMalloc(&d_intermedio1_, maxCapa * sizeof(float)));
        VERIFICAR_CUDA(cudaMalloc(&d_intermedio2_, maxCapa * sizeof(float)));

        sincronizarPesosAGPU();
        gpuInicializada_ = true;
    }
}

RedNeuronal::RedNeuronal(const RedNeuronal& otra)
    : arquitectura_(otra.arquitectura_)
    , pesosHost_(otra.pesosHost_)
    , totalParametros_(otra.totalParametros_)
    , d_pesos_(nullptr)
    , d_entrada_(nullptr)
    , d_salida_(nullptr)
    , d_intermedio1_(nullptr)
    , d_intermedio2_(nullptr)
    , gpuInicializada_(false)
{
    if (s_cudaIniciado) {
        VERIFICAR_CUDA(cudaMalloc(&d_pesos_, totalParametros_ * sizeof(float)));
        VERIFICAR_CUDA(cudaMalloc(&d_entrada_, arquitectura_.front() * sizeof(float)));
        VERIFICAR_CUDA(cudaMalloc(&d_salida_, arquitectura_.back() * sizeof(float)));

        int maxCapa = tamMaxCapa();
        VERIFICAR_CUDA(cudaMalloc(&d_intermedio1_, maxCapa * sizeof(float)));
        VERIFICAR_CUDA(cudaMalloc(&d_intermedio2_, maxCapa * sizeof(float)));

        sincronizarPesosAGPU();
        gpuInicializada_ = true;
    }
}

RedNeuronal& RedNeuronal::operator=(const RedNeuronal& otra) {
    if (this == &otra) return *this;

    arquitectura_ = otra.arquitectura_;
    pesosHost_ = otra.pesosHost_;
    totalParametros_ = otra.totalParametros_;

    if (gpuInicializada_ && s_cudaIniciado) {
        sincronizarPesosAGPU();
    }
    return *this;
}

RedNeuronal::~RedNeuronal() {
    if (gpuInicializada_) {
        cudaFree(d_pesos_);
        cudaFree(d_entrada_);
        cudaFree(d_salida_);
        cudaFree(d_intermedio1_);
        cudaFree(d_intermedio2_);
    }
}

void RedNeuronal::inicializarCUDA() {
    std::lock_guard<std::mutex> lock(s_mutexCuda);
    if (s_cudaIniciado) return;

    int dispositivos = 0;
    cudaError_t err = cudaGetDeviceCount(&dispositivos);
    if (err != cudaSuccess || dispositivos == 0) {
        std::cerr << "[CUDA] No se encontraron dispositivos CUDA compatibles." << std::endl;
        return;
    }

    // Seleccionar el primer dispositivo (RTX 4080 Super)
    cudaDeviceProp prop;
    VERIFICAR_CUDA(cudaGetDeviceProperties(&prop, 0));
    VERIFICAR_CUDA(cudaSetDevice(0));

    std::cerr << "[CUDA] Dispositivo: " << prop.name << std::endl;
    std::cerr << "[CUDA] Memoria: " << (prop.totalGlobalMem / (1024*1024)) << " MB" << std::endl;
    std::cerr << "[CUDA] Compute Capability: " << prop.major << "." << prop.minor << std::endl;

    s_cudaIniciado = true;
}

void RedNeuronal::finalizarCUDA() {
    std::lock_guard<std::mutex> lock(s_mutexCuda);
    if (!s_cudaIniciado) return;
    cudaDeviceReset();
    s_cudaIniciado = false;
}

bool RedNeuronal::cudaDisponible() {
    return s_cudaIniciado;
}

// Evaluación en CPU (función estática auxiliar, fallback si no hay GPU)
static std::vector<float> evaluarCPU_estatico(
    const std::vector<float>& entrada,
    const std::vector<float>& pesos,
    const std::vector<int>& arquitectura
) {
    std::vector<float> actual = entrada;
    int numCapas = static_cast<int>(arquitectura.size() - 1);
    int offsetPeso = 0;

    for (int capa = 0; capa < numCapas; ++capa) {
        int tamActual = arquitectura[capa];
        int tamSiguiente = arquitectura[capa + 1];

        std::vector<float> siguiente(tamSiguiente);

        for (int j = 0; j < tamSiguiente; ++j) {
            float suma = pesos[offsetPeso + tamActual * tamSiguiente + j];
            for (int i = 0; i < tamActual; ++i) {
                suma += actual[i] * pesos[offsetPeso + i * tamSiguiente + j];
            }
            if (capa < numCapas - 1) {
                suma = std::max(0.0f, suma);
            }
            siguiente[j] = suma;
        }

        actual = std::move(siguiente);
        offsetPeso += tamActual * tamSiguiente + tamSiguiente;
    }

    float maxVal = *std::max_element(actual.begin(), actual.end());
    float sumaExp = 0.0f;
    for (auto& v : actual) {
        v = std::exp(v - maxVal);
        sumaExp += v;
    }
    for (auto& v : actual) {
        v /= sumaExp;
    }
    return actual;
}

std::vector<float> RedNeuronal::evaluar(const std::vector<float>& entrada) const {
    if (entrada.size() != static_cast<size_t>(arquitectura_.front())) {
        return std::vector<float>(arquitectura_.back(), 0.0f);
    }

    // Si CUDA está disponible, usar GPU
    if (gpuInicializada_ && s_cudaIniciado) {
        // Copiar entrada a GPU
        VERIFICAR_CUDA(cudaMemcpy(d_entrada_, entrada.data(),
                                   entrada.size() * sizeof(float),
                                   cudaMemcpyHostToDevice));

        // Copiar arquitectura a GPU
        int* d_arq;
        VERIFICAR_CUDA(cudaMalloc(&d_arq, arquitectura_.size() * sizeof(int)));
        VERIFICAR_CUDA(cudaMemcpy(d_arq, arquitectura_.data(),
                                   arquitectura_.size() * sizeof(int),
                                   cudaMemcpyHostToDevice));

        int maxCapa = tamMaxCapa();
        int numCapas = static_cast<int>(arquitectura_.size() - 1);

        // Un bloque, hilos suficientes para la capa más grande
        int hilosPorBloque = std::min(256, maxCapa);
        size_t memoriaCompartida = 2 * maxCapa * sizeof(float);

        kernelPropagacionAdelante<<<1, hilosPorBloque, memoriaCompartida>>>(
            d_entrada_, d_pesos_, d_salida_, nullptr,
            d_arq, numCapas, totalParametros_,
            arquitectura_.front(), arquitectura_.back(),
            maxCapa, 1
        );

        VERIFICAR_CUDA(cudaDeviceSynchronize());

        // Copiar resultado de vuelta a CPU
        std::vector<float> salida(arquitectura_.back());
        VERIFICAR_CUDA(cudaMemcpy(salida.data(), d_salida_,
                                   salida.size() * sizeof(float),
                                   cudaMemcpyDeviceToHost));

        cudaFree(d_arq);
        return salida;
    }

    // Fallback CPU si CUDA no disponible
    return evaluarCPU_estatico(entrada, pesosHost_, arquitectura_);
}

std::vector<std::vector<float>> RedNeuronal::evaluarLote(
    const std::vector<RedNeuronal*>& redes,
    const std::vector<std::vector<float>>& entradas
) {
    int N = static_cast<int>(redes.size());
    if (N == 0) return {};

    int tamEntrada = redes[0]->arquitectura_.front();
    int tamSalida = redes[0]->arquitectura_.back();
    int totalParams = redes[0]->totalParametros_;
    int maxCapa = redes[0]->tamMaxCapa();
    int numCapas = static_cast<int>(redes[0]->arquitectura_.size() - 1);

    // Si CUDA no está disponible, evaluar en CPU secuencialmente
    if (!s_cudaIniciado) {
        std::vector<std::vector<float>> resultados(N);
        for (int i = 0; i < N; ++i) {
            resultados[i] = evaluarCPU_estatico(entradas[i], redes[i]->pesosHost_,
                                            redes[i]->arquitectura_);
        }
        return resultados;
    }

    // Preparar datos contiguos para GPU
    std::vector<float> todasEntradas(N * tamEntrada);
    std::vector<float> todosPesos(N * totalParams);

    for (int i = 0; i < N; ++i) {
        std::memcpy(todasEntradas.data() + i * tamEntrada,
                    entradas[i].data(), tamEntrada * sizeof(float));
        std::memcpy(todosPesos.data() + i * totalParams,
                    redes[i]->pesosHost_.data(), totalParams * sizeof(float));
    }

    // Asignar memoria GPU para el lote
    float *d_entradas, *d_pesos, *d_salidas;
    int* d_arq;

    VERIFICAR_CUDA(cudaMalloc(&d_entradas, N * tamEntrada * sizeof(float)));
    VERIFICAR_CUDA(cudaMalloc(&d_pesos, N * totalParams * sizeof(float)));
    VERIFICAR_CUDA(cudaMalloc(&d_salidas, N * tamSalida * sizeof(float)));
    VERIFICAR_CUDA(cudaMalloc(&d_arq, redes[0]->arquitectura_.size() * sizeof(int)));

    // Copiar datos a GPU
    VERIFICAR_CUDA(cudaMemcpy(d_entradas, todasEntradas.data(),
                               N * tamEntrada * sizeof(float), cudaMemcpyHostToDevice));
    VERIFICAR_CUDA(cudaMemcpy(d_pesos, todosPesos.data(),
                               N * totalParams * sizeof(float), cudaMemcpyHostToDevice));
    VERIFICAR_CUDA(cudaMemcpy(d_arq, redes[0]->arquitectura_.data(),
                               redes[0]->arquitectura_.size() * sizeof(int),
                               cudaMemcpyHostToDevice));

    // Lanzar kernel: un bloque por agente
    int hilosPorBloque = std::min(256, maxCapa);
    size_t memoriaCompartida = 2 * maxCapa * sizeof(float);

    kernelPropagacionAdelante<<<N, hilosPorBloque, memoriaCompartida>>>(
        d_entradas, d_pesos, d_salidas, nullptr,
        d_arq, numCapas, totalParams,
        tamEntrada, tamSalida, maxCapa, N
    );

    VERIFICAR_CUDA(cudaDeviceSynchronize());

    // Copiar resultados de vuelta a CPU
    std::vector<float> todasSalidas(N * tamSalida);
    VERIFICAR_CUDA(cudaMemcpy(todasSalidas.data(), d_salidas,
                               N * tamSalida * sizeof(float), cudaMemcpyDeviceToHost));

    // Liberar memoria GPU del lote
    cudaFree(d_entradas);
    cudaFree(d_pesos);
    cudaFree(d_salidas);
    cudaFree(d_arq);

    // Reorganizar resultados
    std::vector<std::vector<float>> resultados(N);
    for (int i = 0; i < N; ++i) {
        resultados[i].assign(todasSalidas.begin() + i * tamSalida,
                             todasSalidas.begin() + (i + 1) * tamSalida);
    }

    return resultados;
}

ActivacionesRed RedNeuronal::obtenerActivaciones(const std::vector<float>& entrada) const {
    ActivacionesRed result;

    // Guardar la capa de entrada
    result.capas.push_back(entrada);

    std::vector<float> actual = entrada;
    int numCapas = static_cast<int>(arquitectura_.size() - 1);
    int offsetPeso = 0;

    for (int capa = 0; capa < numCapas; ++capa) {
        int tamActual = arquitectura_[capa];
        int tamSiguiente = arquitectura_[capa + 1];

        std::vector<float> siguiente(tamSiguiente);

        for (int j = 0; j < tamSiguiente; ++j) {
            float suma = pesosHost_[offsetPeso + tamActual * tamSiguiente + j];
            for (int i = 0; i < tamActual; ++i) {
                suma += actual[i] * pesosHost_[offsetPeso + i * tamSiguiente + j];
            }
            if (capa < numCapas - 1) {
                suma = std::max(0.0f, suma);
            }
            siguiente[j] = suma;
        }

        // Para la última capa, aplicar softmax
        if (capa == numCapas - 1) {
            float maxVal = *std::max_element(siguiente.begin(), siguiente.end());
            float sumaExp = 0.0f;
            for (auto& v : siguiente) {
                v = std::exp(v - maxVal);
                sumaExp += v;
            }
            for (auto& v : siguiente) {
                v /= sumaExp;
            }
        }

        result.capas.push_back(siguiente);
        actual = std::move(siguiente);
        offsetPeso += tamActual * tamSiguiente + tamSiguiente;
    }

    return result;
}

std::vector<float> RedNeuronal::obtenerPesos() const {
    return pesosHost_;
}

void RedNeuronal::establecerPesos(const std::vector<float>& pesos) {
    if (pesos.size() != static_cast<size_t>(totalParametros_)) return;
    pesosHost_ = pesos;
    if (gpuInicializada_ && s_cudaIniciado) {
        sincronizarPesosAGPU();
    }
}

void RedNeuronal::inicializarAleatorio(unsigned int semilla) {
    if (semilla == 0) {
        semilla = static_cast<unsigned int>(
            std::chrono::steady_clock::now().time_since_epoch().count());
    }
    std::mt19937 rng(semilla);

    // Inicialización Xavier/Glorot para cada capa
    int offset = 0;
    for (size_t capa = 0; capa < arquitectura_.size() - 1; ++capa) {
        int tamEntrada = arquitectura_[capa];
        int tamSalida = arquitectura_[capa + 1];

        float desviacion = std::sqrt(2.0f / (tamEntrada + tamSalida));
        std::normal_distribution<float> dist(0.0f, desviacion);

        // Pesos
        int numPesos = tamEntrada * tamSalida;
        for (int i = 0; i < numPesos; ++i) {
            pesosHost_[offset + i] = dist(rng);
        }
        offset += numPesos;

        // Sesgos inicializados a cero
        for (int i = 0; i < tamSalida; ++i) {
            pesosHost_[offset + i] = 0.0f;
        }
        offset += tamSalida;
    }

    if (gpuInicializada_ && s_cudaIniciado) {
        sincronizarPesosAGPU();
    }
}

bool RedNeuronal::guardar(const std::string& ruta) const {
    std::ofstream archivo(ruta, std::ios::binary);
    if (!archivo.is_open()) return false;

    // Guardar arquitectura
    int numCapas = static_cast<int>(arquitectura_.size());
    archivo.write(reinterpret_cast<const char*>(&numCapas), sizeof(int));
    archivo.write(reinterpret_cast<const char*>(arquitectura_.data()),
                  numCapas * sizeof(int));

    // Guardar pesos
    archivo.write(reinterpret_cast<const char*>(&totalParametros_), sizeof(int));
    archivo.write(reinterpret_cast<const char*>(pesosHost_.data()),
                  totalParametros_ * sizeof(float));

    return archivo.good();
}

bool RedNeuronal::cargar(const std::string& ruta) {
    std::ifstream archivo(ruta, std::ios::binary);
    if (!archivo.is_open()) return false;

    // Leer arquitectura
    int numCapas;
    archivo.read(reinterpret_cast<char*>(&numCapas), sizeof(int));
    if (numCapas <= 0 || numCapas > 100) return false; // Validación

    arquitectura_.resize(numCapas);
    archivo.read(reinterpret_cast<char*>(arquitectura_.data()),
                 numCapas * sizeof(int));

    // Validar que los tamaños de capa son razonables
    for (int tam : arquitectura_) {
        if (tam <= 0 || tam > 10000) return false;
    }

    // Leer pesos
    int totalParams;
    archivo.read(reinterpret_cast<char*>(&totalParams), sizeof(int));
    if (totalParams != calcularTotalParametros()) return false; // Validación

    totalParametros_ = totalParams;
    pesosHost_.resize(totalParametros_);
    archivo.read(reinterpret_cast<char*>(pesosHost_.data()),
                 totalParametros_ * sizeof(float));

    if (gpuInicializada_ && s_cudaIniciado) {
        sincronizarPesosAGPU();
    }

    return archivo.good();
}

int RedNeuronal::calcularTotalParametros() const {
    int total = 0;
    for (size_t i = 0; i < arquitectura_.size() - 1; ++i) {
        // Pesos + sesgos de cada capa
        total += arquitectura_[i] * arquitectura_[i + 1] + arquitectura_[i + 1];
    }
    return total;
}

void RedNeuronal::sincronizarPesosAGPU() const {
    if (d_pesos_ && s_cudaIniciado) {
        VERIFICAR_CUDA(cudaMemcpy(d_pesos_, pesosHost_.data(),
                                   totalParametros_ * sizeof(float),
                                   cudaMemcpyHostToDevice));
    }
}

int RedNeuronal::tamMaxCapa() const {
    int maxTam = 0;
    for (int tam : arquitectura_) {
        maxTam = std::max(maxTam, tam);
    }
    return maxTam;
}

} // namespace tetris
