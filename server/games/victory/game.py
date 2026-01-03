from ..base_game import BaseGame, EventResponse

class VictoryGame(BaseGame):
    GAME_ID = "VICTORY"
    GAME_NAME = "Victory"
    
    def on_enter(self, state_data):
        self._state = state_data
        return EventResponse()
    
    def on_exit(self):
        return EventResponse()
