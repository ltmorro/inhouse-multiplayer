import time
from ..base_game import BaseGame, EventResponse, EventContext


class PixelPerfectGame(BaseGame):
    """
    Pixel Perfect - Visual Buzzer Game

    An image starts heavily blurred and clears over 30 seconds.
    Teams buzz in to guess what the baby item is. When a team buzzes,
    the timer and blur animation pause. Wrong answers resume the game
    and freeze that team's buzzer temporarily.
    """
    GAME_ID = "PIXELPERFECT"
    GAME_NAME = "Pixel Perfect"

    EVENTS = {
        'press_pixelperfect_buzzer': 'handle_press_buzzer'
    }
    ADMIN_EVENTS = {
        'judge_pixelperfect': 'handle_judge',
        'start_pixelperfect_round': 'handle_start_round',
        'reveal_pixelperfect': 'handle_reveal_answer',
    }

    def on_enter(self, state_data):
        self._state = {
            'round_id': state_data.get('round_id'),
            'image_url': state_data.get('image_url', ''),
            'correct_answer': state_data.get('correct_answer', ''),
            'locked_by': None,  # {team_id, team_name, player_id, player_name}
            'frozen_teams': {},  # team_id -> expires_at (timestamp)
            'round_started': False,
            'round_start_time': None,
        }
        return EventResponse()

    def on_exit(self):
        return EventResponse()

    def handle_start_round(self, data, context: EventContext) -> EventResponse:
        """Admin starts a new round with an image."""
        response = EventResponse()

        self._state['round_id'] = data.get('round_id', int(time.time()))
        self._state['image_url'] = data.get('image_url', '')
        self._state['correct_answer'] = data.get('correct_answer', '')
        self._state['locked_by'] = None
        self._state['frozen_teams'] = {}
        self._state['round_started'] = True
        self._state['round_start_time'] = time.time()

        response.broadcast['pixelperfect_round_start'] = {
            'round_id': self._state['round_id'],
            'image_url': self._state['image_url'],
        }

        return response

    def handle_press_buzzer(self, data, context: EventContext) -> EventResponse:
        """Player presses the buzzer to guess."""
        response = EventResponse()

        team_id = context.team_id or data.get('team_id')
        if not team_id:
            return response

        # Check if already locked
        if self._state['locked_by']:
            return response

        # Check if team is frozen (penalty from wrong answer)
        if self._is_team_frozen(team_id):
            return response

        team = self.session_manager.get_team(team_id)
        if not team:
            return response

        # Lock the buzzer
        self._state['locked_by'] = {
            'team_id': team_id,
            'team_name': team['name'],
            'player_id': context.player_id,
            'player_name': context.player_name
        }

        response.broadcast['pixelperfect_locked'] = {
            'locked_by_team_id': team_id,
            'locked_by_team_name': team['name'],
            'locked_by_player_id': context.player_id,
            'locked_by_player_name': context.player_name
        }

        return response

    def handle_judge(self, data, context: EventContext) -> EventResponse:
        """Admin judges whether the guess is correct."""
        team_id = data.get('team_id')
        correct = data.get('correct', False)
        points = data.get('points', 0)

        response = EventResponse()
        previous = self._state['locked_by']
        self._state['locked_by'] = None  # Reset lock

        if correct and points:
            self.session_manager.add_points(team_id, points, 'Pixel Perfect correct answer')
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
            response.to_specific_team[team_id]['pixelperfect_lockout'] = {
                'freeze_seconds': freeze_seconds,
                'message': f'Frozen for {freeze_seconds} seconds'
            }

        response.broadcast['pixelperfect_reset'] = {
            'previous_team_id': previous.get('team_id') if previous else None,
            'previous_team_name': previous.get('team_name') if previous else None,
            'previous_player_id': previous.get('player_id') if previous else None,
            'previous_player_name': previous.get('player_name') if previous else None,
            'result': 'correct' if correct else 'incorrect',
            'freeze_seconds': freeze_seconds
        }

        return response

    def handle_reveal_answer(self, data, context: EventContext) -> EventResponse:
        """Admin reveals the correct answer."""
        response = EventResponse()
        response.broadcast['pixelperfect_reveal'] = {
            'correct_answer': data.get('correct_answer', self._state.get('correct_answer', ''))
        }
        return response

    def _freeze_team(self, team_id, duration):
        """Freeze a team's buzzer for the given duration."""
        self._state['frozen_teams'][team_id] = time.time() + duration

    def _is_team_frozen(self, team_id):
        """Check if a team is currently frozen."""
        if team_id not in self._state['frozen_teams']:
            return False
        if time.time() >= self._state['frozen_teams'][team_id]:
            del self._state['frozen_teams'][team_id]
            return False
        return True

    def get_sanitized_state_data(self) -> dict:
        return {
            'round_id': self._state.get('round_id'),
            'image_url': self._state.get('image_url', ''),
        }