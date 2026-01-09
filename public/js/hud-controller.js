/**
 * HUD Controller - Manages state-driven HUD element visibility and updates
 * Part of the immersive TV game experience system
 */

// ============================================================
// HUD CONTROLLER - State-driven visibility management
// ============================================================

class HUDController {
    constructor() {
        this.elements = new Map();
        this.currentState = null;
        this.initialized = false;
    }

    /**
     * Initialize the HUD controller - collect all HUD elements
     */
    init() {
        if (this.initialized) return;

        // Collect all HUD elements with data-show-states attribute
        document.querySelectorAll('.hud-element[data-show-states]').forEach(el => {
            const statesAttr = el.dataset.showStates;
            const states = statesAttr.split(',').map(s => s.trim().toUpperCase());
            this.elements.set(el.id, { element: el, states });
        });

        console.log('[HUDController] Initialized with', this.elements.size, 'elements');
        this.initialized = true;
    }

    /**
     * Update visibility based on current game state
     * @param {string} newState - The new game state (e.g., 'LOBBY', 'TRIVIA')
     */
    setState(newState) {
        if (!this.initialized) this.init();

        const state = newState.toUpperCase();
        this.currentState = state;

        this.elements.forEach(({ element, states }, id) => {
            const shouldShow = states.includes(state);

            if (shouldShow) {
                element.classList.add('hud-visible');
            } else {
                element.classList.remove('hud-visible');
            }
        });

        console.log('[HUDController] State changed to:', state);
    }

    /**
     * Update timer - now delegates to MoonTimer
     * @param {number} seconds - Remaining seconds
     * @param {number} totalSeconds - Total seconds for this timer (optional)
     */
    updateTimer(seconds, totalSeconds = 60) {
        // Update the MoonTimer if available
        if (window.moonTimer) {
            window.moonTimer.update(seconds, totalSeconds);
        }

        // Also update legacy timer orb if it exists (for backwards compatibility)
        const orb = document.getElementById('timer-orb');
        const value = document.getElementById('timer-orb-value');

        if (orb && value) {
            value.textContent = seconds;

            // Update urgency classes
            orb.classList.remove('timer-orb--warning', 'timer-orb--danger');
            if (seconds <= 5) {
                orb.classList.add('timer-orb--danger');
            } else if (seconds <= 10) {
                orb.classList.add('timer-orb--warning');
            }
        }
    }

    /**
     * Hide the timer (moon timer or legacy orb)
     */
    hideTimer() {
        if (window.moonTimer) {
            window.moonTimer.hide();
        }

        const orb = document.getElementById('timer-orb');
        if (orb) {
            orb.classList.remove('hud-visible');
        }
    }

    /**
     * Show the timer (moon timer or legacy orb)
     */
    showTimer() {
        if (window.moonTimer) {
            window.moonTimer.show();
        }

        const orb = document.getElementById('timer-orb');
        if (orb) {
            orb.classList.add('hud-visible');
        }
    }

    /**
     * Trigger score ribbon drift animation (for state changes)
     */
    triggerScoreDrift() {
        if (window.scoreRibbonController) {
            window.scoreRibbonController.drift();
        }
    }

    /**
     * Trigger score sparkle for a specific team
     * @param {string} teamId - The team that scored
     */
    triggerScoreSparkle(teamId) {
        if (window.scoreRibbonController) {
            window.scoreRibbonController.sparkle(teamId);
        }
    }

    /**
     * Update chapter seal with current game name
     * @param {string} name - The game/chapter name
     */
    updateChapter(name) {
        const el = document.getElementById('chapter-name');
        if (el) {
            el.textContent = name;
        }
    }

    /**
     * Update score ribbon with team scores
     * @param {Array} teams - Array of team objects with name, score, color
     */
    updateScores(teams) {
        const container = document.getElementById('score-ribbon-teams');
        if (!container) return;

        // Sort by score descending
        const sorted = [...teams].sort((a, b) => (b.score || 0) - (a.score || 0));
        const maxScore = sorted.length > 0 ? sorted[0].score : 0;

        container.innerHTML = sorted.map((team, i) => {
            const isLeading = team.score === maxScore && maxScore > 0;
            const leadingClass = isLeading ? 'score-ribbon__team--leading' : '';
            const color = team.color || 'var(--ice-glow)';

            return `
                <div class="score-ribbon__team ${leadingClass}" style="animation-delay: ${i * 0.1}s">
                    <span class="score-ribbon__color" style="color: ${color}; background: ${color}"></span>
                    <span class="score-ribbon__name">${team.name || 'Team'}</span>
                    <span class="score-ribbon__score">${team.score || 0}</span>
                </div>
            `;
        }).join('');
    }

    /**
     * Update team count orb
     * @param {number} count - Number of connected teams
     */
    updateTeamCount(count) {
        const el = document.getElementById('hud-team-count');
        if (el) {
            el.textContent = count;
        }
    }

    /**
     * Update room code badge
     * @param {string} url - The join URL
     * @param {string} code - The room code
     */
    updateRoomCode(url, code) {
        const urlEl = document.getElementById('hud-room-url');
        const codeEl = document.getElementById('hud-room-code');

        if (urlEl) urlEl.textContent = url || '';
        if (codeEl) codeEl.textContent = code || '----';
    }
}

// ============================================================
// FLOATING NOTES CONTROLLER - Ethereal drifting messages
// ============================================================

class FloatingNotesController {
    constructor() {
        this.notes = [];
        this.container = null;
        this.intervalId = null;
        this.minInterval = 60000;  // 60 seconds
        this.maxInterval = 360000; // 360 seconds
    }

    /**
     * Initialize the floating notes controller
     */
    init() {
        this.container = document.getElementById('floating-notes');

        // Get notes from the component's inline script
        if (window.floatingNotesContent) {
            this.notes = window.floatingNotesContent;
        } else {
            // Fallback notes
            this.notes = [
                "Every family has a story worth telling...",
                "The best adventures begin with tiny footsteps",
                "Love grows stronger with each new chapter"
            ];
        }

        console.log('[FloatingNotes] Initialized with', this.notes.length, 'notes');
    }

    /**
     * Spawn a single floating note
     */
    spawn() {
        if (!this.container) {
            console.error('[FloatingNotes] Container not found!');
            return;
        }
        if (this.notes.length === 0) {
            console.error('[FloatingNotes] No notes to display!');
            return;
        }

        console.log('[FloatingNotes] Spawning note, container:', this.container);

        // Create note element
        const note = document.createElement('div');
        note.className = 'floating-note';

        // Random note content
        const text = this.notes[Math.floor(Math.random() * this.notes.length)];
        note.textContent = text;

        // Random horizontal position (10% - 80% of viewport width)
        let leftPos = 5 + Math.random() * 30;
        if (Math.random() > .5) {
            leftPos = 70 + Math.random() * 30;
        }

        note.style.left = `${leftPos}%`;

        // Random drift for natural snow-like movement
        const driftStart = (Math.random() - 0.5) * 60;
        const driftEnd = driftStart + (Math.random() - 0.5) * 80;
        note.style.setProperty('--drift-start', `${driftStart}px`);
        note.style.setProperty('--drift-end', `${driftEnd}px`);

        // Random rotation for tumbling snow effect
        const rotateStart = (Math.random() - 0.5) * 12;
        const rotateEnd = (Math.random() - 0.5) * 12;
        note.style.setProperty('--rotate-start', `${rotateStart}deg`);
        note.style.setProperty('--rotate-end', `${rotateEnd}deg`);

        // Add to container
        this.container.appendChild(note);

        // Remove after animation completes (15s animation + buffer)
        setTimeout(() => {
            if (note.parentNode) {
                note.parentNode.removeChild(note);
            }
        }, 16000);
    }

    /**
     * Start the note spawning loop
     */
    startLoop() {
        if (this.intervalId) return;

        // Spawn first note immediately for testing
        console.log('[FloatingNotes] Spawning first note immediately');
        this.spawn();

        // Spawn a second one after 1 second
        setTimeout(() => {
            console.log('[FloatingNotes] Spawning second test note');
            this.spawn();
        }, 1000);

        // Schedule next spawn with random interval
        const scheduleNext = () => {
            const delay = this.minInterval + Math.random() * (this.maxInterval - this.minInterval);
            this.intervalId = setTimeout(() => {
                this.spawn();
                scheduleNext();
            }, delay);
        };

        scheduleNext();
        console.log('[FloatingNotes] Loop started');
    }

    /**
     * Stop the note spawning loop
     */
    stopLoop() {
        if (this.intervalId) {
            clearTimeout(this.intervalId);
            this.intervalId = null;
            console.log('[FloatingNotes] Loop stopped');
        }
    }
}

// ============================================================
// MOON TIMER CONTROLLER - Arc-based visual timer
// ============================================================

class MoonTimerController {
    constructor() {
        this.moonPath = null;
        this.moonOrb = null;
        this.moonAmbient = null;
        this.moonTimer = null;
        this.pathLength = 0;
        this.currentProgress = 0;
    }

    /**
     * Initialize the moon timer controller
     */
    init() {
        this.moonPath = document.getElementById('moon-path');
        this.moonOrb = document.getElementById('moon-orb');
        this.moonAmbient = document.getElementById('moon-ambient');
        this.moonTimer = document.getElementById('moon-timer');

        if (this.moonPath) {
            this.pathLength = this.moonPath.getTotalLength();
            console.log('[MoonTimer] Initialized, path length:', this.pathLength);
        } else {
            console.log('[MoonTimer] Moon path not found');
        }
    }

    /**
     * Update the moon position based on time remaining
     * @param {number} secondsRemaining - Seconds left
     * @param {number} totalSeconds - Total seconds for this timer
     */
    update(secondsRemaining, totalSeconds) {
        if (!this.moonPath || !this.moonOrb) {
            this.init();
            if (!this.moonPath) return;
        }

        // Calculate progress: 0 = start (full time), 1 = end (time's up)
        const progress = 1 - (secondsRemaining / totalSeconds);
        this.currentProgress = Math.max(0, Math.min(1, progress));

        // Get point along the path
        const point = this.moonPath.getPointAtLength(this.pathLength * this.currentProgress);

        // Move the moon
        this.moonOrb.setAttribute('transform', `translate(${point.x}, ${point.y})`);

        // Update ambient glow position and intensity
        if (this.moonAmbient) {
            const xPercent = (point.x / 1920) * 100;
            const glowIntensity = 0.1 + (this.currentProgress * 0.15);
            this.moonAmbient.style.setProperty('--moon-x', `${xPercent}%`);
            this.moonAmbient.style.setProperty('--glow-intensity', glowIntensity);
        }

        // Update urgency states
        if (this.moonTimer) {
            this.moonTimer.classList.remove('warning', 'danger');
            if (secondsRemaining <= 5) {
                this.moonTimer.classList.add('danger');
            } else if (secondsRemaining <= 10) {
                this.moonTimer.classList.add('warning');
            }
        }

        // Update glow intensity on moon orb
        const glowOuter = document.getElementById('moon-glow-outer');
        const glowInner = document.getElementById('moon-glow-inner');
        if (glowOuter) {
            glowOuter.setAttribute('opacity', 0.4 + (this.currentProgress * 0.4));
        }
        if (glowInner) {
            glowInner.setAttribute('opacity', 0.6 + (this.currentProgress * 0.3));
        }
    }

    /**
     * Show the moon timer
     */
    show() {
        if (this.moonTimer) {
            this.moonTimer.classList.add('visible');
        }
    }

    /**
     * Hide the moon timer
     */
    hide() {
        if (this.moonTimer) {
            this.moonTimer.classList.remove('visible');
        }
    }

    /**
     * Reset moon to starting position
     */
    reset() {
        this.update(60, 60); // Reset to full time
    }
}

// ============================================================
// SCORE RIBBON CONTROLLER - Drifting score display
// ============================================================

class ScoreRibbonController {
    constructor() {
        this.ribbon = null;
        this.driftTimeout = null;
    }

    /**
     * Initialize the score ribbon controller
     */
    init() {
        this.ribbon = document.getElementById('score-ribbon');
        console.log('[ScoreRibbon] Initialized');
    }

    /**
     * Trigger the drift animation (shows scores temporarily)
     */
    drift() {
        if (!this.ribbon) {
            this.init();
            if (!this.ribbon) return;
        }

        // Clear any existing timeout
        if (this.driftTimeout) {
            clearTimeout(this.driftTimeout);
        }

        // Remove any existing animation classes
        this.ribbon.classList.remove('drifting', 'visible');

        // Force reflow to restart animation
        void this.ribbon.offsetWidth;

        // Start the drift animation
        this.ribbon.classList.add('drifting');

        console.log('[ScoreRibbon] Drift triggered');
    }

    /**
     * Show the ribbon permanently (for certain states)
     */
    show() {
        if (!this.ribbon) {
            this.init();
            if (!this.ribbon) return;
        }

        this.ribbon.classList.remove('drifting');
        this.ribbon.classList.add('visible');
    }

    /**
     * Hide the ribbon
     */
    hide() {
        if (!this.ribbon) return;
        this.ribbon.classList.remove('visible', 'drifting');
    }

    /**
     * Trigger sparkle animation on a team's score
     * @param {string} teamId - The team that scored
     */
    sparkle(teamId) {
        if (!this.ribbon) return;

        // Find the team element
        const teamEl = this.ribbon.querySelector(`[data-team-id="${teamId}"]`);
        if (teamEl) {
            teamEl.classList.add('sparkle');
            const scoreEl = teamEl.querySelector('.score-ribbon__team-score');
            if (scoreEl) {
                scoreEl.classList.add('bumping');
            }

            // Remove animation classes after they complete
            setTimeout(() => {
                teamEl.classList.remove('sparkle');
                if (scoreEl) {
                    scoreEl.classList.remove('bumping');
                }
            }, 800);
        }

        // Also trigger drift to show the updated scores
        this.drift();
    }
}

// ============================================================
// TEAM SCOREBOARD CONTROLLER - Persistent footer scoreboard
// ============================================================

class TeamScoreboardController {
    constructor() {
        this.container = null;
        this.previousScores = {};
    }

    /**
     * Initialize the scoreboard controller
     */
    init() {
        this.container = document.getElementById('scoreboard-teams');
        console.log('[TeamScoreboard] Initialized');
    }

    /**
     * Update the scoreboard with team data
     * @param {Object} teams - Teams object { team_id: { name, players, color, ... } }
     * @param {Object} scores - Scores object { team_id: score }
     */
    updateTeams(teams, scores) {
        if (!this.container) {
            this.init();
            if (!this.container) return;
        }

        const teamIds = Object.keys(teams);
        if (teamIds.length === 0) {
            this.container.innerHTML = '';
            return;
        }

        // Sort by score descending
        const sorted = teamIds.sort((a, b) => (scores[b] || 0) - (scores[a] || 0));
        const maxScore = sorted.length > 0 ? (scores[sorted[0]] || 0) : 0;

        this.container.innerHTML = sorted.map((teamId, i) => {
            const team = teams[teamId];
            const score = scores[teamId] || 0;
            const isLeading = score === maxScore && maxScore > 0;
            const leadingClass = isLeading ? 'leading' : '';

            // Get team color
            const colorIndex = team.color || ((i % 8) + 1);
            const colorValue = window.TeamColors ? window.TeamColors.getColor(colorIndex) : '#87CEEB';

            // Get members list
            const players = team.players || [];
            let membersList = '';
            if (Array.isArray(players)) {
                membersList = players.join(', ');
            } else if (typeof players === 'object') {
                // players might be { player_id: { name } }
                membersList = Object.values(players).map(p => p.name || p).join(', ');
            }
            const membersHtml = membersList
                ? `<div class="scoreboard-team-box__members">${membersList}</div>`
                : '';

            // Crown badge for leading team
            const crownHtml = isLeading ? '<span class="scoreboard-team-box__crown">👑</span>' : '';

            // Handle long team names
            const teamName = team.name || 'Team';
            const longNameClass = teamName.length > 12 ? 'long-name' : '';

            return `
                <div class="scoreboard-team-box ${leadingClass}" data-team-id="${teamId}" style="--team-color: ${colorValue};">
                    ${crownHtml}
                    <div class="scoreboard-team-box__header">
                        <span class="scoreboard-team-box__color" style="background: ${colorValue};"></span>
                        <span class="scoreboard-team-box__name ${longNameClass}" title="${teamName}">${teamName}</span>
                        <span class="scoreboard-team-box__score" data-score="${score}">${score}</span>
                    </div>
                    ${membersHtml}
                </div>
            `;
        }).join('');

        // Store current scores for comparison
        this.previousScores = { ...scores };
    }

    /**
     * Highlight a team that just scored
     * @param {string} teamId - The team that scored
     */
    highlightTeam(teamId) {
        if (!this.container) return;

        const teamEl = this.container.querySelector(`[data-team-id="${teamId}"]`);
        if (teamEl) {
            // Add scoring animation
            teamEl.classList.add('scoring');

            // Animate the score value with counting effect
            const scoreEl = teamEl.querySelector('.scoreboard-team-box__score');
            if (scoreEl) {
                const targetScore = parseInt(scoreEl.dataset.score, 10) || 0;
                const previousScore = this.previousScores[teamId] || 0;

                // Animate counting up from previous to new score
                if (targetScore > previousScore) {
                    this.animateScoreCounter(scoreEl, previousScore, targetScore);
                } else {
                    scoreEl.classList.add('counting');
                }
            }

            // Remove animation classes after they complete
            setTimeout(() => {
                teamEl.classList.remove('scoring');
                if (scoreEl) {
                    scoreEl.classList.remove('counting');
                }
            }, 1200);
        }
    }

    /**
     * Animate score counter from start to end value
     * @param {HTMLElement} scoreEl - The score element
     * @param {number} start - Starting value
     * @param {number} end - Ending value
     */
    animateScoreCounter(scoreEl, start, end) {
        const duration = 600; // ms
        const startTime = performance.now();
        const diff = end - start;

        scoreEl.classList.add('counting');

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out cubic for smooth deceleration
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const currentValue = Math.round(start + diff * easeOut);

            scoreEl.textContent = currentValue;

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                scoreEl.textContent = end;
            }
        };

        requestAnimationFrame(animate);
    }
}

// ============================================================
// INITIALIZATION
// ============================================================

// Create global instances
window.hudController = new HUDController();
window.floatingNotes = new FloatingNotesController();
window.moonTimer = new MoonTimerController();
window.scoreRibbonController = new ScoreRibbonController();
window.teamScoreboardController = new TeamScoreboardController();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.hudController.init();
        window.floatingNotes.init();
        window.floatingNotes.startLoop();
        window.moonTimer.init();
        window.scoreRibbonController.init();
        window.teamScoreboardController.init();
    });
} else {
    window.hudController.init();
    window.floatingNotes.init();
    window.floatingNotes.startLoop();
    window.moonTimer.init();
    window.scoreRibbonController.init();
    window.teamScoreboardController.init();
}

console.log('[HUD] Controller loaded with MoonTimer, ScoreRibbon, and TeamScoreboard');
