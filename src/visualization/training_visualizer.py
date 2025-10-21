"""Training Visualizer - Visualizador del proceso de entrenamiento."""
import pygame
import sys
import math
from src.game.tetris_game import TetrisGame
from src.ai.tetris_ai import TetrisAI

# Colores
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
GRAY = (100, 100, 100)
DARK_GRAY = (50, 50, 50)
GREEN = (0, 255, 0)
RED = (255, 0, 0)
BLUE = (0, 100, 255)
YELLOW = (255, 255, 0)
CYAN = (0, 255, 255)
ORANGE = (255, 165, 0)
PURPLE = (160, 32, 240)
GOLD = (255, 215, 0)

# Colores de las piezas (mapeo por número de color)
PIECE_COLORS = [
    BLACK,      # 0 - vacío
    CYAN,       # 1 - I
    YELLOW,     # 2 - O
    PURPLE,     # 3 - T
    GREEN,      # 4 - S
    RED,        # 5 - Z
    BLUE,       # 6 - J
    ORANGE      # 7 - L
]


class TrainingVisualizer:
    """Visualizador para el proceso de entrenamiento genético."""
    
    def __init__(self, population_size=20):
        """Inicializa el visualizador.
        
        Args:
            population_size: Tamaño de la población.
        """
        # Asegurar que pygame esté inicializado
        if not pygame.get_init():
            pygame.init()
        
        # Configuración de pantalla adaptable y redimensionable
        info = pygame.display.Info()
        self.screen_width = min(1400, info.current_w - 100)
        self.screen_height = min(800, info.current_h - 100)
        
        # Crear ventana redimensionable
        print(f"Creando ventana de {self.screen_width}x{self.screen_height}...")
        self.screen = pygame.display.set_mode(
            (self.screen_width, self.screen_height),
            pygame.RESIZABLE  # Hacer la ventana redimensionable
        )
        pygame.display.set_caption("Tetris AI - Entrenamiento")
        
        # Forzar actualización inicial de la ventana
        self.screen.fill((40, 40, 60))
        pygame.display.flip()
        pygame.event.pump()
        
        # Fuentes
        self.font = pygame.font.Font(None, 28)
        self.small_font = pygame.font.Font(None, 20)
        self.tiny_font = pygame.font.Font(None, 16)
        
        # Configuración de visualización
        self.population_size = population_size
        
        # Inicializar scroll ANTES de calculate_layout
        self.scroll_offset = 0
        self.max_scroll = 0
        
        # Cálculo dinámico de disposición en cuadrícula (calcula block_size también)
        self.calculate_layout()
        
        self.clock = pygame.time.Clock()
        
        # Estado del entrenamiento
        self.current_generation = 0
        self.best_fitness = 0
        self.avg_fitness = 0
        self.best_weights = None
        self.generation_stats = []
        
        # Visualización de tableros
        self.games = []
        self.ais = []
        self.fitness_scores = []
        self.tetris_count = []  # Contador de Tetris (4 líneas)
        self.lines_cleared = []
        self.individual_complete = []
        
        # Flag para control de cierre
        self.running = True
        
        # Contador de frames para debug
        self.frame_count = 0
        
        # Lock para sincronización de threads (evita condiciones de carrera)
        self.lock = None  # Se establecerá desde training.py si se usa evaluación paralela
        
        print("Visualizador inicializado completamente.")
    
    def calculate_layout(self):
        """Calcula el layout dinámico basado en el tamaño de población y pantalla."""
        header_height = 70
        # Usar TODO el espacio disponible
        available_width = self.screen_width - 20  # Márgenes mínimos
        available_height = self.screen_height - header_height - 20
        
        # Información compacta del tablero
        info_space = 52
        margin_between_boards = 3  # Espacio mínimo entre tableros
        
        # Calcular la mejor distribución probando diferentes configuraciones
        best_config = None
        best_block_size = 0
        
        # Probar diferentes números de columnas
        for cols in range(1, min(self.population_size + 1, 25)):
            rows = math.ceil(self.population_size / cols)
            
            # Calcular el tamaño de bloque que se puede lograr con esta configuración
            max_board_width = (available_width - margin_between_boards * (cols + 1)) // cols
            max_board_height = (available_height - margin_between_boards * (rows + 1)) // rows - info_space
            
            # El tablero de Tetris es 10 bloques de ancho y 20 de alto
            block_size_from_width = max_board_width // 10
            block_size_from_height = max_board_height // 20
            
            block_size = max(5, min(block_size_from_width, block_size_from_height))
            
            # Buscar la configuración que maximice el tamaño de bloque
            if block_size > best_block_size:
                best_block_size = block_size
                best_config = (cols, rows)
        
        # Usar la mejor configuración encontrada
        self.boards_per_row, self.boards_per_col = best_config
        self.block_size = best_block_size
        
        self.board_width = 10 * self.block_size
        self.board_height = 20 * self.block_size
        
        # Calcular espaciado exacto para centrar
        total_boards_width = self.boards_per_row * self.board_width
        total_boards_height = self.boards_per_col * (self.board_height + info_space)
        
        # Distribuir el espacio sobrante uniformemente
        extra_width = available_width - total_boards_width
        extra_height = available_height - total_boards_height
        
        # Espaciado horizontal y vertical mínimo pero uniforme
        self.board_spacing_x = self.board_width + max(margin_between_boards, extra_width // max(1, self.boards_per_row + 1))
        self.board_spacing_y = self.board_height + info_space + max(margin_between_boards, extra_height // max(1, self.boards_per_col + 1))
        
        # Centrar la cuadrícula completa
        total_grid_width = self.boards_per_row * self.board_spacing_x - (self.board_spacing_x - self.board_width)
        total_grid_height = self.boards_per_col * self.board_spacing_y - (self.board_spacing_y - self.board_height - info_space)
        
        self.board_start_x = (self.screen_width - total_grid_width) // 2
        self.board_start_y = header_height + 10
        
        # Calcular scroll máximo
        self.max_scroll = max(0, total_grid_height - available_height)
        
        # Ajustar scroll si cambió el layout
        self.scroll_offset = min(self.scroll_offset, self.max_scroll)
        
        print(f"Layout optimizado: {self.boards_per_row}x{self.boards_per_col}, block_size={self.block_size}, spacing=({self.board_spacing_x},{self.board_spacing_y})")
        
    def draw_mini_board(self, game, x, y, individual_num, is_best=False):
        """Dibuja un tablero pequeño de forma segura para threads.
        
        Args:
            game: Instancia del juego.
            x, y: Posición en pantalla.
            individual_num: Número del individuo.
            is_best: Si es el mejor individuo actual.
        """
        # Capturar estado del juego de forma segura
        if self.lock:
            self.lock.acquire()
        
        try:
            # Hacer copias locales de los datos que necesitamos para evitar race conditions
            game_over = game.game_over
            board_copy = [row[:] for row in game.board]  # Copia profunda del tablero
            
            # Copiar datos de la pieza actual si existe
            current_piece_data = None
            if game.current_piece and not game_over:
                try:
                    current_piece_data = {
                        'shape': [row[:] for row in game.current_piece.shape],
                        'color': game.current_piece.color,
                        'x': game.current_piece.x,
                        'y': game.current_piece.y
                    }
                except:
                    # Si hay error al copiar la pieza, simplemente no la dibujamos
                    current_piece_data = None
        finally:
            if self.lock:
                self.lock.release()
        
        # Ahora dibujamos con las copias locales (sin lock, no bloquea threads)
        # Marco (dorado para el mejor)
        border_color = GOLD if is_best else (GREEN if not game_over else GRAY)
        border_width = 3 if is_best else 2
        pygame.draw.rect(self.screen, border_color, 
                        (x - 2, y - 2, self.board_width + 4, self.board_height + 4), 
                        border_width)
        
        # Fondo del tablero
        pygame.draw.rect(self.screen, BLACK, 
                        (x, y, self.board_width, self.board_height))
        
        # Dibujar bloques del tablero con colores - OPTIMIZADO
        # Solo dibujar celdas ocupadas
        for row in range(20):
            for col in range(10):
                cell_value = board_copy[row][col]
                if cell_value:
                    color = PIECE_COLORS[cell_value] if cell_value < len(PIECE_COLORS) else WHITE
                    rect = pygame.Rect(x + col * self.block_size,
                                      y + row * self.block_size,
                                      self.block_size - 1,
                                      self.block_size - 1)
                    pygame.draw.rect(self.screen, color, rect)
        
        # Dibujar pieza actual con colores - OPTIMIZADO
        if current_piece_data:
            shape = current_piece_data['shape']
            color = PIECE_COLORS[current_piece_data['color']] if current_piece_data['color'] < len(PIECE_COLORS) else WHITE
            
            for row in range(len(shape)):
                for col in range(len(shape[0])):
                    if shape[row][col]:
                        screen_x = x + (current_piece_data['x'] + col) * self.block_size
                        screen_y = y + (current_piece_data['y'] + row) * self.block_size
                        
                        if 0 <= screen_y < y + self.board_height:
                            rect = pygame.Rect(screen_x, screen_y,
                                             self.block_size - 1,
                                             self.block_size - 1)
                            pygame.draw.rect(self.screen, color, rect)
        
        # Información del individuo (compacta) - usar lock para acceso seguro
        info_y = y + self.board_height + 3
        
        # Número de individuo
        num_text = self.tiny_font.render(f"#{individual_num + 1}", True, GOLD if is_best else WHITE)
        self.screen.blit(num_text, (x, info_y))
        
        # Puntuación y estado en la misma línea
        if individual_num < len(self.fitness_scores):
            score = self.fitness_scores[individual_num]
            if game_over:  # Ya capturado de forma segura arriba
                status = "END"
                color = RED
            elif individual_num < len(self.individual_complete) and self.individual_complete[individual_num]:
                status = "OK"
                color = GREEN
            else:
                status = "..."
                color = YELLOW
            
            score_text = self.tiny_font.render(f"F:{int(score)}", True, color)
            self.screen.blit(score_text, (x, info_y + 12))
        
        # Líneas y Tetris - acceder de forma segura
        if self.lock:
            self.lock.acquire()
        try:
            lines_cleared = game.lines_cleared if hasattr(game, 'lines_cleared') else 0
        finally:
            if self.lock:
                self.lock.release()
        
        tetris_count = self.tetris_count[individual_num] if individual_num < len(self.tetris_count) else 0
        
        lines_text = self.tiny_font.render(f"L:{lines_cleared}", True, CYAN)
        self.screen.blit(lines_text, (x, info_y + 24))
        
        # Mostrar Tetris count en dorado si es > 0
        if tetris_count > 0:
            tetris_text = self.tiny_font.render(f"T4:{tetris_count}", True, GOLD)
            self.screen.blit(tetris_text, (x, info_y + 36))
        else:
            tetris_text = self.tiny_font.render(f"T4:0", True, GRAY)
            self.screen.blit(tetris_text, (x, info_y + 36))
    
    def draw_header(self):
        """Dibuja el encabezado con información del entrenamiento."""
        # Fondo del encabezado visible
        pygame.draw.rect(self.screen, (40, 40, 60), (0, 0, self.screen_width, 60))
        
        # Título
        title_text = self.font.render("ENTRENAMIENTO TETRIS AI", True, WHITE)
        self.screen.blit(title_text, (10, 8))
        
        # Información de generación en una línea compacta
        info_x = 10
        info_y = 35
        
        gen_text = self.small_font.render(
            f"Gen: {self.current_generation}", True, CYAN)
        self.screen.blit(gen_text, (info_x, info_y))
        info_x += 100
        
        pop_text = self.small_font.render(
            f"Pop: {self.population_size}", True, WHITE)
        self.screen.blit(pop_text, (info_x, info_y))
        info_x += 120
        
        # Mejor fitness
        best_text = self.small_font.render(
            f"Mejor: {int(self.best_fitness)}", True, GOLD)
        self.screen.blit(best_text, (info_x, info_y))
        info_x += 120
        
        # Promedio
        avg_text = self.small_font.render(
            f"Promedio: {int(self.avg_fitness)}", True, GREEN)
        self.screen.blit(avg_text, (info_x, info_y))
        info_x += 150
        
        # Contador de Tetris totales
        total_tetris = sum(self.tetris_count) if self.tetris_count else 0
        tetris_text = self.small_font.render(
            f"Tetris: {total_tetris}", True, GOLD)
        self.screen.blit(tetris_text, (info_x, info_y))
        
        # Controles
        controls_x = self.screen_width - 300
        controls_text = self.small_font.render(
            "ESC: Salir", True, RED)
        self.screen.blit(controls_text, (controls_x, info_y))
    
    def initialize_population(self, population):
        """Inicializa la población para visualización.
        
        Args:
            population: Lista de individuos (diccionarios de pesos).
        """
        self.games = []
        self.ais = []
        self.fitness_scores = [0.0] * len(population)
        self.tetris_count = [0] * len(population)
        self.lines_cleared = [0] * len(population)
        self.individual_complete = [False] * len(population)
        
        for weights in population:
            game = TetrisGame()
            ai = TetrisAI(weights)
            self.games.append(game)
            self.ais.append(ai)
        
        # Reset frame counter
        self.frame_count = 0
        
        print(f"Población inicializada: {len(self.games)} juegos creados")
        
        # Dibujar estado inicial inmediatamente
        self.draw()
    
    def update_individual(self, individual_num, fitness_score, is_complete=False):
        """Actualiza la información de un individuo.
        
        Args:
            individual_num: Número del individuo.
            fitness_score: Puntuación de fitness.
            is_complete: Si el individuo completó su evaluación.
        """
        if individual_num < len(self.fitness_scores):
            self.fitness_scores[individual_num] = fitness_score
            self.individual_complete[individual_num] = is_complete
            
            # Actualizar contador de Tetris
            if individual_num < len(self.games):
                game = self.games[individual_num]
                # Calcular Tetris basado en líneas (cada 4 líneas seguidas = 1 Tetris potencial)
                # Esto es una aproximación simple
                if hasattr(game, 'lines_cleared'):
                    self.lines_cleared[individual_num] = game.lines_cleared
    
    def update_tetris_count(self, individual_num, tetris_count):
        """Actualiza el contador de Tetris para un individuo.
        
        Args:
            individual_num: Número del individuo.
            tetris_count: Número de Tetris realizados.
        """
        if individual_num < len(self.tetris_count):
            self.tetris_count[individual_num] = tetris_count
    
    def update_generation(self, generation, best_fitness, avg_fitness, best_weights=None):
        """Actualiza la información de la generación.
        
        Args:
            generation: Número de generación.
            best_fitness: Mejor fitness de la generación.
            avg_fitness: Fitness promedio de la generación.
            best_weights: Mejores pesos encontrados.
        """
        self.current_generation = generation
        self.best_fitness = best_fitness
        self.avg_fitness = avg_fitness
        if best_weights:
            self.best_weights = best_weights
    
    def draw(self):
        """Dibuja toda la visualización de forma BLOQUEANTE y PRIORITARIA."""
        if not self.running:
            return
            
        try:
            self.frame_count += 1
            
            # Limpiar pantalla con color visible
            self.screen.fill(DARK_GRAY)
            
            # Dibujar encabezado SIEMPRE
            self.draw_header()
            
            # Encontrar el mejor individuo
            best_idx = -1
            if self.fitness_scores:
                try:
                    best_idx = self.fitness_scores.index(max(self.fitness_scores))
                except:
                    pass
            
            # Dibujar TODOS los tableros visibles
            boards_drawn = 0
            if self.games:
                visible_start_y = -self.board_spacing_y
                visible_end_y = self.screen_height
                
                for i in range(len(self.games)):
                    row = i // self.boards_per_row
                    col = i % self.boards_per_row
                    
                    x = self.board_start_x + col * self.board_spacing_x
                    y = self.board_start_y + row * self.board_spacing_y - self.scroll_offset
                    
                    # Dibujar si está visible
                    if visible_start_y <= y <= visible_end_y:
                        is_best = (i == best_idx)
                        self.draw_mini_board(self.games[i], x, y, i, is_best)
                        boards_drawn += 1
            
            # Barra de scroll
            if self.max_scroll > 0:
                scroll_bar_height = max(20, int(self.screen_height * 0.6))
                scroll_bar_y = 70 + int((self.scroll_offset / self.max_scroll) * 
                                       (self.screen_height - scroll_bar_height - 80))
                pygame.draw.rect(self.screen, WHITE, 
                               (self.screen_width - 10, scroll_bar_y, 8, scroll_bar_height))
            
            # Debug info (opcional, en la esquina)
            if self.frame_count < 10:  # Solo mostrar en los primeros frames
                debug_text = self.tiny_font.render(
                    f"Frame {self.frame_count} | Boards: {boards_drawn}/{len(self.games)}", 
                    True, YELLOW)
                self.screen.blit(debug_text, (10, self.screen_height - 20))
            
            # ACTUALIZAR PANTALLA - BLOQUEANTE - CRÍTICO
            pygame.display.flip()
            
        except Exception as e:
            print(f"Error en draw(): {e}")
            import traceback
            traceback.print_exc()
    
    def handle_events(self):
        """Maneja eventos de pygame.
        
        Returns:
            True para continuar, False para salir.
        """
        try:
            # CRÍTICO: Llamar a pump PRIMERO para obtener eventos del SO
            pygame.event.pump()
            
            # Procesar eventos disponibles
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.running = False
                    return False
                elif event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_ESCAPE:
                        self.running = False
                        return False
                    elif event.key == pygame.K_UP:
                        self.scroll_offset = max(0, self.scroll_offset - 50)
                    elif event.key == pygame.K_DOWN:
                        self.scroll_offset = min(self.max_scroll, self.scroll_offset + 50)
                elif event.type == pygame.MOUSEWHEEL:
                    # Soporte para rueda del mouse
                    self.scroll_offset = max(0, min(self.max_scroll, 
                                                   self.scroll_offset - event.y * 30))
                elif event.type == pygame.VIDEORESIZE:
                    # Manejar redimensionamiento de ventana
                    self.screen_width = event.w
                    self.screen_height = event.h
                    self.screen = pygame.display.set_mode(
                        (self.screen_width, self.screen_height),
                        pygame.RESIZABLE
                    )
                    # Recalcular layout con el nuevo tamaño
                    self.calculate_layout()
                    # Redibujar inmediatamente con el nuevo tamaño
                    self.draw()
            
            return self.running
        except Exception as e:
            print(f"Error en handle_events(): {e}")
            return True  # Continuar aunque haya error
    
    def close(self):
        """Cierra el visualizador."""
        pygame.quit()
