"""Entrenador de IA Heurística para Tetris."""
import os
from src.ai.tetris_ai import GeneticAlgorithm


def clear_screen():
    """Limpia la pantalla."""
    os.system('cls' if os.name == 'nt' else 'clear')


def get_int_input(prompt, min_val=1, max_val=None, default=None):
    """Obtiene entrada entera del usuario con validación.
    
    Args:
        prompt: Mensaje a mostrar.
        min_val: Valor mínimo aceptable.
        max_val: Valor máximo aceptable (None = sin límite).
        default: Valor por defecto si el usuario presiona Enter.
        
    Returns:
        Valor entero válido.
    """
    while True:
        try:
            if default is not None:
                user_input = input(f"{prompt} (default: {default}): ").strip()
                if not user_input:
                    return default
            else:
                user_input = input(f"{prompt}: ").strip()
            
            value = int(user_input)
            
            if value < min_val:
                print(f"Error: El valor debe ser al menos {min_val}")
                continue
            
            if max_val is not None and value > max_val:
                print(f"Error: El valor no puede ser mayor que {max_val}")
                continue
            
            return value
        
        except ValueError:
            print("Error: Por favor ingresa un número válido")


def get_float_input(prompt, min_val=0.0, max_val=1.0, default=None):
    """Obtiene entrada decimal del usuario con validación.
    
    Args:
        prompt: Mensaje a mostrar.
        min_val: Valor mínimo aceptable.
        max_val: Valor máximo aceptable.
        default: Valor por defecto si el usuario presiona Enter.
        
    Returns:
        Valor decimal válido.
    """
    while True:
        try:
            if default is not None:
                user_input = input(f"{prompt} (default: {default}): ").strip()
                if not user_input:
                    return default
            else:
                user_input = input(f"{prompt}: ").strip()
            
            value = float(user_input)
            
            if value < min_val:
                print(f"Error: El valor debe ser al menos {min_val}")
                continue
            
            if value > max_val:
                print(f"Error: El valor no puede ser mayor que {max_val}")
                continue
            
            return value
        
        except ValueError:
            print("Error: Por favor ingresa un número decimal válido")


def get_yes_no_input(prompt, default=True):
    """Obtiene respuesta sí/no del usuario.
    
    Args:
        prompt: Mensaje a mostrar.
        default: Valor por defecto (True para sí, False para no).
        
    Returns:
        True para sí, False para no.
    """
    default_str = "S/n" if default else "s/N"
    while True:
        response = input(f"{prompt} ({default_str}): ").strip().lower()
        
        if not response:
            return default
        
        if response in ['s', 'si', 'sí', 'y', 'yes']:
            return True
        elif response in ['n', 'no']:
            return False
        else:
            print("Error: Por favor responde 's' para sí o 'n' para no")


def train_heuristic_ai():
    """Inicia el entrenamiento de la IA heurística con parámetros personalizables."""
    clear_screen()
    print("=" * 70)
    print(" " * 15 + "ENTRENAMIENTO DE IA HEURISTICA")
    print("=" * 70)
    print()
    print("Este módulo usa un Algoritmo Genético para encontrar los mejores")
    print("pesos para la función de evaluación heurística de la IA.")
    print()
    print("El algoritmo:")
    print("  1. Crea una población de individuos con pesos aleatorios")
    print("  2. Evalúa cada individuo jugando varios juegos")
    print("  3. Selecciona los mejores individuos")
    print("  4. Crea nuevos individuos combinando los mejores (crossover)")
    print("  5. Aplica mutaciones aleatorias")
    print("  6. Repite el proceso por varias generaciones")
    print()
    print("=" * 70)
    print()
    
    # Configuración de parámetros
    print("CONFIGURACION DE PARAMETROS")
    print("-" * 70)
    print()
    
    # Tamaño de población
    print("Tamaño de población:")
    print("  - Más individuos = Más diversidad pero más lento")
    print("  - Recomendado: 20-50 para entrenamientos rápidos")
    print("  - Recomendado: 50-100 para mejores resultados")
    population_size = get_int_input("Tamaño de población", min_val=2, max_val=200, default=30)
    print()
    
    # Número de generaciones
    print("Número de generaciones:")
    print("  - Más generaciones = Mejor optimización pero más tiempo")
    print("  - Recomendado: 10-20 para pruebas rápidas")
    print("  - Recomendado: 50-100 para mejores resultados")
    num_generations = get_int_input("Número de generaciones", min_val=1, max_val=1000, default=20)
    print()
    
    # Tasa de mutación
    print("Tasa de mutación (0.0 - 1.0):")
    print("  - Controla cuánto varían los pesos de padres a hijos")
    print("  - Más alta = Más exploración pero menos estabilidad")
    print("  - Recomendado: 0.1 - 0.2")
    mutation_rate = get_float_input("Tasa de mutación", min_val=0.0, max_val=1.0, default=0.15)
    print()
    
    # Juegos por individuo
    print("Juegos por individuo:")
    print("  - Cuántos juegos se juegan para evaluar cada individuo")
    print("  - Más juegos = Evaluación más precisa pero más lento")
    print("  - Recomendado: 3-5 para entrenamientos rápidos")
    print("  - Recomendado: 5-10 para mejores resultados")
    games_per_individual = get_int_input("Juegos por individuo", min_val=1, max_val=50, default=5)
    print()
    
    # Modo de visualización
    print("Modo de visualización:")
    print("  - Con visualización: Puedes ver a los individuos jugando en tiempo real")
    print("  - Sin visualización: Más rápido pero sin feedback visual")
    use_visualization = get_yes_no_input("¿Usar visualización?", default=True)
    print()
    
    # Modo paralelo (solo si hay visualización)
    use_parallel = False
    if use_visualization:
        print("Evaluación paralela:")
        print("  - Paralela: Todos los individuos juegan simultáneamente (muy rápido)")
        print("  - Secuencial: Los individuos juegan uno por uno (más lento)")
        print("  - Nota: La evaluación paralela muestra todos los juegos a la vez")
        use_parallel = get_yes_no_input("¿Usar evaluación paralela?", default=True)
        print()
    
    # Resumen de configuración
    print("=" * 70)
    print("RESUMEN DE CONFIGURACION")
    print("-" * 70)
    print(f"  Tamaño de población:    {population_size} individuos")
    print(f"  Número de generaciones: {num_generations}")
    print(f"  Tasa de mutación:       {mutation_rate}")
    print(f"  Juegos por individuo:   {games_per_individual}")
    print(f"  Visualización:          {'Sí' if use_visualization else 'No'}")
    if use_visualization:
        print(f"  Evaluación paralela:    {'Sí' if use_parallel else 'No'}")
    print("=" * 70)
    print()
    
    # Estimación de tiempo
    time_per_game = 2 if use_visualization else 0.5  # segundos aproximados
    if use_parallel and use_visualization:
        estimated_time = num_generations * games_per_individual * time_per_game
    else:
        estimated_time = num_generations * population_size * games_per_individual * time_per_game
    
    minutes = int(estimated_time // 60)
    seconds = int(estimated_time % 60)
    print(f"Tiempo estimado: ~{minutes} minutos y {seconds} segundos")
    print()
    
    # Confirmación
    if not get_yes_no_input("¿Iniciar entrenamiento?", default=True):
        print("\nEntrenamiento cancelado.")
        return
    
    print()
    print("=" * 70)
    print("INICIANDO ENTRENAMIENTO")
    print("=" * 70)
    print()
    
    # Crear e inicializar el algoritmo genético
    ga = GeneticAlgorithm(
        population_size=population_size,
        mutation_rate=mutation_rate
    )
    ga.initialize_population()
    
    try:
        if use_visualization:
            # Verificar si existe el visualizador de población
            try:
                from src.visualization.heuristic_population_viewer import (
                    HeuristicPopulationViewer
                )
                # Entrenamiento con visualización
                ga.train_with_visualization(
                    num_generations=num_generations,
                    num_games_per_individual=games_per_individual,
                    use_parallel=use_parallel
                )
            except ImportError:
                print("⚠ Advertencia: El visualizador de población no está disponible.")
                print("   Entrenando en modo sin visualización...")
                print()
                use_visualization = False
        
        if not use_visualization:
            # Entrenamiento sin visualización (más rápido)
            print("Entrenamiento en progreso...")
            print("(Esto puede tardar varios minutos dependiendo de los parámetros)")
            print()
            
            for gen in range(num_generations):
                print(f"Generación {gen + 1}/{num_generations}")
                print("-" * 70)
                
                # Evaluar individuos
                for i, individual in enumerate(ga.population):
                    fitness = ga.evaluate_fitness(
                        individual['weights'],
                        num_games=games_per_individual
                    )
                    individual['fitness'] = fitness
                    print(f"  Individuo {i+1}/{population_size}: Fitness = {fitness:.2f}")
                
                # Ordenar por fitness
                ga.population.sort(key=lambda x: x['fitness'], reverse=True)
                
                # Estadísticas
                best_fitness = ga.population[0]['fitness']
                avg_fitness = sum(ind['fitness'] for ind in ga.population) / len(ga.population)
                ga.best_fitness_history.append(best_fitness)
                ga.avg_fitness_history.append(avg_fitness)
                
                print()
                print(f"Mejor fitness: {best_fitness:.2f}")
                print(f"Fitness promedio: {avg_fitness:.2f}")
                print()
                
                # Evolucionar población para la siguiente generación
                if gen < num_generations - 1:
                    elite_size = population_size // 4
                    new_population = ga.population[:elite_size]
                    
                    while len(new_population) < population_size:
                        parent1 = ga.tournament_selection()
                        parent2 = ga.tournament_selection()
                        child_weights = ga.crossover(parent1, parent2)
                        child_weights = ga.mutate(child_weights)
                        
                        new_population.append({
                            'weights': child_weights,
                            'fitness': 0
                        })
                    
                    ga.population = new_population
                    ga.generation = gen + 1
            
            # Resultados finales
            best = ga.get_best_individual()
            print()
            print("=" * 70)
            print("ENTRENAMIENTO COMPLETADO")
            print("=" * 70)
            print()
            print(f"Mejor fitness alcanzado: {best['fitness']:.2f}")
            print()
            print("Mejores pesos encontrados:")
            for key, value in best['weights'].items():
                print(f"  {key}: {value:.6f}")
            print()
            
            # Guardar pesos
            try:
                with open('best_heuristic_weights.txt', 'w', encoding='utf-8') as f:
                    f.write("# Mejores pesos del algoritmo genético\n")
                    f.write(f"# Fitness: {best['fitness']:.2f}\n")
                    f.write(f"# Población: {population_size}, Generaciones: {num_generations}\n")
                    f.write(f"# Juegos por evaluación: {games_per_individual}\n\n")
                    for key, value in best['weights'].items():
                        f.write(f"{key}: {value:.6f}\n")
                print("✓ Pesos guardados en 'best_heuristic_weights.txt'")
            except Exception as e:
                print(f"✗ Error al guardar pesos: {e}")
            
            print()
    
    except KeyboardInterrupt:
        print("\n\nEntrenamiento interrumpido por el usuario.")
        print("Los mejores pesos hasta el momento:")
        best = ga.get_best_individual()
        for key, value in best['weights'].items():
            print(f"  {key}: {value:.6f}")
    
    except Exception as e:
        print(f"\n\nError durante el entrenamiento: {e}")
        import traceback
        traceback.print_exc()
    
    print()
    input("Presiona ENTER para volver al menú principal...")


if __name__ == "__main__":
    train_heuristic_ai()
