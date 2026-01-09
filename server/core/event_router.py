"""
EventRouter: Routes Socket.IO events to the active game cartridge.
"""

import logging
from typing import Dict, Any, Optional
from flask_socketio import emit, join_room, leave_room
from ..games.base_game import EventResponse, EventContext

logger = logging.getLogger(__name__)

class EventRouter:
    def __init__(self, socketio, session_manager, game_registry):
        self.socketio = socketio
        self.session_manager = session_manager
        self.game_registry = game_registry
        self.current_game_id: Optional[str] = None
    
    def handle_event(self, event_name: str, data: Dict[str, Any], sid: str):
        """
        Route an event to the current game.
        """
        # 1. Build Context
        session_data = self.session_manager.get_team_for_session(sid)
        team_id = None
        player_id = None
        team_name = ""
        player_name = ""
        
        if session_data:
            team_id = session_data.get('team_id')
            player_id = session_data.get('player_id')
            team = self.session_manager.get_team(team_id)
            if team:
                team_name = team.get('name', "")
                if player_id:
                    player_name = team.get('players', {}).get(player_id, {}).get('name', "")

        # Check if user is in admin room to determine is_admin
        # This is a bit of a hack, ideally we'd have a better auth check in session
        # But for now, we can trust the room membership if managed correctly
        # However, checking room membership via socketio in handler might be tricky or slow.
        # Let's rely on a passed flag or separate admin auth flow. 
        # For now, we default to False. Admin events usually come from the admin client which should be authenticated.
        is_admin = False 

        context = EventContext(
            session_id=sid,
            team_id=team_id,
            player_id=player_id,
            player_name=player_name,
            team_name=team_name,
            is_admin=is_admin
        )

        # 2. Find Game
        # We route to the CURRENT game.
        if not self.current_game_id:
            logger.warning(f"No active game. Event {event_name} ignored.")
            return

        game = self.game_registry.get_game(self.current_game_id)
        if not game:
            logger.error(f"Active game {self.current_game_id} not found in registry!")
            return

        # Check if game handles this event (including global events)
        if (event_name not in game.EVENTS and
            event_name not in game.ADMIN_EVENTS and
            event_name not in game.GLOBAL_ADMIN_EVENTS):
             logger.debug(f"Event {event_name} not handled by current game {self.current_game_id}")
             return

        # 3. Handle
        try:
            response = game.handle_event(event_name, data, context)
            
            # 4. Emit responses
            if response:
                self._process_response(response, context)
        except Exception as e:
            logger.exception(f"Error handling event {event_name} in game {self.current_game_id}: {e}")
            self.socketio.emit('error', {'code': 'GAME_ERROR', 'message': str(e)}, room=sid)

    def set_state(self, new_state: str, state_data: dict) -> bool:
        """
        Transition to a new game state.
        """
        logger.info(f"Transitioning from {self.current_game_id} to {new_state}")

        # Exit current game
        if self.current_game_id:
            current_game = self.game_registry.get_game(self.current_game_id)
            if current_game:
                try:
                    response = current_game.on_exit()
                    self._process_response(response, None)
                except Exception as e:
                    logger.error(f"Error exiting game {self.current_game_id}: {e}")

        # Enter new game
        # We assume the 'state' string from admin matches the GAME_ID
        self.current_game_id = new_state 
        new_game = self.game_registry.get_game(self.current_game_id)
        
        if not new_game:
            logger.error(f"Game not found for state: {new_state}")
            # Fallback to LOBBY if possible?
            if new_state != 'LOBBY':
                logger.info("Falling back to LOBBY")
                self.current_game_id = 'LOBBY'
                new_game = self.game_registry.get_game('LOBBY')
            
            if not new_game:
                 logger.critical("LOBBY game not found! System in bad state.")
                 return False

        # Update SessionManager state (for persistence/crash recovery)
        self.session_manager.set_state(new_state, state_data)

        try:
            response = new_game.on_enter(state_data)
            self._process_response(response, None)
        except Exception as e:
            logger.exception(f"Error entering game {new_state}: {e}")
            return False
        
        # Broadcast state change (Console responsibility)
        sanitized_data = new_game.get_sanitized_state_data()
        self.socketio.emit('state_change', {
            'current_state': new_state,
            'state_data': sanitized_data
        })
        
        return True

    def _process_response(self, response: EventResponse, context: Optional[EventContext]):
        """
        Emit events based on EventResponse.
        """
        if not response:
            return

        # 1. Broadcast
        if response.broadcast:
            for event, payload in response.broadcast.items():
                self.socketio.emit(event, payload)
        
        # 2. To Sender
        if response.to_sender and context and context.session_id:
            for event, payload in response.to_sender.items():
                self.socketio.emit(event, payload, room=context.session_id)

        # 3. To Team (Sender's Team)
        if response.to_team and context and context.team_id:
            for event, payload in response.to_team.items():
                self.socketio.emit(event, payload, room=f"team:{context.team_id}")

        # 3b. To Team Others (Sender's Team excluding sender)
        if response.to_team_others and context and context.team_id:
            for event, payload in response.to_team_others.items():
                self.socketio.emit(event, payload, room=f"team:{context.team_id}", skip_sid=context.session_id)

        # 4. To Admin
        if response.to_admin:
            for event, payload in response.to_admin.items():
                self.socketio.emit(event, payload, room='admin')

        # 5. To Specific Teams
        if response.to_specific_team:
            for team_id, events in response.to_specific_team.items():
                for event, payload in events.items():
                    self.socketio.emit(event, payload, room=f"team:{team_id}")

        # 6. Error (to sender)
        if response.error and context and context.session_id:
            self.socketio.emit('error', response.error, room=context.session_id)
