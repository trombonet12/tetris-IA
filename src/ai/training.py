"""Training Module - Módulo de entrenamiento para la IA heurística."""
import os
import time
import json
import pygame
import threading
from src.game.tetris_game import TetrisGame
from src.ai.tetris_ai import TetrisAI, GeneticAlgorithm


def evaluate_individual_parallel(weights, num_games=1, visualizer=None, 
                                 individual_num=0, game_instance=None, 
                                 result_dict=None, lock=None):
    """Evalúa un individuo jugando Tetris (versión para threads).
    
    Args:
        weights: Diccionario de pesos para la IA.
        num_games: Número de partidas a jugar.
        visualizer: Visualizador opcional.
        individual_num: Número del individuo.
        game_instance: Instancia del juego (para visualización).
        result_dict: Diccionario compartido para resultados.
        lock: Lock para sincronización.
    
    Returns:
        Puntuación de fitness.
    """
    try:
        total_score = 0
        total_lines = 0
        total_tetris = 0
        
        for game_num in range(num_games):
            # Usar siempre la misma instancia del juego si se proporciona (para visualización)
            if game_instance:
                game = game_instance
                game.reset()
            else:
                game = TetrisGame()
            
            ai = TetrisAI(weights)
            moves = 0
            max_moves = 200  # Límite muy reducido para visualización fluida
            tetris_count = 0
            last_lines = 0
            
            while not game.game_over and moves < max_moves:
                move = ai.get_best_move(game)
                
                if move is None:
                    break
                
                # Aplicar rotación
                for _ in range(move['rotation']):
                    game.rotate_piece()
                
                # Mover horizontalmente
                target_x = move['x']
                current_x = game.current_piece.x
                
                while current_x < target_x:
                    if not game.move(1, 0):
                        break
                    current_x = game.current_piece.x
                
                while current_x > target_x:
                    if not game.move(-1, 0):
                        break
                    current_x = game.current_piece.x
                
                # Hard drop
                game.hard_drop()
                
                # Detectar Tetris (4 líneas de una vez)
                lines_cleared_now = game.lines_cleared - last_lines
                if lines_cleared_now == 4:
                    tetris_count += 1
                last_lines = game.lines_cleared
                
                moves += 1
                
                # Actualizar datos sin dibujar
                if visualizer and lock is not None:
                    current_fitness = game.score + game.lines_cleared * 100 + tetris_count * 500
                    with lock:
                        visualizer.update_individual(individual_num, current_fitness, False)
            
            # Acumular estadísticas de esta partida
            total_score += game.score
            total_lines += game.lines_cleared
            total_tetris += tetris_count
        
        # Calcular fitness promedio con bonus por Tetris
        avg_score = total_score / num_games
        avg_lines = total_lines / num_games
        fitness = avg_score + avg_lines * 100 + total_tetris * 500
        
        # Actualizar visualizador con resultado final
        if visualizer and lock is not None:
            with lock:
                visualizer.update_individual(individual_num, fitness, True)
                visualizer.update_tetris_count(individual_num, total_tetris)
        elif visualizer:
            visualizer.update_individual(individual_num, fitness, True)
            visualizer.update_tetris_count(individual_num, total_tetris)
        
        # Guardar resultado si se proporciona diccionario
        if result_dict is not None and lock is not None:
            with lock:
                result_dict[individual_num] = {
                    'fitness': fitness,
                    'tetris_count': total_tetris,
                    'lines': total_lines
                }
        
        return fitness
    
    except Exception as e:
        print(f"  Error durante evaluación del individuo {individual_num}: {e}")
        if result_dict is not None and lock is not None:
            with lock:
                result_dict[individual_num] = {
                    'fitness': 0,
                    'tetris_count': 0,
                    'lines': 0
                }
        return 0


def evaluate_individual(weights, num_games=1, visualizer=None, individual_num=0, game_instance=None):
    """Evalúa un individuo jugando Tetris (versión simple sin threads).
    
    Args:
        weights: Diccionario de pesos para la IA.
        num_games: Número de partidas a jugar.
        visualizer: Visualizador opcional.
        individual_num: Número del individuo.
        game_instance: Instancia del juego (para visualización).
    
    Returns:
        Puntuación de fitness.
    """
    return evaluate_individual_parallel(weights, num_games, visualizer, 
                                       individual_num, game_instance, None, None)


def train_heuristic_ai(population_size=20, generations=10, num_games=5, 
                       mutation_rate=0.1, use_visualizer=True, use_parallel=True):
    """Entrena la IA heurística usando algoritmo genético.
    
    Args:
        population_size: Tamaño de la población.
        generations: Número de generaciones.
        num_games: Número de partidas por individuo para evaluación.
        mutation_rate: Tasa de mutación.
        use_visualizer: Si se debe usar el visualizador.
        use_parallel: Si se debe evaluar en paralelo.
    
    Returns:
        Mejores pesos encontrados.
    """
    visualizer = None
    
    if use_visualizer:
        try:
            # Asegurar que pygame esté inicializado ANTES de crear el visualizador
            if not pygame.get_init():
                print("Inicializando pygame...")
                pygame.init()
                # Dar tiempo para que pygame se inicialice completamente
                pygame.time.wait(100)
            
            print("Creando visualizador...")
            from src.visualization.training_visualizer import TrainingVisualizer
            visualizer = TrainingVisualizer(population_size)
            print(f"Visualizador creado: {visualizer.screen_width}x{visualizer.screen_height}")
            
            # CRÍTICO: Dibujar ventana inicial INMEDIATAMENTE con múltiples actualizaciones
            for _ in range(3):  # Repetir para asegurar que se dibuje
                visualizer.screen.fill((40, 40, 60))
                font = pygame.font.Font(None, 48)
                text = font.render("Inicializando entrenamiento...", True, (255, 255, 255))
                text_rect = text.get_rect(center=(visualizer.screen_width // 2, visualizer.screen_height // 2))
                visualizer.screen.blit(text, text_rect)
                pygame.display.flip()
                pygame.event.pump()
                pygame.time.wait(50)
            
            # Procesar eventos iniciales
            if not visualizer.handle_events():
                print("Usuario cerró la ventana durante la inicialización")
                return None
            
            print("Ventana visible y responsiva.")
            pygame.time.wait(500)  # Pausa para que el usuario vea la ventana
                
        except Exception as e:
            print(f"No se pudo inicializar el visualizador: {e}")
            import traceback
            traceback.print_exc()
            print("Continuando sin visualización...")
            use_visualizer = False
            visualizer = None
    
    # Inicializar algoritmo genético
    ga = GeneticAlgorithm(population_size, mutation_rate)
    ga.init_simple_population()  # Inicializar población con estructura simple
    
    best_overall_fitness = float('-inf')
    best_overall_weights = None
    best_overall_tetris = 0
    
    print(f"\nIniciando entrenamiento:")
    print(f"  Población: {population_size}")
    print(f"  Generaciones: {generations}")
    print(f"  Partidas por individuo: {num_games}")
    print(f"  Tasa de mutación: {mutation_rate}")
    print(f"  Visualización: {'Sí' if use_visualizer else 'No'}")
    print(f"  Evaluación paralela: {'Sí' if use_parallel else 'No'}")
    print("="*60)
    
    for generation in range(generations):
        print(f"\n--- Generación {generation + 1}/{generations} ---")
        
        if visualizer:
            visualizer.initialize_population(ga.population)
            # BLOQUEANTE: Dibujar inmediatamente varias veces
            for _ in range(3):
                pygame.event.pump()
                if not visualizer.handle_events():
                    print("Usuario cerró la ventana")
                    visualizer.close()
                    return best_overall_weights
                visualizer.draw()
                pygame.time.wait(100)
            time.sleep(0.3)  # Pausa para ver la inicialización
        
        fitness_scores = []
        tetris_counts = []
        
        if use_parallel and visualizer:
            # Evaluación paralela con threads
            print(f"  Evaluando {population_size} individuos en paralelo...")
            threads = []
            results = {}
            lock = threading.Lock()
            
            # CRÍTICO: Pasar el lock al visualizador para evitar race conditions
            visualizer.lock = lock
            
            # Iniciar todos los threads de evaluación
            for i, individual in enumerate(ga.population):
                thread = threading.Thread(
                    target=evaluate_individual_parallel,
                    args=(individual, num_games, visualizer, i, 
                          visualizer.games[i], results, lock),
                    daemon=True
                )
                threads.append(thread)
                thread.start()
            
            print(f"  {len(threads)} threads iniciados.")
            print(f"  La visualización es PRIORITARIA - bloqueará hasta completar.")
            
            # BUCLE BLOQUEANTE: La visualización tiene MÁXIMA PRIORIDAD
            last_progress = -1
            update_counter = 0
            
            while True:
                # 1. PRIMERO: Procesar eventos de pygame (CRÍTICO)
                pygame.event.pump()
                if not visualizer.handle_events():
                    print("\nEntrenamiento cancelado por el usuario.")
                    for thread in threads:
                        thread.join(timeout=0.1)
                    visualizer.close()
                    return best_overall_weights
                
                # 2. SEGUNDO: Dibujar regularmente (no cada frame para mejor performance)
                update_counter += 1
                if update_counter >= 3:  # Actualizar cada 3 iteraciones
                    visualizer.draw()
                    update_counter = 0
                
                # 3. TERCERO: Verificar progreso
                threads_alive = sum(1 for t in threads if t.is_alive())
                if threads_alive == 0:
                    break
                
                # 4. Reportar progreso
                completed = population_size - threads_alive
                if completed != last_progress:
                    print(f"    Progreso: {completed}/{population_size} completados")
                    last_progress = completed
                    # Dibujar inmediatamente cuando hay progreso
                    visualizer.draw()
                    update_counter = 0
                
                # 5. Sleep corto para dar tiempo a los threads
                time.sleep(0.02)  # 20ms = ~50 FPS máximo
            
            # Esperar a que todos terminen completamente
            for thread in threads:
                thread.join(timeout=5)
            
            print(f"  Todos los individuos completados. Recopilando resultados...")
            
            # Recopilar resultados
            for i in range(population_size):
                if i in results:
                    fitness_scores.append(results[i]['fitness'])
                    tetris_counts.append(results[i]['tetris_count'])
                    print(f"  Individuo {i+1}: Fitness={results[i]['fitness']:.0f}, Tetris={results[i]['tetris_count']}, Líneas={results[i]['lines']}")
                else:
                    fitness_scores.append(0)
                    tetris_counts.append(0)
                    print(f"  Individuo {i+1}: Error - Fitness=0")
            
            # Actualizar visualización final varias veces para asegurar que se vea
            for _ in range(3):
                pygame.event.pump()
                visualizer.handle_events()
                visualizer.draw()
                pygame.time.wait(100)
                    
        else:
            # Evaluación secuencial
            print(f"  Evaluando {population_size} individuos secuencialmente...")
            
            # NO usar lock en modo secuencial (no hay threads concurrentes)
            if visualizer:
                visualizer.lock = None
            
            for i, individual in enumerate(ga.population):
                try:
                    if visualizer:
                        # BLOQUEANTE: Procesar eventos y dibujar ANTES
                        pygame.event.pump()
                        if not visualizer.handle_events():
                            visualizer.close()
                            print("\nEntrenamiento cancelado por el usuario.")
                            return best_overall_weights
                        visualizer.draw()
                        
                        # Evaluar
                        fitness = evaluate_individual(
                            individual, 
                            num_games, 
                            visualizer, 
                            i,
                            visualizer.games[i]
                        )
                        
                        # BLOQUEANTE: Dibujar DESPUÉS
                        visualizer.draw()
                    else:
                        fitness = evaluate_individual(individual, num_games)
                    
                    if fitness == -1:  # Usuario canceló
                        if visualizer:
                            visualizer.close()
                        print("\nEntrenamiento cancelado por el usuario.")
                        return best_overall_weights
                    
                    fitness_scores.append(fitness)
                    # Obtener tetris count del visualizador
                    tetris = visualizer.tetris_count[i] if visualizer and i < len(visualizer.tetris_count) else 0
                    tetris_counts.append(tetris)
                    
                    print(f"  Individuo {i + 1}/{population_size}: Fitness = {fitness:.0f}, Tetris = {tetris}")
                
                except Exception as e:
                    print(f"  Error evaluando individuo {i + 1}: {e}")
                    import traceback
                    traceback.print_exc()
                    fitness_scores.append(0)
                    tetris_counts.append(0)
        
        # Verificar que haya al menos un individuo evaluado
        if len(fitness_scores) == 0:
            print("\nError: No se pudo evaluar ningún individuo en esta generación.")
            if visualizer:
                visualizer.close()
            return best_overall_weights
        
        # Estadísticas de la generación
        avg_fitness = sum(fitness_scores) / len(fitness_scores)
        max_fitness = max(fitness_scores)
        best_idx = fitness_scores.index(max_fitness)
        total_tetris = sum(tetris_counts)
        
        print(f"\nEstadísticas de Generación {generation + 1}:")
        print(f"  Fitness promedio: {avg_fitness:.2f}")
        print(f"  Mejor fitness: {max_fitness:.2f}")
        print(f"  Mejor individuo: #{best_idx + 1}")
        print(f"  Total Tetris (4 líneas): {total_tetris}")
        
        # Actualizar mejor resultado global
        if max_fitness > best_overall_fitness:
            best_overall_fitness = max_fitness
            best_overall_weights = ga.population[best_idx].copy()
            best_overall_tetris = tetris_counts[best_idx]
            print(f"  ¡NUEVO RÉCORD! Fitness: {best_overall_fitness:.2f}")
            print(f"  Tetris realizados: {best_overall_tetris}")
            print(f"  Pesos: {best_overall_weights}")
        
        # Actualizar visualizador
        if visualizer:
            visualizer.update_generation(generation + 1, best_overall_fitness, 
                                        avg_fitness, best_overall_weights)
            visualizer.draw()
            pygame.time.wait(2000)  # Pausa de 2 segundos entre generaciones
        
        # Evolucionar población con bonus por Tetris
        if generation < generations - 1:
            # Dar bonus a individuos con más Tetris
            adjusted_scores = []
            for i, fitness in enumerate(fitness_scores):
                tetris_bonus = tetris_counts[i] * 200  # Bonus adicional
                adjusted_scores.append(fitness + tetris_bonus)
            
            ga.evolve(adjusted_scores)
            print("  Población evolucionada (con bonus por Tetris).")
    
    print("\n" + "="*60)
    print("ENTRENAMIENTO COMPLETADO")
    print("="*60)
    print(f"Mejor fitness obtenido: {best_overall_fitness:.2f}")
    print(f"Tetris realizados: {best_overall_tetris}")
    print(f"Mejores pesos: {best_overall_weights}")
    
    # Guardar mejores pesos
    save_best_weights(best_overall_weights, best_overall_fitness, best_overall_tetris)
    
    if visualizer:
        print("\nPresiona ESC o cierra la ventana para terminar...")
        running = True
        while running:
            running = visualizer.handle_events()
            visualizer.clock.tick(30)
        visualizer.close()
    
    return best_overall_weights


def save_best_weights(weights, fitness, tetris_count=0, filename='best_heuristic_weights.txt'):
    """Guarda los mejores pesos en un archivo.
    
    Args:
        weights: Diccionario de pesos.
        fitness: Fitness alcanzado.
        tetris_count: Número de Tetris realizados.
        filename: Nombre del archivo.
    """
    try:
        with open(filename, 'w') as f:
            f.write(f"# Mejores pesos de IA Heurística\n")
            f.write(f"# Fitness: {fitness:.2f}\n")
            f.write(f"# Tetris (4 líneas): {tetris_count}\n")
            f.write(f"# Fecha: {time.strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            f.write(json.dumps(weights, indent=4))
        
        print(f"\nPesos guardados en: {filename}")
    except Exception as e:
        print(f"Error al guardar pesos: {e}")


def load_best_weights(filename='best_heuristic_weights.txt'):
    """Carga los mejores pesos desde un archivo.
    
    Args:
        filename: Nombre del archivo.
    
    Returns:
        Diccionario de pesos o None si no existe.
    """
    try:
        if os.path.exists(filename):
            with open(filename, 'r') as f:
                lines = f.readlines()
                # Saltar comentarios
                json_start = next(i for i, line in enumerate(lines) 
                                 if not line.startswith('#'))
                json_str = ''.join(lines[json_start:])
                weights = json.loads(json_str)
                return weights
        return None
    except Exception as e:
        print(f"Error al cargar pesos: {e}")
        return None
