"""
GameManager: Core state machine and persistence layer for Y2K Party Game.
Handles team registration, game state, scoring, and crash recovery.
"""

import json
import os
import uuid
import random
import string
import time
import logging
from enum import Enum
from typing import Optional
from pathlib import Path

logger = logging.getLogger(__name__)


class GameState(Enum):
    """All possible game states matching the events_spec."""
    LOBBY = "LOBBY"
    MACGYVER = "MACGYVER"
    TRIVIA = "TRIVIA"
    TIMER = "TIMER"
    BUZZER = "BUZZER"
    TIMELINE = "TIMELINE"
    MINESWEEPER = "MINESWEEPER"
    PICTUREGUESS = "PICTUREGUESS"
    VICTORY = "VICTORY"


def generate_join_code(length: int = 4) -> str:
    """Generate a random alphanumeric join code (uppercase, no confusing chars)."""
    # Exclude confusing characters: 0/O, 1/I/L
    chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
    return ''.join(random.choice(chars) for _ in range(length))


class GameManager:
    """
    Central game state manager.

    Attributes:
        teams: Dictionary of team_id -> team data (includes players dict)
        current_state: Current game phase
        state_data: Additional data for current state
        buzzer_locked_by: Dict with team_id, player_id, player_name (or None)
        join_codes: Dictionary of join_code -> team_id for quick lookup
    """

    # Y2K-themed color palette for teams (matches CSS variables)
    TEAM_COLORS = [
        {'id': 1, 'name': 'Coral', 'hex': '#FF6B6B'},
        {'id': 2, 'name': 'Teal', 'hex': '#4ECDC4'},
        {'id': 3, 'name': 'Yellow', 'hex': '#FFE66D'},
        {'id': 4, 'name': 'Mint', 'hex': '#95E1D3'},
        {'id': 5, 'name': 'Plum', 'hex': '#DDA0DD'},
        {'id': 6, 'name': 'Sky', 'hex': '#87CEEB'},
        {'id': 7, 'name': 'Sand', 'hex': '#F4A460'},
        {'id': 8, 'name': 'Seafoam', 'hex': '#98D8C8'},
    ]

    def __init__(self, data_dir: str = "data"):
        self.data_dir = Path(data_dir)
        self.scores_file = self.data_dir / "scores.json"

        # Core state
        self.teams: dict = {}
        self.current_state: GameState = GameState.LOBBY
        self.state_data: dict = {}

        # Join code lookup: maps join_code -> team_id
        self.join_codes: dict = {}

        # Session tracking: maps session_id -> {team_id, player_id}
        self.sessions: dict = {}

        # Buzzer state for Protocol 4
        self.buzzer_locked_by: Optional[str] = None
        self.buzzer_frozen_teams: dict = {}  # team_id -> freeze_expires_at (timestamp)

        # Trivia state for Protocol 2
        self.current_answers: dict = {}  # team_id -> answer_text
        self.current_question_id: Optional[int] = None

        # Timeline state for Protocol 5
        self.timeline_winners: list = []
        self.timeline_correct_order: list = []  # Correct order indices
        self.timeline_statuses: dict = {}  # team_id -> 'thinking' | 'failed' | 'winner'
        self.timeline_submissions: dict = {}  # team_id -> {order, player_id, player_name, timestamp}

        # Timer state
        self.timer_total_seconds: int = 0
        self.timer_remaining_seconds: int = 0
        self.timer_start_time: float = 0
        self.timer_paused: bool = False
        self.timer_message: str = ''

        # Load persisted data on startup
        self._load_scores()

        logger.info(f"GameManager initialized. Loaded {len(self.teams)} teams.")

    def _load_scores(self) -> None:
        """Load persisted game data from JSON file (Crash Recovery)."""
        if not self.scores_file.exists():
            logger.info("No scores.json found, starting fresh.")
            return

        try:
            with open(self.scores_file, 'r') as f:
                data = json.load(f)

            self.teams = data.get('teams', {})
            state_str = data.get('current_state', 'LOBBY')
            try:
                self.current_state = GameState(state_str)
            except ValueError:
                self.current_state = GameState.LOBBY
            self.state_data = data.get('state_data', {})
            self.sessions = data.get('sessions', {})

            # Rebuild join_codes lookup from teams
            self.join_codes = {}
            for team_id, team_data in self.teams.items():
                if 'join_code' in team_data:
                    self.join_codes[team_data['join_code']] = team_id

            logger.info(f"Loaded game state: {self.current_state.value}, {len(self.teams)} teams")
        except (json.JSONDecodeError, IOError) as e:
            logger.error(f"Failed to load scores.json: {e}")

    def _save_scores(self) -> None:
        """Persist game data to JSON file (Crash Protection)."""
        self.data_dir.mkdir(parents=True, exist_ok=True)

        data = {
            'teams': self.teams,
            'current_state': self.current_state.value,
            'state_data': self.state_data,
            'sessions': self.sessions
        }

        try:
            with open(self.scores_file, 'w') as f:
                json.dump(data, f, indent=2)
            logger.debug("Game state saved to scores.json")
        except IOError as e:
            logger.error(f"Failed to save scores.json: {e}")

    def create_team(self, team_name: str, player_name: str, session_id: str) -> dict:
        """
        Create a new team with the first player.

        Returns:
            dict with success, team_id, player_id, team_name, join_code
        """
        # Validate team name
        team_name = team_name.strip()
        if not team_name or len(team_name) > 20:
            return {
                'success': False,
                'message': 'Team name must be 1-20 characters'
            }

        # Validate player name
        player_name = player_name.strip()
        if not player_name or len(player_name) > 20:
            return {
                'success': False,
                'message': 'Player name must be 1-20 characters'
            }

        # Check if session already has a team
        if session_id in self.sessions:
            session_data = self.sessions[session_id]
            existing_team_id = session_data.get('team_id') if isinstance(session_data, dict) else session_data
            if existing_team_id in self.teams:
                team = self.teams[existing_team_id]
                player_id = session_data.get('player_id') if isinstance(session_data, dict) else None
                return {
                    'success': True,
                    'team_id': existing_team_id,
                    'player_id': player_id,
                    'team_name': team['name'],
                    'player_name': team['players'].get(player_id, {}).get('name', '') if player_id else '',
                    'join_code': team.get('join_code', ''),
                    'players': self._get_players_list(existing_team_id),
                    'message': 'Reconnected to existing team'
                }

        # Check for duplicate team name
        for tid, team_data in self.teams.items():
            if team_data['name'].lower() == team_name.lower():
                return {
                    'success': False,
                    'message': 'Team name already taken'
                }

        # Generate unique join code
        join_code = generate_join_code()
        while join_code in self.join_codes:
            join_code = generate_join_code()

        # Create new team
        team_id = str(uuid.uuid4())
        player_id = str(uuid.uuid4())
        team_color = self._assign_team_color()

        self.teams[team_id] = {
            'name': team_name,
            'score': 0,
            'status': 'active',
            'eliminated': False,
            'join_code': join_code,
            'color': team_color,
            'players': {
                player_id: {
                    'name': player_name,
                    'joined_at': time.time()
                }
            }
        }
        self.join_codes[join_code] = team_id
        self.sessions[session_id] = {
            'team_id': team_id,
            'player_id': player_id
        }

        self._save_scores()

        logger.info(f"Team created: {team_name} ({team_id}) by {player_name}, code: {join_code}")

        return {
            'success': True,
            'team_id': team_id,
            'player_id': player_id,
            'team_name': team_name,
            'player_name': player_name,
            'join_code': join_code,
            'color': team_color,
            'players': self._get_players_list(team_id),
            'message': 'Team created successfully'
        }

    def join_team(self, join_code: str, player_name: str, session_id: str) -> dict:
        """
        Join an existing team via join code.

        Returns:
            dict with success, team_id, player_id, team_name, players list
        """
        # Validate player name
        player_name = player_name.strip()
        if not player_name or len(player_name) > 20:
            return {
                'success': False,
                'message': 'Player name must be 1-20 characters'
            }

        # Normalize join code
        join_code = join_code.strip().upper()

        # Check if session already has a team
        if session_id in self.sessions:
            session_data = self.sessions[session_id]
            existing_team_id = session_data.get('team_id') if isinstance(session_data, dict) else session_data
            if existing_team_id in self.teams:
                team = self.teams[existing_team_id]
                player_id = session_data.get('player_id') if isinstance(session_data, dict) else None
                return {
                    'success': True,
                    'team_id': existing_team_id,
                    'player_id': player_id,
                    'team_name': team['name'],
                    'player_name': team['players'].get(player_id, {}).get('name', '') if player_id else '',
                    'join_code': team.get('join_code', ''),
                    'players': self._get_players_list(existing_team_id),
                    'message': 'Reconnected to existing team'
                }

        # Find team by join code
        if join_code not in self.join_codes:
            return {
                'success': False,
                'message': 'Invalid join code'
            }

        team_id = self.join_codes[join_code]
        team = self.teams[team_id]

        # Check if player name already exists on this team
        for pid, pdata in team['players'].items():
            if pdata['name'].lower() == player_name.lower():
                return {
                    'success': False,
                    'message': 'Player name already taken on this team'
                }

        # Add player to team
        player_id = str(uuid.uuid4())
        team['players'][player_id] = {
            'name': player_name,
            'joined_at': time.time()
        }
        self.sessions[session_id] = {
            'team_id': team_id,
            'player_id': player_id
        }

        self._save_scores()

        logger.info(f"Player {player_name} joined team {team['name']} ({team_id})")

        return {
            'success': True,
            'team_id': team_id,
            'player_id': player_id,
            'team_name': team['name'],
            'player_name': player_name,
            'join_code': join_code,
            'color': team.get('color', 1),
            'players': self._get_players_list(team_id),
            'message': f"Joined team {team['name']}"
        }

    def _get_players_list(self, team_id: str) -> list:
        """Get list of players for a team."""
        team = self.teams.get(team_id)
        if not team or 'players' not in team:
            return []
        return [
            {'player_id': pid, 'name': pdata['name']}
            for pid, pdata in team['players'].items()
        ]

    def get_team_for_session(self, session_id: str) -> Optional[dict]:
        """
        Get session data for a session.

        Returns:
            dict with team_id, player_id or None if not found
        """
        session_data = self.sessions.get(session_id)
        if session_data is None:
            return None
        # Handle legacy format (just team_id string)
        if isinstance(session_data, str):
            return {'team_id': session_data, 'player_id': None}
        return session_data

    def reassociate_session(self, session_id: str, team_id: str, player_id: str) -> bool:
        """
        Reassociate a new session ID with an existing player.
        Used when a player refreshes the page and gets a new Socket.IO session.

        Args:
            session_id: The new Socket.IO session ID
            team_id: The team ID to associate with
            player_id: The player ID to associate with

        Returns:
            True if successful, False if team/player doesn't exist
        """
        team = self.teams.get(team_id)
        if not team:
            return False

        if 'players' not in team or player_id not in team['players']:
            return False

        # Store the new session mapping
        self.sessions[session_id] = {
            'team_id': team_id,
            'player_id': player_id
        }

        self._save_scores()

        player_name = team['players'][player_id].get('name', 'Unknown')
        logger.info(f"Session reassociated: {session_id} -> {player_name} on {team['name']}")
        return True

    def get_player_info(self, team_id: str, player_id: str) -> Optional[dict]:
        """Get player info by team_id and player_id."""
        team = self.teams.get(team_id)
        if not team or 'players' not in team:
            return None
        player = team['players'].get(player_id)
        if not player:
            return None
        return {
            'player_id': player_id,
            'name': player['name']
        }

    def get_team(self, team_id: str) -> Optional[dict]:
        """Get team data by team_id."""
        return self.teams.get(team_id)

    def add_points(self, team_id: str, points: int, reason: str = "") -> bool:
        """
        Add points to a team's score.

        Returns:
            True if successful, False if team not found
        """
        if team_id not in self.teams:
            return False

        self.teams[team_id]['score'] += points
        self._save_scores()

        logger.info(f"Added {points} points to {self.teams[team_id]['name']}: {reason}")
        return True

    def set_state(self, new_state: str, state_data: dict = None) -> bool:
        """
        Change the current game state.

        Args:
            new_state: State string (must match GameState enum)
            state_data: Optional data for the new state

        Returns:
            True if successful, False if invalid state
        """
        try:
            self.current_state = GameState(new_state)
        except ValueError:
            logger.error(f"Invalid state: {new_state}")
            return False

        self.state_data = state_data or {}

        # Reset state-specific data when changing states
        if self.current_state == GameState.BUZZER:
            self.buzzer_locked_by = None
        elif self.current_state == GameState.TRIVIA:
            self.current_answers = {}
            self.current_question_id = state_data.get('question_id') if state_data else None
        elif self.current_state == GameState.PICTUREGUESS:
            # Picture guessing reuses the same answer submission system as trivia
            self.current_answers = {}
            self.current_question_id = state_data.get('picture_id') if state_data else None
        elif self.current_state == GameState.TIMELINE:
            self.timeline_winners = []
            self.timeline_submissions = {}  # Clear submissions for new puzzle
            self.timeline_statuses = {
                team_id: 'thinking'
                for team_id in self.teams.keys()
            }
            # Store correct order from state_data if provided
            if state_data and 'correct_order' in state_data:
                self.timeline_correct_order = state_data['correct_order']

        self._save_scores()

        logger.info(f"State changed to: {self.current_state.value}")
        return True

    def reset_game(self, preserve_teams: bool = False) -> None:
        """
        Reset the entire game.

        Args:
            preserve_teams: If True, keep teams but reset scores
        """
        if preserve_teams:
            for team_id in self.teams:
                self.teams[team_id]['score'] = 0
                self.teams[team_id]['status'] = 'active'
                self.teams[team_id]['eliminated'] = False
        else:
            self.teams = {}
            self.sessions = {}
            self.join_codes = {}

        self.current_state = GameState.LOBBY
        self.state_data = {}
        self.buzzer_locked_by = None
        self.current_answers = {}
        self.current_question_id = None
        self.timeline_winners = []

        self._save_scores()

        logger.info(f"Game reset. preserve_teams={preserve_teams}")

    def get_scores(self) -> dict:
        """Get current scores for all teams."""
        return {
            tid: team['score']
            for tid, team in self.teams.items()
        }

    def get_teams_info(self) -> dict:
        """Get team info for broadcasting."""
        return {
            tid: {
                'name': team['name'],
                'status': team['status'],
                'color': team.get('color', 1),
                'avatar': team.get('avatar', ''),
                'players': [p['name'] for p in team.get('players', {}).values()],
            }
            for tid, team in self.teams.items()
        }

    def _assign_team_color(self) -> int:
        """Assign a color to a new team (1-8), cycling through available colors."""
        used_colors = {team.get('color', 0) for team in self.teams.values()}
        for color in self.TEAM_COLORS:
            if color['id'] not in used_colors:
                return color['id']
        # All colors used, cycle back (use team count mod 8)
        return (len(self.teams) % 8) + 1

    def get_team_color(self, team_id: str) -> dict:
        """Get the color info for a team."""
        team = self.teams.get(team_id)
        if not team:
            return self.TEAM_COLORS[0]
        color_id = team.get('color', 1)
        for color in self.TEAM_COLORS:
            if color['id'] == color_id:
                return color
        return self.TEAM_COLORS[0]

    def get_sync_state(self, team_id: str, player_id: str = None) -> dict:
        """
        Get full state for a reconnecting client.
        This is the "Refresh Fix" - sends all state needed to restore client.
        """
        team = self.teams.get(team_id, {})
        player_name = ''
        if player_id and 'players' in team:
            player_data = team['players'].get(player_id, {})
            player_name = player_data.get('name', '')

        return {
            'team_id': team_id,
            'team_name': team.get('name', ''),
            'player_id': player_id,
            'player_name': player_name,
            'join_code': team.get('join_code', ''),
            'color': team.get('color', 1),
            'players': self._get_players_list(team_id),
            'current_state': self.current_state.value,
            'scores': self.get_scores(),
            'state_data': self.state_data
        }

    def kick_team(self, team_id: str) -> bool:
        """Remove a team from the game."""
        if team_id not in self.teams:
            return False

        team = self.teams[team_id]
        team_name = team['name']

        # Remove join code mapping
        if 'join_code' in team:
            self.join_codes.pop(team['join_code'], None)

        del self.teams[team_id]

        # Remove session mappings (handle both old and new format)
        self.sessions = {
            sid: sdata for sid, sdata in self.sessions.items()
            if (sdata.get('team_id') if isinstance(sdata, dict) else sdata) != team_id
        }

        self._save_scores()

        logger.info(f"Team kicked: {team_name}")
        return True

    def set_team_avatar(self, team_id: str, avatar_id: str) -> bool:
        """Set the avatar for a team."""
        if team_id not in self.teams:
            return False

        self.teams[team_id]['avatar'] = avatar_id
        logger.debug(f"Team {team_id} avatar set to: {avatar_id}")
        return True

    def toggle_elimination(self, team_id: str, eliminated: bool) -> bool:
        """Toggle team's elimination status for Minesweeper."""
        if team_id not in self.teams:
            return False

        self.teams[team_id]['eliminated'] = eliminated
        self.teams[team_id]['status'] = 'eliminated' if eliminated else 'active'

        self._save_scores()
        return True

    def get_remaining_teams(self) -> int:
        """Count non-eliminated teams."""
        return sum(
            1 for team in self.teams.values()
            if not team.get('eliminated', False)
        )

    def press_buzzer(self, team_id: str, player_id: str = None, player_name: str = None) -> Optional[dict]:
        """
        Handle buzzer press. Returns locking info dict if this press locked it,
        None if buzzer was already locked or team is frozen.
        """
        if self.buzzer_locked_by is not None:
            return None

        if team_id not in self.teams:
            return None

        # Check if team is frozen (penalty for wrong answer)
        if self.is_team_buzzer_frozen(team_id):
            return None

        team = self.teams[team_id]
        self.buzzer_locked_by = {
            'team_id': team_id,
            'team_name': team['name'],
            'player_id': player_id,
            'player_name': player_name or ''
        }
        return self.buzzer_locked_by

    def reset_buzzer(self) -> Optional[dict]:
        """Reset the buzzer. Returns the previous locker's info."""
        previous = self.buzzer_locked_by
        self.buzzer_locked_by = None
        return previous

    def freeze_team_buzzer(self, team_id: str, duration_seconds: int = 10) -> float:
        """
        Freeze a team's buzzer for a penalty period.

        Args:
            team_id: The team to freeze
            duration_seconds: How long the freeze lasts (default 10 seconds)

        Returns:
            The timestamp when the freeze expires
        """
        expires_at = time.time() + duration_seconds
        self.buzzer_frozen_teams[team_id] = expires_at
        team_name = self.teams.get(team_id, {}).get('name', 'Unknown')
        logger.info(f"Team {team_name} buzzer frozen for {duration_seconds} seconds")
        return expires_at

    def is_team_buzzer_frozen(self, team_id: str) -> bool:
        """
        Check if a team's buzzer is currently frozen.

        Returns:
            True if frozen, False if not frozen or freeze has expired
        """
        if team_id not in self.buzzer_frozen_teams:
            return False

        expires_at = self.buzzer_frozen_teams[team_id]
        if time.time() >= expires_at:
            # Freeze has expired, clean it up
            del self.buzzer_frozen_teams[team_id]
            return False

        return True

    def get_team_freeze_remaining(self, team_id: str) -> int:
        """
        Get remaining freeze time for a team in seconds.

        Returns:
            Seconds remaining, or 0 if not frozen
        """
        if team_id not in self.buzzer_frozen_teams:
            return 0

        expires_at = self.buzzer_frozen_teams[team_id]
        remaining = expires_at - time.time()
        if remaining <= 0:
            del self.buzzer_frozen_teams[team_id]
            return 0

        return int(remaining)

    def submit_answer(self, team_id: str, question_id: int, answer_text: str,
                       player_id: str = None, player_name: str = None) -> bool:
        """Store a trivia answer submission with player attribution."""
        if team_id not in self.teams:
            return False

        self.current_answers[team_id] = {
            'answer_text': answer_text,
            'question_id': question_id,
            'player_id': player_id,
            'player_name': player_name or ''
        }
        return True

    def get_submission_count(self) -> tuple:
        """Get (submitted_count, total_teams) for trivia."""
        return (len(self.current_answers), len(self.teams))

    def clear_answers(self) -> None:
        """Clear all stored answers for new question."""
        self.current_answers = {}

    # =========================================================================
    # TIMELINE METHODS (Protocol 5)
    # =========================================================================

    def start_timeline(self, correct_order: list) -> None:
        """
        Initialize a new timeline puzzle.

        Args:
            correct_order: List of indices representing the correct chronological order
        """
        self.timeline_correct_order = correct_order
        self.timeline_winners = []
        self.timeline_statuses = {
            team_id: 'thinking'
            for team_id in self.teams.keys()
        }
        logger.info(f"Timeline puzzle started. Correct order: {correct_order}")

    def submit_timeline(self, team_id: str, puzzle_id: int, submitted_order: list,
                         player_id: str = None, player_name: str = None) -> dict:
        """
        Validate a team's timeline submission.
        Only one submission per team is allowed - resubmissions overwrite the previous.

        Args:
            team_id: The submitting team's ID
            puzzle_id: The puzzle being answered
            submitted_order: Array of indices in the team's submitted order
            player_id: The submitting player's ID
            player_name: The submitting player's name

        Returns:
            dict with correct, points_awarded, finish_position, message
        """
        if team_id not in self.teams:
            return {
                'correct': False,
                'message': 'Team not found'
            }

        # Check if team already won
        if team_id in self.timeline_winners:
            return {
                'correct': True,
                'points_awarded': 0,
                'finish_position': self.timeline_winners.index(team_id) + 1,
                'message': 'Already submitted correct answer'
            }

        # Store/overwrite the submission for this team
        self.timeline_submissions[team_id] = {
            'order': submitted_order,
            'player_id': player_id,
            'player_name': player_name or '',
            'timestamp': time.time()
        }

        # Validate submission
        is_correct = submitted_order == self.timeline_correct_order

        if is_correct:
            # Add to winners list
            self.timeline_winners.append(team_id)
            finish_position = len(self.timeline_winners)

            # Award points based on finish position (100, 75, 50, 25...)
            points_table = [100, 75, 50, 25]
            points = points_table[min(finish_position - 1, len(points_table) - 1)]

            self.add_points(team_id, points, f'Timeline correct - position {finish_position}')
            self.timeline_statuses[team_id] = 'winner'

            logger.info(f"Team {team_id} solved timeline in position {finish_position}")

            return {
                'correct': True,
                'points_awarded': points,
                'finish_position': finish_position,
                'message': 'TIMELINE RESTORED'
            }
        else:
            # Mark as failed attempt (they can try again)
            self.timeline_statuses[team_id] = 'failed'

            return {
                'correct': False,
                'attempt_number': 1,  # Could track attempts per team
                'message': 'INDEX ERROR'
            }

    def get_timeline_statuses(self) -> dict:
        """Get current timeline statuses for all teams."""
        return self.timeline_statuses.copy()

    def get_timeline_submissions(self) -> list:
        """Get all timeline submissions for admin display."""
        submissions = []
        for team_id, submission in self.timeline_submissions.items():
            team = self.teams.get(team_id)
            if team:
                submissions.append({
                    'team_id': team_id,
                    'team_name': team['name'],
                    'order': submission['order'],
                    'player_id': submission.get('player_id'),
                    'player_name': submission.get('player_name', ''),
                    'timestamp': submission.get('timestamp', 0),
                    'status': self.timeline_statuses.get(team_id, 'thinking')
                })
        # Sort by timestamp (most recent first)
        submissions.sort(key=lambda x: x['timestamp'], reverse=True)
        return submissions

    def get_timeline_winner(self) -> Optional[str]:
        """Get the first place winner's team_id, if any."""
        return self.timeline_winners[0] if self.timeline_winners else None

    # =========================================================================
    # TIMER METHODS
    # =========================================================================

    def start_timer(self, duration_seconds: int, message: str = '') -> None:
        """Start a new timer with the given duration."""
        self.timer_total_seconds = duration_seconds
        self.timer_remaining_seconds = duration_seconds
        self.timer_start_time = time.time()
        self.timer_paused = False
        self.timer_message = message
        logger.info(f"Timer started: {duration_seconds} seconds - {message}")

    def pause_timer(self) -> int:
        """Pause the timer and return remaining seconds."""
        if not self.timer_paused:
            elapsed = time.time() - self.timer_start_time
            self.timer_remaining_seconds = max(0, self.timer_remaining_seconds - int(elapsed))
            self.timer_paused = True
            logger.info(f"Timer paused at {self.timer_remaining_seconds} seconds")
        return self.timer_remaining_seconds

    def resume_timer(self) -> int:
        """Resume a paused timer and return remaining seconds."""
        if self.timer_paused:
            self.timer_start_time = time.time()
            self.timer_paused = False
            logger.info(f"Timer resumed with {self.timer_remaining_seconds} seconds")
        return self.timer_remaining_seconds

    def reset_timer(self, duration_seconds: int = None) -> None:
        """Reset the timer to initial state."""
        if duration_seconds is not None:
            self.timer_total_seconds = duration_seconds
        self.timer_remaining_seconds = self.timer_total_seconds
        self.timer_start_time = 0
        self.timer_paused = False
        logger.info(f"Timer reset to {self.timer_total_seconds} seconds")

    def get_timer_total(self) -> int:
        """Get the total timer duration."""
        return self.timer_total_seconds

    def get_timer_remaining(self) -> int:
        """Get the current remaining time."""
        if self.timer_paused or self.timer_start_time == 0:
            return self.timer_remaining_seconds
        elapsed = time.time() - self.timer_start_time
        return max(0, self.timer_remaining_seconds - int(elapsed))