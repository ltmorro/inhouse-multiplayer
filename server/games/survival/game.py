"""Survival Mode - Majority vote elimination game.

Teams vote on binary questions. The minority group is eliminated.
Last team standing wins.
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
        'survival_revive_all': 'handle_revive_all',
    }

    def on_enter(self, state_data):
        # Ensure eliminated_teams is always a set
        eliminated = state_data.get('eliminated_teams', [])
        if not isinstance(eliminated, set):
            eliminated = set(eliminated)

        self._state = {
            'round_id': state_data.get('round_id'),
            'question_text': state_data.get('question_text', ''),
            'option_a': state_data.get('option_a', 'YES'),
            'option_b': state_data.get('option_b', 'NO'),
            'votes': {},  # team_id -> 'A' or 'B'
            'eliminated_teams': eliminated,
            'revealed': False,
        }
        return EventResponse()

    def on_exit(self):
        return EventResponse()

    def handle_vote(self, data, context: EventContext) -> EventResponse:
        """Handle a team's vote submission."""
        team_id = context.team_id or data.get('team_id')
        vote = data.get('vote')  # 'A' or 'B'

        response = EventResponse()

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

        # Check if team is eliminated
        if team_id in self._state.get('eliminated_teams', set()):
            response.error = {'code': 'ELIMINATED', 'message': 'Team is eliminated'}
            return response

        # Store vote
        self._state['votes'][team_id] = vote

        # Count votes
        vote_counts = self._get_vote_counts()

        # Notify admin of vote
        response.to_admin['survival_vote_received'] = {
            'team_id': team_id,
            'team_name': team['name'],
            'player_id': context.player_id,
            'player_name': context.player_name,
            'vote': vote,
            'vote_counts': vote_counts,
        }

        # Notify the voting team
        if team_id not in response.to_specific_team:
            response.to_specific_team[team_id] = {}
        response.to_specific_team[team_id]['survival_vote_confirmed'] = {
            'vote': vote,
        }

        # Broadcast updated vote counts (anonymized)
        response.broadcast['survival_vote_update'] = {
            'vote_counts': vote_counts,
            'total_votes': len(self._state['votes']),
            'total_alive': self._get_alive_count(),
        }

        return response

    def handle_reveal(self, data, context: EventContext) -> EventResponse:
        """Reveal the majority and eliminate the minority."""
        response = EventResponse()

        votes = self._state['votes']
        if not votes:
            response.error = {'code': 'NO_VOTES', 'message': 'No votes to reveal'}
            return response

        # Count votes
        vote_counts = self._get_vote_counts()
        count_a = vote_counts['A']
        count_b = vote_counts['B']

        # Determine majority/minority
        if count_a > count_b:
            majority = 'A'
            minority = 'B'
        elif count_b > count_a:
            majority = 'B'
            minority = 'A'
        else:
            # Tie - randomly pick (or keep everyone alive)
            # For now, no elimination on ties
            majority = None
            minority = None

        # Eliminate minority teams
        newly_eliminated = []
        if minority:
            for team_id, vote in votes.items():
                if vote == minority:
                    self._state['eliminated_teams'].add(team_id)
                    newly_eliminated.append(team_id)

        # Build team lists for display
        majority_teams = []
        minority_teams = []
        for team_id, vote in votes.items():
            team = self.session_manager.get_team(team_id)
            if team:
                team_info = {
                    'team_id': team_id,
                    'team_name': team['name'],
                    'vote': vote,
                }
                if vote == majority:
                    majority_teams.append(team_info)
                else:
                    minority_teams.append(team_info)

        # Mark as revealed
        self._state['revealed'] = True

        # Broadcast results
        response.broadcast['survival_reveal'] = {
            'majority': majority,
            'minority': minority,
            'vote_counts': vote_counts,
            'majority_teams': majority_teams,
            'minority_teams': minority_teams,
            'newly_eliminated': newly_eliminated,
            'remaining_count': self._get_alive_count(),
            'is_tie': majority is None,
        }

        # Send elimination notice to eliminated teams
        for team_id in newly_eliminated:
            if team_id not in response.to_specific_team:
                response.to_specific_team[team_id] = {}
            response.to_specific_team[team_id]['survival_eliminated'] = {
                'reason': 'minority',
            }

        # Notify admin
        response.to_admin['survival_round_complete'] = {
            'majority': majority,
            'minority': minority,
            'vote_counts': vote_counts,
            'newly_eliminated': newly_eliminated,
            'remaining_count': self._get_alive_count(),
        }

        return response

    def handle_reset_round(self, data, context: EventContext) -> EventResponse:
        """Reset for a new round (clear votes, keep eliminations)."""
        response = EventResponse()

        # Clear votes but keep eliminated teams
        self._state['votes'] = {}
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
            'eliminated_teams': list(self._state['eliminated_teams']),
            'remaining_count': self._get_alive_count(),
        }

        return response

    def handle_revive_all(self, data, context: EventContext) -> EventResponse:
        """Revive all eliminated teams."""
        response = EventResponse()

        self._state['eliminated_teams'] = set()
        self._state['votes'] = {}
        self._state['revealed'] = False

        response.broadcast['survival_revive_all'] = {
            'remaining_count': self._get_alive_count(),
        }

        return response

    def _get_vote_counts(self) -> dict:
        """Get current vote counts."""
        count_a = sum(1 for v in self._state['votes'].values() if v == 'A')
        count_b = sum(1 for v in self._state['votes'].values() if v == 'B')
        return {'A': count_a, 'B': count_b}

    def _get_alive_count(self) -> int:
        """Get count of teams still alive."""
        all_teams = set(self.session_manager.teams.keys())
        eliminated = self._state.get('eliminated_teams', set())
        # Ensure eliminated is a set (might be a list from state_data)
        if not isinstance(eliminated, set):
            eliminated = set(eliminated)
        return len(all_teams - eliminated)

    def get_sanitized_state_data(self) -> dict:
        """Return state data safe for clients."""
        return {
            'round_id': self._state.get('round_id'),
            'question_text': self._state.get('question_text'),
            'option_a': self._state.get('option_a'),
            'option_b': self._state.get('option_b'),
            'eliminated_teams': list(self._state.get('eliminated_teams', set())),
            'remaining_count': self._get_alive_count(),
        }
