"""
Base game interface for the Cartridge system.

All game modules inherit from BaseGame and implement the required methods.
This provides a clean separation between the platform (Console) and games (Cartridges).
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, Any, Optional, List, Callable


@dataclass
class EventResponse:
    """
    Response from handling a game event.

    Games return this to indicate what events should be emitted.
    The EventRouter handles the actual emission.

    Attributes:
        broadcast: Events to emit to all connected clients
        to_sender: Events to emit only to the sender
        to_team: Events to emit to the sender's team room
        to_admin: Events to emit to the admin room
        to_specific_team: Events to emit to a specific team (team_id -> events)
        error: Error response to send to sender
    """
    broadcast: Dict[str, Any] = field(default_factory=dict)
    to_sender: Dict[str, Any] = field(default_factory=dict)
    to_team: Dict[str, Any] = field(default_factory=dict)
    to_team_others: Dict[str, Any] = field(default_factory=dict)
    to_admin: Dict[str, Any] = field(default_factory=dict)
    to_specific_team: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    error: Dict[str, Any] = field(default_factory=dict)

    def merge(self, other: 'EventResponse') -> 'EventResponse':
        """Merge another EventResponse into this one."""
        for key in ['broadcast', 'to_sender', 'to_team', 'to_team_others', 'to_admin', 'error']:
            getattr(self, key).update(getattr(other, key))
        for team_id, events in other.to_specific_team.items():
            if team_id not in self.to_specific_team:
                self.to_specific_team[team_id] = {}
            self.to_specific_team[team_id].update(events)
        return self


@dataclass
class EventContext:
    """
    Context passed to event handlers.

    Contains all information about the sender and their session.

    Attributes:
        session_id: The Socket.IO session ID
        team_id: The sender's team ID (None if not on a team)
        player_id: The sender's player ID (None if not on a team)
        player_name: The sender's player name
        team_name: The sender's team name
        is_admin: Whether the sender is authenticated as admin
    """
    session_id: str
    team_id: Optional[str] = None
    player_id: Optional[str] = None
    player_name: str = ''
    team_name: str = ''
    is_admin: bool = False


class BaseGame(ABC):
    """
    Abstract base class for all game cartridges.

    Games inherit from this class and implement:
    - on_enter(): Called when transitioning TO this game
    - on_exit(): Called when transitioning AWAY from this game
    - Event handlers mapped in EVENTS and ADMIN_EVENTS dicts

    Class Attributes:
        GAME_ID: Unique identifier for this game (e.g., 'TRIVIA')
        GAME_NAME: Human-readable name (e.g., 'Google is Down')
        EVENTS: Mapping of event_name -> handler_method_name for player events
        ADMIN_EVENTS: Mapping of event_name -> handler_method_name for admin events
    """

    GAME_ID: str = ""
    GAME_NAME: str = ""
    EVENTS: Dict[str, str] = {}
    ADMIN_EVENTS: Dict[str, str] = {}

    # Global admin events available in all game states
    GLOBAL_ADMIN_EVENTS: Dict[str, str] = {
        'music_toggle': 'handle_music_toggle',
        'music_next': 'handle_music_next',
        'music_previous': 'handle_music_previous',
    }

    def __init__(self, session_manager: 'SessionManager'):
        """
        Initialize the game with access to the session manager.

        Args:
            session_manager: The core SessionManager for team/player access
        """
        self.session_manager = session_manager
        self._state: Dict[str, Any] = {}

    @abstractmethod
    def on_enter(self, state_data: Dict[str, Any]) -> EventResponse:
        """
        Called when the game state transitions TO this game.

        Use this to initialize game-specific state from the provided state_data.

        Args:
            state_data: Data passed from admin when setting state

        Returns:
            EventResponse with any events to emit on entry
        """
        pass

    @abstractmethod
    def on_exit(self) -> EventResponse:
        """
        Called when the game state transitions AWAY from this game.

        Use this to clean up game-specific state.

        Returns:
            EventResponse with any events to emit on exit
        """
        pass

    def get_state_data(self) -> Dict[str, Any]:
        """
        Get the current game state.

        Returns:
            Copy of the internal state dict
        """
        return self._state.copy()

    def get_sanitized_state_data(self) -> Dict[str, Any]:
        """
        Get state data safe to send to clients.

        Override this to strip sensitive information like answers.
        Default implementation returns the same as get_state_data().

        Returns:
            Sanitized state dict
        """
        return self.get_state_data()

    def handle_event(self, event_name: str, data: Dict[str, Any],
                     context: EventContext) -> EventResponse:
        """
        Route an incoming event to the appropriate handler.

        Looks up the handler in EVENTS, ADMIN_EVENTS, or GLOBAL_ADMIN_EVENTS and calls it.

        Args:
            event_name: The Socket.IO event name
            data: Event payload
            context: Contains session_id, team_id, player_id, etc.

        Returns:
            EventResponse indicating what to emit
        """
        # Check player events, then admin events, then global admin events
        handler_name = (
            self.EVENTS.get(event_name) or
            self.ADMIN_EVENTS.get(event_name) or
            self.GLOBAL_ADMIN_EVENTS.get(event_name)
        )

        if handler_name and hasattr(self, handler_name):
            handler = getattr(self, handler_name)
            return handler(data, context)

        return EventResponse(
            error={'code': 'UNKNOWN_EVENT', 'message': f'Unknown event: {event_name}'}
        )

    # =========================================================================
    # Global Music Control Handlers (available in all game states)
    # =========================================================================

    def handle_music_toggle(self, data: Dict[str, Any], context: EventContext) -> EventResponse:
        """Toggle play/pause for background music."""
        response = EventResponse()
        response.broadcast['music_toggle'] = {}
        return response

    def handle_music_next(self, data: Dict[str, Any], context: EventContext) -> EventResponse:
        """Skip to next track."""
        response = EventResponse()
        response.broadcast['music_next'] = {}
        return response

    def handle_music_previous(self, data: Dict[str, Any], context: EventContext) -> EventResponse:
        """Go to previous track."""
        response = EventResponse()
        response.broadcast['music_previous'] = {}
        return response

    def get_all_event_names(self) -> List[str]:
        """Get all event names this game handles (including global events)."""
        return (
            list(self.EVENTS.keys()) +
            list(self.ADMIN_EVENTS.keys()) +
            list(self.GLOBAL_ADMIN_EVENTS.keys())
        )

    def serialize(self) -> Dict[str, Any]:
        """
        Serialize game state for persistence.

        Override for custom serialization logic.

        Returns:
            Dict suitable for JSON serialization
        """
        return {'state': self._state}

    def deserialize(self, data: Dict[str, Any]) -> None:
        """
        Restore game state from persistence.

        Override for custom deserialization logic.

        Args:
            data: Previously serialized state
        """
        self._state = data.get('state', {})
