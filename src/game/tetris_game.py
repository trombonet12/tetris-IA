"""Tetris Game - Lógica del juego."""
import random
import numpy as np

BOARD_WIDTH = 10
BOARD_HEIGHT = 20
BLOCK_SIZE = 30

COLORS = [
    (0, 0, 0),
    (0, 255, 255),
    (255, 255, 0),
    (128, 0, 128),
    (0, 255, 0),
    (255, 0, 0),
    (0, 0, 255),
    (255, 165, 0),
]

SHAPES = [
    [[1, 1, 1, 1]],
    [[1, 1], [1, 1]],
    [[0, 1, 0], [1, 1, 1]],
    [[0, 1, 1], [1, 1, 0]],
    [[1, 1, 0], [0, 1, 1]],
    [[1, 0, 0], [1, 1, 1]],
    [[0, 0, 1], [1, 1, 1]],
]


class Piece:
    """Representa una pieza de Tetris."""
    
    def __init__(self, shape_id=None):
        if shape_id is None:
            self.shape_id = random.randint(0, len(SHAPES) - 1)
        else:
            self.shape_id = shape_id
        
        self.shape = [row[:] for row in SHAPES[self.shape_id]]
        self.color = self.shape_id + 1
        self.x = BOARD_WIDTH // 2 - len(self.shape[0]) // 2
        self.y = 0
    
    def rotate(self):
        """Rota la pieza 90 grados en sentido horario."""
        self.shape = [list(row) for row in zip(*self.shape[::-1])]
    
    def get_rotated_shape(self):
        """Obtiene la forma rotada sin modificar la pieza.
        
        Returns:
            Matriz con la forma rotada.
        """
        return [list(row) for row in zip(*self.shape[::-1])]


class TetrisGame:
    """Clase principal del juego Tetris."""
    
    def __init__(self):
        """Inicializa el juego."""
        self.board = [[0 for _ in range(BOARD_WIDTH)] 
                     for _ in range(BOARD_HEIGHT)]
        self.current_piece = None
        self.next_piece = Piece()
        self.score = 0
        self.lines_cleared = 0
        self.level = 1
        self.game_over = False
        self.spawn_new_piece()
    
    def spawn_new_piece(self):
        """Genera una nueva pieza."""
        self.current_piece = self.next_piece
        self.next_piece = Piece()
        
        if not self.is_valid_position(self.current_piece):
            self.game_over = True
    
    def is_valid_position(self, piece, offset_x=0, offset_y=0):
        """Verifica si la pieza está en una posición válida.
        
        Args:
            piece: Pieza a verificar.
            offset_x: Desplazamiento horizontal.
            offset_y: Desplazamiento vertical.
            
        Returns:
            True si la posición es válida, False en caso contrario.
        """
        for y, row in enumerate(piece.shape):
            for x, cell in enumerate(row):
                if cell:
                    new_x = piece.x + x + offset_x
                    new_y = piece.y + y + offset_y
                    
                    if new_x < 0 or new_x >= BOARD_WIDTH or new_y >= BOARD_HEIGHT:
                        return False
                    
                    if new_y >= 0 and self.board[new_y][new_x]:
                        return False
        
        return True
    
    def move(self, dx, dy):
        """Mueve la pieza actual.
        
        Args:
            dx: Desplazamiento horizontal.
            dy: Desplazamiento vertical.
            
        Returns:
            True si el movimiento fue exitoso, False en caso contrario.
        """
        if self.game_over:
            return False
        
        if self.is_valid_position(self.current_piece, dx, dy):
            self.current_piece.x += dx
            self.current_piece.y += dy
            return True
        return False
    
    def rotate_piece(self):
        """Rota la pieza actual con wall kick.
        
        Returns:
            True si la rotación fue exitosa, False en caso contrario.
        """
        if self.game_over:
            return False
        
        original_shape = [row[:] for row in self.current_piece.shape]
        self.current_piece.rotate()
        
        if not self.is_valid_position(self.current_piece):
            if self.is_valid_position(self.current_piece, -1, 0):
                self.current_piece.x -= 1
            elif self.is_valid_position(self.current_piece, 1, 0):
                self.current_piece.x += 1
            else:
                self.current_piece.shape = original_shape
                return False
        
        return True
    
    def hard_drop(self):
        """Deja caer la pieza hasta el fondo."""
        if self.game_over:
            return
        
        while self.move(0, 1):
            pass
        
        self.lock_piece()
    
    def soft_drop(self):
        """Mueve la pieza un espacio hacia abajo.
        
        Returns:
            False si la pieza se bloqueó, True en caso contrario.
        """
        if self.game_over:
            return False
        
        if not self.move(0, 1):
            self.lock_piece()
            return False
        return True
    
    def lock_piece(self):
        """Fija la pieza actual en el tablero."""
        for y, row in enumerate(self.current_piece.shape):
            for x, cell in enumerate(row):
                if cell:
                    board_y = self.current_piece.y + y
                    board_x = self.current_piece.x + x
                    if board_y >= 0:
                        self.board[board_y][board_x] = self.current_piece.color
        
        lines = self.clear_lines()
        self.update_score(lines)
        self.spawn_new_piece()
    
    def clear_lines(self):
        """Elimina las líneas completas.
        
        Returns:
            Número de líneas eliminadas.
        """
        lines_to_clear = []
        
        for y in range(BOARD_HEIGHT):
            if all(self.board[y]):
                lines_to_clear.append(y)
        
        for y in lines_to_clear:
            del self.board[y]
            self.board.insert(0, [0 for _ in range(BOARD_WIDTH)])
        
        return len(lines_to_clear)
    
    def update_score(self, lines):
        """Actualiza la puntuación basándose en las líneas eliminadas.
        
        Args:
            lines: Número de líneas eliminadas.
        """
        if lines > 0:
            points = [0, 40, 100, 300, 1200]
            self.score += points[lines] * self.level
            self.lines_cleared += lines
            self.level = self.lines_cleared // 10 + 1
    
    def get_board_state(self):
        """Obtiene el estado actual del tablero con la pieza actual.
        
        Returns:
            Matriz bidimensional representando el tablero.
        """
        state = [row[:] for row in self.board]
        
        if self.current_piece and not self.game_over:
            for y, row in enumerate(self.current_piece.shape):
                for x, cell in enumerate(row):
                    if cell:
                        board_y = self.current_piece.y + y
                        board_x = self.current_piece.x + x
                        if (0 <= board_y < BOARD_HEIGHT and 
                            0 <= board_x < BOARD_WIDTH):
                            state[board_y][board_x] = self.current_piece.color
        
        return state
    
    def get_game_stats(self):
        """Obtiene las estadísticas del juego para análisis.
        
        Returns:
            Diccionario con estadísticas del juego.
        """
        board = np.array(self.board)
        
        max_height = 0
        for x in range(BOARD_WIDTH):
            for y in range(BOARD_HEIGHT):
                if board[y][x] != 0:
                    max_height = max(max_height, BOARD_HEIGHT - y)
                    break
        
        holes = 0
        for x in range(BOARD_WIDTH):
            block_found = False
            for y in range(BOARD_HEIGHT):
                if board[y][x] != 0:
                    block_found = True
                elif block_found:
                    holes += 1
        
        heights = []
        for x in range(BOARD_WIDTH):
            height = 0
            for y in range(BOARD_HEIGHT):
                if board[y][x] != 0:
                    height = BOARD_HEIGHT - y
                    break
            heights.append(height)
        
        bumpiness = sum(abs(heights[i] - heights[i+1]) 
                       for i in range(len(heights)-1))
        complete_lines = sum(1 for row in board if all(row))
        
        return {
            'score': self.score,
            'lines_cleared': self.lines_cleared,
            'level': self.level,
            'max_height': max_height,
            'holes': holes,
            'bumpiness': bumpiness,
            'complete_lines': complete_lines,
            'game_over': self.game_over
        }
    
    def reset(self):
        """Reinicia el juego."""
        self.board = [[0 for _ in range(BOARD_WIDTH)] 
                     for _ in range(BOARD_HEIGHT)]
        self.current_piece = None
        self.next_piece = Piece()
        self.score = 0
        self.lines_cleared = 0
        self.level = 1
        self.game_over = False
        self.spawn_new_piece()
