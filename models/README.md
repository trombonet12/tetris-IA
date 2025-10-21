# Carpeta Models

Esta carpeta almacena los modelos entrenados de la red neuronal.

## Archivos generados:

- `best_tetris_neural_model.h5` - Mejor modelo del entrenamiento
- `checkpoint_gen_X.h5` - Checkpoints cada X generaciones
- `example_model.h5` - Modelos de ejemplo

## Uso:

```python
from src.ai.tetris_neural_ai import TetrisNeuralAI

# Cargar modelo
ai = TetrisNeuralAI()
ai.load_model('models/best_tetris_neural_model.h5')
```
