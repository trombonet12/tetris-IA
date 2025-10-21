"""Tetris AI - Sistema de IA con algoritmo heurístico."""
import numpy as np
from src.game.tetris_game import TetrisGame, BOARD_WIDTH, BOARD_HEIGHT


class TetrisAI:
    """IA heurística para Tetris."""
    
    def __init__(self, weights=None):
        """Inicializa la IA con pesos opcionales.
        
        Args:
            weights: Diccionario con los pesos de las características heurísticas.
                    Si es None, usa pesos por defecto.
        """
        if weights is None:
            self.weights = {
                'aggregate_height': -0.510066,
                'complete_lines': 0.760666,
                'holes': -0.35663,
                'bumpiness': -0.184483,
                'tetris_bonus': 3.0
            }
        else:
            self.weights = weights
    
    def get_board_features(self, board):
        """Extrae características del tablero para evaluación heurística.
        
        Args:
            board: Estado actual del tablero de juego.
            
        Returns:
            Diccionario con las características extraídas.
        """
        board_array = np.array(board)
        
        heights = []
        for x in range(BOARD_WIDTH):
            height = 0
            for y in range(BOARD_HEIGHT):
                if board_array[y][x] != 0:
                    height = BOARD_HEIGHT - y
                    break
            heights.append(height)
        
        aggregate_height = sum(heights)
        complete_lines = sum(1 for row in board_array if all(row))
        tetris_bonus = 1.0 if complete_lines == 4 else 0.0
        
        holes = 0
        for x in range(BOARD_WIDTH):
            block_found = False
            for y in range(BOARD_HEIGHT):
                if board_array[y][x] != 0:
                    block_found = True
                elif block_found:
                    holes += 1
        
        bumpiness = sum(abs(heights[i] - heights[i+1]) 
                       for i in range(len(heights)-1))
        
        return {
            'aggregate_height': aggregate_height,
            'complete_lines': complete_lines,
            'holes': holes,
            'bumpiness': bumpiness,
            'tetris_bonus': tetris_bonus,
            'heights': heights
        }
    
    def evaluate_board(self, board):
        """Evalúa un tablero usando los pesos heurísticos.
        
        Args:
            board: Estado del tablero a evaluar.
            
        Returns:
            Puntuación heurística del tablero.
        """
        features = self.get_board_features(board)
        
        score = 0
        for feature, value in features.items():
            if feature in self.weights:
                score += self.weights[feature] * value
        
        return score
    
    def get_all_possible_moves(self, game):
        """Obtiene todos los movimientos posibles para la pieza actual.
        
        Args:
            game: Instancia del juego actual.
            
        Returns:
            Lista de movimientos posibles con sus evaluaciones.
        """
        moves = []
        original_piece = game.current_piece
        
        for rotation in range(4):
            for x in range(-2, BOARD_WIDTH + 2):
                test_game = self.simulate_move(game, rotation, x)
                
                if test_game is not None:
                    score = self.evaluate_board(test_game.board)
                    moves.append({
                        'rotation': rotation,
                        'x': x,
                        'score': score,
                        'board': test_game.board
                    })
        
        return moves
    
    def simulate_move(self, game, rotations, target_x):
        """Simula un movimiento y retorna el estado resultante.
        
        Args:
            game: Instancia del juego actual.
            rotations: Número de rotaciones a aplicar.
            target_x: Posición horizontal objetivo.
            
        Returns:
            Instancia de TetrisGame con el movimiento simulado, o None si es inválido.
        """
        test_game = TetrisGame()
        test_game.board = [row[:] for row in game.board]
        test_game.current_piece = Piece(game.current_piece.shape_id)
        test_game.score = game.score
        test_game.lines_cleared = game.lines_cleared
        test_game.level = game.level
        
        for _ in range(rotations):
            test_game.rotate_piece()
        
        target_offset = target_x - test_game.current_piece.x
        if not test_game.is_valid_position(test_game.current_piece, 
                                          target_offset, 0):
            return None
        
        test_game.current_piece.x = target_x
        
        while test_game.is_valid_position(test_game.current_piece, 0, 1):
            test_game.current_piece.y += 1
        
        if not test_game.is_valid_position(test_game.current_piece):
            return None
        
        for y, row in enumerate(test_game.current_piece.shape):
            for x, cell in enumerate(row):
                if cell:
                    board_y = test_game.current_piece.y + y
                    board_x = test_game.current_piece.x + x
                    if 0 <= board_y < BOARD_HEIGHT and 0 <= board_x < BOARD_WIDTH:
                        test_game.board[board_y][board_x] = test_game.current_piece.color
        
        return test_game
    
    def get_best_move(self, game):
        """Obtiene el mejor movimiento posible según la evaluación heurística.
        
        Args:
            game: Instancia del juego actual.
            
        Returns:
            Diccionario con el mejor movimiento, o None si no hay movimientos válidos.
        """
        moves = self.get_all_possible_moves(game)
        
        if not moves:
            return None
        
        best_move = max(moves, key=lambda m: m['score'])
        return best_move


from src.game.tetris_game import Piece


class GeneticAlgorithm:
    """Algoritmo genético para optimizar pesos de la IA heurística."""
    
    def __init__(self, population_size=50, mutation_rate=0.1):
        """Inicializa el algoritmo genético.
        
        Args:
            population_size: Tamaño de la población.
            mutation_rate: Tasa de mutación.
        """
        self.population_size = population_size
        self.mutation_rate = mutation_rate
        self.population = []
        self.generation = 0
        self.best_fitness_history = []
        self.avg_fitness_history = []
    
    def create_random_individual(self):
        """Crea un individuo con pesos aleatorios.
        
        Returns:
            Diccionario con pesos aleatorios para las características.
        """
        return {
            'aggregate_height': np.random.uniform(-1, 1),
            'complete_lines': np.random.uniform(-1, 1),
            'holes': np.random.uniform(-1, 1),
            'bumpiness': np.random.uniform(-1, 1),
            'tetris_bonus': np.random.uniform(0, 5)
        }
    
    def initialize_population(self):
        """Inicializa la población con individuos aleatorios."""
        self.population = []
        for _ in range(self.population_size):
            individual = {
                'weights': self.create_random_individual(),
                'fitness': 0
            }
            self.population.append(individual)
    
    def evaluate_fitness(self, weights, num_games=5):
        """Evalúa el fitness de un individuo jugando varios juegos.
        
        Args:
            weights: Pesos del individuo a evaluar.
            num_games: Número de juegos a simular.
            
        Returns:
            Valor de fitness calculado.
        """
        total_score = 0
        total_lines = 0
        
        for _ in range(num_games):
            game = TetrisGame()
            ai = TetrisAI(weights)
            moves = 0
            max_moves = 1000
            
            while not game.game_over and moves < max_moves:
                best_move = ai.get_best_move(game)
                
                if best_move is None:
                    break
                
                for _ in range(best_move['rotation']):
                    game.rotate_piece()
                
                target_x = best_move['x']
                offset = target_x - game.current_piece.x
                game.current_piece.x = target_x
                
                if game.is_valid_position(game.current_piece):
                    game.hard_drop()
                else:
                    break
                
                moves += 1
            
            total_score += game.score
            total_lines += game.lines_cleared
        
        fitness = (total_score / num_games) + (total_lines / num_games) * 100
        return fitness
    
    def crossover(self, parent1, parent2):
        """Cruza dos padres para crear un hijo.
        
        Args:
            parent1: Primer padre.
            parent2: Segundo padre.
            
        Returns:
            Diccionario con pesos del hijo.
        """
        child = {}
        for key in parent1['weights'].keys():
            if np.random.random() < 0.5:
                child[key] = parent1['weights'][key]
            else:
                child[key] = parent2['weights'][key]
        return child
    
    def mutate(self, weights):
        """Aplica mutación a los pesos.
        
        Args:
            weights: Pesos a mutar.
            
        Returns:
            Pesos mutados.
        """
        mutated = weights.copy()
        for key in mutated.keys():
            if np.random.random() < self.mutation_rate:
                mutated[key] += np.random.uniform(-0.2, 0.2)
                mutated[key] = np.clip(mutated[key], -1, 1)
        return mutated
    
    def evolve_generation(self):
        """Evoluciona una generación completa del algoritmo."""
        print(f"Evaluando generación {self.generation}...")
        for i, individual in enumerate(self.population):
            individual['fitness'] = self.evaluate_fitness(individual['weights'])
            print(f"  Individuo {i+1}/{self.population_size}: "
                  f"Fitness = {individual['fitness']:.2f}")
        
        self.population.sort(key=lambda x: x['fitness'], reverse=True)
        
        best_fitness = self.population[0]['fitness']
        avg_fitness = (sum(ind['fitness'] for ind in self.population) / 
                      len(self.population))
        self.best_fitness_history.append(best_fitness)
        self.avg_fitness_history.append(avg_fitness)
        
        print(f"\nGeneración {self.generation}:")
        print(f"  Mejor fitness: {best_fitness:.2f}")
        print(f"  Fitness promedio: {avg_fitness:.2f}")
        print(f"  Mejores pesos: {self.population[0]['weights']}")
        
        elite_size = self.population_size // 4
        new_population = self.population[:elite_size]
        
        while len(new_population) < self.population_size:
            parent1 = self.tournament_selection()
            parent2 = self.tournament_selection()
            child_weights = self.crossover(parent1, parent2)
            child_weights = self.mutate(child_weights)
            
            new_population.append({
                'weights': child_weights,
                'fitness': 0
            })
        
        self.population = new_population
        self.generation += 1
    
    def tournament_selection(self, tournament_size=5):
        """Selecciona un individuo mediante torneo.
        
        Args:
            tournament_size: Tamaño del torneo.
            
        Returns:
            Individuo ganador del torneo.
        """
        tournament = np.random.choice(self.population, tournament_size, 
                                     replace=False)
        return max(tournament, key=lambda x: x['fitness'])
    
    def get_best_individual(self):
        """Obtiene el mejor individuo de la población actual.
        
        Returns:
            Mejor individuo según fitness.
        """
        return max(self.population, key=lambda x: x['fitness'])
    
    def evaluate_fitness_with_viewer(self, weights, num_games=5, viewer=None, 
                                    individual_id=0):
        """Evalúa el fitness con visualización en tiempo real.
        
        Args:
            weights: Pesos del individuo.
            num_games: Número de juegos para evaluar.
            viewer: Instancia del visualizador (opcional).
            individual_id: ID del individuo para la visualización.
            
        Returns:
            Valor de fitness calculado.
        """
        import time
        
        total_score = 0
        total_lines = 0
        
        for game_num in range(num_games):
            game = TetrisGame()
            ai = TetrisAI(weights)
            moves = 0
            max_moves = 1000
            
            while not game.game_over and moves < max_moves:
                best_move = ai.get_best_move(game)
                
                if best_move is None:
                    break
                
                # Ejecutar el movimiento
                for _ in range(best_move['rotation']):
                    game.rotate_piece()
                
                target_x = best_move['x']
                game.current_piece.x = target_x
                
                if game.is_valid_position(game.current_piece):
                    game.hard_drop()
                    
                    if viewer and game_num == 0:
                        fitness = game.score + game.lines_cleared * 100
                        viewer.update_individual(individual_id, game, fitness, 
                                               weights)
                        time.sleep(0.01)
                else:
                    break
                
                moves += 1
            
            total_score += game.score
            total_lines += game.lines_cleared
            
            if viewer and game_num == 0:
                fitness = ((total_score / (game_num + 1)) + 
                          (total_lines / (game_num + 1)) * 100)
                viewer.update_individual(individual_id, game, fitness, weights)
        
        fitness = (total_score / num_games) + (total_lines / num_games) * 100
        return fitness
    
    def train_with_visualization(self, num_generations=10, 
                                num_games_per_individual=5, use_parallel=True):
        """Entrena el algoritmo genético con visualización en tiempo real.
        
        Args:
            num_generations: Número de generaciones a entrenar.
            num_games_per_individual: Juegos para evaluar cada individuo.
            use_parallel: Si True, evalúa individuos en paralelo.
        """
        from src.visualization.heuristic_population_viewer import (
            HeuristicPopulationViewer
        )
        import time
        import threading
        
        print("=" * 70)
        print("ALGORITMO GENETICO CON VISUALIZACION EN PARALELO")
        print("=" * 70)
        print(f"\nConfiguración:")
        print(f"  - Población: {self.population_size} individuos")
        print(f"  - Generaciones: {num_generations}")
        print(f"  - Juegos por individuo: {num_games_per_individual}")
        parallel_mode = "Sí (1 hilo por individuo)" if use_parallel else "No (secuencial)"
        print(f"  - Evaluación paralela: {parallel_mode}")
        print()
        
        viewer = HeuristicPopulationViewer(
            population_size=self.population_size,
            grid_cols=None,
            fullscreen=False,
            fps=60
        )
        
        print("Iniciando visualizador...")
        print(f"Layout: {viewer.grid_cols} columnas x {viewer.grid_rows} filas")
        viewer.start()
        
        time.sleep(1)
        
        for gen in range(num_generations):
            print(f"\n{'='*70}")
            print(f"GENERACION {gen + 1}/{num_generations}")
            print(f"{'='*70}")
            
            viewer.reset_for_generation(gen + 1)
            
            if use_parallel:
                print(f"Iniciando {self.population_size} hilos "
                      f"(1 por individuo)...")
                
                threads = []
                results = {}
                results_lock = threading.Lock()
                completed_count = [0]
                
                def evaluate_individual_thread(idx, individual):
                    """Evalúa un individuo en un hilo separado."""
                    try:
                        fitness = self.evaluate_fitness_with_viewer(
                            individual['weights'],
                            num_games_per_individual,
                            viewer,
                            idx
                        )
                        
                        with results_lock:
                            results[idx] = fitness
                            completed_count[0] += 1
                            completed = completed_count[0]
                            print(f"  Individuo {idx + 1}/{self.population_size} "
                                  f"completado: Fitness = {fitness:.2f} "
                                  f"({completed}/{self.population_size})")
                    except Exception as e:
                        print(f"  Error en individuo {idx + 1}: {e}")
                        with results_lock:
                            results[idx] = 0
                            completed_count[0] += 1
                
                for i, individual in enumerate(self.population):
                    thread = threading.Thread(
                        target=evaluate_individual_thread,
                        args=(i, individual),
                        daemon=True
                    )
                    threads.append(thread)
                    thread.start()
                
                print(f"  Esperando a que completen los {len(threads)} hilos...")
                
                for thread in threads:
                    thread.join()
                
                for idx, fitness in results.items():
                    self.population[idx]['fitness'] = fitness
                
                print("  Todos los individuos completados")
                
            else:
                print("Evaluación secuencial (1 individuo a la vez)...")
                for i, individual in enumerate(self.population):
                    fitness = self.evaluate_fitness_with_viewer(
                        individual['weights'],
                        num_games_per_individual,
                        viewer,
                        i
                    )
                    individual['fitness'] = fitness
                    print(f"  Individuo {i+1}/{self.population_size}: "
                          f"Fitness = {fitness:.2f}")
            
            self.population.sort(key=lambda x: x['fitness'], reverse=True)
            
            best_fitness = self.population[0]['fitness']
            avg_fitness = (sum(ind['fitness'] for ind in self.population) / 
                          len(self.population))
            self.best_fitness_history.append(best_fitness)
            self.avg_fitness_history.append(avg_fitness)
            
            viewer.update_generation_info(gen + 1, best_fitness, avg_fitness)
            
            print(f"\nResultados de Generación {gen + 1}:")
            print(f"  Mejor fitness: {best_fitness:.2f}")
            print(f"  Fitness promedio: {avg_fitness:.2f}")
            print(f"  Mejores pesos:")
            for key, value in self.population[0]['weights'].items():
                print(f"     {key}: {value:.6f}")
            
            if gen < num_generations - 1:
                print(f"\nEvolucionando población para generación {gen + 2}...")
                
                elite_size = self.population_size // 4
                new_population = self.population[:elite_size]
                
                while len(new_population) < self.population_size:
                    parent1 = self.tournament_selection()
                    parent2 = self.tournament_selection()
                    child_weights = self.crossover(parent1, parent2)
                    child_weights = self.mutate(child_weights)
                    
                    new_population.append({
                        'weights': child_weights,
                        'fitness': 0
                    })
                
                self.population = new_population
                self.generation = gen + 1
                
                print("  Nueva población creada")
                time.sleep(2)
        
        best = self.get_best_individual()
        print("\n" + "=" * 70)
        print("ENTRENAMIENTO COMPLETADO")
        print("=" * 70)
        print(f"\nMejor fitness alcanzado: {best['fitness']:.2f}")
        print(f"\nMejores pesos encontrados:")
        for key, value in best['weights'].items():
            print(f"  {key}: {value:.6f}")
        
        print("\nGuardando mejores pesos...")
        try:
            with open('best_heuristic_weights.txt', 'w') as f:
                f.write("# Mejores pesos del algoritmo genético\n")
                f.write(f"# Fitness: {best['fitness']:.2f}\n")
                f.write(f"# Población: {self.population_size}, "
                       f"Generaciones: {num_generations}\n\n")
                for key, value in best['weights'].items():
                    f.write(f"{key}: {value:.6f}\n")
            print("Pesos guardados en 'best_heuristic_weights.txt'")
        except Exception as e:
            print(f"Error al guardar pesos: {e}")
        
        print("\nEl visualizador seguirá abierto. Presiona ESC para cerrar.")
        
        while viewer.running:
            time.sleep(0.1)
        
        viewer.stop()
        print("\nEntrenamiento finalizado.")


if __name__ == "__main__":
    print("Iniciando algoritmo genético para Tetris AI...")
    print("=" * 60)
    
    ga = GeneticAlgorithm(population_size=20, mutation_rate=0.15)
    ga.initialize_population()
    
    num_generations = 10
    
    for gen in range(num_generations):
        ga.evolve_generation()
        print("\n" + "=" * 60 + "\n")
    
    best = ga.get_best_individual()
    print("\n" + "=" * 60)
    print("ENTRENAMIENTO COMPLETADO")
    print("=" * 60)
    print(f"Mejor fitness alcanzado: {best['fitness']:.2f}")
    print("Mejores pesos encontrados:")
    for key, value in best['weights'].items():
        print(f"  {key}: {value:.6f}")

