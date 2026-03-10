// =============================================================================
// Tetris con IA Evolutiva - Algoritmo Genético
// Autor: Joan L.
// Descripción: Implementa un algoritmo genético para evolucionar las redes
//              neuronales. Incluye selección por torneo, cruce uniforme,
//              mutación gaussiana adaptativa y elitismo.
// =============================================================================
#pragma once

#include "RedNeuronal.h"
#include "../juego/Constantes.h"
#include <vector>
#include <random>
#include <functional>

namespace tetris {

// Estadísticas de una generación
struct EstadisticasGeneracion {
    int generacion = 0;
    float mejorFitness = 0.0f;
    float mediaFitness = 0.0f;
    float peorFitness = 0.0f;
    float desviacionEstandar = 0.0f;
    int mejorAgente = 0;  // Índice del mejor agente
};

class AlgoritmoGenetico {
public:
    AlgoritmoGenetico();

    // Configura los parámetros del algoritmo
    void configurar(int tamPoblacion, float tasaMutacion, float sigmaMutacion,
                     float porcentajeElitismo, int tamTorneo);

    // Evoluciona la población: recibe pares (pesos, fitness) y devuelve nueva generación de pesos
    std::vector<std::vector<float>> evolucionar(
        const std::vector<std::pair<std::vector<float>, float>>& poblacionConFitness
    );

    // Calcula las estadísticas de la generación actual
    EstadisticasGeneracion calcularEstadisticas(
        const std::vector<float>& fitnesses, int numGeneracion
    ) const;

    // ---- Getters/Setters de parámetros ----
    float obtenerTasaMutacion() const { return tasaMutacion_; }
    void establecerTasaMutacion(float tasa) { tasaMutacion_ = tasa; }

    float obtenerSigmaMutacion() const { return sigmaMutacion_; }
    void establecerSigmaMutacion(float sigma) { sigmaMutacion_ = sigma; }

    float obtenerPorcentajeElitismo() const { return porcentajeElitismo_; }
    void establecerPorcentajeElitismo(float porcentaje) { porcentajeElitismo_ = porcentaje; }

    int obtenerTamTorneo() const { return tamTorneo_; }
    void establecerTamTorneo(int tam) { tamTorneo_ = tam; }

    int obtenerGeneracion() const { return generacionActual_; }

private:
    float tasaMutacion_;
    float sigmaMutacion_;
    float porcentajeElitismo_;
    int tamTorneo_;
    int generacionActual_;
    int generacionesSinMejora_;
    float mejorFitnessHistorico_;
    std::mt19937 rng_;

    // Selección por torneo: devuelve el índice del ganador
    int seleccionTorneo(const std::vector<float>& fitnesses);

    // Cruce uniforme entre dos padres: genera un hijo
    std::vector<float> cruceUniforme(
        const std::vector<float>& padre1,
        const std::vector<float>& padre2
    );

    // Mutación gaussiana de los pesos
    void mutar(std::vector<float>& pesos);

    // Mutación con sigma y tasa específicos (para adaptación dinámica)
    void mutarConSigma(std::vector<float>& pesos, float sigma, float tasa);

    // Cruce de punto simple: divide los pesos en un punto aleatorio
    std::vector<float> crucePuntoSimple(
        const std::vector<float>& padre1,
        const std::vector<float>& padre2
    );
};

} // namespace tetris
