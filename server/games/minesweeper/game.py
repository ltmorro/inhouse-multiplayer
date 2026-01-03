from ..base_game import BaseGame, EventResponse, EventContext

class MinesweeperGame(BaseGame):
    GAME_ID = "MINESWEEPER"
    GAME_NAME = "Minesweeper"
    
    EVENTS = {
        'toggle_elimination': 'handle_toggle_elimination'
    }

    def on_enter(self, state_data):
        self._state = state_data
        return EventResponse()
    
    def on_exit(self):
        return EventResponse()

    def handle_toggle_elimination(self, data, context: EventContext) -> EventResponse:
        team_id = data.get('team_id')
        eliminated = data.get('eliminated', True)
        
        response = EventResponse()
        
        team = self.session_manager.get_team(team_id)
        if not team:
            response.error = {'code': 'INVALID_TEAM', 'message': 'Team not found'}
            return response
            
        if self.session_manager.toggle_elimination(team_id, eliminated):
            # Broadcast to all
            response.broadcast['elimination_update'] = {
                'team_id': team_id,
                'team_name': team['name'],
                'eliminated': eliminated,
                'remaining_teams': self.session_manager.get_remaining_teams()
            }
            
            # Notify team
            if eliminated:
                if team_id not in response.to_specific_team:
                    response.to_specific_team[team_id] = {}
                response.to_specific_team[team_id]['eliminated'] = {'message': 'SYSTEM DELETED'}
                
        return response
