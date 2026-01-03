from ..base_game import BaseGame, EventResponse

class MacGyverGame(BaseGame):
    GAME_ID = "MACGYVER"
    GAME_NAME = "MacGyver"
    
    def on_enter(self, state_data):
        self._state = state_data
        return EventResponse()
    
    def on_exit(self):
        return EventResponse()
