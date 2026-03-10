// =============================================================================
// Tetris con IA Evolutiva - Implementación del Algoritmo Genético
// Autor: Joan L.
// Descripción: Selección por torneo, cruce uniforme, mutación gaussiana
//              adaptativa y elitismo para evolucionar redes neuronales.
// =============================================================================
#include "ia/AlgoritmoGenetico.h"
#include <algorithm>
#include <numeric>
#include <cmath>
#include <chrono>

namespace tetris {

AlgoritmoGenetico::AlgoritmoGenetico()
    : tasaMutacion_(AG_TASA_MUTACION)
    , sigmaMutacion_(AG_SIGMA_MUTACION)
    , porcentajeElitismo_(AG_PORCENTAJE_ELITISMO)
    , tamTorneo_(AG_TAMANO_TORNEO)
    , generacionActual_(0)
    , generacionesSinMejora_(0)
    , mejorFitnessHistorico_(-1e10f)
{
    unsigned int semilla = static_cast<unsigned int>(
        std::chrono::steady_clock::now().time_since_epoch().count());
    rng_.seed(semilla);
}

void AlgoritmoGenetico::configurar(int tamPoblacion, float tasaMutacion,
                                     float sigmaMutacion, float porcentajeElitismo,
                                     int tamTorneo) {
    tasaMutacion_ = tasaMutacion;
    sigmaMutacion_ = sigmaMutacion;
    porcentajeElitismo_ = porcentajeElitismo;
    tamTorneo_ = tamTorneo;
}

std::vector<std::vector<float>> AlgoritmoGenetico::evolucionar(
    const std::vector<std::pair<std::vector<float>, float>>& poblacionConFitness
) {
    int tamPoblacion = static_cast<int>(poblacionConFitness.size());
    if (tamPoblacion == 0) return {};

    // Obtener las fitnesses para selección
    std::vector<float> fitnesses(tamPoblacion);
    for (int i = 0; i < tamPoblacion; ++i) {
        fitnesses[i] = poblacionConFitness[i].second;
    }

    // Ordenar índices por fitness (descendente)
    std::vector<int> indices(tamPoblacion);
    std::iota(indices.begin(), indices.end(), 0);
    std::sort(indices.begin(), indices.end(), [&](int a, int b) {
        return fitnesses[a] > fitnesses[b];
    });

    // Nueva generación
    std::vector<std::vector<float>> nuevaGeneracion;
    nuevaGeneracion.reserve(tamPoblacion);

    // Elitismo: los mejores pasan directamente a la siguiente generación
    int numElite = std::max(1, static_cast<int>(tamPoblacion * porcentajeElitismo_));
    for (int i = 0; i < numElite; ++i) {
        nuevaGeneracion.push_back(poblacionConFitness[indices[i]].first);
    }

    // Detectar estancamiento: si no mejora en 50 generaciones, inyectar diversidad
    float mejorActual = fitnesses[indices[0]];
    if (mejorActual > mejorFitnessHistorico_ + 0.5f) {
        mejorFitnessHistorico_ = mejorActual;
        generacionesSinMejora_ = 0;
    } else {
        ++generacionesSinMejora_;
    }

    // Sigma adaptativo: aumento suave cuando estancado (sigma ya es pequeño)
    float sigmaEfectivo = sigmaMutacion_;
    float tasaEfectiva = tasaMutacion_;
    if (generacionesSinMejora_ > 30) {
        sigmaEfectivo = sigmaMutacion_ * 1.5f;   // 0.075 — sigue dentro de la escala de pesos
        tasaEfectiva = std::min(tasaMutacion_ * 1.3f, 0.20f);
    }

    // Inyectar diversidad si hay estancamiento prolongado (menos destructiva)
    int numAleatorios = 0;
    if (generacionesSinMejora_ > 100) {
        numAleatorios = tamPoblacion / 10; // 10% con mutación fuerte moderada
        generacionesSinMejora_ = 0; // reiniciar contador
    }

    // Generar el resto: seleccionar padre por torneo, opcionalmente cruzar, y mutar
    std::uniform_real_distribution<float> probCruce(0.0f, 1.0f);
    while (static_cast<int>(nuevaGeneracion.size()) < tamPoblacion - numAleatorios) {
        int idxPadre1 = seleccionTorneo(fitnesses);

        // 30% probabilidad de crossover de punto simple
        if (probCruce(rng_) < 0.3f) {
            int idxPadre2 = seleccionTorneo(fitnesses);
            auto hijo = crucePuntoSimple(poblacionConFitness[idxPadre1].first,
                                         poblacionConFitness[idxPadre2].first);
            mutarConSigma(hijo, sigmaEfectivo, tasaEfectiva);
            nuevaGeneracion.push_back(std::move(hijo));
        } else {
            auto hijo = poblacionConFitness[idxPadre1].first; // clonar
            mutarConSigma(hijo, sigmaEfectivo, tasaEfectiva);
            nuevaGeneracion.push_back(std::move(hijo));
        }
    }

    // Inyectar individuos con mutación fuerte moderada (basados en el mejor)
    while (static_cast<int>(nuevaGeneracion.size()) < tamPoblacion) {
        auto diverso = poblacionConFitness[indices[0]].first; // clonar del mejor
        mutarConSigma(diverso, sigmaMutacion_ * 2.0f, 0.3f); // moderada, no destructiva
        nuevaGeneracion.push_back(std::move(diverso));
    }

    ++generacionActual_;
    return nuevaGeneracion;
}

EstadisticasGeneracion AlgoritmoGenetico::calcularEstadisticas(
    const std::vector<float>& fitnesses, int numGeneracion
) const {
    EstadisticasGeneracion stats;
    stats.generacion = numGeneracion;

    if (fitnesses.empty()) return stats;

    // Mejor, peor y media
    stats.mejorFitness = *std::max_element(fitnesses.begin(), fitnesses.end());
    stats.peorFitness = *std::min_element(fitnesses.begin(), fitnesses.end());

    float suma = std::accumulate(fitnesses.begin(), fitnesses.end(), 0.0f);
    stats.mediaFitness = suma / fitnesses.size();

    // Desviación estándar
    float sumaCuadrados = 0.0f;
    for (float f : fitnesses) {
        float diff = f - stats.mediaFitness;
        sumaCuadrados += diff * diff;
    }
    stats.desviacionEstandar = std::sqrt(sumaCuadrados / fitnesses.size());

    // Índice del mejor agente
    stats.mejorAgente = static_cast<int>(
        std::max_element(fitnesses.begin(), fitnesses.end()) - fitnesses.begin());

    return stats;
}

int AlgoritmoGenetico::seleccionTorneo(const std::vector<float>& fitnesses) {
    int tamPoblacion = static_cast<int>(fitnesses.size());
    std::uniform_int_distribution<int> dist(0, tamPoblacion - 1);

    int mejorIdx = dist(rng_);
    float mejorFitness = fitnesses[mejorIdx];

    for (int i = 1; i < tamTorneo_; ++i) {
        int idx = dist(rng_);
        if (fitnesses[idx] > mejorFitness) {
            mejorFitness = fitnesses[idx];
            mejorIdx = idx;
        }
    }

    return mejorIdx;
}

std::vector<float> AlgoritmoGenetico::cruceUniforme(
    const std::vector<float>& padre1,
    const std::vector<float>& padre2
) {
    std::vector<float> hijo(padre1.size());
    std::uniform_real_distribution<float> dist(0.0f, 1.0f);

    for (size_t i = 0; i < padre1.size(); ++i) {
        hijo[i] = (dist(rng_) < 0.5f) ? padre1[i] : padre2[i];
    }

    return hijo;
}

void AlgoritmoGenetico::mutar(std::vector<float>& pesos) {
    mutarConSigma(pesos, sigmaMutacion_, tasaMutacion_);
}

void AlgoritmoGenetico::mutarConSigma(std::vector<float>& pesos, float sigma, float tasa) {
    std::uniform_real_distribution<float> uniforme(0.0f, 1.0f);
    std::normal_distribution<float> normal(0.0f, sigma);

    for (size_t i = 0; i < pesos.size(); ++i) {
        if (uniforme(rng_) < tasa) {
            pesos[i] += normal(rng_);
        }
    }
}

std::vector<float> AlgoritmoGenetico::crucePuntoSimple(
    const std::vector<float>& padre1,
    const std::vector<float>& padre2
) {
    std::vector<float> hijo(padre1.size());
    std::uniform_int_distribution<size_t> dist(0, padre1.size() - 1);
    size_t punto = dist(rng_);

    for (size_t i = 0; i < padre1.size(); ++i) {
        hijo[i] = (i < punto) ? padre1[i] : padre2[i];
    }
    return hijo;
}

} // namespace tetris
