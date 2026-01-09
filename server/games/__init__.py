"""Game cartridges - pluggable game modules."""

from .base_game import BaseGame, EventResponse, EventContext
from .game_registry import GameRegistry

# Import all game classes
from .lobby.game import LobbyGame
from .victory.game import VictoryGame
from .macgyver.game import MacGyverGame
from .timer.game import TimerGame
from .minesweeper.game import MinesweeperGame
from .trivia.game import TriviaGame
from .pictureguess.game import PictureGuessGame
from .timeline.game import TimelineGame
from .buzzer.game import BuzzerGame
from .survival.game import SurvivalGame
from .pixelperfect.game import PixelPerfectGame
from .priceguess.game import PriceGuessGame

# All available games in registration order
ALL_GAMES = [
    LobbyGame,
    VictoryGame,
    MacGyverGame,
    TimerGame,
    MinesweeperGame,
    TriviaGame,
    PictureGuessGame,
    PriceGuessGame,
    TimelineGame,
    BuzzerGame,
    SurvivalGame,
    PixelPerfectGame,
]

__all__ = [
    'BaseGame', 'EventResponse', 'EventContext', 'GameRegistry',
    'ALL_GAMES',
    'LobbyGame', 'VictoryGame', 'MacGyverGame', 'TimerGame',
    'MinesweeperGame', 'TriviaGame', 'PictureGuessGame', 'PriceGuessGame',
    'TimelineGame', 'BuzzerGame', 'SurvivalGame', 'PixelPerfectGame',
]
