# **ARD: Y2K SYSTEM FAILURE PROTOCOL**

**Version:** 4.0 (Final Hand-Off Specification) **Date:** December 30, 2025 **Target Audience:** Development Team

## **1\. Project Overview**

**Concept:** A local network party game hub for a NYE 2025 event. **The Vibe:** Defunct 90s tech, system errors, "The Matrix" meets "Windows 95." **Hardware Setup:**

* **Server/Display:** One laptop connected to a TV via HDMI. This is the "Main Screen."  
* **Clients:** Players’ smartphones on the same Wi-Fi network. These are the "Controllers."

## **2\. Global Architecture**

**Tech Stack:** Python (Flask), Socket.IO (Flask-SocketIO), HTML/CSS/JS (Vanilla).

### **Core Services (The "Game Manager")**

The `GameManager` class handles the global state. It requires these specific stability features to survive a live party environment:

1. **State Recovery (The "Refresh" Fix):**  
   * *Problem:* If a player refreshes their browser, they usually drop back to the Login screen.  
   * *Requirement:* On `socket.connect`, the server must check if the `session_id` or IP is already in the `teams` registry. If yes, immediately emit `sync_state` to send them back to the current active View.  
2. **Data Persistence (Crash Protection):**  
   * *Problem:* If the Python script crashes, scores are lost.  
   * *Requirement:* Every time points are updated, write the `teams` dictionary to a local `scores.json` file. Load this file on server startup.  
3. **Client Wake Lock:**  
   * *Requirement:* All mobile templates must include a script (like `NoSleep.js` or a looped hidden video) to prevent phones from auto-locking during gameplay.

---

## **3\. Game Protocols (Detailed Specifications)**

### **Protocol 1: The MacGyver Protocol**

**Concept:** A physical relay race using "junk" items to solve a problem. **The Rules (Human Logic):**

1. Host presents a physical "Junk Pile" (paper clips, gum, rubber bands, etc.) and a sealed bottle (or similar object).  
2. Each team selects one "Engineer."  
3. On "GO," Engineers run to the pile, grab ONE item, and try to open the bottle.  
4. If they fail, they tag a teammate who grabs a *different* item.  
5. First team to breach the containment wins.

**The Tech (System Logic):**

* **State:** `MANUAL_SCORING`  
* **TV View:** Display a static banner: "SYSTEM WARNING: LIQUID ASSETS FROZEN." Show the list of Teams.  
* **Mobile View:** Static text: "AWAITING MANUAL INPUT..."  
* **Admin Control:** A simple list of teams with a "Select Winner" button.  
* **Logic:** Admin clicks winner \-\> Server adds 100pts \-\> Server saves JSON \-\> Global Scoreboard updates.

### **Protocol 2: Google is Down**

**Concept:** Analog Trivia. No multiple choice. Hard inputs. **The Rules (Human Logic):**

1. TV displays a 90s/Y2K themed trivia question.  
2. Teams must type the answer into their phones.  
3. Host waits for all answers (or a reasonable amount of time).  
4. Host reveals the correct answer.  
5. Host manually grades answers (allowing for slight spelling errors or "close enough" logic).

**The Tech (System Logic):**

* **State:** `TRIVIA_ACTIVE`  
* **TV View:**  
  * *Phase A:* Large Question Text.  
  * *Phase B:* Status Counter ("3/4 Teams Transmitted").  
  * *Phase C:* The Correct Answer (triggered by Admin).  
* **Mobile View:** Text Input Field \+ "TRANSMIT" Button.  
  * *Constraint:* Input field disables immediately after submission to prevent spamming.  
* **Admin Control:**  
  * **Preview:** Admin sees the correct answer *privately* first.  
  * **Grading Dashboard:** A list of incoming text strings from teams with "Accept (Green)" / "Reject (Red)" toggle buttons.  
  * **Reveal:** Button to show the answer on the TV.

### **Protocol 3: Tin Foil Hat Gala**

**Concept:** A timed creative fashion challenge. **The Rules (Human Logic):**

1. Host gives every team a roll of aluminum foil.  
2. Teams have exactly 3 minutes to construct a "Signal Blocking Hat" on one team member's head.  
3. When the timer hits zero, construction stops.  
4. Models walk the "runway."  
5. Host judges the best design and awards points manually.

**The Tech (System Logic):**

* **State:** `TIMER_ONLY`  
* **TV View:** Giant Digital Countdown Timer (03:00).  
  * *Visuals:* Color shifts from Green \-\> Yellow \-\> Red as time depletes.  
* **Mobile View:** Flashing animation: "RADIATION LEAK DETECTED: CONSTRUCT SHIELDING."  
* **Admin Control:**  
  * Start/Pause/Reset Timer.  
  * Manual Input fields to assign 1st, 2nd, and 3rd place points after the runway show.

### **Protocol 4: Corrupted Audio (The 56k Modem Challenge)**

**Concept:** "Name That Tune" / Audio recognition speed round. **The Rules (Human Logic):**

1. Host plays a short, distorted, or obscure audio clip (TV Theme, 90s Hit, Windows Startup Sound).  
2. Teams race to hit the Big Button on their phone.  
3. The first buzz "Locks" the system. That team shouts the answer.  
4. **Correct:** They get points. **Incorrect:** Their buzzer is locked out, and others can buzz again.

**The Tech (System Logic):**

* **State:** `BUZZER_OPEN` vs `BUZZER_LOCKED`  
* **TV View:** An audio visualizer (CSS bars bouncing).  
  * *Action:* When a buzz occurs, View changes to: "INCOMING SIGNAL: \[TEAM NAME\]".  
  * *Audio:* The "Buzz" sound effect plays **on the TV**, not the phone.  
* **Mobile View:** A giant button.  
  * *State A (Open):* Green "EXECUTE".  
  * *State B (Locked by you):* Blue "TRANSMITTING...".  
  * *State C (Locked by other):* Red "LOCKED".  
* **Server Logic (Latency Handling):**  
  * Server maintains a `locked_by` variable.  
  * When the first `buzz` event arrives, set `locked_by = team_id` and emit `lock_buzzers` to all clients. Ignore subsequent buzzes.  
* **Admin Control:**  
  * "Correct" (Award points).  
  * "Wrong/Reset" (Clears `locked_by` to `None`, re-enables buzzers).

### **Protocol 5: Timeline Restoration**

**Concept:** A logic puzzle sorting historical events chronologically. **The Rules (Human Logic):**

1. Players receive a scrambled list of 4 historical events (e.g., "Release of Win95", "Matrix Theatrical Release", "Y2K", "Launch of iPod").  
2. They must discuss and drag the items into the correct chronological order on their phone.  
3. They hit "Submit."  
4. First team to get the order 100% correct wins.

**The Tech (System Logic):**

* **State:** `PUZZLE_RACE`  
* **TV View:** Live Status Board.  
  * Shows list of teams with status: "Thinking...", "ATTEMPT FAILED", or "TIMELINE RESTORED (WINNER)".  
* **Mobile View:** Draggable list items (Library: `SortableJS`).  
  * *UX Requirement:* CSS `touch-action: none;` on list items to prevent browser scrolling while dragging.  
* **Logic:**  
  * Client sends an array of indices (e.g., `[2, 0, 3, 1]`) to the server.  
  * Server compares against the answer key.  
  * **If Wrong:** Phone vibrates, screen flashes red "INDEX ERROR."  
  * **If Correct:** Phone turns green "SAVED." Server logs the win time.

### **Protocol 6: Minesweeper (Elimination)**

**Concept:** High-stakes Russian Roulette. **The Rules (Human Logic):**

1. This is the elimination round.  
2. Physical cups are set up. Some contain water (Safe), some contain Malort (Mine).  
3. Teams take turns selecting a cup.  
4. **Safe:** They stay in the database.  
5. **Mine:** They drink the Malort and are "Deleted" from the game.  
6. Last team standing wins the remaining points.

**The Tech (System Logic):**

* **State:** `ELIMINATION_TRACKER`  
* **TV View:** A grid of all Teams.  
  * *Active:* Green Text.  
  * *Eliminated:* Red Strikethrough Text \+ "DELETED" stamp.  
* **Mobile View:** Static ominous text: "AWAITING FATE..."  
* **Admin Control:** A list of teams with a "KILL" toggle next to each name. Toggling it updates the TV view instantly.

---

## **4\. Victory Conditions**

* **Trigger:** Completion of all 6 rounds.  
* **Logic:** Server sums total points from the persisted `teams` dictionary.  
* **Display:**  
  * TV shows "BOOT SEQUENCE COMPLETE" animation.  
  * Displays Final Leaderboard.  
  * Top Team flashes with "SURVIVAL CONFIRMED."

---

## **5\. Directory & File Structure**

This structure separates concerns to allow multiple people to work on the code simultaneously (e.g., one on frontend, one on backend).
 
y2k_party/  
│  
├── app.py                  \# ENTRY POINT: Flask App setup & Route definitions  
├── events.py               \# SOCKETS: Handles connect, disconnect, submit_answer, etc.  
├── game_manager.py         \# LOGIC: Class for State, Score persistence, & Recovery  
├── utils.py                \# TOOLS: QR Code generation, Local IP discovery  
├── content_loader.py       \# DATA: Loads questions/puzzles from JSON/YAML  
│  
├── data/  
│   ├── questions.json      \# Trivia & Puzzle content  
│   └── scores.json         \# AUTO-GENERATED: Crash recovery file  
│  
├── templates/  
│   ├── _layout.html        \# Base HTML (includes Socket.IO script & NoSleep.js)  
│   ├── lobby.html          \# Join Screen (QR Code on TV side)  
│   ├── tv.html             \# The Main Display  
│   ├── mobile.html         \# The Controller (Dynamic JS switches internal views)  
│   └── admin.html          \# The Host Dashboard  
│  
└── static/  
    ├── css/  
    │   └── terminal.css    \# Theme: Green text, black bg, courier font  
    ├── js/  
    │   ├── client.js       \# Mobile logic (handling wake lock & view switching)  
    │   ├── tv.js           \# TV logic (visualizers & score updates)  
    │   └── admin.js        \# Admin logic  
    └── audio/              \# SFX (buzz.mp3, error.mp3, win.mp3)

---

## **6\. Pre-Game Checklist (Network & Ops)**

1. **Network Host:** Run `app.py` with `host='0.0.0.0'` to expose the server to the local network.  
2. **Firewall:** Ensure the host laptop's firewall allows incoming connections on port 13370\.  
3. **Battery:** Host laptop must be plugged in.  
4. **Audio:** TV volume up.  
5. **Testing:** Perform a "Hard Refresh" test. Join the game on a phone, then refresh the browser page. Ensure the server puts the player back into the game state, not the lobby.
