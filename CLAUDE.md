# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A real-time multiplayer party game server. Players connect via mobile devices, compete in teams, and interact with a TV display. Uses Flask + Flask-SocketIO for real-time WebSocket communication with an Astro-built frontend.

**Prerequisites:** Node.js v18+, Python v3.10+, uv (Python package manager)

## Development Commands

```bash
# Frontend: Install dependencies & build
npm install && npm run build

# Backend: Install dependencies
uv sync

# Run the server (exposes on 0.0.0.0:13370 for local network access)
uv run python app.py

# Type check frontend
npm run check

# Add Python dependencies
uv add <package-name>
```

**Note:** `npm run dev` runs Astro's dev server but won't connect to Flask's Socket.IO. For full integration testing, rebuild frontend (`npm run build`) and run `uv run python app.py`.

The server runs on port 13370 with three main views:
- `/` or `/mobile` - Player mobile controller
- `/tv` - Main TV display
- `/admin` - Host control dashboard (password: `y2k2025`)

## Architecture

### Backend: Console/Cartridge Pattern

The backend uses a "Console/Cartridge" architecture where the platform (Console) handles infrastructure while games (Cartridges) are pluggable modules.

**Core Platform (`server/core/`):**
- `session_manager.py` - Team/player management, score persistence, crash recovery
- `event_router.py` - Routes Socket.IO events to the active game, handles state transitions

**Game Cartridges (`server/games/`):**
- Each game lives in its own directory (e.g., `server/games/trivia/game.py`)
- All games inherit from `BaseGame` (`server/games/base_game.py`)
- Games define `EVENTS` and `ADMIN_EVENTS` dicts mapping event names to handler methods
- `on_enter()` and `on_exit()` lifecycle methods for state transitions
- `EventResponse` dataclass for declarative event emission (broadcast, to_sender, to_team, etc.)

**Platform Events (`events.py`):**
- Connection/reconnection handling
- Team creation/joining
- Admin authentication
- Delegates game-specific events to `EventRouter`

### Adding a New Game

**Backend:**
1. Create `server/games/<game_name>/game.py` with a class extending `BaseGame`
2. Set `GAME_ID` (matches state name) and `GAME_NAME`
3. Define `EVENTS`/`ADMIN_EVENTS` dicts mapping event names to handler method names
4. Implement handlers with signature: `def handle_foo(self, data: Dict, context: EventContext) -> EventResponse`
5. Add to `ALL_GAMES` list in `server/games/__init__.py`

**Frontend:**
1. Create view components: `src/components/mobile/<Game>View.astro`, `src/components/tv/<Game>View.astro`, `src/components/admin/<Game>Controls.astro`
2. Add state handling in `public/js/client.js`, `public/js/tv.js`, `public/js/admin.js`

### Frontend: Astro + Vanilla JS

- `src/pages/` - Entry pages (mobile.astro, tv.astro, admin.astro)
- `src/components/` - Astro components organized by view (mobile/, tv/, admin/, shared/)
- `public/js/client.js` - Mobile controller logic, Socket.IO connection
- `public/js/tv.js` - TV display logic
- Frontend builds to `dist/` which Flask serves as static files

### Styling: "Winter Storybook" Theme

The design uses a fairy tale / ethereal aesthetic with frost, moonlight, and soft glows.

**CSS Architecture (`src/styles/`):**
- `shared.css` - Design tokens (CSS variables), base styles, utility classes, animations
- `frost.css` - Aurora + glassmorphism system (`.frost-bg`, `.frost-card`, `.frost-btn`) used by mobile and TV
- `mobile.css` - Mobile client styles (deep night sky gradient, starfield, action card layout)
- `tv.css` - TV display styles (cinematic stage layout, large typography for 55"+ screens)
- `admin.css` - Admin dashboard styles

**Design Tokens (defined in `shared.css` `:root`):**
- Colors: `--void-*` (dark backgrounds), `--ice-*` (blue glows), `--gold-*` (warm accents), `--fairy-*` (purple magic)
- Fonts: `--font-story` (Cormorant Garamond serif), `--font-whimsy` (Quicksand sans)
- Effects: `--glass-*` (glassmorphism), `--glow-*` (light effects), `--shadow-*` (depth)

**Key Patterns:**
- Glassmorphism: `backdrop-filter: blur()` with semi-transparent backgrounds
- Breathing animations: `breathe`, `float-gentle`, `glow-pulse` for "living" UI
- Frost components: `.frost-card`, `.frost-btn`, `.frost-input` (modern glass style)
- Storybook components: `.storybook-page`, `.floating-card`, `.glass-panel`
- Utility classes: `.flex-center`, `.gap-3`, `.text-lg`, `.animate-float`

### Real-Time Communication

Socket.IO events follow the contract in `docs/events_spec.md`. Key patterns:
- Client -> Server: `snake_case` verbs (`submit_answer`, `press_buzzer`)
- Server -> Client: `snake_case` nouns (`state_change`, `buzzer_locked`)
- Teams use room-based messaging (`team:{team_id}`)
- Admin uses the `admin` room

### Persistence

Game state persists to `data/scores.json` for crash recovery. Teams survive server restarts.