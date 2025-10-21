"""Tetris AI Viewer - Visualizador de IA jugando Tetris."""
import pygame
import sys
import time
from src.game.tetris_game import TetrisGame
from src.ai.tetris_ai import TetrisAI
from src.game.tetris_ui import TetrisUI

WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
GREEN = (0, 255, 0)
RED = (255, 0, 0)


class TetrisAIViewer(TetrisUI):
    """Visualizador para ver la IA jugando."""
    
    def __init__(self, ai_weights=None, speed=1.0):
        """Inicializa el visualizador de IA.
        
        Args:
            ai_weights: Pesos personalizados para la IA.
            speed: Factor de velocidad (1.0 = normal, 2.0 = doble).
        """
        super().__init__(ai_mode=True)
        self.ai = TetrisAI(ai_weights)
        self.speed = speed
        self.move_delay = int(100 / self.speed)
        self.last_move_time = 0
        self.current_target_move = None
        self.game_count = 0
        self.total_score = 0
        self.total_lines = 0
        self.paused = False
    
    def execute_ai_move(self):
        """Ejecuta el siguiente movimiento de la IA."""
        current_time = pygame.time.get_ticks()
        
        if current_time - self.last_move_time < self.move_delay:
            return
        
        self.last_move_time = current_time
        
        if self.game.game_over:
            self.game_count += 1
            self.total_score += self.game.score
            self.total_lines += self.game.lines_cleared
            
            print(f"\nJuego {self.game_count} terminado:")
            print(f"  Puntuación: {self.game.score}")
            print(f"  Líneas: {self.game.lines_cleared}")
            avg_score = self.total_score / self.game_count
            avg_lines = self.total_lines / self.game_count
            print(f"  Promedio de puntuación: {avg_score:.2f}")
            print(f"  Promedio de líneas: {avg_lines:.2f}")
            
            time.sleep(1)
            self.game.reset()
            self.current_target_move = None
            return
        
        if self.current_target_move is None:
            self.current_target_move = self.ai.get_best_move(self.game)
            
            if self.current_target_move is None:
                self.game.game_over = True
                return
        
        if self.current_target_move['rotation'] > 0:
            self.game.rotate_piece()
            self.current_target_move['rotation'] -= 1
            return
        
        target_x = self.current_target_move['x']
        current_x = self.game.current_piece.x
        
        if current_x < target_x:
            if self.game.move(1, 0):
                return
        elif current_x > target_x:
            if self.game.move(-1, 0):
                return
        
        self.game.hard_drop()
        self.current_target_move = None
    
    def handle_input(self):
        """Maneja la entrada del usuario.
        
        Returns:
            False si se debe cerrar, True en caso contrario.
        """
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                return False
            
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_SPACE:
                    self.paused = not self.paused
                elif event.key == pygame.K_r:
                    self.game.reset()
                    self.current_target_move = None
                elif event.key == pygame.K_UP:
                    self.speed = min(10.0, self.speed * 1.5)
                    self.move_delay = int(100 / self.speed)
                    print(f"Velocidad: {self.speed:.1f}x")
                elif event.key == pygame.K_DOWN:
                    self.speed = max(0.1, self.speed / 1.5)
                    self.move_delay = int(100 / self.speed)
                    print(f"Velocidad: {self.speed:.1f}x")
        
        return True
    
    def draw_ai_info(self):
        """Dibuja información adicional de la IA."""
        stats_x = 20
        stats_y = self.board_offset_y + 20 * 30 + 20
        
        speed_text = self.small_font.render(
            f"Velocidad: {self.speed:.1f}x", True, WHITE)
        self.screen.blit(speed_text, (stats_x, stats_y))
        
        games_text = self.small_font.render(
            f"Juegos: {self.game_count}", True, WHITE)
        self.screen.blit(games_text, (stats_x, stats_y + 25))
        
        if self.game_count > 0:
            avg_score = self.total_score / self.game_count
            avg_score_text = self.small_font.render(
                f"Prom. Punt.: {avg_score:.1f}", True, WHITE)
            self.screen.blit(avg_score_text, (stats_x + 150, stats_y))
            
            avg_lines = self.total_lines / self.game_count
            avg_lines_text = self.small_font.render(
                f"Prom. Líneas: {avg_lines:.1f}", True, WHITE)
            self.screen.blit(avg_lines_text, (stats_x + 150, stats_y + 25))
        
        if self.paused:
            pause_text = self.font.render("PAUSADO", True, RED)
            self.screen.blit(pause_text, (stats_x + 330, stats_y))
        else:
            play_text = self.font.render("JUGANDO", True, GREEN)
            self.screen.blit(play_text, (stats_x + 330, stats_y))
        
        controls_y = stats_y + 60
        controls = [
            "Controles:",
            "ESPACIO - Pausar/Reanudar",
            "R - Reiniciar juego",
            "ARRIBA - Aumentar velocidad",
            "ABAJO - Reducir velocidad"
        ]
        
        for i, control in enumerate(controls):
            text = self.small_font.render(control, True, WHITE)
            self.screen.blit(text, (stats_x, controls_y + i * 22))
        
        weights_x = 420
        weights_y = 50
        weights_title = self.small_font.render("Pesos de la IA:", True, WHITE)
        self.screen.blit(weights_title, (weights_x, weights_y))
        
        y_offset = weights_y + 30
        for key, value in self.ai.weights.items():
            weight_text = self.small_font.render(
                f"{key}: {value:.4f}", True, WHITE)
            self.screen.blit(weight_text, (weights_x, y_offset))
            y_offset += 22
    
    def update(self):
        """Actualiza el estado del juego con la IA."""
        if not self.paused:
            self.execute_ai_move()
    
    def draw(self):
        """Dibuja todos los elementos."""
        super().draw()
        self.draw_ai_info()
        pygame.display.flip()
    
    def run(self):
        """Loop principal."""
        print("Tetris AI Viewer")
        print("=" * 60)
        print("La IA está jugando. Usa los controles para interactuar:")
        print("  ESPACIO - Pausar/Reanudar")
        print("  R - Reiniciar juego")
        print("  FLECHA ARRIBA - Aumentar velocidad")
        print("  FLECHA ABAJO - Reducir velocidad")
        print("=" * 60)
        
        running = True
        
        while running:
            running = self.handle_input()
            self.update()
            self.draw()
            self.clock.tick(60)
        
        pygame.quit()
        sys.exit()


if __name__ == "__main__":
    viewer = TetrisAIViewer(ai_weights=None, speed=2.0)
    viewer.run()
