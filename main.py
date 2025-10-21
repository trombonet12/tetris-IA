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
    print("  3. Información del proyecto")
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
    print("  - src/ai/tetris_ai.py: IA heurística")
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


