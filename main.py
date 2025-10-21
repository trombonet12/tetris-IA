"""Tetris AI - Menú Principal."""
import os
import sys


def clear_screen():
    """Limpia la pantalla."""
    os.system('cls' if os.name == 'nt' else 'clear')


def print_header():
    """Imprime el encabezado."""
    clear_screen()
    print("="*70)
    print(" " * 20 + "TETRIS CON IA HEURISTICA")
    print("="*70)
    print()


def show_menu():
    """Muestra el menú principal."""
    print_header()
    print("Selecciona una opción:")
    print()
    print("  1. Jugar Tetris (Modo Manual)")
    print("  2. Ver IA Heurística jugando")
    print("  3. Entrenar IA Heurística (Algoritmo Genético)")
    print("  4. Información del proyecto")
    print("  0. Salir")
    print()
    print("="*70)


def play_manual():
    """Inicia el modo de juego manual."""
    print_header()
    print("Iniciando Tetris en modo manual...")
    print("Controles:")
    print("  Flechas izquierda/derecha: Mover pieza")
    print("  Flecha abajo: Caída suave")
    print("  Flecha arriba/ESPACIO: Rotar")
    print("  ENTER: Caída dura")
    print()
    input("Presiona ENTER para continuar...")
    
    from src.game.tetris_ui import TetrisUI
    game = TetrisUI()
    game.run()


def view_heuristic_ai():
    """Inicia el visualizador de IA heurística."""
    print_header()
    print("Iniciando visualizador de IA Heurística...")
    print("La IA usa un sistema de evaluación basado en:")
    print("  - Altura agregada")
    print("  - Líneas completas")
    print("  - Huecos")
    print("  - Irregularidad")
    print()
    input("Presiona ENTER para continuar...")
    
    from src.visualization.tetris_ai_viewer import TetrisAIViewer
    viewer = TetrisAIViewer(speed=2.0)
    viewer.run()


def train_heuristic_ai():
    """Inicia el entrenamiento de la IA heurística."""
    print_header()
    print("ENTRENAMIENTO DE IA HEURISTICA")
    print("="*70)
    print()
    print("Este proceso usa un algoritmo genético para encontrar")
    print("los mejores pesos para la función de evaluación heurística.")
    print()
    
    # Parámetros personalizables
    try:
        print("Configuración del entrenamiento:")
        print()
        
        pop = input("  Tamaño de población (default: 20): ").strip()
        population_size = int(pop) if pop else 20
        
        gen = input("  Número de generaciones (default: 10): ").strip()
        generations = int(gen) if gen else 10
        
        games = input("  Número de partidas por individuo (default: 5): ").strip()
        num_games = int(games) if games else 5
        
        mut = input("  Tasa de mutación 0-1 (default: 0.1): ").strip()
        mutation_rate = float(mut) if mut else 0.1
        
        par = input("  ¿Evaluación paralela (todos a la vez)? (s/n, default: s): ").strip().lower()
        use_parallel = par != 'n'
        
        print()
        print("Iniciando entrenamiento...")
        if use_parallel:
            print("Se abrirá una ventana mostrando TODOS los individuos jugando simultáneamente.")
        else:
            print("Se abrirá una ventana mostrando los individuos jugando uno por uno.")
        print("Esto puede tomar varios minutos dependiendo de los parámetros.")
        print()
        input("Presiona ENTER para comenzar...")
        
        from src.ai.training import train_heuristic_ai as train_ai
        
        best_weights = train_ai(
            population_size=population_size,
            generations=generations,
            num_games=num_games,
            mutation_rate=mutation_rate,
            use_visualizer=True,
            use_parallel=use_parallel
        )
        
        if best_weights:
            print()
            print("¡Entrenamiento completado exitosamente!")
            print("Los mejores pesos han sido guardados en 'best_heuristic_weights.txt'")
        
    except KeyboardInterrupt:
        print("\n\nEntrenamiento interrumpido por el usuario.")
    except Exception as e:
        print(f"\nError durante el entrenamiento: {e}")
        import traceback
        traceback.print_exc()
    
    print()
    input("Presiona ENTER para volver al menú...")


def show_info():
    """Muestra información del proyecto."""
    print_header()
    print("INFORMACION DEL PROYECTO")
    print("="*70)
    print()
    print("Tetris con IA Heurística")
    print()
    print("Archivos del Proyecto:")
    print("  - src/game/tetris_game.py: Lógica del juego")
    print("  - src/game/tetris_ui.py: Interfaz gráfica")
    print("  - src/ai/tetris_ai.py: IA heurística y algoritmo genético")
    print("  - src/ai/trainer.py: Módulo de entrenamiento")
    print("  - src/visualization/tetris_ai_viewer.py: Visualizador")
    print()
    print("Sistema de IA Heurística:")
    print()
    print("La IA evalúa cada movimiento usando 4 características:")
    print()
    print("  1. Altura agregada (Aggregate Height)")
    print("     Suma de alturas de todas las columnas.")
    print("     Peso negativo: preferir tableros más bajos.")
    print()
    print("  2. Líneas completas (Complete Lines)")
    print("     Número de líneas que se pueden completar.")
    print("     Peso positivo: preferir movimientos que completen líneas.")
    print()
    print("  3. Huecos (Holes)")
    print("     Espacios vacíos debajo de bloques.")
    print("     Peso negativo: evitar crear huecos.")
    print()
    print("  4. Irregularidad (Bumpiness)")
    print("     Diferencias de altura entre columnas adyacentes.")
    print("     Peso negativo: preferir tableros más uniformes.")
    print()
    print("Algoritmo Genético:")
    print()
    print("El entrenamiento usa un algoritmo genético para optimizar los pesos:")
    print("  - Crea una población de individuos con pesos aleatorios")
    print("  - Evalúa cada individuo jugando múltiples partidas")
    print("  - Selecciona los mejores individuos (élite)")
    print("  - Crea nuevos individuos mediante cruce y mutación")
    print("  - Repite el proceso durante varias generaciones")
    print("  - Guarda los mejores pesos en 'best_heuristic_weights.txt'")
    print()
    print("Características del Juego:")
    print("  - Sistema de rotación con wall kick")
    print("  - Pieza fantasma (ghost piece)")
    print("  - Sistema de niveles progresivos")
    print("  - Estadísticas en tiempo real")
    print()
    print("Dependencias:")
    print("  - Python 3.8+")
    print("  - Pygame (interfaz gráfica)")
    print("  - NumPy (cálculos numéricos)")
    print()
    input("Presiona ENTER para volver al menú...")


def main():
    """Función principal del menú."""
    while True:
        show_menu()
        
        try:
            choice = input("Opción: ").strip()
            
            if choice == '1':
                play_manual()
            elif choice == '2':
                view_heuristic_ai()
            elif choice == '3':
                train_heuristic_ai()
            elif choice == '4':
                show_info()
            elif choice == '0':
                print_header()
                print("Gracias por usar Tetris AI")
                print()
                sys.exit(0)
            else:
                print("\nOpción no válida. Presiona ENTER para continuar...")
                input()
        
        except KeyboardInterrupt:
            print("\n\nInterrumpido por el usuario.")
            sys.exit(0)
        except Exception as e:
            print(f"\nError: {e}")
            input("Presiona ENTER para continuar...")


if __name__ == "__main__":
    main()


