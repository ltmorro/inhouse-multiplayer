# Socket.IO Events Specification

**Version:** 1.0
**Status:** WP0 Interface Contract
**Purpose:** Define the exact event names and JSON payloads for all Socket.IO communication.

---

## Table of Contents

1. [Connection & Session Events](#1-connection--session-events)
2. [Global State Events](#2-global-state-events)
3. [Scoreboard Events](#3-scoreboard-events)
4. [Protocol 1: MacGyver (Manual Scoring)](#4-protocol-1-macgyver)
5. [Protocol 2: Google is Down (Trivia)](#5-protocol-2-trivia)
6. [Protocol 3: Tin Foil Hat (Timer)](#6-protocol-3-timer)
7. [Protocol 4: Corrupted Audio (Buzzer)](#7-protocol-4-buzzer)
8. [Protocol 5: Timeline Restoration (Puzzle)](#8-protocol-5-timeline)
9. [Protocol 6: Minesweeper (Elimination)](#9-protocol-6-minesweeper)
10. [Admin Control Events](#10-admin-control-events)

---

## Event Naming Conventions

- **Client -> Server:** `snake_case` verbs (e.g., `submit_answer`, `press_buzzer`)
- **Server -> Client:** `snake_case` nouns/states (e.g., `state_change`, `buzzer_locked`)
- **Broadcast:** Events sent to all connected clients
- **Targeted:** Events sent to specific client(s) via `room` or `sid`

---

## 1. Connection & Session Events

### `connect` (Built-in)
**Direction:** Client -> Server (automatic)
**Trigger:** Browser establishes WebSocket connection
**Server Action:** Check if `session_id` exists in team registry

---

### `register_team`
**Direction:** Client -> Server
**Trigger:** Player submits team name on join screen

```json
{
  "team_name": "string (1-20 chars)"
}
```

**Server Response:** `registration_result`

---

### `registration_result`
**Direction:** Server -> Client (targeted)
**Trigger:** Response to `register_team`

```json
{
  "success": true,
  "team_id": "string (UUID)",
  "team_name": "string",
  "message": "string (error message if success=false)"
}
```

---

### `sync_state`
**Direction:** Server -> Client (targeted)
**Trigger:** On reconnection of existing session (The "Refresh Fix")

```json
{
  "team_id": "string",
  "team_name": "string",
  "current_state": "string (enum)",
  "scores": { "team_id": 100 },
  "state_data": {}
}
```

---

### `disconnect` (Built-in)
**Direction:** Client -> Server (automatic)
**Trigger:** Browser closes or loses connection
**Server Action:** Log event. DO NOT remove team from registry.

---

## 2. Global State Events

### `state_change`
**Direction:** Server -> All Clients (broadcast)
**Trigger:** Admin changes game phase

```json
{
  "current_state": "LOBBY | MACGYVER | TRIVIA | TIMER | BUZZER | TIMELINE | MINESWEEPER | VICTORY",
  "state_data": {}
}
```

**State-Specific `state_data` Payloads:**

| State | `state_data` Schema |
|-------|---------------------|
| `LOBBY` | `{}` |
| `MACGYVER` | `{ "message": "string" }` |
| `TRIVIA` | `{ "question_id": "int", "question_text": "string" }` |
| `TIMER` | `{ "duration_seconds": 180, "message": "string" }` |
| `BUZZER` | `{ "round_id": "int", "audio_hint": "string" }` |
| `TIMELINE` | `{ "puzzle_id": "int", "items": ["string", "string", ...] }` |
| `MINESWEEPER` | `{ "message": "string" }` |
| `VICTORY` | `{ "winner_team_id": "string", "final_scores": {} }` |

---

## 3. Scoreboard Events

### `score_update`
**Direction:** Server -> All Clients (broadcast)
**Trigger:** Any point change

```json
{
  "scores": {
    "team_id_1": 150,
    "team_id_2": 200
  },
  "teams": {
    "team_id_1": { "name": "Team Alpha", "status": "active" },
    "team_id_2": { "name": "Team Beta", "status": "active" }
  }
}
```

---

## 4. Protocol 1: MacGyver

*Low-logic manual scoring mode. Minimal socket events.*

### `macgyver_winner`
**Direction:** Admin Client -> Server
**Trigger:** Admin selects winning team

```json
{
  "team_id": "string",
  "points": 100
}
```

**Server Action:** Add points, persist to JSON, broadcast `score_update`

---

## 5. Protocol 2: Trivia

### `submit_answer`
**Direction:** Client -> Server
**Trigger:** Player hits TRANSMIT button

```json
{
  "team_id": "string",
  "question_id": "int",
  "answer_text": "string"
}
```

**Server Action:** Store answer, emit `answer_received` to admin, update submission counter

---

### `answer_received`
**Direction:** Server -> Admin Client
**Trigger:** After `submit_answer` processed

```json
{
  "team_id": "string",
  "team_name": "string",
  "answer_text": "string",
  "question_id": "int"
}
```

---

### `submission_status`
**Direction:** Server -> All Clients (broadcast)
**Trigger:** After each answer submission

```json
{
  "submitted_count": 3,
  "total_teams": 4
}
```

---

### `answer_result`
**Direction:** Server -> Client (targeted)
**Trigger:** Admin grades answer

```json
{
  "correct": true,
  "points_awarded": 50
}
```

---

### `grade_answer`
**Direction:** Admin Client -> Server
**Trigger:** Admin accepts/rejects an answer

```json
{
  "team_id": "string",
  "question_id": "int",
  "correct": true,
  "points": 50
}
```

---

### `reveal_answer`
**Direction:** Admin Client -> Server
**Trigger:** Admin reveals correct answer on TV

```json
{
  "question_id": "int"
}
```

---

### `answer_revealed`
**Direction:** Server -> All Clients (broadcast)
**Trigger:** After `reveal_answer` processed

```json
{
  "question_id": "int",
  "correct_answer": "string"
}
```

---

## 6. Protocol 3: Timer

### `start_timer`
**Direction:** Admin Client -> Server
**Trigger:** Admin starts countdown

```json
{
  "duration_seconds": 180
}
```

---

### `timer_sync`
**Direction:** Server -> All Clients (broadcast)
**Trigger:** Timer state changes

```json
{
  "action": "start | pause | resume | reset | complete",
  "remaining_seconds": 180,
  "total_seconds": 180
}
```

---

### `pause_timer`
**Direction:** Admin Client -> Server

```json
{}
```

---

### `resume_timer`
**Direction:** Admin Client -> Server

```json
{}
```

---

### `reset_timer`
**Direction:** Admin Client -> Server

```json
{
  "duration_seconds": 180
}
```

---

### `timer_winner`
**Direction:** Admin Client -> Server
**Trigger:** Admin awards points after judging

```json
{
  "placements": [
    { "team_id": "string", "place": 1, "points": 100 },
    { "team_id": "string", "place": 2, "points": 75 },
    { "team_id": "string", "place": 3, "points": 50 }
  ]
}
```

---

## 7. Protocol 4: Buzzer

### `press_buzzer`
**Direction:** Client -> Server
**Trigger:** Player taps big button

```json
{
  "team_id": "string",
  "timestamp": 1703980800000
}
```

**Server Logic:**
1. Check if `buzzer_locked_by` is `null`
2. If null: Set `buzzer_locked_by = team_id`, emit `buzzer_locked`
3. If not null: Ignore (race condition protection)

---

### `buzzer_locked`
**Direction:** Server -> All Clients (broadcast)
**Trigger:** First valid buzz received

```json
{
  "locked_by_team_id": "string",
  "locked_by_team_name": "string"
}
```

**Client UI Response:**
- Buzzing team: Blue "TRANSMITTING..."
- Other teams: Red "LOCKED"
- TV: Display team name

---

### `buzzer_reset`
**Direction:** Server -> All Clients (broadcast)
**Trigger:** Admin resets after correct/incorrect answer

```json
{
  "previous_team_id": "string",
  "result": "correct | incorrect"
}
```

**Client UI Response:** All buzzers return to Green "EXECUTE"

---

### `judge_buzzer`
**Direction:** Admin Client -> Server
**Trigger:** Admin marks answer correct or incorrect

```json
{
  "team_id": "string",
  "correct": true,
  "points": 75
}
```

**Server Action:**
- If correct: Award points, reset buzzer, optionally move to next round
- If incorrect: Reset buzzer (team can buzz again, or lockout logic)

---

### `buzzer_lockout`
**Direction:** Server -> Client (targeted)
**Trigger:** Team answered incorrectly (optional lockout mode)

```json
{
  "locked_until_reset": true
}
```

---

## 8. Protocol 5: Timeline

### `submit_timeline`
**Direction:** Client -> Server
**Trigger:** Player submits sorted order

```json
{
  "team_id": "string",
  "puzzle_id": "int",
  "order": [2, 0, 3, 1]
}
```

**Note:** `order` is array of original indices in user's sorted position

---

### `timeline_result`
**Direction:** Server -> Client (targeted)
**Trigger:** After `submit_timeline` validated

```json
{
  "correct": false,
  "attempt_number": 2,
  "message": "INDEX ERROR"
}
```

**Correct Response:**
```json
{
  "correct": true,
  "points_awarded": 100,
  "finish_position": 1,
  "message": "TIMELINE RESTORED"
}
```

---

### `timeline_status`
**Direction:** Server -> All Clients (broadcast)
**Trigger:** After each submission attempt

```json
{
  "team_statuses": {
    "team_id_1": "thinking",
    "team_id_2": "failed",
    "team_id_3": "winner"
  }
}
```

**Status Values:** `thinking | failed | winner`

---

### `timeline_complete`
**Direction:** Server -> All Clients (broadcast)
**Trigger:** Winner found or admin ends round

```json
{
  "winner_team_id": "string",
  "correct_order": [0, 1, 2, 3],
  "correct_labels": ["Event A", "Event B", "Event C", "Event D"]
}
```

---

## 9. Protocol 6: Minesweeper

### `toggle_elimination`
**Direction:** Admin Client -> Server
**Trigger:** Admin toggles team's elimination status

```json
{
  "team_id": "string",
  "eliminated": true
}
```

---

### `elimination_update`
**Direction:** Server -> All Clients (broadcast)
**Trigger:** After elimination state changes

```json
{
  "team_id": "string",
  "team_name": "string",
  "eliminated": true,
  "remaining_teams": 3
}
```

---

### `eliminated`
**Direction:** Server -> Client (targeted)
**Trigger:** Team is eliminated

```json
{
  "message": "SYSTEM DELETED"
}
```

---

### `minesweeper_complete`
**Direction:** Server -> All Clients (broadcast)
**Trigger:** One team remains

```json
{
  "survivor_team_id": "string",
  "survivor_team_name": "string",
  "points_awarded": 150
}
```

---

## 10. Admin Control Events

### `admin_auth`
**Direction:** Admin Client -> Server
**Trigger:** Admin enters password

```json
{
  "password": "string"
}
```

---

### `admin_auth_result`
**Direction:** Server -> Admin Client

```json
{
  "success": true,
  "message": "string"
}
```

---

### `set_state`
**Direction:** Admin Client -> Server
**Trigger:** Admin changes game phase

```json
{
  "new_state": "LOBBY | MACGYVER | TRIVIA | TIMER | BUZZER | TIMELINE | MINESWEEPER | VICTORY",
  "state_data": {}
}
```

---

### `add_points`
**Direction:** Admin Client -> Server
**Trigger:** Manual point adjustment

```json
{
  "team_id": "string",
  "points": 50,
  "reason": "string (optional)"
}
```

---

### `reset_game`
**Direction:** Admin Client -> Server
**Trigger:** Full game reset

```json
{
  "confirm": true,
  "preserve_teams": false
}
```

---

### `kick_team`
**Direction:** Admin Client -> Server
**Trigger:** Remove a team from the game

```json
{
  "team_id": "string"
}
```

---

### `team_kicked`
**Direction:** Server -> Client (targeted)
**Trigger:** After team removed

```json
{
  "message": "TERMINATED BY ADMINISTRATOR"
}
```

---

## State Machine Reference

```
LOBBY
  ├── MACGYVER
  ├── TRIVIA
  ├── TIMER
  ├── BUZZER
  ├── TIMELINE
  ├── MINESWEEPER
  └── VICTORY

Any state can transition to any other state via admin control.
Recommended flow: LOBBY -> [Protocol 1-6 in order] -> VICTORY
```

---

## Error Handling

All error responses follow this schema:

### `error`
**Direction:** Server -> Client (targeted)

```json
{
  "code": "INVALID_TEAM | INVALID_STATE | DUPLICATE_SUBMISSION | UNAUTHORIZED",
  "message": "Human-readable error description"
}
```

---

## Implementation Notes

1. **Session Management:** Use Flask session or Socket.IO `sid` to track clients
2. **Race Conditions:** Buzzer logic MUST use server-side locking
3. **Persistence:** Write to `scores.json` on every `score_update`
4. **Reconnection:** Always emit `sync_state` on connection if team exists
5. **Timestamps:** All timestamps in milliseconds since epoch (UTC)
6. **IDs:** Team IDs should be UUID v4, not sequential integers