from ..base_game import BaseGame, EventResponse, EventContext

class TriviaGame(BaseGame):
    GAME_ID = "TRIVIA"
    GAME_NAME = "Trivia"
    
    EVENTS = {
        'submit_answer': 'handle_submit_answer',
        'answer_typing': 'handle_answer_typing'
    }
    ADMIN_EVENTS = {
        'grade_answer': 'handle_grade_answer',
        'reveal_answer': 'handle_reveal_answer'
    }

    def on_enter(self, state_data):
        self._state = {
            'question_id': state_data.get('question_id'),
            'answers': {}  # team_id -> {answer_text, player_id, player_name, question_id}
        }
        return EventResponse()
    
    def on_exit(self):
        return EventResponse()

    def handle_submit_answer(self, data, context: EventContext) -> EventResponse:
        team_id = context.team_id or data.get('team_id')
        question_id = data.get('question_id')
        answer_text = data.get('answer_text', '')
        
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
            'answer_text': answer_text,
            'question_id': question_id,
            'player_id': context.player_id,
            'player_name': context.player_name
        }
        
        # Notify admin
        response.to_admin['answer_received'] = {
            'team_id': team_id,
            'team_name': team['name'],
            'player_id': context.player_id,
            'player_name': context.player_name,
            'answer_text': answer_text,
            'question_id': question_id
        }
        
        # Notify team
        if team_id not in response.to_specific_team:
            response.to_specific_team[team_id] = {}
        response.to_specific_team[team_id]['answer_submitted'] = {
            'player_id': context.player_id,
            'player_name': context.player_name,
            'answer_text': answer_text
        }
        
        # Broadcast submission count
        response.broadcast['submission_status'] = {
            'submitted_count': len(self._state['answers']),
            'total_teams': len(self.session_manager.teams)
        }
        
        return response

    def handle_answer_typing(self, data, context: EventContext) -> EventResponse:
        response = EventResponse()
        text = data.get('text', '')
        
        if context.team_id:
             response.to_team_others['answer_sync'] = {
                'text': text,
                'from_player_id': context.player_id,
                'from_player_name': context.player_name
             }
        return response

    def handle_grade_answer(self, data, context: EventContext) -> EventResponse:
        team_id = data.get('team_id')
        correct = data.get('correct', False)
        points = data.get('points', 0)
        
        response = EventResponse()
        
        # Notify team of result
        if team_id not in response.to_specific_team:
            response.to_specific_team[team_id] = {}
        response.to_specific_team[team_id]['answer_result'] = {
            'correct': correct,
            'points_awarded': points if correct else 0
        }
        
        if correct and points:
            self.session_manager.add_points(team_id, points, 'Trivia correct answer')
            response.broadcast['score_update'] = {
                'scores': self.session_manager.get_scores(),
                'teams': self.session_manager.get_teams_info()
            }
            
        return response

    def handle_reveal_answer(self, data, context: EventContext) -> EventResponse:
        question_id = data.get('question_id')
        correct_answer = data.get('correct_answer', '')
        
        response = EventResponse()
        
        # Collect answers
        team_answers = []
        for tid, ans_data in self._state['answers'].items():
            team = self.session_manager.get_team(tid)
            if team:
                team_answers.append({
                    'team_id': tid,
                    'team_name': team['name'],
                    'answer_text': ans_data.get('answer_text', ''),
                    'player_name': ans_data.get('player_name', '')
                })
        
        response.broadcast['answer_revealed'] = {
            'question_id': question_id,
            'correct_answer': correct_answer,
            'team_answers': team_answers
        }
        
        # Clear answers
        self._state['answers'] = {}
        
        return response

    def get_sanitized_state_data(self) -> dict:
        state = self._state.copy()
        if 'answers' in state:
            del state['answers']
        return state
