# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Y2K System Failure Protocol - A real-time multiplayer party game server for NYE 2025. Players connect via mobile devices, compete in teams, and interact with a TV display. Uses Flask + Flask-SocketIO for real-time WebSocket communication.

## Development Commands

```bash
# Install dependencies
uv sync

# Run the development server (exposes on 0.0.0.0:13370 for local network access)
uv run python app.py

# Add new dependencies
uv add <package-name>
```

The server runs on port 13370 with three main views:
- `/` or `/mobile` - Player mobile controller
- `/tv` - Main TV display
- `/admin` - Host control dashboard (password: `y2k2025`)

## Architecture

### Core Files
- `app.py` - Flask app, HTTP routes, Spotify OAuth integration
- `game_manager.py` - Game state machine, team/player management, score persistence
- `events.py` - Socket.IO event handlers implementing the events contract

### Game State Machine
The game uses a state machine defined in `GameState` enum:
`LOBBY → MACGYVER → TRIVIA → TIMER → BUZZER → TIMELINE → MINESWEEPER → VICTORY`

Each state corresponds to a different game protocol/minigame.

### Real-Time Communication
Socket.IO events follow the contract in `docs/events_spec.md`. Key patterns:
- Client → Server: `snake_case` verbs (`submit_answer`, `press_buzzer`)
- Server → Client: `snake_case` nouns (`state_change`, `buzzer_locked`)
- Teams use room-based messaging (`team:{team_id}`)
- Admin uses the `admin` room

### Persistence
Game state persists to `data/scores.json` for crash recovery. Teams survive server restarts.