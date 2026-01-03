This is a classic robust "Hub and Spoke" real-time architecture. To achieve maximum concurrency, we must decouple the **State Machine (Backend)** from the **Presentation Layer (Frontend)**.

The single biggest bottleneck in this specific design is the **Socket.IO Event Registry**. If developers guess event names (e.g., `emit('buzz')` vs `emit('buzzer_pressed')`), integration will fail.

Therefore, we will utilize a **Contract-First Approach**. We define the API surface area *first*, allowing the Backend Engineer and Frontend Engineer to work completely independently using mocks.

Here is the decomposition of your ARD into 5 Parallel Work Packages.

### **System Module Breakdown**

1. **Core Kernel:** `GameManager` (State, Persistence, Recovery).
2. **Comms Layer:** Socket.IO Event Handlers (The Router).
3. **Controller UI:** Mobile View (Input-heavy).
4. **Display UI:** TV View (Read-only, Visual-heavy).
5. **Orchestrator:** Admin Dashboard (Control panel).

---

### **WP0: The Interface Contract (Blocking Dependency)** ✅ COMPLETE

*This package must be completed by the Lead Architect before WP1 and WP2 begin. It defines the "language" the system speaks.*

**Objective:** Define the JSON schema for all Socket.IO events to ensure independent development.
**Deliverable:** An `events_spec.md` document containing exact event names and payloads.

* **Contract Definition (Example):**
* `Client -> Server`: `submit_answer { team_id: "A", text: "Matrix" }`
* `Server -> Client`: `state_change { current_view: "TRIVIA", question: "Who is..." }`


* **Milestone:** All 6 Protocols have defined `emit` and `on` signatures.

**Implementation Notes:**
- Created `docs/events_spec.md` with complete Socket.IO event specifications
- Defined all 10 protocol sections with exact JSON payloads
- Includes error handling schema and state machine reference

---

### **WP1: The Backend Core (Kernel & State)** ✅ COMPLETE

*Owner: Backend Engineer*
*Concurrency: Parallel with WP2 & WP3*

**Objective:** Build the `GameManager` class and persistence layer. This module does not require a working UI; it can be tested via Unit Tests or Postman.

**Prerequisites:**

* WP0 (Interface Contract)
* Python Environment (Flask/SocketIO)

**Tasks:**

1. **State Logic:** Implement `GameManager` class.
* *Attribute:* `self.teams` (Dictionary).
* *Attribute:* `self.current_state` (Enum).


2. **Persistence Engine:** Implement `save_scores()` and `load_scores()`.
* *Trigger:* Write to `scores.json` on any point change.
* *Startup:* Read `scores.json` on `__init__`.


3. **Connection Handlers (`events.py`):**
* Implement `on_connect`: Check `request.sid` or IP against `self.teams`. If match found -> Emit `sync_state` (The "Refresh Fix").
* Implement `on_disconnect`: Log it, but do *not* delete the team from the dict.


4. **Admin Logic:** Implement endpoints for `add_points`, `set_state`, and `reset_game`.

**Key Milestone:**

* Server restarts, loads previous JSON data, and retains team scores.
* "Hard Refresh" simulation passes (simulated client reconnects and receives correct state immediately).

**Implementation Notes:**
- `game_manager.py`: Full `GameManager` class with `GameState` enum, team registry, score persistence
- `events.py`: All Socket.IO event handlers including registration, state sync, admin controls
- `app.py`: Flask app with Socket.IO integration, routes for `/`, `/mobile`, `/tv`, `/admin`, `/health`
- Persistence: Auto-saves to `data/scores.json` on any score change
- Session tracking via `sid_to_team` mapping for reconnection handling

---

### **WP2: The Presentation Framework (Frontend Foundation)** ✅ COMPLETE

*Owner: Frontend Designer/Engineer*
*Concurrency: Parallel with WP1*

**Objective:** Create the visual container, assets, and routing logic without needing real backend logic.

**Prerequisites:**

* WP0 (Interface Contract)
* Design Assets (Fonts, CRT effects)

**Tasks:**

1. **Global Styles:** Implement `terminal.css`.
* *Specs:* Green (#00FF00) on Black. Scanline overlays. Monospace font.


2. **View Manager (`client.js` & `tv.js`):**
* Create a JS switch statement that listens for `state_change`.
* Logic: `if state == 'TRIVIA' { hideAll(); show('#trivia-view'); }`


3. **Wake Lock:** Implement `NoSleep.js` or video loop hack in `_layout.html`.
4. **Mocking:** Hardcode a "Mock Mode" switch in JS.
* *Mock:* When enabled, `client.js` simulates incoming socket events to test UI transitions without a running server.



**Key Milestone:**

* Opening `mobile.html` works offline.
* Clicking a "Test View" button successfully cycles through the HTML templates (Lobby -> Trivia -> Buzzer).
* Screen does not dim after 5 minutes.

**Implementation Notes:**
- `static/css/terminal.css`: Full CRT terminal styling with:
  - Scanline overlays via CSS `repeating-linear-gradient`
  - CRT flicker animation
  - Vignette screen curvature effect
  - Buzzer button states (active/locked-self/locked-other)
  - Timer display with warning/critical color transitions
  - Timeline sortable list styling
- `templates/_layout.html`: Base template with Wake Lock (native API + video loop fallback)
- `templates/mobile.html`: Mobile controller with views for all 8 game states + eliminated/kicked
- `templates/tv.html`: TV display with matching views and scoreboard displays
- `static/js/client.js`: Mobile View Manager with `CONFIG.MOCK_MODE` toggle and test controls
- `static/js/tv.js`: TV View Manager with mock mode and test data
- `static/js/admin.js`: Admin dashboard controller (basic implementation)

**To Test Mock Mode:**
Set `CONFIG.MOCK_MODE = true` in `client.js` or `tv.js`, then open pages without server. Test buttons appear to cycle through views.

---

### **WP3: Active Game Implementations (Complex Logic)**

*Owner: Full Stack (or Split FE/BE)*
*Concurrency: Requires WP1 & WP2 baseline*

**Objective:** Implement the three complex interactive protocols: Trivia, Audio (Buzzer), and Timeline (Sorting).

**Tasks (Protocol 2: Trivia):**

* **BE:** Implement `handle_answer_submission`. Store answers in a temp dict. Implement `grade_answer` (Admin trigger).
* **FE:** Input field with `disabled` state toggle on submit.

**Tasks (Protocol 4: Audio/Buzzer):**

* **BE:** **Race Condition Handling.**
* Variable `self.buzzer_locked_by = None`.
* Logic: `if self.buzzer_locked_by is None: self.buzzer_locked_by = team_id; emit('lock_all')`.

* **BE:** **Spotify Embed Support.**
* Store Spotify track URIs in `questions.json` (e.g., `"spotify_uri": "spotify:track:4iV5W9uYEdYUVa79Axb7Rh"`).
* Emit track URI to TV display via `play_audio { spotify_uri: "...", start_ms: 0, duration_ms: 30000 }`.

* **FE (TV):** **Spotify Embed Player.**
* Embed Spotify IFrame Player: `<iframe src="https://open.spotify.com/embed/track/{track_id}" ...>`.
* Use Spotify Embed API to control playback (play/pause on admin command).
* Hide album art / track title initially for guessing games; reveal on `reveal_answer` event.

* **FE (Mobile):** Big Button UI. States: Active (Green), Locked-by-self (Blue), Locked-by-other (Red).

**Tasks (Protocol 5: Timeline):**

* **FE:** Integrate `SortableJS`. Disable native touch scrolling on list items (`touch-action: none`).
* **BE:** Validation Logic. Compare `user_index_array` vs `correct_index_array`.

**Key Milestone:**

* Two phones connected simultaneously. Phone A hits buzzer; Phone B instantly turns Red (Locked).
* Timeline drag-and-drop array transmits correct index order to server.

---

### **WP4: Passive Game Implementations (Simple State)**

*Owner: Junior Dev / Content Manager*
*Concurrency: Can be done anytime after WP1*

**Objective:** Implement "MacGyver," "Tin Foil Hat," and "Minesweeper." These are low-logic, high-admin-control modes.

**Tasks:**

1. **Timer Logic (Tin Foil Hat):**
* **FE:** JS Timer that takes a duration from the server `start_timer` event.
* **Visual:** CSS animation (Green -> Red gradient).


2. **Minesweeper View:**
* **BE:** `toggle_elimination(team_id)`.
* **FE:** CSS class `.eliminated` (Red strikethrough).


3. **Content Entry:** Populate `questions.json` with the actual trivia/puzzles.

**Key Milestone:**

* Admin can toggle a team to "Dead" and their specific phone updates to "DELETED" screen.

---

### **WP5: Integration & Load Testing**

*Owner: Lead Architect*
*Concurrency: Final Phase*

**Objective:** Stress test the "Hub" capabilities.

**Tasks:**

1. **Network Config:** Set up `host='0.0.0.0'`. Test discovery across mixed devices (iPhone/Android).
2. **Concurrency Test:** Connect 4-6 devices. Spam the Buzzer button simultaneously. Ensure only *one* `locked` event fires.
3. **Crash Test:** Unplug the server mid-game. Restart. Ensure scores remain.
4. **Audio Balance:** Test TV volume vs. background party noise.

**Key Milestone:**

* System runs for 30 minutes without crashing.
* QR Code on TV successfully links a new phone to the Lobby.

---

### **Visualizing the Architecture**

To ensure your team understands the critical separation between the "State" (WP1) and the "View" (WP2), here is the data flow.
```
┌─────────────────────────────────────────────────────────────────┐
│                        SERVER (Flask)                           │
│  ┌─────────────────┐     ┌─────────────────────────────────┐   │
│  │  GameManager    │◄───►│  Socket.IO Event Handlers       │   │
│  │  (game_manager) │     │  (events.py)                    │   │
│  └────────┬────────┘     └──────────────┬──────────────────┘   │
│           │                              │                      │
│           ▼                              │                      │
│  ┌─────────────────┐                     │                      │
│  │  scores.json    │                     │                      │
│  │  (persistence)  │                     │                      │
│  └─────────────────┘                     │                      │
└──────────────────────────────────────────┼──────────────────────┘
                                           │
              ┌────────────────────────────┼────────────────────────────┐
              │                            │                            │
              ▼                            ▼                            ▼
    ┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
    │   Mobile View   │          │    TV View      │          │   Admin View    │
    │   (client.js)   │          │    (tv.js)      │          │   (admin.js)    │
    │   mobile.html   │          │    tv.html      │          │   admin.html    │
    └─────────────────┘          └─────────────────┘          └─────────────────┘
```

---

### **Progress Summary**

| Work Package | Status | Key Files |
|--------------|--------|-----------|
| WP0: Interface Contract | ✅ Complete | `docs/events_spec.md` |
| WP1: Backend Core | ✅ Complete | `game_manager.py`, `events.py`, `app.py` |
| WP2: Presentation Framework | ✅ Complete | `terminal.css`, `client.js`, `tv.js`, templates |
| WP3: Active Game Logic | 🔲 Pending | Trivia, Buzzer, Timeline protocols |
| WP4: Passive Game Logic | 🔲 Pending | Timer, Minesweeper, content entry |
| WP5: Integration Testing | 🔲 Pending | Load testing, network config |

---

### **Next Steps**

1. **WP3: Active Game Implementations** - Wire up the complex interactive protocols:
   - Trivia: Connect answer submission to backend grading
   - Buzzer: Verify race condition handling with multiple devices
   - Timeline: Integrate SortableJS submission with backend validation

2. **WP4: Passive Game Implementations** - Complete simple state games:
   - Timer: Connect admin controls for start/pause/reset
   - Minesweeper: Wire elimination toggle to frontend
   - Content: Populate `questions.json` with actual game content

3. **WP5: Integration Testing** - Final validation:
   - Multi-device concurrency testing
   - Server crash recovery testing
   - QR code generation for easy mobile joining