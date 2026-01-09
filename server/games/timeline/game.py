import time
import re
import logging
from ..base_game import BaseGame, EventResponse, EventContext

logger = logging.getLogger(__name__)

class TimelineGame(BaseGame):
    GAME_ID = "TIMELINE"
    GAME_NAME = "Timeline"
    
    EVENTS = {
        'submit_timeline': 'handle_submit_timeline',
        'timeline_update': 'handle_timeline_update'
    }
    ADMIN_EVENTS = {
        'complete_timeline': 'handle_complete_timeline'
    }

    def on_enter(self, state_data):
        self._state = {
            'puzzle_id': state_data.get('puzzle_id'),
            'correct_order': state_data.get('correct_order', []),
            'winners': [],
            'submissions': {}, # team_id -> {order, player_id, player_name, timestamp}
            'statuses': {tid: 'thinking' for tid in self.session_manager.teams.keys()},
            'items': state_data.get('items', []) # Needed for reveal
        }
        return EventResponse()
    
    def on_exit(self):
        return EventResponse()

    def handle_submit_timeline(self, data, context: EventContext) -> EventResponse:
        team_id = context.team_id or data.get('team_id')
        puzzle_id = data.get('puzzle_id', 0)
        submitted_order = data.get('order', [])
        
        response = EventResponse()
        
        if not team_id:
             response.error = {'code': 'NO_TEAM', 'message': 'Team required'}
             return response

        team = self.session_manager.get_team(team_id)
        if not team:
             response.error = {'code': 'INVALID_TEAM', 'message': 'Team not found'}
             return response

        # Check if team already won
        if team_id in self._state['winners']:
            if team_id not in response.to_specific_team:
                response.to_specific_team[team_id] = {}
            response.to_specific_team[team_id]['timeline_result'] = {
                'correct': True,
                'points_awarded': 0,
                'finish_position': self._state['winners'].index(team_id) + 1,
                'message': 'Already submitted correct answer',
                'player_id': context.player_id,
                'player_name': context.player_name
            }
            return response

        # Store submission
        self._state['submissions'][team_id] = {
            'order': submitted_order,
            'player_id': context.player_id,
            'player_name': context.player_name,
            'timestamp': time.time()
        }

        # Validate
        correct_order = self._state['correct_order']
        # Ensure comparison is valid (handle types if needed, JSON lists are usually fine)
        is_correct = submitted_order == correct_order

        if is_correct:
            self._state['winners'].append(team_id)
            finish_position = len(self._state['winners'])
            
            points_table = [100, 75, 50, 25]
            points = points_table[min(finish_position - 1, len(points_table) - 1)]
            
            self.session_manager.add_points(team_id, points, f'Timeline correct - position {finish_position}')
            self._state['statuses'][team_id] = 'winner'
            
            # Result to team
            if team_id not in response.to_specific_team:
                response.to_specific_team[team_id] = {}
                
            response.to_specific_team[team_id]['timeline_result'] = {
                'correct': True,
                'points_awarded': points,
                'finish_position': finish_position,
                'message': 'TIMELINE RESTORED',
                'player_id': context.player_id,
                'player_name': context.player_name
            }
            
            # Score update broadcast
            response.broadcast['score_update'] = {
                'scores': self.session_manager.get_scores(),
                'teams': self.session_manager.get_teams_info()
            }
            
        else:
            self._state['statuses'][team_id] = 'failed'
            
            if team_id not in response.to_specific_team:
                response.to_specific_team[team_id] = {}
                
            response.to_specific_team[team_id]['timeline_result'] = {
                'correct': False,
                'attempt_number': 1,
                'message': 'Incorrect!',
                'player_id': context.player_id,
                'player_name': context.player_name
            }

        # Notify admin
        response.to_admin['timeline_submission'] = {
            'team_id': team_id,
            'team_name': team['name'],
            'player_id': context.player_id,
            'player_name': context.player_name,
            'order': submitted_order,
            'status': self._state['statuses'][team_id]
        }
        
        # Broadcast status update
        response.broadcast['timeline_status'] = {
            'team_statuses': self._state['statuses']
        }

        return response

    def handle_timeline_update(self, data, context: EventContext) -> EventResponse:
        response = EventResponse()
        order = data.get('order', [])
        
        if context.team_id:
             response.to_team_others['timeline_sync'] = {
                'order': order,
                'from_player_id': context.player_id,
                'from_player_name': context.player_name
             }
        return response

    def handle_complete_timeline(self, data, context: EventContext) -> EventResponse:
        correct_order = data.get('correct_order', self._state['correct_order'])
        correct_labels = data.get('correct_labels', [])
        
        winner_team_id = self._state['winners'][0] if self._state['winners'] else None
        
        # Get submissions formatted for TV
        team_submissions = []
        for tid, sub in self._state['submissions'].items():
            team = self.session_manager.get_team(tid)
            if team:
                team_submissions.append({
                    'team_id': tid,
                    'team_name': team['name'],
                    'order': sub['order'],
                    'player_id': sub.get('player_id'),
                    'player_name': sub.get('player_name', ''),
                    'timestamp': sub.get('timestamp', 0),
                    'status': self._state['statuses'].get(tid, 'thinking')
                })
        team_submissions.sort(key=lambda x: x['timestamp'], reverse=True)
        
        response = EventResponse()
        response.broadcast['timeline_complete'] = {
            'winner_team_id': winner_team_id,
            'correct_order': correct_order,
            'correct_labels': correct_labels,
            'shuffled_items': self._state['items'],
            'team_submissions': team_submissions
        }
        return response

    def get_sanitized_state_data(self) -> dict:
        def _strip_parenthetical(text: str) -> str:
            return re.sub(r'\s*\([^)]*\)\s*$', '', text).strip()
            
        state = self._state.copy()
        if 'items' in state:
            state['items'] = [_strip_parenthetical(item) for item in state['items']]
        if 'correct_order' in state:
             del state['correct_order']
             
        # Also clean up internal bookkeeping
        if 'submissions' in state:
             del state['submissions']
        if 'winners' in state:
             del state['winners']
             
        return state
