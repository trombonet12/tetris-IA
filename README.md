# Tetris · IA

Juego de Tetris completo para navegador con una IA evolutiva que aprende a jugar
en directo. **Sin dependencias, sin build**: HTML + JavaScript vanilla + Canvas 2D.

## Ejecutar

```bash
npm run serve     # → http://localhost:8080  (o: python -m http.server 8080)
```

> Los ES modules no cargan desde `file://`; hace falta el servidor estático.

```bash
npm test          # suite de tests (node --test, 115 tests)
npm run smoke     # humo del motor (partidas aleatorias + determinismo)
node tools/train-smoke.js   # humo del entrenamiento (12 generaciones en Node)
```

## Los tres modos

### 🎮 Jugar (Modo Normal)
Tetris guideline moderno: SRS con wall kicks, 7-bag, hold, ghost, DAS/ARR/SDF
configurables, lock delay con move-reset, T-spins (regla de 3 esquinas),
combos, back-to-back, perfect clears, niveles con gravedad guideline.
Seis sub-modos: **Maratón** (150 líneas), **Sprint 40**, **Ultra 2:00**,
**Zen**, **Excavación** (cheese) e **Infinito**. Récords top-10 por modo,
repeticiones grabadas (semilla + inputs), finesse, estadísticas históricas,
partículas, música y efectos procedurales con WebAudio, temas visuales,
modo daltónico, gamepad y teclas remapeables.

### 🧬 Entrenamiento IA
Algoritmo genético generacional sobre redes neuronales evaluadoras de
posiciones (14 features del tablero → MLP → puntuación de cada colocación
posible). **Toda la población (10–100 agentes) juega visible en directo** en un
grid de mini-tableros, simulada en paralelo en un pool de Web Workers.

- **Auto-finetuning**: mutación adaptativa (σ baja con progreso, sube con
  estancamiento), inyección de diversidad, curriculum de dificultad y
  re-evaluación del élite con semillas rotatorias.
- Configuración completa: población, elitismo, torneo, cruce, mutación,
  semilla maestra reproducible, features de entrada activables, arquitectura
  de red editable, coeficientes de fitness, presets.
- Dashboard: gráficas de fitness (con banda p25–p75), diversidad y σ/tasa,
  ranking en vivo, log de eventos, heatmap, inspector por agente (tablero
  grande + red neuronal con activaciones en vivo).
- Persistencia: autoguardado de modelos, sesiones reanudables (población
  completa + estado del auto-tuner), Salón de la Fama, exportación CSV/JSON.

### 👁 Ver IA
Carga cualquier modelo guardado (o importado de fichero `.tetris-model.json`)
y obsérvalo jugar con velocidades 0.5x–5x, paso a paso y retroceso. Incluye
visualización de la red neuronal con activaciones, top-5 de colocaciones
candidatas como fantasmas sobre el tablero, explicación de cada decisión
(contribución por feature), gauge de confianza, benchmark estadístico con
histograma y curva de supervivencia, comparador de 2 modelos con la misma
secuencia de piezas, torneos entre modelos y **duelo humano contra la IA**
a pantalla dividida.

## Arquitectura

```
src/
├── core/       rng determinista (mulberry32/splitmix32), config, emitter
├── game/       motor headless (SRS, 7-bag, scoring guideline) — corre igual
│               en el navegador, en Web Workers y en Node (tests)
├── ai/         features, MLP, enumerador de jugadas, GA, auto-tuner, fitness,
│               formato de modelo portable
├── workers/    sim-worker (chunk de agentes) + pool orquestador
├── modes/      escenas: menú, jugar, entrenamiento, ver-IA, ajustes, récords
├── ui/         renderers de canvas, gráficas, red neuronal, audio WebAudio,
│               partículas, input DAS/ARR + gamepad, textos en español
└── storage/    IndexedDB (modelos/sesiones/replays) + localStorage (ajustes)
```

Principios: el motor no toca el DOM (headless y determinista con semilla —
nunca `Math.random()` en lógica de juego); los textos de UI viven en
`src/ui/strings.es.js`; los pesos de la red se serializan como base64
little-endian en un JSON con versión y validación.
