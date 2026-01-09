import time
from ..base_game import BaseGame, EventResponse, EventContext

class TimerGame(BaseGame):
    GAME_ID = "TIMER"
    GAME_NAME = "Timer"
    
    # Map event names to handler methods
    EVENTS = {
        'timer_control': 'handle_timer_control'
    }

    def on_enter(self, state_data):
        duration = state_data.get('duration_seconds', 180)
        self._state = {
            'total_seconds': duration,
            'remaining_seconds': duration,
            'duration_seconds': duration,
            'start_time': 0,
            'paused': False,
            'message': state_data.get('message', '')
        }
        return EventResponse()
    
    def on_exit(self):
        return EventResponse()

    def handle_timer_control(self, data, context: EventContext) -> EventResponse:
        action = data.get('action')
        duration = data.get('duration_seconds', 180)
        message = data.get('message', '')
        
        response = EventResponse()
        
        if action == 'start':
            self._start_timer(duration, message)
            response.broadcast['timer_sync'] = {
                'action': 'start',
                'remaining_seconds': duration,
                'total_seconds': duration,
                'message': message
            }
        elif action == 'pause':
            remaining = self._pause_timer()
            response.broadcast['timer_sync'] = {
                'action': 'pause',
                'remaining_seconds': remaining,
                'total_seconds': self._state.get('total_seconds', 0)
            }
        elif action == 'resume':
            remaining = self._resume_timer()
            response.broadcast['timer_sync'] = {
                'action': 'resume',
                'remaining_seconds': remaining,
                'total_seconds': self._state.get('total_seconds', 0)
            }
        elif action == 'reset':
            self._reset_timer(duration)
            response.broadcast['timer_sync'] = {
                'action': 'reset',
                'remaining_seconds': duration,
                'total_seconds': duration
            }
            
        return response

    def _start_timer(self, duration, message):
        self._state['total_seconds'] = duration
        self._state['remaining_seconds'] = duration
        self._state['start_time'] = time.time()
        self._state['paused'] = False
        self._state['message'] = message

    def _pause_timer(self):
        if not self._state.get('paused'):
            elapsed = time.time() - self._state.get('start_time', 0)
            self._state['remaining_seconds'] = max(0, self._state.get('remaining_seconds', 0) - int(elapsed))
            self._state['paused'] = True
        return self._state['remaining_seconds']

    def _resume_timer(self):
        if self._state.get('paused'):
            self._state['start_time'] = time.time()
            self._state['paused'] = False
        return self._state.get('remaining_seconds', 0)

    def _reset_timer(self, duration=None):
        if duration is not None:
            self._state['total_seconds'] = duration
        self._state['remaining_seconds'] = self._state.get('total_seconds', 0)
        self._state['start_time'] = 0
        self._state['paused'] = False

    def get_sanitized_state_data(self) -> dict:
        return {
            'duration_seconds': self._state.get('duration_seconds', self._state.get('total_seconds', 180)),
            'message': self._state.get('message', '')
        }
