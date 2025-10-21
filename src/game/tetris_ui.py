"""Tetris UI - Interfaz gráfica con Pygame."""
import pygame
import sys
from .tetris_game import TetrisGame, BOARD_WIDTH, BOARD_HEIGHT, BLOCK_SIZE, COLORS

WINDOW_WIDTH = BOARD_WIDTH * BLOCK_SIZE + 250
WINDOW_HEIGHT = BOARD_HEIGHT * BLOCK_SIZE + 100
FPS = 60

WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
GRAY = (128, 128, 128)
DARK_GRAY = (50, 50, 50)


class TetrisUI:
    """Interfaz gráfica para Tetris."""
    
    def __init__(self, ai_mode=False):
        """Inicializa la interfaz gráfica.
        
        Args:
            ai_mode: Si True, el modo IA está activo.
        """
        pygame.init()
        self.screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
        pygame.display.set_caption("Tetris - Python")
        self.clock = pygame.time.Clock()
        self.font = pygame.font.Font(None, 36)
        self.small_font = pygame.font.Font(None, 24)
        
        self.game = TetrisGame()
        self.ai_mode = ai_mode
        self.fall_time = 0
        self.fall_speed = 500
        self.board_offset_x = 20
        self.board_offset_y = 50
    
    def get_fall_speed(self):
        """Calcula la velocidad de caída basada en el nivel.
        
        Returns:
            Velocidad de caída en milisegundos.
        """
        return max(100, 500 - (self.game.level - 1) * 50)
    
    def draw_board(self):
        """Dibuja el tablero de juego."""
        pygame.draw.rect(
            self.screen,
            DARK_GRAY,
            (self.board_offset_x - 2, self.board_offset_y - 2,
             BOARD_WIDTH * BLOCK_SIZE + 4, BOARD_HEIGHT * BLOCK_SIZE + 4)
        )
        
        for y in range(BOARD_HEIGHT):
            for x in range(BOARD_WIDTH):
                color = COLORS[self.game.board[y][x]]
                rect = pygame.Rect(
                    self.board_offset_x + x * BLOCK_SIZE,
                    self.board_offset_y + y * BLOCK_SIZE,
                    BLOCK_SIZE,
                    BLOCK_SIZE
                )
                pygame.draw.rect(self.screen, color, rect)
                pygame.draw.rect(self.screen, GRAY, rect, 1)
    
    def draw_piece(self, piece, offset_x=0, offset_y=0):
        """Dibuja una pieza.
        
        Args:
            piece: Pieza a dibujar.
            offset_x: Desplazamiento horizontal.
            offset_y: Desplazamiento vertical.
        """
        if piece is None:
            return
        
        for y, row in enumerate(piece.shape):
            for x, cell in enumerate(row):
                if cell:
                    rect = pygame.Rect(
                        self.board_offset_x + (piece.x + x) * BLOCK_SIZE + offset_x,
                        self.board_offset_y + (piece.y + y) * BLOCK_SIZE + offset_y,
                        BLOCK_SIZE,
                        BLOCK_SIZE
                    )
                    pygame.draw.rect(self.screen, COLORS[piece.color], rect)
                    pygame.draw.rect(self.screen, WHITE, rect, 2)
    
    def draw_ghost_piece(self):
        """Dibuja la pieza fantasma que muestra dónde caerá la pieza."""
        if self.game.current_piece is None or self.game.game_over:
            return
        
        ghost_y = self.game.current_piece.y
        
        while self.game.is_valid_position(self.game.current_piece, 0, 
                                         ghost_y - self.game.current_piece.y + 1):
            ghost_y += 1
        
        for y, row in enumerate(self.game.current_piece.shape):
            for x, cell in enumerate(row):
                if cell:
                    rect = pygame.Rect(
                        self.board_offset_x + (self.game.current_piece.x + x) * BLOCK_SIZE,
                        self.board_offset_y + (ghost_y + y) * BLOCK_SIZE,
                        BLOCK_SIZE,
                        BLOCK_SIZE
                    )
                    pygame.draw.rect(self.screen, GRAY, rect, 2)
    
    def draw_next_piece(self):
        """Dibuja la siguiente pieza."""
        if self.game.next_piece is None:
            return
        
        text = self.small_font.render("Siguiente:", True, WHITE)
        self.screen.blit(text, (BOARD_WIDTH * BLOCK_SIZE + 50, 100))
        
        offset_x = BOARD_WIDTH * BLOCK_SIZE + 70
        offset_y = 140
        
        for y, row in enumerate(self.game.next_piece.shape):
            for x, cell in enumerate(row):
                if cell:
                    rect = pygame.Rect(
                        offset_x + x * BLOCK_SIZE,
                        offset_y + y * BLOCK_SIZE,
                        BLOCK_SIZE,
                        BLOCK_SIZE
                    )
                    pygame.draw.rect(self.screen, 
                                   COLORS[self.game.next_piece.color], rect)
                    pygame.draw.rect(self.screen, WHITE, rect, 2)
    
    def draw_stats(self):
        """Dibuja las estadísticas del juego."""
        stats_x = BOARD_WIDTH * BLOCK_SIZE + 50
        stats_y = 250
        
        score_text = self.small_font.render("Puntuación:", True, WHITE)
        score_value = self.font.render(f"{self.game.score}", True, WHITE)
        self.screen.blit(score_text, (stats_x, stats_y))
        self.screen.blit(score_value, (stats_x, stats_y + 30))
        
        lines_text = self.small_font.render("Líneas:", True, WHITE)
        lines_value = self.font.render(f"{self.game.lines_cleared}", True, WHITE)
        self.screen.blit(lines_text, (stats_x, stats_y + 80))
        self.screen.blit(lines_value, (stats_x, stats_y + 110))
        
        level_text = self.small_font.render("Nivel:", True, WHITE)
        level_value = self.font.render(f"{self.game.level}", True, WHITE)
        self.screen.blit(level_text, (stats_x, stats_y + 160))
        self.screen.blit(level_value, (stats_x, stats_y + 190))
        
        stats = self.game.get_game_stats()
        ai_stats_y = stats_y + 260
        
        height_text = self.small_font.render(
            f"Altura: {stats['max_height']}", True, WHITE)
        holes_text = self.small_font.render(
            f"Huecos: {stats['holes']}", True, WHITE)
        bump_text = self.small_font.render(
            f"Irregularidad: {stats['bumpiness']}", True, WHITE)
        
        self.screen.blit(height_text, (stats_x, ai_stats_y))
        self.screen.blit(holes_text, (stats_x, ai_stats_y + 30))
        self.screen.blit(bump_text, (stats_x, ai_stats_y + 60))
    
    def draw_game_over(self):
        """Dibuja la pantalla de game over."""
        overlay = pygame.Surface((WINDOW_WIDTH, WINDOW_HEIGHT))
        overlay.set_alpha(200)
        overlay.fill(BLACK)
        self.screen.blit(overlay, (0, 0))
        
        game_over_text = self.font.render("GAME OVER", True, WHITE)
        score_text = self.small_font.render(
            f"Puntuación Final: {self.game.score}", True, WHITE)
        restart_text = self.small_font.render(
            "Presiona R para reiniciar", True, WHITE)
        
        self.screen.blit(game_over_text, 
                        (WINDOW_WIDTH // 2 - game_over_text.get_width() // 2, 
                         WINDOW_HEIGHT // 2 - 50))
        self.screen.blit(score_text,
                        (WINDOW_WIDTH // 2 - score_text.get_width() // 2,
                         WINDOW_HEIGHT // 2 + 10))
        self.screen.blit(restart_text,
                        (WINDOW_WIDTH // 2 - restart_text.get_width() // 2,
                         WINDOW_HEIGHT // 2 + 50))
    
    def draw_title(self):
        """Dibuja el título del juego."""
        title = self.font.render("TETRIS", True, WHITE)
        self.screen.blit(title, (self.board_offset_x, 10))
    
    def handle_input(self):
        """Maneja la entrada del usuario.
        
        Returns:
            False si se debe cerrar el juego, True en caso contrario.
        """
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                return False
            
            if event.type == pygame.KEYDOWN:
                if self.game.game_over:
                    if event.key == pygame.K_r:
                        self.game.reset()
                        self.fall_time = 0
                else:
                    if event.key == pygame.K_LEFT:
                        self.game.move(-1, 0)
                    elif event.key == pygame.K_RIGHT:
                        self.game.move(1, 0)
                    elif event.key == pygame.K_DOWN:
                        self.game.soft_drop()
                    elif event.key == pygame.K_UP or event.key == pygame.K_SPACE:
                        self.game.rotate_piece()
                    elif event.key == pygame.K_RETURN:
                        self.game.hard_drop()
        
        return True
    
    def update(self):
        """Actualiza el estado del juego."""
        if self.game.game_over:
            return
        
        self.fall_time += self.clock.get_time()
        self.fall_speed = self.get_fall_speed()
        
        if self.fall_time >= self.fall_speed:
            self.game.soft_drop()
            self.fall_time = 0
    
    def draw(self):
        """Dibuja todos los elementos."""
        self.screen.fill(BLACK)
        
        self.draw_title()
        self.draw_board()
        self.draw_ghost_piece()
        self.draw_piece(self.game.current_piece)
        self.draw_next_piece()
        self.draw_stats()
        
        if self.game.game_over:
            self.draw_game_over()
        
        pygame.display.flip()
    
    def run(self):
        """Loop principal del juego."""
        running = True
        
        while running:
            running = self.handle_input()
            self.update()
            self.draw()
            self.clock.tick(FPS)
        
        pygame.quit()
        sys.exit()


if __name__ == "__main__":
    game_ui = TetrisUI()
    game_ui.run()
