from ..base_game import BaseGame, EventResponse

class LobbyGame(BaseGame):
    GAME_ID = "LOBBY"
    GAME_NAME = "Lobby"
    
    def on_enter(self, state_data):
        self._state = state_data
        return EventResponse()
    
    def on_exit(self):
        return EventResponse()
