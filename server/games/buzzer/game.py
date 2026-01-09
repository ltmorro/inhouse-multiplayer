import time
from ..base_game import BaseGame, EventResponse, EventContext

class BuzzerGame(BaseGame):
    GAME_ID = "BUZZER"
    GAME_NAME = "Buzzer"
    
    EVENTS = {
        'press_buzzer': 'handle_press_buzzer'
    }
    ADMIN_EVENTS = {
        'judge_buzzer': 'handle_judge_buzzer',
        'play_audio': 'handle_play_audio',
        'stop_audio': 'handle_stop_audio',
        'reveal_audio': 'handle_reveal_audio',
    }

    def on_enter(self, state_data):
        self._state = {
            'round_id': state_data.get('round_id'),
            'audio_hint': state_data.get('audio_hint', ''),
            'locked_by': None, # {team_id, team_name, player_id, player_name}
            'frozen_teams': {} # team_id -> expires_at (timestamp)
        }
        return EventResponse()
    
    def on_exit(self):
        return EventResponse()

    def handle_press_buzzer(self, data, context: EventContext) -> EventResponse:
        response = EventResponse()
        
        team_id = context.team_id or data.get('team_id')
        if not team_id:
            return response
            
        # Check if locked
        if self._state['locked_by']:
            return response
            
        # Check if frozen
        if self._is_team_frozen(team_id):
            return response
            
        team = self.session_manager.get_team(team_id)
        if not team:
            return response
            
        # Lock it
        self._state['locked_by'] = {
            'team_id': team_id,
            'team_name': team['name'],
            'player_id': context.player_id,
            'player_name': context.player_name
        }
        
        response.broadcast['buzzer_locked'] = {
            'locked_by_team_id': team_id,
            'locked_by_team_name': team['name'],
            'locked_by_player_id': context.player_id,
            'locked_by_player_name': context.player_name
        }
        response.broadcast['pause_audio'] = {}
        
        return response

    def handle_judge_buzzer(self, data, context: EventContext) -> EventResponse:
        team_id = data.get('team_id')
        correct = data.get('correct', False)
        points = data.get('points', 0)
        
        response = EventResponse()
        previous = self._state['locked_by']
        self._state['locked_by'] = None # Reset
        
        if correct and points:
             self.session_manager.add_points(team_id, points, 'Buzzer correct answer')
             response.broadcast['score_update'] = {
                'scores': self.session_manager.get_scores(),
                'teams': self.session_manager.get_teams_info()
            }
        
        freeze_seconds = 0
        if not correct and team_id:
             freeze_seconds = 10
             self._freeze_team(team_id, freeze_seconds)
             if team_id not in response.to_specific_team:
                response.to_specific_team[team_id] = {}
             response.to_specific_team[team_id]['buzzer_lockout'] = {
                'freeze_seconds': freeze_seconds,
                'message': f'Frozen for {freeze_seconds} seconds'
             }
             
        response.broadcast['buzzer_reset'] = {
            'previous_team_id': previous.get('team_id') if previous else None,
            'previous_team_name': previous.get('team_name') if previous else None,
            'previous_player_id': previous.get('player_id') if previous else None,
            'previous_player_name': previous.get('player_name') if previous else None,
            'result': 'correct' if correct else 'incorrect',
            'freeze_seconds': freeze_seconds
        }
        
        if not correct:
             response.broadcast['resume_audio'] = {}
             
        return response

    def handle_play_audio(self, data, context: EventContext) -> EventResponse:
        # Reset buzzer
        self._state['locked_by'] = None
        
        response = EventResponse()
        response.broadcast['play_audio'] = {
            'audio_url': data.get('audio_url', ''),
            'spotify_uri': data.get('spotify_uri', ''),
            'start_ms': data.get('start_ms', 0),
            'duration_ms': data.get('duration_ms', 30000)
        }
        # Explicit reset event
        response.broadcast['buzzer_reset'] = {
            'result': 'new_audio'
        }
        return response

    def handle_stop_audio(self, data, context: EventContext) -> EventResponse:
        response = EventResponse()
        response.broadcast['stop_audio'] = {}
        return response

    def handle_reveal_audio(self, data, context: EventContext) -> EventResponse:
        response = EventResponse()
        response.broadcast['reveal_audio'] = {
            'track_title': data.get('track_title', ''),
            'artist': data.get('artist', '')
        }
        return response

    def _freeze_team(self, team_id, duration):
        self._state['frozen_teams'][team_id] = time.time() + duration

    def _is_team_frozen(self, team_id):
        if team_id not in self._state['frozen_teams']:
            return False
        if time.time() >= self._state['frozen_teams'][team_id]:
            del self._state['frozen_teams'][team_id]
            return False
        return True

    def get_sanitized_state_data(self) -> dict:
        return {
            'round_id': self._state.get('round_id'),
            'audio_hint': self._state.get('audio_hint', '')
        }
