"""
Game Registry for managing game cartridges.
"""
import logging
from typing import Dict, Type, Optional
from .base_game import BaseGame

logger = logging.getLogger(__name__)

class GameRegistry:
    def __init__(self, session_manager):
        self.session_manager = session_manager
        self._games: Dict[str, BaseGame] = {}
        self._event_map: Dict[str, str] = {}  # event_name -> game_id

    def register(self, game_class: Type[BaseGame]):
        """
        Register a game class, instantiating it.
        """
        # Instantiate the game with the session manager
        game_instance = game_class(self.session_manager)
        game_id = game_instance.GAME_ID
        
        if not game_id:
            logger.warning(f"Game class {game_class.__name__} has no GAME_ID. Skipping.")
            return

        self._games[game_id] = game_instance
        logger.info(f"Registered game cartridge: {game_id} ({game_instance.GAME_NAME})")
        
        # Register events
        for event in game_instance.get_all_event_names():
            if event in self._event_map:
                 logger.warning(f"Event '{event}' collision: {self._event_map[event]} vs {game_id}. Last one wins.")
            self._event_map[event] = game_id

    def get_game(self, game_id: str) -> Optional[BaseGame]:
        """Get a game instance by ID."""
        return self._games.get(game_id)

    def get_game_for_event(self, event_name: str) -> Optional[BaseGame]:
        """Find which game handles a specific event."""
        game_id = self._event_map.get(event_name)
        if game_id:
            return self._games.get(game_id)
        return None

    def get_all_events(self) -> Dict[str, str]:
        """Get mapping of all registered events to their game IDs."""
        return self._event_map.copy()
