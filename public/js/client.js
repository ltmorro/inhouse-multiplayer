/**
 * CLIENT.JS - Mobile Controller View Manager
 * Handles view switching, socket events, and mock mode for testing
 *
 * Uses shared modules from src/scripts/ (exposed via window globals):
 * - window.STATE_VIEW_MAP, window.AVATARS, window.AVATAR_EMOJIS
 * - window.Haptics, window.GlitchEffects, window.VHSTransition
 * - window.TimerEffects, window.BSOD, window.Win98Dialog
 */

// ============================================================
// CONFIGURATION (uses shared STATE_VIEW_MAP from globals)
// ============================================================

const CONFIG = {
    // Set to true to enable mock mode (no server connection)
    MOCK_MODE: false,

    // Mock mode delay (ms) for simulated responses
    MOCK_DELAY: 500,

    // States mapping to views - use shared config, fallback to inline for safety
    get STATE_VIEW_MAP() {
        return window.STATE_VIEW_MAP || {
            'LOBBY': 'view-lobby',
            'MACGYVER': 'view-macgyver',
            'TRIVIA': 'view-trivia',
            'TIMER': 'view-timer',
            'BUZZER': 'view-buzzer',
            'TIMELINE': 'view-timeline',
            'MINESWEEPER': 'view-minesweeper',
            'PICTUREGUESS': 'view-pictureguess',
            'PIXELPERFECT': 'view-pixelperfect',
            'PRICEGUESS': 'view-priceguess',
            'SURVIVAL': 'view-survival',
            'VICTORY': 'view-victory'
        };
    }
};

// ============================================================
// STATE
// ============================================================

const AppState = {
    socket: null,
    connected: false,
    teamId: null,
    teamName: null,
    teamColor: 1,           // Team color ID (1-8)
    playerId: null,
    playerName: null,
    joinCode: null,
    players: [],
    currentState: 'LOBBY',
    isRegistered: false,
    buzzerLocked: false,
    buzzerLockedBy: null,
    buzzerFreezeInterval: null,  // Timer for freeze countdown
    timerInterval: null,
    timelineOrder: [],
    sortableInstance: null,
    currentQuestionId: null,
    currentPuzzleId: null,
    currentPictureId: null,
    currentProductId: null,
    answerTypingTimeout: null,
    pictureGuessTypingTimeout: null,
    priceGuessTypingTimeout: null,
    syncingFromRemote: false,  // Flag to prevent echo when syncing
    timelineCompleted: false,  // Flag to track if timeline has been revealed
    triviaSubmitted: false,    // Flag to track if user submitted trivia answer (prevents count overwrite)
    selectedAvatar: null,      // Selected team avatar
    lastReactionTime: 0,       // Throttle reactions
    lastChatTime: 0,           // Throttle chat messages
    lastTeamSubmissionTime: 0, // Timestamp of last teammate's submission (prevents count overwrite)
    pixelperfectLocked: false, // Track if pixelperfect buzzer is locked
    pixelperfectFreezeInterval: null  // Timer for pixelperfect freeze countdown
};

// ============================================================
// BOOT SEQUENCE (shorter for mobile)
// ============================================================

const BootSequence = {
    asciiArt: `
 BABY SHOWER
 ═══════════
    `,

    bootLines: [
        { text: 'BABY MONITOR OS v1.0', class: 'boot-line--header', delay: 80 },
        { text: 'Initializing cuteness sensors...', delay: 100 },
        { text: 'Diaper Status: CLEAN', class: 'boot-line--success', delay: 120 },
        { text: 'Sleep Mode: NOT FOUND', class: 'boot-line--warning', delay: 100 },
        { text: 'READY FOR BABY', class: 'boot-line--success', delay: 150 },
    ],

    hasPlayed: false,

    async play() {
        if (sessionStorage.getItem('mobileBootPlayed')) {
            this.skip();
            return;
        }

        const container = document.getElementById('boot-sequence');
        const asciiEl = document.getElementById('boot-ascii');
        const linesEl = document.getElementById('boot-lines');
        const progressEl = document.getElementById('boot-progress');
        const progressFill = document.getElementById('boot-progress-fill');
        const progressText = document.getElementById('boot-progress-text');

        if (!container) return;

        asciiEl.textContent = this.asciiArt;

        for (let i = 0; i < this.bootLines.length; i++) {
            const line = this.bootLines[i];
            const lineEl = document.createElement('div');
            lineEl.className = `boot-line ${line.class || ''}`;
            lineEl.textContent = line.text;
            linesEl.appendChild(lineEl);

            await this.sleep(line.delay);
            lineEl.classList.add('visible');
        }

        await this.sleep(150);
        progressEl.style.display = 'flex';

        for (let i = 0; i <= 100; i += 5) {
            progressFill.style.width = `${i}%`;
            progressText.textContent = `${i}%`;
            await this.sleep(15);
        }

        await this.sleep(200);

        container.style.transition = 'opacity 0.2s ease';
        container.style.opacity = '0';

        await this.sleep(200);
        container.classList.add('hidden');

        sessionStorage.setItem('mobileBootPlayed', 'true');
        this.hasPlayed = true;

        GlitchEffects.trigger('minor');
    },

    skip() {
        const container = document.getElementById('boot-sequence');
        if (container) container.classList.add('hidden');
        this.hasPlayed = true;
    },

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};

// ============================================================
// HAPTICS - Use shared module from window.Haptics
// ============================================================

// Haptics is now loaded from src/scripts/haptics.js via globals
// Access via window.Haptics (fallback defined for safety)
const Haptics = window.Haptics || {
    isSupported() { return 'vibrate' in navigator; },
    tap() { this.isSupported() && navigator.vibrate(10); },
    confirm() { this.isSupported() && navigator.vibrate(30); },
    success() { this.isSupported() && navigator.vibrate([20, 50, 20]); },
    error() { this.isSupported() && navigator.vibrate([50, 30, 50]); },
    buzzer() { this.isSupported() && navigator.vibrate([30, 20, 30, 20, 30]); },
    impact() { this.isSupported() && navigator.vibrate([100, 50, 100, 50, 100]); },
    warning() { this.isSupported() && navigator.vibrate([50, 30, 50]); },
    tick() { this.isSupported() && navigator.vibrate(15); },
    stateChange() { this.isSupported() && navigator.vibrate([20, 40, 20]); }
};

// ============================================================
// GLITCH EFFECTS - Use shared module from window.GlitchEffects
// ============================================================

// GlitchEffects loaded from src/scripts/effects.ts via globals (disabled for winter theme)
const GlitchEffects = window.GlitchEffects || {
    trigger(type = 'minor') { /* no-op for winter theme */ },
    shake(duration = 300) { /* no-op for winter theme */ }
};

// ============================================================
// WINDOWS 98 ERROR DIALOG - Use shared module
// ============================================================

const Win98Dialog = window.Win98Dialog || {
    show(options = {}) {
        const overlay = document.getElementById('win98-overlay');
        if (!overlay) return;
        overlay.classList.remove('hidden');
        if (options.duration > 0) setTimeout(() => this.hide(), options.duration);
    },
    hide() {
        const overlay = document.getElementById('win98-overlay');
        if (overlay) overlay.classList.add('hidden');
    },
    showWrongAnswer(context) { this.show({ duration: 2500 }); },
    showBuzzerLock(teamName) { this.show({ duration: 2000 }); },
    showFreeze(seconds) { this.show({ duration: 2000 }); }
};

// ============================================================
// BLUE SCREEN OF DEATH - Use shared module
// ============================================================

const BSOD = window.BSOD || {
    show(teamName, duration = 3000) {
        const overlay = document.getElementById('bsod-overlay');
        if (!overlay) return;
        overlay.classList.remove('hidden');
        setTimeout(() => this.hide(), duration);
    },
    hide() {
        const overlay = document.getElementById('bsod-overlay');
        if (overlay) overlay.classList.add('hidden');
    }
};

// ============================================================
// VHS TRANSITIONS - Use shared module (disabled for winter theme)
// ============================================================

const VHSTransition = window.VHSTransition || {
    async play(type = 'switch') { await this.sleep(50); },
    sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
};

// ============================================================
// TIMER EFFECTS - Use shared module
// ============================================================

const TimerEffects = window.TimerEffects || {
    criticalOverlayActive: false,
    setCriticalOverlay(active) { /* fallback no-op */ },
    setHeartbeat(active) { /* fallback no-op */ },
    updateForTime(seconds, total) { /* fallback no-op */ }
};

// ============================================================
// AVATAR CONFIGURATION - Use shared module
// ============================================================

const AVATARS = window.AVATARS || [
    { id: 'bottle', emoji: '🍼', name: 'BOTTLE' },
    { id: 'pacifier', emoji: '👶', name: 'BABY' },
    { id: 'bear', emoji: '🧸', name: 'TEDDY' },
    { id: 'duck', emoji: '🦆', name: 'DUCKY' },
    { id: 'rattle', emoji: '🪇', name: 'RATTLE' },
    { id: 'stroller', emoji: '🛒', name: 'STROLLER' },
    { id: 'footprint', emoji: '👣', name: 'FEET' },
    { id: 'angel', emoji: '👼', name: 'ANGEL' }
];

// ============================================================
// VIEW MANAGER
// ============================================================

const ViewManager = {
    /**
     * Hide all views
     */
    hideAll() {
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
        });
    },

    /**
     * Show a specific view by ID
     * @param {string} viewId - The view element ID
     * @param {boolean} withTransition - Whether to play transition effect
     */
    show(viewId, withTransition = false) {
        if (withTransition && BootSequence.hasPlayed) {
            VHSTransition.play().then(() => {
                this.hideAll();
                const view = document.getElementById(viewId);
                if (view) view.classList.add('active');
            });
        } else {
            this.hideAll();
            const view = document.getElementById(viewId);
            if (view) view.classList.add('active');
        }
        console.log(`[ViewManager] Showing: ${viewId}`);
    },

    /**
     * Show view based on game state
     * @param {string} state - The game state enum value
     */
    showForState(state) {
        const viewId = CONFIG.STATE_VIEW_MAP[state];
        if (viewId) {
            // Use transition when changing between game states (not initial)
            const useTransition = AppState.isRegistered && AppState.currentState !== state;
            this.show(viewId, useTransition);
            AppState.currentState = state;
        } else {
            console.warn(`[ViewManager] Unknown state: ${state}`);
        }
    },

    /**
     * Show registration view
     */
    showRegister() {
        this.show('view-register');
    },

    /**
     * Show eliminated view
     */
    showEliminated() {
        this.show('view-eliminated');
    },

    /**
     * Show kicked view
     */
    showKicked() {
        this.show('view-kicked');
    }
};

// ============================================================
// UI UPDATERS
// ============================================================

const UI = {
    /**
     * Update connection status indicator
     * @param {boolean} connected
     * @param {string} [message] - Optional message to display when disconnected
     */
    updateConnectionStatus(connected, message = null) {
        const indicator = document.getElementById('connection-indicator');
        const status = document.getElementById('connection-status');

        if (connected) {
            // Support both old and new class naming
            indicator.classList.remove('status-indicator--disconnected', 'storybook-status-bar__indicator--disconnected');
            indicator.classList.add('status-indicator--connected', 'storybook-status-bar__indicator--connected');
            status.textContent = 'Connected';
        } else {
            indicator.classList.remove('status-indicator--connected', 'storybook-status-bar__indicator--connected');
            indicator.classList.add('status-indicator--disconnected', 'storybook-status-bar__indicator--disconnected');
            status.textContent = message || 'Reconnecting...';
        }
    },

    /**
     * Update team name display with optional team color
     * @param {string} name
     * @param {number} colorId - Team color ID (1-8)
     */
    updateTeamName(name, colorId) {
        const el = document.getElementById('team-name-display');
        const statusBar = document.querySelector('.status-bar');
        el.textContent = name || '---';

        // Update the header team code display
        const headerCodeEl = document.getElementById('header-team-code');
        if (headerCodeEl && AppState.joinCode) {
            headerCodeEl.textContent = AppState.joinCode;
        }

        // Apply team color to the status bar
        if (colorId && statusBar) {
            // Remove any existing team color classes
            statusBar.classList.forEach(c => {
                if (c.startsWith('team-accent-')) statusBar.classList.remove(c);
            });
            statusBar.classList.add(`team-accent-${colorId}`);
            el.classList.add(`team-color-${colorId}`);
        }
    },

    /**
     * Update player name display
     * @param {string} name
     */
    updatePlayerName(name) {
        const el = document.getElementById('player-name-display');
        if (el) {
            el.textContent = name ? `(${name})` : '';
        }
    },

    /**
     * Update join code display
     * @param {string} code
     */
    updateJoinCode(code) {
        const el = document.getElementById('join-code-display');
        if (el) {
            el.textContent = code || '----';
        }

        const headerEl = document.getElementById('header-team-code');
        if (headerEl) {
            headerEl.textContent = code ? `#${code}` : '';
        }
    },

    /**
     * Update players list display
     * @param {Array} players
     */
    updatePlayersList(players) {
        const el = document.getElementById('players-list');
        if (!el) return;

        if (!players || players.length === 0) {
            el.innerHTML = '';
            return;
        }

        el.innerHTML = players.map((p, i) => {
            const isYou = p.player_id === AppState.playerId;
            return `<div style="color: ${isYou ? 'var(--baby-blue)' : 'var(--baby-blue-dim)'};">
                ${i + 1}. ${p.name}${isYou ? ' (you)' : ''}
            </div>`;
        }).join('');
    },

    /**
     * Show registration error
     * @param {string} message
     */
    showRegisterError(message) {
        const errorEl = document.getElementById('register-error');
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    },

    /**
     * Hide registration error
     */
    hideRegisterError() {
        document.getElementById('register-error').style.display = 'none';
    },

    /**
     * Update trivia question
     * @param {string} question
     */
    updateTriviaQuestion(question) {
        document.getElementById('trivia-question').textContent = question;
    },

    /**
     * Update trivia status
     * @param {string} status
     * @param {boolean} disabled - Disable submit button
     */
    updateTriviaStatus(status, disabled = false) {
        document.getElementById('trivia-status').textContent = status;
        document.getElementById('trivia-submit').disabled = disabled;
        document.getElementById('trivia-answer').disabled = disabled;
    },

    /**
     * Update picture guess hint
     * @param {string} hint
     */
    updatePictureGuessHint(hint) {
        const el = document.getElementById('pictureguess-hint');
        if (el) {
            el.textContent = hint || '';
        }
    },

    /**
     * Update picture guess status
     * @param {string} status
     * @param {boolean} disabled - Disable submit button
     */
    updatePictureGuessStatus(status, disabled = false) {
        const statusEl = document.getElementById('pictureguess-status');
        const submitEl = document.getElementById('pictureguess-submit');
        const answerEl = document.getElementById('pictureguess-answer');
        if (statusEl) statusEl.textContent = status;
        if (submitEl) submitEl.disabled = disabled;
        if (answerEl) answerEl.disabled = disabled;
    },

    /**
     * Update price guess hint
     * @param {string} hint
     */
    updatePriceGuessHint(hint) {
        const el = document.getElementById('priceguess-hint');
        if (el) {
            el.textContent = hint || '';
        }
    },

    /**
     * Update price guess status
     * @param {string} status
     * @param {boolean} disabled - Disable submit button
     */
    updatePriceGuessStatus(status, disabled = false) {
        const statusEl = document.getElementById('priceguess-status');
        const submitEl = document.getElementById('priceguess-submit');
        const answerEl = document.getElementById('priceguess-answer');
        if (statusEl) statusEl.textContent = status;
        if (submitEl) submitEl.disabled = disabled;
        if (answerEl) answerEl.disabled = disabled;
    },

    /**
     * Update timer display
     * @param {number} seconds
     * @param {number} totalSeconds
     */
    updateTimer(seconds, totalSeconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        const display = document.getElementById('timer-display');
        const progressBar = document.getElementById('timer-progress-bar');

        display.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        // Calculate progress percentage
        const percent = (seconds / totalSeconds) * 100;
        progressBar.style.width = `${percent}%`;

        // Update color based on time remaining
        if (percent <= 20) {
            display.classList.add('timer-display--critical');
            display.classList.remove('timer-display--warning');
            progressBar.classList.add('timer-progress__bar--critical');
            progressBar.classList.remove('timer-progress__bar--warning');
        } else if (percent <= 50) {
            display.classList.add('timer-display--warning');
            display.classList.remove('timer-display--critical');
            progressBar.classList.add('timer-progress__bar--warning');
            progressBar.classList.remove('timer-progress__bar--critical');
        } else {
            display.classList.remove('timer-display--warning', 'timer-display--critical');
            progressBar.classList.remove('timer-progress__bar--warning', 'timer-progress__bar--critical');
        }

        // Enhanced timer effects
        TimerEffects.updateForTime(seconds, totalSeconds);
    },

    /**
     * Update buzzer state
     * @param {string} state - 'active', 'locked-self', 'locked-other'
     * @param {string} [lockedByName] - Name of team that locked buzzer
     */
    updateBuzzer(state, lockedByName = null) {
        const btn = document.getElementById('buzzer-button');
        const text = document.getElementById('buzzer-text');
        const status = document.getElementById('buzzer-status');

        // Clear any existing freeze timer
        if (AppState.buzzerFreezeInterval) {
            clearInterval(AppState.buzzerFreezeInterval);
            AppState.buzzerFreezeInterval = null;
        }

        // Remove all state classes
        btn.classList.remove('frost-buzzer--active', 'frost-buzzer--locked-self', 'frost-buzzer--locked-other', 'frost-buzzer--frozen');
        btn.disabled = false;

        switch (state) {
            case 'active':
                btn.classList.add('frost-buzzer--active');
                text.textContent = 'BUZZ!';
                status.textContent = '';
                AppState.buzzerLocked = false;
                break;
            case 'locked-self':
                btn.classList.add('frost-buzzer--locked-self');
                text.textContent = 'BUZZING!';
                status.textContent = 'Waiting for judgment...';
                btn.disabled = true;
                AppState.buzzerLocked = true;
                break;
            case 'locked-other':
                btn.classList.add('frost-buzzer--locked-other');
                text.textContent = 'LOCKED';
                status.textContent = lockedByName ? `${lockedByName} buzzed in` : 'Another team buzzed first';
                btn.disabled = true;
                AppState.buzzerLocked = true;
                break;
        }
    },

    /**
     * Start a buzzer freeze countdown for the team
     * @param {number} seconds - Duration of the freeze
     */
    startBuzzerFreeze(seconds) {
        const btn = document.getElementById('buzzer-button');
        const text = document.getElementById('buzzer-text');
        const status = document.getElementById('buzzer-status');

        // Clear any existing freeze timer
        if (AppState.buzzerFreezeInterval) {
            clearInterval(AppState.buzzerFreezeInterval);
        }

        // Set frozen state
        btn.classList.remove('frost-buzzer--active', 'frost-buzzer--locked-self', 'frost-buzzer--locked-other');
        btn.classList.add('frost-buzzer--frozen');
        btn.disabled = true;
        AppState.buzzerLocked = true;

        let remaining = seconds;
        text.textContent = `FROZEN ${remaining}s`;
        status.textContent = 'Wrong answer penalty';

        // Countdown timer
        AppState.buzzerFreezeInterval = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(AppState.buzzerFreezeInterval);
                AppState.buzzerFreezeInterval = null;
                // Re-enable buzzer
                this.updateBuzzer('active');
            } else {
                text.textContent = `FROZEN ${remaining}s`;
            }
        }, 1000);
    },

    /**
     * Update Pixel Perfect buzzer state
     * @param {string} state - 'active', 'locked-self', 'locked-other'
     * @param {string} [lockedByName] - Name of team that locked buzzer
     */
    updatePixelPerfectBuzzer(state, lockedByName = null) {
        const btn = document.getElementById('pixelperfect-buzzer-button');
        const text = document.getElementById('pixelperfect-buzzer-text');
        const status = document.getElementById('pixelperfect-status');

        if (!btn || !text) return;

        // Clear any existing freeze timer
        if (AppState.pixelperfectFreezeInterval) {
            clearInterval(AppState.pixelperfectFreezeInterval);
            AppState.pixelperfectFreezeInterval = null;
        }

        // Remove all state classes
        btn.classList.remove('frost-buzzer--active', 'frost-buzzer--locked-self', 'frost-buzzer--locked-other', 'frost-buzzer--frozen');
        btn.disabled = false;

        switch (state) {
            case 'active':
                btn.classList.add('frost-buzzer--active');
                text.textContent = 'BUZZ IN!';
                if (status) status.textContent = '';
                AppState.pixelperfectLocked = false;
                break;
            case 'locked-self':
                btn.classList.add('frost-buzzer--locked-self');
                text.textContent = 'BUZZING!';
                if (status) status.textContent = 'Waiting for judgment...';
                btn.disabled = true;
                AppState.pixelperfectLocked = true;
                break;
            case 'locked-other':
                btn.classList.add('frost-buzzer--locked-other');
                text.textContent = 'LOCKED';
                if (status) status.textContent = lockedByName ? `${lockedByName} is answering` : 'Another team buzzed first';
                btn.disabled = true;
                AppState.pixelperfectLocked = true;
                break;
        }
    },

    /**
     * Start a Pixel Perfect buzzer freeze countdown for the team
     * @param {number} seconds - Duration of the freeze
     */
    startPixelPerfectFreeze(seconds) {
        const btn = document.getElementById('pixelperfect-buzzer-button');
        const text = document.getElementById('pixelperfect-buzzer-text');
        const status = document.getElementById('pixelperfect-status');

        if (!btn || !text) return;

        // Clear any existing freeze timer
        if (AppState.pixelperfectFreezeInterval) {
            clearInterval(AppState.pixelperfectFreezeInterval);
        }

        // Set frozen state
        btn.classList.remove('frost-buzzer--active', 'frost-buzzer--locked-self', 'frost-buzzer--locked-other');
        btn.classList.add('frost-buzzer--frozen');
        btn.disabled = true;
        AppState.pixelperfectLocked = true;

        let remaining = seconds;
        text.textContent = `FROZEN ${remaining}s`;
        if (status) status.textContent = 'Wrong answer penalty';

        // Countdown timer
        AppState.pixelperfectFreezeInterval = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(AppState.pixelperfectFreezeInterval);
                AppState.pixelperfectFreezeInterval = null;
                // Re-enable buzzer
                this.updatePixelPerfectBuzzer('active');
            } else {
                text.textContent = `FROZEN ${remaining}s`;
            }
        }, 1000);
    },

    /**
     * Show timeline waiting state (no items yet)
     */
    showTimelineWaiting() {
        const waitingEl = document.getElementById('timeline-waiting');
        const activeEl = document.getElementById('timeline-active');
        if (waitingEl) waitingEl.classList.remove('hidden');
        if (activeEl) activeEl.classList.add('hidden');
    },

    /**
     * Show timeline active state (items loaded)
     */
    showTimelineActive() {
        const waitingEl = document.getElementById('timeline-waiting');
        const activeEl = document.getElementById('timeline-active');
        if (waitingEl) waitingEl.classList.add('hidden');
        if (activeEl) activeEl.classList.remove('hidden');
    },

    /**
     * Initialize timeline sortable list
     * @param {string[]} items
     */
    initTimeline(items) {
        const list = document.getElementById('timeline-list');
        list.innerHTML = '';

        // Show active state since we have items
        this.showTimelineActive();

        items.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'timeline-item';
            li.textContent = item;
            li.dataset.originalIndex = index;
            list.appendChild(li);
        });

        // Store initial order
        AppState.timelineOrder = items.map((_, i) => i);

        // Initialize SortableJS
        if (AppState.sortableInstance) {
            AppState.sortableInstance.destroy();
        }

        if (typeof Sortable !== 'undefined') {
            AppState.sortableInstance = new Sortable(list, {
                animation: 150,
                ghostClass: 'sortable-ghost',
                chosenClass: 'sortable-chosen',
                onEnd: function() {
                    // Update order array
                    const newOrder = [];
                    list.querySelectorAll('.timeline-item').forEach(item => {
                        newOrder.push(parseInt(item.dataset.originalIndex, 10));
                    });
                    AppState.timelineOrder = newOrder;

                    // Sync to teammates (unless we're syncing from remote)
                    if (!AppState.syncingFromRemote) {
                        SocketHandlers.emit('timeline_update', { order: newOrder });
                    }
                }
            });
        }
    },

    /**
     * Sync timeline order from teammate
     * @param {number[]} order - Array of original indices in new order
     */
    syncTimelineOrder(order) {
        const list = document.getElementById('timeline-list');
        if (!list) return;

        const items = Array.from(list.querySelectorAll('.timeline-item'));
        if (items.length === 0) return;

        // Create a map of originalIndex -> element
        const itemMap = {};
        items.forEach(item => {
            itemMap[item.dataset.originalIndex] = item;
        });

        // Reorder based on the received order
        order.forEach(originalIndex => {
            const item = itemMap[originalIndex];
            if (item) {
                list.appendChild(item);
            }
        });
    },

    /**
     * Update timeline status message
     * @param {string} message
     * @param {string} [color] - CSS color value
     */
    updateTimelineStatus(message, color = 'var(--baby-blue)') {
        const status = document.getElementById('timeline-status');
        status.textContent = message;
        status.style.color = color;
    },

    /**
     * Update minesweeper alive status
     * @param {boolean} alive
     */
    updateMinesweeperStatus(alive) {
        const statusEl = document.getElementById('player-alive-status');
        if (alive) {
            statusEl.textContent = 'ACTIVE';
            statusEl.style.color = 'var(--baby-blue)';
        } else {
            statusEl.textContent = 'ELIMINATED';
            statusEl.style.color = 'var(--status-oops)';
        }
    },

    /**
     * Update survival status text
     * @param {string} message
     */
    updateSurvivalStatus(message) {
        const el = document.getElementById('survival-status');
        if (el) el.textContent = message;
    },

    /**
     * Update survival team status after reveal
     * @param {boolean} eliminated - Legacy param for elimination-based mode
     * @param {number|null} pointsAwarded - Points earned this round (null = not revealed yet)
     */
    updateSurvivalTeamStatus(eliminated, pointsAwarded = null) {
        const el = document.getElementById('survival-team-status');
        if (!el) return;

        // Points-based mode
        if (pointsAwarded !== null && pointsAwarded !== undefined) {
            if (pointsAwarded > 0) {
                el.textContent = `+${pointsAwarded} points this round!`;
                el.className = 'survival-team-status awarded';
            } else {
                el.textContent = 'No points this round';
                el.className = 'survival-team-status not-awarded';
            }
        } else if (eliminated) {
            // Legacy elimination mode
            el.textContent = 'ELIMINATED';
            el.className = 'survival-team-status not-awarded';
        } else {
            // Waiting state
            el.textContent = '';
            el.className = 'survival-team-status';
        }
    },

    /**
     * Reset survival vote buttons
     */
    resetSurvivalVoteButtons() {
        const btnA = document.getElementById('survival-vote-a');
        const btnB = document.getElementById('survival-vote-b');
        if (btnA) {
            btnA.classList.remove('selected');
            btnA.disabled = false;
        }
        if (btnB) {
            btnB.classList.remove('selected');
            btnB.disabled = false;
        }
    },

    /**
     * Select a survival vote button
     * @param {string} vote - 'A' or 'B'
     */
    selectSurvivalVote(vote) {
        const btnA = document.getElementById('survival-vote-a');
        const btnB = document.getElementById('survival-vote-b');
        if (btnA) btnA.classList.toggle('selected', vote === 'A');
        if (btnB) btnB.classList.toggle('selected', vote === 'B');
    },

    /**
     * Show mock mode banner
     */
    showMockModeBanner() {
        document.getElementById('mock-mode-banner').classList.remove('hidden');
    },

    /**
     * Show the correct timeline order and disable submissions
     * @param {string[]} correctLabels - The items in correct chronological order
     * @param {string} winnerTeamId - ID of the winning team (if any)
     */
    showTimelineComplete(correctLabels, winnerTeamId) {
        const list = document.getElementById('timeline-list');
        const submitBtn = document.getElementById('timeline-submit');

        // Disable submissions
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'SEQUENCE REVEALED';
        }

        // Disable sorting
        if (AppState.sortableInstance) {
            AppState.sortableInstance.option('disabled', true);
        }

        // Clear the list and show correct order
        list.innerHTML = '';
        correctLabels.forEach((label, index) => {
            const li = document.createElement('li');
            li.className = 'timeline-item timeline-item--revealed';
            li.innerHTML = `<span style="color: var(--baby-blue-dim); margin-right: 0.5rem;">${index + 1}.</span> ${label}`;
            li.style.cursor = 'default';
            list.appendChild(li);
        });

        // Update status message
        const isWinner = winnerTeamId === AppState.teamId;
        if (isWinner) {
            UI.updateTimelineStatus('CORRECT ORDER REVEALED - You solved it!', 'var(--baby-blue)');
        } else if (winnerTeamId) {
            UI.updateTimelineStatus('CORRECT ORDER REVEALED', 'var(--gold-candle)');
        } else {
            UI.updateTimelineStatus('CORRECT ORDER REVEALED', 'var(--baby-blue)');
        }

        AppState.timelineCompleted = true;
    },

    /**
     * Reset timeline for a new puzzle
     */
    resetTimelineState() {
        const submitBtn = document.getElementById('timeline-submit');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'SUBMIT SEQUENCE';
        }

        if (AppState.sortableInstance) {
            AppState.sortableInstance.option('disabled', false);
        }

        AppState.timelineCompleted = false;
    }
};

// ============================================================
// SOCKET HANDLERS
// ============================================================

// ============================================================
// SESSION PERSISTENCE (localStorage)
// ============================================================

const SessionStorage = {
    STORAGE_KEY: 'baby_shower_session',

    /**
     * Save session data to localStorage
     */
    save(teamId, playerId, teamName, playerName) {
        const data = {
            team_id: teamId,
            player_id: playerId,
            team_name: teamName,
            player_name: playerName,
            saved_at: Date.now()
        };
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
            console.log('[Session] Saved to localStorage:', data.player_name, 'on', data.team_name);
        } catch (e) {
            console.warn('[Session] Failed to save to localStorage:', e);
        }
    },

    /**
     * Load session data from localStorage
     * @returns {Object|null} Session data or null if not found
     */
    load() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (!stored) return null;
            const data = JSON.parse(stored);
            // Validate required fields
            if (data.team_id && data.player_id) {
                console.log('[Session] Loaded from localStorage:', data.player_name, 'on', data.team_name);
                return data;
            }
            return null;
        } catch (e) {
            console.warn('[Session] Failed to load from localStorage:', e);
            return null;
        }
    },

    /**
     * Clear session data from localStorage
     */
    clear() {
        try {
            localStorage.removeItem(this.STORAGE_KEY);
            console.log('[Session] Cleared from localStorage');
        } catch (e) {
            console.warn('[Session] Failed to clear localStorage:', e);
        }
    }
};

const SocketHandlers = {
    /**
     * Initialize socket connection and event handlers
     */
    init() {
        if (CONFIG.MOCK_MODE) {
            console.log('[Socket] Mock mode enabled - no server connection');
            UI.showMockModeBanner();
            MockSocket.init();
            return;
        }

        AppState.socket = io();
        // Expose socket globally for screensaver and other shared components
        window.socket = AppState.socket;

        // Heartbeat interval ID
        let heartbeatInterval = null;
        const HEARTBEAT_INTERVAL = 30000; // 30 seconds

        // Connection events
        AppState.socket.on('connect', () => {
            console.log('[Socket] Connected');
            AppState.connected = true;
            UI.updateConnectionStatus(true);

            // Start heartbeat to keep session alive
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            heartbeatInterval = setInterval(() => {
                if (AppState.connected) {
                    AppState.socket.emit('heartbeat');
                }
            }, HEARTBEAT_INTERVAL);

            // Check for stored session and attempt rejoin
            const storedSession = SessionStorage.load();
            if (storedSession && !AppState.isRegistered) {
                console.log('[Socket] Attempting to rejoin session...');
                AppState.socket.emit('rejoin_session', {
                    team_id: storedSession.team_id,
                    player_id: storedSession.player_id
                });
            }
        });

        AppState.socket.on('disconnect', (reason) => {
            console.log('[Socket] Disconnected:', reason);
            AppState.connected = false;
            UI.updateConnectionStatus(false, 'Reconnecting...');
            // Stop heartbeat on disconnect
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
                heartbeatInterval = null;
            }
        });

        // Connection error handling
        AppState.socket.on('connect_error', (error) => {
            console.error('[Socket] Connection error:', error.message);
            UI.updateConnectionStatus(false, 'Connection error');
        });

        AppState.socket.io.on('reconnect_attempt', (attempt) => {
            console.log(`[Socket] Reconnect attempt ${attempt}`);
            UI.updateConnectionStatus(false, `Reconnecting (${attempt})...`);
        });

        AppState.socket.io.on('reconnect', (attempt) => {
            console.log(`[Socket] Reconnected after ${attempt} attempts`);
            UI.updateConnectionStatus(true);
        });

        AppState.socket.io.on('reconnect_failed', () => {
            console.error('[Socket] Reconnection failed');
            UI.updateConnectionStatus(false, 'Connection lost. Tap to retry.');
        });

        // Rejoin session response (after page refresh)
        AppState.socket.on('rejoin_result', (data) => {
            if (data.success) {
                console.log('[Socket] Rejoin successful, waiting for sync_state...');
            } else {
                console.log('[Socket] Rejoin failed:', data.message);
                // Clear invalid session data
                SessionStorage.clear();
                // Show registration view
                ViewManager.showRegister();
            }
        });

        // Team creation response
        AppState.socket.on('creation_result', (data) => {
            if (data.success) {
                AppState.teamId = data.team_id;
                AppState.teamName = data.team_name;
                AppState.teamColor = data.color || 1;
                AppState.playerId = data.player_id;
                AppState.playerName = data.player_name;
                AppState.joinCode = data.join_code;
                AppState.players = data.players || [];
                AppState.isRegistered = true;
                UI.updateTeamName(data.team_name, data.color);
                UI.updatePlayerName(data.player_name);
                UI.updateJoinCode(data.join_code);
                UI.updatePlayersList(data.players);
                UI.hideRegisterError();
                ViewManager.show('view-team-created');
                // Save session for refresh persistence
                SessionStorage.save(data.team_id, data.player_id, data.team_name, data.player_name);
            } else {
                UI.showRegisterError(data.message || 'Team creation failed');
            }
        });

        // Team join response
        AppState.socket.on('join_result', (data) => {
            if (data.success) {
                AppState.teamId = data.team_id;
                AppState.teamName = data.team_name;
                AppState.teamColor = data.color || 1;
                AppState.playerId = data.player_id;
                AppState.playerName = data.player_name;
                AppState.joinCode = data.join_code;
                AppState.players = data.players || [];
                AppState.isRegistered = true;
                UI.updateTeamName(data.team_name, data.color);
                UI.updatePlayerName(data.player_name);
                UI.hideRegisterError();
                ViewManager.showForState('LOBBY');
                // Save session for refresh persistence
                SessionStorage.save(data.team_id, data.player_id, data.team_name, data.player_name);
            } else {
                UI.showRegisterError(data.message || 'Failed to join team');
            }
        });

        // Player joined team (teammate notification)
        AppState.socket.on('player_joined', (data) => {
            console.log('[Socket] Player joined:', data);
            AppState.players = data.players || [];
            UI.updatePlayersList(data.players);
        });

        // State sync on reconnect
        AppState.socket.on('sync_state', (data) => {
            console.log('[Socket] State sync received:', data);
            AppState.teamId = data.team_id;
            AppState.teamName = data.team_name;
            AppState.teamColor = data.color || 1;
            AppState.playerId = data.player_id;
            AppState.playerName = data.player_name;
            AppState.joinCode = data.join_code;
            AppState.players = data.players || [];
            AppState.isRegistered = true;
            UI.updateTeamName(data.team_name, data.color);
            UI.updatePlayerName(data.player_name);
            this.handleStateChange(data);
        });

        // Global state change
        AppState.socket.on('state_change', (data) => {
            console.log('[Socket] State change:', data);
            this.handleStateChange(data);
        });

        // Trivia events
        AppState.socket.on('answer_result', (data) => {
            if (data.correct) {
                UI.updateTriviaStatus(`CORRECT! +${data.points_awarded} points`, true);
                GlitchEffects.trigger('minor');
                Haptics.success();
            } else {
                UI.updateTriviaStatus('INCORRECT', true);
                Win98Dialog.showWrongAnswer('Your answer was incorrect.');
                Haptics.error();
            }
        });

        AppState.socket.on('submission_status', (data) => {
            // Don't overwrite user's own submission confirmation or recent teammate submission
            const timeSinceTeamSubmission = Date.now() - AppState.lastTeamSubmissionTime;
            if (!AppState.triviaSubmitted && timeSinceTeamSubmission > 3000) {
                UI.updateTriviaStatus(`${data.submitted_count}/${data.total_teams} teams submitted`);
            }
        });

        // Trivia answer reveal (when admin reveals correct answer)
        AppState.socket.on('answer_revealed', (data) => {
            console.log('[Socket] Answer revealed:', data);
            // Show the correct answer
            const correctAnswer = data.correct_answer || '';
            UI.updateTriviaQuestion(`Answer: ${correctAnswer}`);
            UI.updateTriviaStatus('Round complete!', true);
            // Disable inputs
            const answerInput = document.getElementById('trivia-answer');
            const submitBtn = document.getElementById('trivia-submit');
            if (answerInput) answerInput.disabled = true;
            if (submitBtn) submitBtn.disabled = true;
            Haptics.stateChange();
        });

        // Timer events
        AppState.socket.on('timer_sync', (data) => {
            this.handleTimerSync(data);
        });

        // Buzzer events
        AppState.socket.on('buzzer_locked', (data) => {
            if (data.locked_by_team_id === AppState.teamId) {
                UI.updateBuzzer('locked-self');
            } else {
                UI.updateBuzzer('locked-other', data.locked_by_team_name);
                // Show Win98 dialog when another team buzzes
                Win98Dialog.showBuzzerLock(data.locked_by_team_name);
            }
            AppState.buzzerLockedBy = data.locked_by_team_id;
        });

        AppState.socket.on('buzzer_reset', () => {
            UI.updateBuzzer('active');
            AppState.buzzerLockedBy = null;
        });

        AppState.socket.on('buzzer_lockout', (data) => {
            const freezeSeconds = data.freeze_seconds || 10;
            UI.startBuzzerFreeze(freezeSeconds);
            // Show Win98 dialog for freeze penalty
            Win98Dialog.showFreeze(freezeSeconds);
            Haptics.warning();
        });

        // Pixel Perfect events
        AppState.socket.on('pixelperfect_locked', (data) => {
            if (data.locked_by_team_id === AppState.teamId) {
                UI.updatePixelPerfectBuzzer('locked-self');
            } else {
                UI.updatePixelPerfectBuzzer('locked-other', data.locked_by_team_name);
                Win98Dialog.showBuzzerLock(data.locked_by_team_name);
            }
        });

        AppState.socket.on('pixelperfect_reset', (data) => {
            // Only reset if this team wasn't frozen (freeze is handled separately)
            if (data.result === 'correct' || data.previous_team_id !== AppState.teamId) {
                UI.updatePixelPerfectBuzzer('active');
            }
        });

        AppState.socket.on('pixelperfect_lockout', (data) => {
            const freezeSeconds = data.freeze_seconds || 10;
            UI.startPixelPerfectFreeze(freezeSeconds);
            Win98Dialog.showFreeze(freezeSeconds);
            Haptics.warning();
        });

        // Timeline events
        AppState.socket.on('timeline_result', (data) => {
            if (data.correct) {
                const msg = data.player_name
                    ? `${data.player_name} put the milestones in order! +${data.points_awarded} points`
                    : `TIMELINE RESTORED! +${data.points_awarded} points`;
                UI.updateTimelineStatus(msg, 'var(--baby-blue)');
                Haptics.success();
            } else {
                UI.updateTimelineStatus(data.message || 'Incorrect! - Try again', 'var(--status-oops)');
                Haptics.error();
            }
        });

        // Timeline complete/reveal event
        AppState.socket.on('timeline_complete', (data) => {
            console.log('[Socket] Timeline complete:', data);
            UI.showTimelineComplete(data.correct_labels, data.winner_team_id);
        });

        // Real-time team sync events
        AppState.socket.on('timeline_sync', (data) => {
            console.log('[Socket] Timeline sync from teammate:', data.from_player_name);
            AppState.syncingFromRemote = true;
            UI.syncTimelineOrder(data.order);
            AppState.timelineOrder = data.order;
            AppState.syncingFromRemote = false;
        });

        AppState.socket.on('answer_sync', (data) => {
            console.log('[Socket] Answer sync from teammate:', data.from_player_name);
            const answerInput = document.getElementById('trivia-answer');
            if (answerInput) {
                AppState.syncingFromRemote = true;
                answerInput.value = data.text;
                AppState.syncingFromRemote = false;
            }
        });

        AppState.socket.on('answer_submitted', (data) => {
            console.log('[Socket] Answer submitted by teammate:', data.player_name);
            // Show who submitted, but keep inputs enabled so team can resubmit to update answer
            UI.updateTriviaStatus(`${data.player_name} submitted: "${data.answer_text}" (can still change)`);
            // Set timestamp to prevent submission_status from immediately overwriting this message
            AppState.lastTeamSubmissionTime = Date.now();
        });

        // Picture Guess events
        AppState.socket.on('picture_guess_result', (data) => {
            if (data.correct) {
                UI.updatePictureGuessStatus(`CORRECT! +${data.points_awarded} points`, true);
                GlitchEffects.trigger('minor');
                Haptics.success();
            } else {
                UI.updatePictureGuessStatus('INCORRECT', true);
                Win98Dialog.showWrongAnswer('Image identification failed.');
                Haptics.error();
            }
        });

        AppState.socket.on('picture_guess_sync', (data) => {
            console.log('[Socket] Picture guess sync from teammate:', data.from_player_name);
            const guessInput = document.getElementById('pictureguess-answer');
            if (guessInput) {
                AppState.syncingFromRemote = true;
                guessInput.value = data.text;
                AppState.syncingFromRemote = false;
            }
        });

        AppState.socket.on('picture_guess_submitted', (data) => {
            console.log('[Socket] Picture guess submitted by teammate:', data.player_name);
            UI.updatePictureGuessStatus(`${data.player_name} submitted: "${data.guess_text}" (can still change)`);
            // Set timestamp to prevent submission_status from immediately overwriting this message
            AppState.lastTeamSubmissionTime = Date.now();
        });

        // Picture guess reveal (when admin reveals correct answer)
        AppState.socket.on('picture_revealed', (data) => {
            console.log('[Socket] Picture revealed:', data);
            const correctAnswer = data.correct_answer || '';
            UI.updatePictureGuessHint(`Answer: ${correctAnswer}`);
            UI.updatePictureGuessStatus('Round complete!', true);
            // Disable inputs
            const guessInput = document.getElementById('pictureguess-answer');
            const submitBtn = document.getElementById('pictureguess-submit');
            if (guessInput) guessInput.disabled = true;
            if (submitBtn) submitBtn.disabled = true;
            Haptics.stateChange();
        });

        // Price Guess events
        AppState.socket.on('price_guess_result', (data) => {
            if (data.winner) {
                UI.updatePriceGuessStatus(`Winner! Actual price: $${data.actual_price.toFixed(2)}`, true);
                GlitchEffects.trigger('minor');
                Haptics.success();
            } else if (data.bust) {
                UI.updatePriceGuessStatus(`Bust! You went over. Actual price: $${data.actual_price.toFixed(2)}`, true);
                Win98Dialog.showWrongAnswer('You went over the price!');
                Haptics.error();
            } else {
                UI.updatePriceGuessStatus(`Close! Actual price: $${data.actual_price.toFixed(2)}`, true);
            }
        });

        AppState.socket.on('price_guess_sync', (data) => {
            console.log('[Socket] Price guess sync from teammate:', data.from_player_name);
            const guessInput = document.getElementById('priceguess-answer');
            if (guessInput) {
                AppState.syncingFromRemote = true;
                guessInput.value = data.text;
                AppState.syncingFromRemote = false;
            }
        });

        AppState.socket.on('price_guess_submitted', (data) => {
            console.log('[Socket] Price guess submitted by teammate:', data.player_name);
            UI.updatePriceGuessStatus(`${data.player_name} submitted: $${parseFloat(data.guess_amount).toFixed(2)} (can still change)`);
            // Set timestamp to prevent submission_status from immediately overwriting this message
            AppState.lastTeamSubmissionTime = Date.now();
        });

        // Price reveal (when admin reveals actual price)
        AppState.socket.on('price_revealed', (data) => {
            console.log('[Socket] Price revealed:', data);
            const actualPrice = data.actual_price || 0;
            const isWinner = data.winner_team_id === AppState.teamId;

            UI.updatePriceGuessHint(`Actual Price: $${actualPrice.toFixed(2)}`);
            if (isWinner) {
                UI.updatePriceGuessStatus('You won! Closest without going over!', true);
                Haptics.success();
            } else {
                UI.updatePriceGuessStatus('Round complete!', true);
                Haptics.stateChange();
            }
            // Disable inputs
            const guessInput = document.getElementById('priceguess-answer');
            const submitBtn = document.getElementById('priceguess-submit');
            if (guessInput) guessInput.disabled = true;
            if (submitBtn) submitBtn.disabled = true;
        });

        // Minesweeper events
        AppState.socket.on('eliminated', (data) => {
            // Show BSOD before switching to eliminated view
            BSOD.show(AppState.teamName, 3000);
            setTimeout(() => {
                ViewManager.showEliminated();
            }, 3000);
        });

        AppState.socket.on('elimination_update', (data) => {
            if (data.team_id === AppState.teamId && data.eliminated) {
                UI.updateMinesweeperStatus(false);
                BSOD.show(AppState.teamName, 3000);
            }
        });

        // Survival events
        AppState.socket.on('survival_vote_confirmed', (data) => {
            AppState.survivalVote = data.vote;
            UI.selectSurvivalVote(data.vote);
            UI.updateSurvivalStatus('Vote submitted! Waiting for others...');
            Haptics.confirm();
        });

        AppState.socket.on('survival_vote_update', (data) => {
            // Could show anonymous vote counts if desired
            console.log('[Socket] Survival vote update:', data);
        });

        AppState.socket.on('survival_reveal', (data) => {
            // Check if our team was awarded points
            const teamAwarded = data.teams_awarded?.find(t => t.team_id === AppState.teamId);
            const teamNotAwarded = data.teams_not_awarded?.find(t => t.team_id === AppState.teamId);

            if (data.is_tie) {
                UI.updateSurvivalStatus("It's a tie! No points this round.");
                UI.updateSurvivalTeamStatus(false, null);
                Haptics.success();
            } else if (teamAwarded) {
                UI.updateSurvivalStatus(`Your team aligned with the majority! +${teamAwarded.points_awarded} points!`);
                UI.updateSurvivalTeamStatus(false, teamAwarded.points_awarded);
                Haptics.success();
            } else if (teamNotAwarded) {
                const reason = teamNotAwarded.reason;
                let msg = 'Your team voted with the minority.';
                if (reason === 'team_tie') {
                    msg = 'Your team was split - no majority!';
                } else if (reason === 'no_votes') {
                    msg = 'No one from your team voted!';
                }
                UI.updateSurvivalStatus(msg);
                UI.updateSurvivalTeamStatus(false, 0);
                Haptics.impact();
            }
        });

        AppState.socket.on('survival_round_reset', (data) => {
            // New round starting
            AppState.survivalVote = null;
            const questionEl = document.getElementById('survival-question');
            if (questionEl && data.question_text) {
                questionEl.textContent = data.question_text;
            }
            const labelA = document.getElementById('survival-label-a');
            const labelB = document.getElementById('survival-label-b');
            if (labelA && data.option_a) labelA.textContent = data.option_a;
            if (labelB && data.option_b) labelB.textContent = data.option_b;
            UI.updateSurvivalStatus('');
            // Clear previous result
            const statusEl = document.getElementById('survival-team-status');
            if (statusEl) {
                statusEl.textContent = '';
                statusEl.className = 'survival-team-status';
            }
            UI.resetSurvivalVoteButtons();
            Haptics.stateChange();
        });

        // Admin actions
        AppState.socket.on('team_kicked', () => {
            ViewManager.showKicked();
            AppState.isRegistered = false;
            // Clear saved session since team was kicked
            SessionStorage.clear();
        });

        // Error handling
        AppState.socket.on('error', (data) => {
            console.error('[Socket] Error:', data);
        });
    },

    /**
     * Handle state change event
     * @param {Object} data
     */
    handleStateChange(data) {
        const state = data.current_state;

        // Haptic feedback on state change (if state actually changed)
        if (AppState.currentState !== state) {
            Haptics.stateChange();
        }

        ViewManager.showForState(state);

        // Update reaction bar visibility
        updateReactionBarVisibility(state);

        // Handle state-specific data
        switch (state) {
            case 'MACGYVER':
                if (data.state_data?.message) {
                    document.getElementById('macgyver-message').textContent = data.state_data.message;
                }
                break;

            case 'TRIVIA':
                // Reset submission flag for new question
                AppState.triviaSubmitted = false;
                if (data.state_data?.question_text) {
                    UI.updateTriviaQuestion(data.state_data.question_text);
                    UI.updateTriviaStatus('', false);
                    document.getElementById('trivia-answer').value = '';
                }
                // Track current question ID for submission
                AppState.currentQuestionId = data.state_data?.question_id || null;
                break;

            case 'TIMER':
                if (data.state_data?.message) {
                    document.getElementById('timer-message').textContent = data.state_data.message;
                }
                if (data.state_data?.duration_seconds) {
                    UI.updateTimer(data.state_data.duration_seconds, data.state_data.duration_seconds);
                }
                break;

            case 'BUZZER':
                UI.updateBuzzer('active');
                if (data.state_data?.audio_hint) {
                    document.getElementById('buzzer-hint').textContent = data.state_data.audio_hint;
                }
                break;

            case 'TIMELINE':
                // Reset timeline state for new puzzle
                UI.resetTimelineState();
                if (data.state_data?.items && data.state_data.items.length > 0) {
                    UI.initTimeline(data.state_data.items);
                } else {
                    // No items yet - show waiting state
                    UI.showTimelineWaiting();
                }
                // Track current puzzle ID for submission
                AppState.currentPuzzleId = data.state_data?.puzzle_id || null;
                UI.updateTimelineStatus('');
                break;

            case 'MINESWEEPER':
                if (data.state_data?.message) {
                    document.getElementById('minesweeper-message').textContent = data.state_data.message;
                }
                UI.updateMinesweeperStatus(true);
                break;

            case 'PICTUREGUESS':
                if (data.state_data?.hint) {
                    UI.updatePictureGuessHint(data.state_data.hint);
                } else {
                    UI.updatePictureGuessHint('');
                }
                UI.updatePictureGuessStatus('', false);
                const picGuessInput = document.getElementById('pictureguess-answer');
                if (picGuessInput) picGuessInput.value = '';
                // Track current picture ID for submission
                AppState.currentPictureId = data.state_data?.picture_id || null;
                break;

            case 'PIXELPERFECT':
                // Reset buzzer state for pixel perfect
                UI.updatePixelPerfectBuzzer('active');
                AppState.pixelperfectLocked = false;
                break;

            case 'PRICEGUESS':
                if (data.state_data?.hint) {
                    UI.updatePriceGuessHint(data.state_data.hint);
                } else {
                    UI.updatePriceGuessHint('');
                }
                UI.updatePriceGuessStatus('', false);
                const priceGuessInput = document.getElementById('priceguess-answer');
                if (priceGuessInput) priceGuessInput.value = '';
                // Track current product ID for submission
                AppState.currentProductId = data.state_data?.product_id || null;
                break;

            case 'SURVIVAL':
                // Reset survival vote state
                AppState.survivalVote = null;
                if (data.state_data?.question_text) {
                    const questionEl = document.getElementById('survival-question');
                    if (questionEl) questionEl.textContent = data.state_data.question_text;
                }
                if (data.state_data?.option_a) {
                    const labelA = document.getElementById('survival-label-a');
                    if (labelA) labelA.textContent = data.state_data.option_a;
                }
                if (data.state_data?.option_b) {
                    const labelB = document.getElementById('survival-label-b');
                    if (labelB) labelB.textContent = data.state_data.option_b;
                }
                UI.updateSurvivalStatus('');
                // Clear any previous result
                const survivalStatusEl = document.getElementById('survival-team-status');
                if (survivalStatusEl) {
                    survivalStatusEl.textContent = '';
                    survivalStatusEl.className = 'survival-team-status';
                }
                UI.resetSurvivalVoteButtons();
                break;

            case 'VICTORY':
                if (data.state_data?.winner_team_id === AppState.teamId) {
                    document.getElementById('victory-message').innerHTML = '<p class="glow-strong" style="font-size: 2rem;">YOU WIN!</p>';
                } else {
                    document.getElementById('victory-message').innerHTML = '<p>Game Over</p>';
                }
                break;
        }
    },

    /**
     * Handle timer sync event
     * @param {Object} data
     */
    handleTimerSync(data) {
        if (data.action === 'start' || data.action === 'resume') {
            // Start local timer countdown
            if (AppState.timerInterval) {
                clearInterval(AppState.timerInterval);
            }

            let remaining = data.remaining_seconds;
            const total = data.total_seconds;

            UI.updateTimer(remaining, total);

            AppState.timerInterval = setInterval(() => {
                remaining--;
                if (remaining <= 0) {
                    clearInterval(AppState.timerInterval);
                    UI.updateTimer(0, total);
                } else {
                    UI.updateTimer(remaining, total);
                }
            }, 1000);

        } else if (data.action === 'pause') {
            if (AppState.timerInterval) {
                clearInterval(AppState.timerInterval);
            }

        } else if (data.action === 'reset') {
            if (AppState.timerInterval) {
                clearInterval(AppState.timerInterval);
            }
            UI.updateTimer(data.remaining_seconds, data.total_seconds);

        } else if (data.action === 'complete') {
            if (AppState.timerInterval) {
                clearInterval(AppState.timerInterval);
            }
            UI.updateTimer(0, data.total_seconds);
        }
    },

    /**
     * Emit event to server
     * @param {string} event
     * @param {Object} data
     */
    emit(event, data) {
        if (CONFIG.MOCK_MODE) {
            MockSocket.emit(event, data);
        } else if (AppState.socket && AppState.connected) {
            AppState.socket.emit(event, data);
        } else {
            console.warn('[Socket] Cannot emit - not connected');
        }
    }
};

// ============================================================
// MOCK SOCKET (for testing without server)
// ============================================================

const MockSocket = {
    /**
     * Initialize mock socket
     */
    init() {
        AppState.connected = true;
        UI.updateConnectionStatus(true);
    },

    /**
     * Handle mock emit
     * @param {string} event
     * @param {Object} data
     */
    emit(event, data) {
        console.log(`[MockSocket] Emit: ${event}`, data);

        setTimeout(() => {
            switch (event) {
                case 'create_team':
                    this.mockCreateTeam(data);
                    break;
                case 'join_team':
                    this.mockJoinTeam(data);
                    break;
                case 'submit_answer':
                    this.mockTriviaSubmit(data);
                    break;
                case 'press_buzzer':
                    this.mockBuzzerPress(data);
                    break;
                case 'submit_timeline':
                    this.mockTimelineSubmit(data);
                    break;
            }
        }, CONFIG.MOCK_DELAY);
    },

    mockCreateTeam(data) {
        const result = {
            success: true,
            team_id: 'mock-team-' + Date.now(),
            player_id: 'mock-player-' + Date.now(),
            team_name: data.team_name,
            player_name: data.player_name,
            join_code: 'AB12',
            players: [{ player_id: 'mock-player-' + Date.now(), name: data.player_name }]
        };
        AppState.teamId = result.team_id;
        AppState.teamName = result.team_name;
        AppState.playerId = result.player_id;
        AppState.playerName = result.player_name;
        AppState.joinCode = result.join_code;
        AppState.players = result.players;
        AppState.isRegistered = true;
        UI.updateTeamName(result.team_name);
        UI.updatePlayerName(result.player_name);
        UI.updateJoinCode(result.join_code);
        UI.updatePlayersList(result.players);
        UI.hideRegisterError();
        ViewManager.show('view-team-created');
    },

    mockJoinTeam(data) {
        const result = {
            success: true,
            team_id: 'mock-team-123',
            player_id: 'mock-player-' + Date.now(),
            team_name: 'Mock Team',
            player_name: data.player_name,
            join_code: data.join_code,
            players: [
                { player_id: 'mock-player-1', name: 'Alice' },
                { player_id: 'mock-player-' + Date.now(), name: data.player_name }
            ]
        };
        AppState.teamId = result.team_id;
        AppState.teamName = result.team_name;
        AppState.playerId = result.player_id;
        AppState.playerName = result.player_name;
        AppState.joinCode = result.join_code;
        AppState.players = result.players;
        AppState.isRegistered = true;
        UI.updateTeamName(result.team_name);
        UI.updatePlayerName(result.player_name);
        UI.hideRegisterError();
        ViewManager.showForState('LOBBY');
    },

    mockTriviaSubmit(data) {
        // In mock mode, show submitted answer (can still change until graded)
        UI.updateTriviaStatus(`Submitted: "${data.answer_text}" (can still change)`);
    },

    mockBuzzerPress() {
        UI.updateBuzzer('locked-self');
        setTimeout(() => {
            UI.updateBuzzer('active');
        }, 3000);
    },

    mockTimelineSubmit() {
        const correct = Math.random() > 0.7;
        if (correct) {
            UI.updateTimelineStatus('TIMELINE RESTORED! +100 points', 'var(--baby-blue)');
        } else {
            UI.updateTimelineStatus('Incorrect! - Try again', 'var(--status-oops)');
        }
    }
};

// ============================================================
// EVENT BINDINGS
// ============================================================

function initEventBindings() {
    // Create team form
    const createForm = document.getElementById('create-form');
    if (createForm) {
        createForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const teamName = document.getElementById('create-team-name').value.trim();
            const playerName = document.getElementById('create-player-name').value.trim();
            if (teamName && playerName) {
                SocketHandlers.emit('create_team', {
                    team_name: teamName,
                    player_name: playerName
                });
            }
        });
    }

    // Join team form
    const joinForm = document.getElementById('join-form');
    if (joinForm) {
        joinForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const joinCode = document.getElementById('join-code').value.trim().toUpperCase();
            const playerName = document.getElementById('join-player-name').value.trim();
            if (joinCode && playerName) {
                SocketHandlers.emit('join_team', {
                    join_code: joinCode,
                    player_name: playerName
                });
            }
        });
    }

    // Trivia form submission
    const triviaForm = document.getElementById('trivia-form');
    if (triviaForm) {
        triviaForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const answer = document.getElementById('trivia-answer').value.trim();
            if (answer && AppState.teamId) {
                Haptics.confirm();
                SocketHandlers.emit('submit_answer', {
                    team_id: AppState.teamId,
                    question_id: AppState.currentQuestionId,
                    answer_text: answer
                });
                // Show confirmation but keep enabled - team can resubmit to update answer
                UI.updateTriviaStatus(`Submitted: "${answer}" (can still change)`);
                // Set flag to prevent submission_status from overwriting this message
                AppState.triviaSubmitted = true;
            }
        });
    }

    // Trivia submit button (fallback for direct click)
    const triviaSubmitBtn = document.getElementById('trivia-submit');
    if (triviaSubmitBtn) {
        triviaSubmitBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const answer = document.getElementById('trivia-answer').value.trim();
            if (answer && AppState.teamId) {
                Haptics.confirm();
                SocketHandlers.emit('submit_answer', {
                    team_id: AppState.teamId,
                    question_id: AppState.currentQuestionId,
                    answer_text: answer
                });
                // Show confirmation but keep enabled - team can resubmit to update answer
                UI.updateTriviaStatus(`Submitted: "${answer}" (can still change)`);
                // Set flag to prevent submission_status from overwriting this message
                AppState.triviaSubmitted = true;
            }
        });
    }

    // Trivia answer input - sync typing to teammates
    const triviaAnswer = document.getElementById('trivia-answer');
    if (triviaAnswer) {
        triviaAnswer.addEventListener('input', (e) => {
            // Don't emit if we're syncing from a remote update
            if (AppState.syncingFromRemote) return;

            // Debounce the typing event
            clearTimeout(AppState.answerTypingTimeout);
            AppState.answerTypingTimeout = setTimeout(() => {
                SocketHandlers.emit('answer_typing', { text: e.target.value });
            }, 300);
        });
    }

    // Picture guess form submission
    const pictureGuessForm = document.getElementById('pictureguess-form');
    if (pictureGuessForm) {
        pictureGuessForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const guess = document.getElementById('pictureguess-answer').value.trim();
            if (guess && AppState.teamId) {
                Haptics.confirm();
                SocketHandlers.emit('submit_picture_guess', {
                    team_id: AppState.teamId,
                    picture_id: AppState.currentPictureId,
                    guess_text: guess
                });
                UI.updatePictureGuessStatus(`Submitted: "${guess}" (can still change)`);
            }
        });
    }

    // Picture guess submit button (fallback for direct click)
    const pictureGuessSubmitBtn = document.getElementById('pictureguess-submit');
    if (pictureGuessSubmitBtn) {
        pictureGuessSubmitBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const guess = document.getElementById('pictureguess-answer').value.trim();
            if (guess && AppState.teamId) {
                Haptics.confirm();
                SocketHandlers.emit('submit_picture_guess', {
                    team_id: AppState.teamId,
                    picture_id: AppState.currentPictureId,
                    guess_text: guess
                });
                UI.updatePictureGuessStatus(`Submitted: "${guess}" (can still change)`);
            }
        });
    }

    // Picture guess answer input - sync typing to teammates
    const pictureGuessAnswer = document.getElementById('pictureguess-answer');
    if (pictureGuessAnswer) {
        pictureGuessAnswer.addEventListener('input', (e) => {
            // Don't emit if we're syncing from a remote update
            if (AppState.syncingFromRemote) return;

            // Debounce the typing event
            clearTimeout(AppState.pictureGuessTypingTimeout);
            AppState.pictureGuessTypingTimeout = setTimeout(() => {
                SocketHandlers.emit('picture_guess_typing', { text: e.target.value });
            }, 300);
        });
    }

    // Price guess form submission
    const priceGuessForm = document.getElementById('priceguess-form');
    if (priceGuessForm) {
        priceGuessForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const guessAmount = document.getElementById('priceguess-answer').value;
            if (guessAmount && AppState.teamId) {
                Haptics.confirm();
                SocketHandlers.emit('submit_price_guess', {
                    team_id: AppState.teamId,
                    product_id: AppState.currentProductId,
                    guess_amount: parseFloat(guessAmount)
                });
                UI.updatePriceGuessStatus(`Submitted: $${parseFloat(guessAmount).toFixed(2)} (can still change)`);
            }
        });
    }

    // Price guess submit button (fallback for direct click)
    const priceGuessSubmitBtn = document.getElementById('priceguess-submit');
    if (priceGuessSubmitBtn) {
        priceGuessSubmitBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const guessAmount = document.getElementById('priceguess-answer').value;
            if (guessAmount && AppState.teamId) {
                Haptics.confirm();
                SocketHandlers.emit('submit_price_guess', {
                    team_id: AppState.teamId,
                    product_id: AppState.currentProductId,
                    guess_amount: parseFloat(guessAmount)
                });
                UI.updatePriceGuessStatus(`Submitted: $${parseFloat(guessAmount).toFixed(2)} (can still change)`);
            }
        });
    }

    // Price guess answer input - sync typing to teammates
    const priceGuessAnswer = document.getElementById('priceguess-answer');
    if (priceGuessAnswer) {
        priceGuessAnswer.addEventListener('input', (e) => {
            if (AppState.syncingFromRemote) return;
            clearTimeout(AppState.priceGuessTypingTimeout);
            AppState.priceGuessTypingTimeout = setTimeout(() => {
                SocketHandlers.emit('price_guess_typing', { text: e.target.value });
            }, 300);
        });
    }

    // Buzzer button
    const buzzerBtn = document.getElementById('buzzer-button');
    if (buzzerBtn) {
        buzzerBtn.addEventListener('click', () => {
            if (!AppState.buzzerLocked && AppState.teamId) {
                Haptics.buzzer();
                SocketHandlers.emit('press_buzzer', {
                    team_id: AppState.teamId,
                    timestamp: Date.now()
                });
            }
        });
    }

    // Pixel Perfect buzzer button
    const pixelperfectBuzzerBtn = document.getElementById('pixelperfect-buzzer-button');
    if (pixelperfectBuzzerBtn) {
        pixelperfectBuzzerBtn.addEventListener('click', () => {
            if (!AppState.pixelperfectLocked && AppState.teamId) {
                Haptics.buzzer();
                SocketHandlers.emit('press_pixelperfect_buzzer', {
                    team_id: AppState.teamId,
                    timestamp: Date.now()
                });
            }
        });
    }

    // Timeline submit
    const timelineSubmit = document.getElementById('timeline-submit');
    if (timelineSubmit) {
        timelineSubmit.addEventListener('click', () => {
            // Don't submit if timeline has been revealed
            if (AppState.timelineCompleted) return;

            if (AppState.teamId) {
                Haptics.confirm();
                SocketHandlers.emit('submit_timeline', {
                    team_id: AppState.teamId,
                    puzzle_id: AppState.currentPuzzleId,
                    order: AppState.timelineOrder
                });
            }
        });
    }

    // Survival vote buttons
    const survivalVoteA = document.getElementById('survival-vote-a');
    const survivalVoteB = document.getElementById('survival-vote-b');

    if (survivalVoteA) {
        survivalVoteA.addEventListener('click', () => {
            if (AppState.survivalVote) return; // Already voted this round
            Haptics.tap();
            SocketHandlers.emit('survival_vote', {
                team_id: AppState.teamId,
                vote: 'A'
            });
        });
    }

    if (survivalVoteB) {
        survivalVoteB.addEventListener('click', () => {
            if (AppState.survivalVote) return; // Already voted this round
            Haptics.tap();
            SocketHandlers.emit('survival_vote', {
                team_id: AppState.teamId,
                vote: 'B'
            });
        });
    }
}

// Tab switching functions (for registration view)
function showCreateTab() {
    document.getElementById('tab-create').classList.add('frost-tab--active');
    document.getElementById('tab-join').classList.remove('frost-tab--active');
    document.getElementById('create-form').classList.remove('hidden');
    document.getElementById('join-form').classList.add('hidden');
}

function showJoinTab() {
    document.getElementById('tab-join').classList.add('frost-tab--active');
    document.getElementById('tab-create').classList.remove('frost-tab--active');
    document.getElementById('join-form').classList.remove('hidden');
    document.getElementById('create-form').classList.add('hidden');
}

// Proceed to lobby after team creation
function proceedToLobby() {
    ViewManager.showForState('LOBBY');
}

// ============================================================
// MOCK MODE TEST CONTROLS
// ============================================================

function initMockModeTestControls() {
    if (!CONFIG.MOCK_MODE) return;

    // Add test buttons for cycling through views
    const testControls = document.createElement('div');
    testControls.style.cssText = 'position:fixed;top:50px;right:10px;z-index:9999;display:flex;flex-direction:column;gap:5px;';
    testControls.innerHTML = `
        <button class="terminal-btn" style="padding:5px 10px;font-size:0.7rem;" onclick="ViewManager.show('view-register')">REGISTER</button>
        <button class="terminal-btn" style="padding:5px 10px;font-size:0.7rem;" onclick="ViewManager.showForState('LOBBY')">LOBBY</button>
        <button class="terminal-btn" style="padding:5px 10px;font-size:0.7rem;" onclick="MockTestHelper.showTrivia()">TRIVIA</button>
        <button class="terminal-btn" style="padding:5px 10px;font-size:0.7rem;" onclick="MockTestHelper.showTimer()">TIMER</button>
        <button class="terminal-btn" style="padding:5px 10px;font-size:0.7rem;" onclick="ViewManager.showForState('BUZZER')">BUZZER</button>
        <button class="terminal-btn" style="padding:5px 10px;font-size:0.7rem;" onclick="MockTestHelper.showTimeline()">TIMELINE</button>
        <button class="terminal-btn" style="padding:5px 10px;font-size:0.7rem;" onclick="ViewManager.showForState('MINESWEEPER')">MINESWEEPER</button>
        <button class="terminal-btn" style="padding:5px 10px;font-size:0.7rem;" onclick="MockTestHelper.showPictureGuess()">PICTUREGUESS</button>
        <button class="terminal-btn" style="padding:5px 10px;font-size:0.7rem;" onclick="ViewManager.showForState('VICTORY')">VICTORY</button>
    `;
    document.body.appendChild(testControls);
}

// Mock test helpers
const MockTestHelper = {
    showTrivia() {
        ViewManager.showForState('TRIVIA');
        UI.updateTriviaQuestion('How many diapers does a newborn use per day?');
    },

    showTimer() {
        ViewManager.showForState('TIMER');
        UI.updateTimer(180, 180);

        // Start countdown for demo
        let remaining = 180;
        if (AppState.timerInterval) clearInterval(AppState.timerInterval);
        AppState.timerInterval = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(AppState.timerInterval);
            }
            UI.updateTimer(remaining, 180);
        }, 1000);
    },

    showTimeline() {
        ViewManager.showForState('TIMELINE');
        UI.initTimeline([
            'Conception',
            'First Ultrasound',
            'Gender Reveal',
            'Baby Shower'
        ]);
    },

    showPictureGuess() {
        ViewManager.showForState('PICTUREGUESS');
        UI.updatePictureGuessHint('This item is essential for feeding...');
    }
};

// ============================================================
// AVATAR SELECTION
// ============================================================

/**
 * Initialize avatar selection grid
 */
function initAvatarGrid() {
    const grid = document.getElementById('avatar-grid');
    if (!grid) return;

    grid.innerHTML = AVATARS.map(avatar => `
        <button class="avatar-option" data-avatar-id="${avatar.id}" title="${avatar.name}">
            ${avatar.emoji}
        </button>
    `).join('');

    // Add click handlers
    grid.querySelectorAll('.avatar-option').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const avatarId = btn.dataset.avatarId;
            selectAvatar(avatarId);
        });
    });

    // Auto-select first avatar
    if (AVATARS.length > 0) {
        selectAvatar(AVATARS[0].id);
    }
}

/**
 * Select an avatar
 * @param {string} avatarId - The avatar ID to select
 */
function selectAvatar(avatarId) {
    const grid = document.getElementById('avatar-grid');
    if (!grid) return;

    // Update UI
    grid.querySelectorAll('.avatar-option').forEach(btn => {
        btn.classList.remove('selected');
        if (btn.dataset.avatarId === avatarId) {
            btn.classList.add('selected');
        }
    });

    AppState.selectedAvatar = avatarId;

    // Emit to server if connected and registered
    if (AppState.teamId) {
        SocketHandlers.emit('select_avatar', {
            team_id: AppState.teamId,
            avatar_id: avatarId
        });
    }
}

// ============================================================
// REACTION BAR
// ============================================================

/**
 * Initialize reaction bar
 */
function initReactionBar() {
    const bar = document.getElementById('reaction-bar');
    if (!bar) return;

    // Updated selector for new frost-reactions__emoji class
    bar.querySelectorAll('.frost-reactions__emoji').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const reaction = btn.dataset.reaction;
            sendReaction(reaction);
        });
    });

    // Initialize chat toggle button
    const chatToggle = document.getElementById('chat-toggle');
    const chatDrawer = document.getElementById('chat-drawer');
    const chatOverlay = document.getElementById('chat-overlay');
    const chatClose = document.getElementById('chat-close');

    if (chatToggle && chatDrawer) {
        chatToggle.addEventListener('click', () => {
            chatDrawer.classList.add('open');
            if (chatOverlay) chatOverlay.classList.add('open');
            const input = document.getElementById('chat-input');
            if (input) input.focus();
        });
    }

    if (chatClose && chatDrawer) {
        chatClose.addEventListener('click', () => {
            chatDrawer.classList.remove('open');
            if (chatOverlay) chatOverlay.classList.remove('open');
        });
    }

    if (chatOverlay && chatDrawer) {
        chatOverlay.addEventListener('click', () => {
            chatDrawer.classList.remove('open');
            chatOverlay.classList.remove('open');
        });
    }
}

/**
 * Send a reaction (with throttling)
 * @param {string} reaction - The emoji to send
 */
function sendReaction(reaction) {
    const now = Date.now();
    const cooldown = 2000; // 2 seconds between reactions

    if (now - AppState.lastReactionTime < cooldown) {
        // Still on cooldown
        return;
    }

    AppState.lastReactionTime = now;

    // Emit to server
    SocketHandlers.emit('send_reaction', {
        team_id: AppState.teamId,
        player_id: AppState.playerId,
        player_name: AppState.playerName,
        reaction: reaction
    });

    // Disable buttons briefly
    const bar = document.getElementById('reaction-bar');
    if (bar) {
        bar.querySelectorAll('.frost-reactions__emoji').forEach(btn => {
            btn.disabled = true;
        });

        setTimeout(() => {
            bar.querySelectorAll('.frost-reactions__emoji').forEach(btn => {
                btn.disabled = false;
            });
        }, cooldown);
    }
}

/**
 * Show/hide reaction bar based on game state
 * @param {string} state - Current game state
 */
function updateReactionBarVisibility(state) {
    const bar = document.getElementById('reaction-bar');

    // Show reaction bar during gameplay (chat drawer is accessed via toggle button in bar)
    const showStates = ['LOBBY', 'MACGYVER', 'TRIVIA', 'TIMER', 'BUZZER', 'TIMELINE', 'MINESWEEPER', 'PICTUREGUESS', 'PIXELPERFECT', 'PRICEGUESS', 'SURVIVAL', 'VICTORY'];

    if (showStates.includes(state) && AppState.isRegistered) {
        if (bar) bar.classList.remove('hidden');
    } else {
        if (bar) bar.classList.add('hidden');
        // Also close chat drawer when hiding reaction bar
        const chatDrawer = document.getElementById('chat-drawer');
        const chatOverlay = document.getElementById('chat-overlay');
        if (chatDrawer) chatDrawer.classList.remove('open');
        if (chatOverlay) chatOverlay.classList.remove('open');
    }
}

// ============================================================
// CHAT INPUT
// ============================================================

/**
 * Initialize chat input bar
 */
function initChatInput() {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');

    if (!input || !sendBtn) return;

    // Send on button click
    sendBtn.addEventListener('click', (e) => {
        e.preventDefault();
        sendChatMessage();
    });

    // Send on Enter key
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendChatMessage();
        }
    });
}

/**
 * Send a chat message (with throttling)
 */
function sendChatMessage() {
    const input = document.getElementById('chat-input');
    if (!input) return;

    const message = input.value.trim();
    if (!message) return;

    const now = Date.now();
    const cooldown = 3000; // 3 seconds between messages

    if (now - AppState.lastChatTime < cooldown) {
        // Still on cooldown - could show feedback
        return;
    }

    AppState.lastChatTime = now;

    // Emit to server
    SocketHandlers.emit('send_chat_message', {
        team_id: AppState.teamId,
        player_id: AppState.playerId,
        player_name: AppState.playerName,
        message: message
    });

    // Clear input
    input.value = '';

    // Disable input briefly
    const sendBtn = document.getElementById('chat-send-btn');
    input.disabled = true;
    if (sendBtn) sendBtn.disabled = true;

    setTimeout(() => {
        input.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
    }, cooldown);
}

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Client] Initializing...');

    // Play boot sequence first (shorter for mobile)
    await BootSequence.play();

    // Initialize socket connection
    SocketHandlers.init();

    // Bind event handlers
    initEventBindings();

    // Initialize avatar grid
    initAvatarGrid();

    // Initialize reaction bar
    initReactionBar();

    // Initialize chat input
    initChatInput();

    // Show registration view by default
    ViewManager.showRegister();

    // Initialize mock mode test controls if enabled
    initMockModeTestControls();

    console.log('[Client] Ready');
});

// Expose to window for debugging
window.ViewManager = ViewManager;
window.AppState = AppState;
window.CONFIG = CONFIG;
window.MockTestHelper = MockTestHelper;
window.BootSequence = BootSequence;
window.GlitchEffects = GlitchEffects;
window.Win98Dialog = Win98Dialog;
window.BSOD = BSOD;
window.VHSTransition = VHSTransition;
window.TimerEffects = TimerEffects;
window.SessionStorage = SessionStorage;
window.Haptics = Haptics;
