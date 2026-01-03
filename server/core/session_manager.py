"""
SessionManager: Core team, player, and session management.

This is the 'Console' component that all game cartridges share.
Handles team registration, player management, scoring, and persistence.
"""

import json
import uuid
import random
import time
import logging
from pathlib import Path
from typing import Optional, Dict, List, Any

logger = logging.getLogger(__name__)


def generate_join_code(length: int = 4) -> str:
    """Generate a random alphanumeric join code (uppercase, no confusing chars)."""
    # Exclude confusing characters: 0/O, 1/I/L
    chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
    return ''.join(random.choice(chars) for _ in range(length))


class SessionManager:
    """
    Central session and team manager.

    Handles:
    - Team creation and management
    - Player registration and sessions
    - Scoring and persistence
    - Crash recovery

    This is game-agnostic - contains no game-specific logic.
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

        # Core state (no game-specific state)
        self.teams: Dict[str, dict] = {}
        self.sessions: Dict[str, dict] = {}  # session_id -> {team_id, player_id}
        self.join_codes: Dict[str, str] = {}  # join_code -> team_id
        
        self.current_state: str = "LOBBY"
        self.state_data: Dict[str, Any] = {}

        # Load persisted data on startup
        self._load_scores()

        logger.info(f"SessionManager initialized. Loaded {len(self.teams)} teams.")

    def _load_scores(self) -> None:
        """Load persisted game data from JSON file (Crash Recovery)."""
        if not self.scores_file.exists():
            logger.info("No scores.json found, starting fresh.")
            return

        try:
            with open(self.scores_file, 'r') as f:
                data = json.load(f)

            self.teams = data.get('teams', {})
            self.sessions = data.get('sessions', {})
            self.current_state = data.get('current_state', 'LOBBY')
            self.state_data = data.get('state_data', {})

            # Rebuild join_codes lookup from teams
            self.join_codes = {}
            for team_id, team_data in self.teams.items():
                if 'join_code' in team_data:
                    self.join_codes[team_data['join_code']] = team_id

            logger.info(f"Loaded session state: {len(self.teams)} teams, State: {self.current_state}")
        except (json.JSONDecodeError, IOError) as e:
            logger.error(f"Failed to load scores.json: {e}")

    def _save_scores(self) -> None:
        """Persist game data to JSON file (Crash Protection)."""
        self.data_dir.mkdir(parents=True, exist_ok=True)

        data = {
            'teams': self.teams,
            'sessions': self.sessions,
            'current_state': self.current_state,
            'state_data': self.state_data
        }

        try:
            with open(self.scores_file, 'w') as f:
                json.dump(data, f, indent=2)
            logger.debug("Session state saved to scores.json")
        except IOError as e:
            logger.error(f"Failed to save scores.json: {e}")

    def set_state(self, new_state: str, state_data: dict = None) -> None:
        """Update current game state."""
        self.current_state = new_state
        self.state_data = state_data or {}
        self._save_scores()

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

    def _get_players_list(self, team_id: str) -> List[dict]:
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

    def reset_game(self, preserve_teams: bool = False) -> None:
        """
        Reset the game.

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

        self._save_scores()

        logger.info(f"Game reset. preserve_teams={preserve_teams}")

    def get_scores(self) -> Dict[str, int]:
        """Get current scores for all teams."""
        return {
            tid: team['score']
            for tid, team in self.teams.items()
        }

    def get_teams_info(self) -> Dict[str, dict]:
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
        self._save_scores()
        logger.debug(f"Team {team_id} avatar set to: {avatar_id}")
        return True

    def toggle_elimination(self, team_id: str, eliminated: bool) -> bool:
        """Toggle team's elimination status."""
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

    def get_sync_state(self, team_id: str, player_id: str = None) -> dict:
        """
        Get team/player state for reconnection sync.

        Note: Does not include game state - that comes from EventRouter.
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
            'scores': self.get_scores(),
        }
