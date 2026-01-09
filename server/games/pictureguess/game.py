from ..base_game import BaseGame, EventResponse, EventContext

class PictureGuessGame(BaseGame):
    GAME_ID = "PICTUREGUESS"
    GAME_NAME = "Picture Guess"
    
    EVENTS = {
        'submit_picture_guess': 'handle_submit_guess',
        'picture_guess_typing': 'handle_guess_typing'
    }
    ADMIN_EVENTS = {
        'grade_picture_guess': 'handle_grade_guess',
        'reveal_picture': 'handle_reveal_picture',
        'show_picture': 'handle_show_picture'
    }

    def on_enter(self, state_data):
        self._state = {
            'picture_id': state_data.get('picture_id'),
            'image_url': state_data.get('image_url'),
            'hint': state_data.get('hint'),
            'answers': {}  # team_id -> {guess_text, player_id, player_name, picture_id}
        }
        return EventResponse()
    
    def on_exit(self):
        return EventResponse()

    def handle_submit_guess(self, data, context: EventContext) -> EventResponse:
        team_id = context.team_id or data.get('team_id')
        picture_id = data.get('picture_id')
        guess_text = data.get('guess_text', '')
        
        response = EventResponse()
        
        if not team_id:
             response.error = {'code': 'NO_TEAM', 'message': 'Team required'}
             return response
             
        team = self.session_manager.get_team(team_id)
        if not team:
             response.error = {'code': 'INVALID_TEAM', 'message': 'Team not found'}
             return response

        # Store answer
        self._state['answers'][team_id] = {
            'guess_text': guess_text,
            'picture_id': picture_id,
            'player_id': context.player_id,
            'player_name': context.player_name
        }
        
        # Notify admin
        response.to_admin['picture_guess_received'] = {
            'team_id': team_id,
            'team_name': team['name'],
            'player_id': context.player_id,
            'player_name': context.player_name,
            'guess_text': guess_text,
            'picture_id': picture_id
        }
        
        # Notify team
        if team_id not in response.to_specific_team:
            response.to_specific_team[team_id] = {}
        response.to_specific_team[team_id]['picture_guess_submitted'] = {
            'player_id': context.player_id,
            'player_name': context.player_name,
            'guess_text': guess_text
        }
        
        # Broadcast submission count
        response.broadcast['submission_status'] = {
            'submitted_count': len(self._state['answers']),
            'total_teams': len(self.session_manager.teams)
        }
        
        return response

    def handle_guess_typing(self, data, context: EventContext) -> EventResponse:
        response = EventResponse()
        text = data.get('text', '')
        
        if context.team_id:
             response.to_team_others['picture_guess_sync'] = {
                'text': text,
                'from_player_id': context.player_id,
                'from_player_name': context.player_name
             }
        return response

    def handle_grade_guess(self, data, context: EventContext) -> EventResponse:
        team_id = data.get('team_id')
        correct = data.get('correct', False)
        points = data.get('points', 0)
        
        response = EventResponse()
        
        # Notify team of result
        if team_id not in response.to_specific_team:
            response.to_specific_team[team_id] = {}
        response.to_specific_team[team_id]['picture_guess_result'] = {
            'correct': correct,
            'points_awarded': points if correct else 0
        }
        
        if correct and points:
            self.session_manager.add_points(team_id, points, 'Picture guess correct')
            response.broadcast['score_update'] = {
                'scores': self.session_manager.get_scores(),
                'teams': self.session_manager.get_teams_info()
            }
            
        return response

    def handle_reveal_picture(self, data, context: EventContext) -> EventResponse:
        picture_id = data.get('picture_id')
        correct_answer = data.get('correct_answer', '')
        
        response = EventResponse()
        
        # Collect answers
        team_guesses = []
        for tid, ans_data in self._state['answers'].items():
            team = self.session_manager.get_team(tid)
            if team:
                team_guesses.append({
                    'team_id': tid,
                    'team_name': team['name'],
                    'guess_text': ans_data.get('guess_text', ''),
                    'player_name': ans_data.get('player_name', '')
                })
        
        response.broadcast['picture_revealed'] = {
            'picture_id': picture_id,
            'correct_answer': correct_answer,
            'team_guesses': team_guesses
        }
        
        # Clear answers
        self._state['answers'] = {}
        
        return response

    def handle_show_picture(self, data, context: EventContext) -> EventResponse:
        picture_id = data.get('picture_id')
        image_url = data.get('image_url')
        hint = data.get('hint', '')
        
        response = EventResponse()
        response.broadcast['show_picture'] = {
            'picture_id': picture_id,
            'image_url': image_url,
            'hint': hint
        }
        return response

    def get_sanitized_state_data(self) -> dict:
        state = self._state.copy()
        if 'answers' in state:
            del state['answers']
        return state
