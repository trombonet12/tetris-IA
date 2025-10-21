"""
Paquete principal del juego Tetris
"""
from .tetris_game import *
from .tetris_ui import *

__all__ = ['TetrisGame', 'TetrisUI', 'Piece', 'BOARD_WIDTH', 'BOARD_HEIGHT', 'BLOCK_SIZE', 'COLORS']
