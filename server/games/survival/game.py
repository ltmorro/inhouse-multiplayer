"""Survival Mode - Majority alignment point game.

Players vote individually on binary questions. Teams earn points if a majority
of their members align with the overall game majority.
"""

from ..base_game import BaseGame, EventResponse, EventContext


class SurvivalGame(BaseGame):
    GAME_ID = "SURVIVAL"
    GAME_NAME = "Survival Mode"

    EVENTS = {
        'survival_vote': 'handle_vote',
    }
    ADMIN_EVENTS = {
        'survival_reveal': 'handle_reveal',
        'survival_reset_round': 'handle_reset_round',
    }

    POINTS_FOR_MAJORITY = 100  # Points awarded to teams that align with majority

    def on_enter(self, state_data):
        self._state = {
            'round_id': state_data.get('round_id'),
            'question_text': state_data.get('question_text', ''),
            'option_a': state_data.get('option_a', 'YES'),
            'option_b': state_data.get('option_b', 'NO'),
            'player_votes': {},  # player_id -> 'A' or 'B'
            'revealed': False,
        }
        return EventResponse()

    def on_exit(self):
        return EventResponse()

    def handle_vote(self, data, context: EventContext) -> EventResponse:
        """Handle an individual player's vote submission."""
        player_id = context.player_id
        team_id = context.team_id or data.get('team_id')
        vote = data.get('vote')  # 'A' or 'B'

        response = EventResponse()

        if not player_id:
            response.error = {'code': 'NO_PLAYER', 'message': 'Player required'}
            return response

        if not team_id:
            response.error = {'code': 'NO_TEAM', 'message': 'Team required'}
            return response

        if vote not in ('A', 'B'):
            response.error = {'code': 'INVALID_VOTE', 'message': 'Vote must be A or B'}
            return response

        team = self.session_manager.get_team(team_id)
        if not team:
            response.error = {'code': 'INVALID_TEAM', 'message': 'Team not found'}
            return response

        # Store individual player vote
        self._state['player_votes'][player_id] = vote

        # Count total votes
        vote_counts = self._get_vote_counts()

        # Count how many from this team have voted
        team_vote_count = self._get_team_vote_count(team_id)

        # Notify admin of vote
        response.to_admin['survival_vote_received'] = {
            'team_id': team_id,
            'team_name': team['name'],
            'player_id': player_id,
            'player_name': context.player_name,
            'vote': vote,
            'vote_counts': vote_counts,
            'total_players_voted': len(self._state['player_votes']),
        }

        # Confirm to the individual player
        response.to_sender['survival_vote_confirmed'] = {
            'vote': vote,
        }

        # Broadcast updated vote counts (anonymized)
        response.broadcast['survival_vote_update'] = {
            'vote_counts': vote_counts,
            'total_votes': len(self._state['player_votes']),
        }

        return response

    def handle_reveal(self, data, context: EventContext) -> EventResponse:
        """Reveal the majority and award points to teams that aligned."""
        response = EventResponse()

        player_votes = self._state['player_votes']
        if not player_votes:
            response.error = {'code': 'NO_VOTES', 'message': 'No votes to reveal'}
            return response

        # Count overall votes
        vote_counts = self._get_vote_counts()
        count_a = vote_counts['A']
        count_b = vote_counts['B']

        # Determine game-wide majority
        if count_a > count_b:
            game_majority = 'A'
        elif count_b > count_a:
            game_majority = 'B'
        else:
            # Tie - no points awarded
            game_majority = None

        # Calculate team results
        teams_awarded = []
        teams_not_awarded = []

        for team_id, team in self.session_manager.teams.items():
            team_votes = self._get_team_votes(team_id)
            if not team_votes:
                # Team didn't vote at all
                teams_not_awarded.append({
                    'team_id': team_id,
                    'team_name': team['name'],
                    'team_majority': None,
                    'votes_a': 0,
                    'votes_b': 0,
                    'reason': 'no_votes',
                })
                continue

            # Count team's votes
            team_a = sum(1 for v in team_votes.values() if v == 'A')
            team_b = sum(1 for v in team_votes.values() if v == 'B')

            # Determine team's majority vote
            if team_a > team_b:
                team_majority = 'A'
            elif team_b > team_a:
                team_majority = 'B'
            else:
                team_majority = None  # Tie within team

            team_info = {
                'team_id': team_id,
                'team_name': team['name'],
                'team_majority': team_majority,
                'votes_a': team_a,
                'votes_b': team_b,
            }

            # Check if team majority aligns with game majority
            if game_majority and team_majority == game_majority:
                # Award points
                self.session_manager.add_points(team_id, self.POINTS_FOR_MAJORITY, 'Survival majority alignment')
                team_info['points_awarded'] = self.POINTS_FOR_MAJORITY
                teams_awarded.append(team_info)
            else:
                team_info['points_awarded'] = 0
                if not game_majority:
                    team_info['reason'] = 'game_tie'
                elif not team_majority:
                    team_info['reason'] = 'team_tie'
                else:
                    team_info['reason'] = 'minority'
                teams_not_awarded.append(team_info)

        # Mark as revealed
        self._state['revealed'] = True

        # Broadcast results
        response.broadcast['survival_reveal'] = {
            'game_majority': game_majority,
            'vote_counts': vote_counts,
            'teams_awarded': teams_awarded,
            'teams_not_awarded': teams_not_awarded,
            'points_value': self.POINTS_FOR_MAJORITY,
            'is_tie': game_majority is None,
        }

        # Notify admin
        response.to_admin['survival_round_complete'] = {
            'game_majority': game_majority,
            'vote_counts': vote_counts,
            'teams_awarded': [t['team_id'] for t in teams_awarded],
            'teams_not_awarded': [t['team_id'] for t in teams_not_awarded],
        }

        return response

    def handle_reset_round(self, data, context: EventContext) -> EventResponse:
        """Reset for a new round (clear votes)."""
        response = EventResponse()

        # Clear votes for new round
        self._state['player_votes'] = {}
        self._state['revealed'] = False

        # Update question if provided
        if data.get('question_text'):
            self._state['question_text'] = data['question_text']
        if data.get('option_a'):
            self._state['option_a'] = data['option_a']
        if data.get('option_b'):
            self._state['option_b'] = data['option_b']
        if data.get('round_id'):
            self._state['round_id'] = data['round_id']

        response.broadcast['survival_round_reset'] = {
            'round_id': self._state['round_id'],
            'question_text': self._state['question_text'],
            'option_a': self._state['option_a'],
            'option_b': self._state['option_b'],
        }

        return response

    def _get_vote_counts(self) -> dict:
        """Get current vote counts across all players."""
        count_a = sum(1 for v in self._state['player_votes'].values() if v == 'A')
        count_b = sum(1 for v in self._state['player_votes'].values() if v == 'B')
        return {'A': count_a, 'B': count_b}

    def _get_team_vote_count(self, team_id: str) -> int:
        """Get count of players from a team who have voted."""
        team = self.session_manager.get_team(team_id)
        if not team:
            return 0
        team_player_ids = set(team.get('players', {}).keys())
        return sum(1 for pid in self._state['player_votes'] if pid in team_player_ids)

    def _get_team_votes(self, team_id: str) -> dict:
        """Get all votes from players on a specific team."""
        team = self.session_manager.get_team(team_id)
        if not team:
            return {}
        team_player_ids = set(team.get('players', {}).keys())
        return {pid: vote for pid, vote in self._state['player_votes'].items() if pid in team_player_ids}

    def get_sanitized_state_data(self) -> dict:
        """Return state data safe for clients."""
        return {
            'round_id': self._state.get('round_id'),
            'question_text': self._state.get('question_text'),
            'option_a': self._state.get('option_a'),
            'option_b': self._state.get('option_b'),
            'total_votes': len(self._state.get('player_votes', {})),
        }
