from ..base_game import BaseGame, EventResponse, EventContext

class PriceGuessGame(BaseGame):
    GAME_ID = "PRICEGUESS"
    GAME_NAME = "Price Guess"

    EVENTS = {
        'submit_price_guess': 'handle_submit_guess',
        'price_guess_typing': 'handle_guess_typing'
    }
    ADMIN_EVENTS = {
        'reveal_price': 'handle_reveal_price',
        'show_price_product': 'handle_show_product'
    }

    def on_enter(self, state_data):
        self._state = {
            'product_id': state_data.get('product_id'),
            'image_url': state_data.get('image_url'),
            'hint': state_data.get('hint'),
            'actual_price': state_data.get('actual_price'),
            'guesses': {}  # team_id -> {guess_amount, player_id, player_name, product_id}
        }
        return EventResponse()

    def on_exit(self):
        return EventResponse()

    def handle_submit_guess(self, data, context: EventContext) -> EventResponse:
        team_id = context.team_id or data.get('team_id')
        product_id = data.get('product_id')
        guess_amount = data.get('guess_amount')

        response = EventResponse()

        if not team_id:
            response.error = {'code': 'NO_TEAM', 'message': 'Team required'}
            return response

        team = self.session_manager.get_team(team_id)
        if not team:
            response.error = {'code': 'INVALID_TEAM', 'message': 'Team not found'}
            return response

        # Parse and validate amount
        try:
            guess_amount = float(guess_amount)
            if guess_amount < 0:
                response.error = {'code': 'INVALID_AMOUNT', 'message': 'Price must be positive'}
                return response
        except (TypeError, ValueError):
            response.error = {'code': 'INVALID_AMOUNT', 'message': 'Invalid price format'}
            return response

        # Store guess
        self._state['guesses'][team_id] = {
            'guess_amount': guess_amount,
            'product_id': product_id,
            'player_id': context.player_id,
            'player_name': context.player_name
        }

        # Notify admin
        response.to_admin['price_guess_received'] = {
            'team_id': team_id,
            'team_name': team['name'],
            'player_id': context.player_id,
            'player_name': context.player_name,
            'guess_amount': guess_amount,
            'product_id': product_id
        }

        # Notify team
        if team_id not in response.to_specific_team:
            response.to_specific_team[team_id] = {}
        response.to_specific_team[team_id]['price_guess_submitted'] = {
            'player_id': context.player_id,
            'player_name': context.player_name,
            'guess_amount': guess_amount
        }

        # Broadcast submission count
        response.broadcast['submission_status'] = {
            'submitted_count': len(self._state['guesses']),
            'total_teams': len(self.session_manager.teams)
        }

        return response

    def handle_guess_typing(self, data, context: EventContext) -> EventResponse:
        response = EventResponse()
        text = data.get('text', '')

        if context.team_id:
            response.to_team_others['price_guess_sync'] = {
                'text': text,
                'from_player_id': context.player_id,
                'from_player_name': context.player_name
            }
        return response

    def handle_reveal_price(self, data, context: EventContext) -> EventResponse:
        product_id = data.get('product_id')
        actual_price = data.get('actual_price')

        # Tiered points: 1st=100, 2nd=50, 3rd=25, 4th=10
        point_tiers = [100, 50, 25, 10]

        response = EventResponse()

        try:
            actual_price = float(actual_price)
        except (TypeError, ValueError):
            response.error = {'code': 'INVALID_PRICE', 'message': 'Invalid actual price'}
            return response

        # Determine rankings - closest without going over
        valid_guesses = []
        bust_guesses = []

        for tid, guess_data in self._state['guesses'].items():
            team = self.session_manager.get_team(tid)
            if not team:
                continue

            guess_amount = guess_data.get('guess_amount', 0)
            guess_info = {
                'team_id': tid,
                'team_name': team['name'],
                'guess_amount': guess_amount,
                'player_name': guess_data.get('player_name', '')
            }

            if guess_amount > actual_price:
                guess_info['status'] = 'bust'
                guess_info['points_awarded'] = 0
                bust_guesses.append(guess_info)
            else:
                guess_info['status'] = 'valid'
                guess_info['difference'] = actual_price - guess_amount
                valid_guesses.append(guess_info)

        # Sort valid guesses by closeness (smallest difference first)
        valid_guesses.sort(key=lambda x: x['difference'])

        # Award tiered points to top 4 valid guesses
        winner_team_id = None
        total_points_awarded = 0
        for i, guess in enumerate(valid_guesses):
            if i < len(point_tiers):
                points = point_tiers[i]
                guess['points_awarded'] = points
                guess['rank'] = i + 1
                self.session_manager.add_points(guess['team_id'], points, f'Price guess #{i+1}')
                total_points_awarded += points
                if i == 0:
                    guess['status'] = 'winner'
                    winner_team_id = guess['team_id']
            else:
                guess['points_awarded'] = 0
                guess['rank'] = i + 1

        # Sort bust guesses by how much over
        bust_guesses.sort(key=lambda x: x['guess_amount'])

        # Combine all guesses sorted by amount (lowest to highest)
        all_guesses = sorted(
            valid_guesses + bust_guesses,
            key=lambda x: x['guess_amount']
        )

        response.broadcast['price_revealed'] = {
            'product_id': product_id,
            'actual_price': actual_price,
            'winner_team_id': winner_team_id,
            'team_guesses': all_guesses,
            'points_awarded': total_points_awarded
        }

        # Send score update if any points were awarded
        if total_points_awarded > 0:
            response.broadcast['score_update'] = {
                'scores': self.session_manager.get_scores(),
                'teams': self.session_manager.get_teams_info()
            }

        # Clear guesses for next round
        self._state['guesses'] = {}

        return response

    def handle_show_product(self, data, context: EventContext) -> EventResponse:
        product_id = data.get('product_id')
        image_url = data.get('image_url')
        hint = data.get('hint', '')

        response = EventResponse()
        response.broadcast['show_price_product'] = {
            'product_id': product_id,
            'image_url': image_url,
            'hint': hint
        }
        return response

    def get_sanitized_state_data(self) -> dict:
        state = self._state.copy()
        if 'guesses' in state:
            del state['guesses']
        if 'actual_price' in state:
            del state['actual_price']
        return state
