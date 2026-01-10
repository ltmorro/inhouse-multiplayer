/**
 * TV.JS - TV Display View Manager
 * Handles view switching and socket events for the main display
 *
 * Uses shared modules from src/scripts/ (exposed via window globals):
 * - window.STATE_VIEW_MAP, window.GAME_PHASES, window.AVATAR_EMOJIS
 * - window.TeamColors, window.VHSTransition, window.TimerEffects
 */

// ============================================================
// CONFIGURATION (uses shared modules from globals)
// ============================================================

const CONFIG = {
    // Set to true to enable mock mode (no server connection)
    MOCK_MODE: false,

    // Mock mode delay (ms) for simulated responses
    MOCK_DELAY: 500,

    // States mapping to views - use shared config with fallback
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
    },

    // Game phases - use shared config with fallback
    get GAME_PHASES() {
        return window.GAME_PHASES || [
            'MACGYVER',
            'TRIVIA',
            'TIMER',
            'BUZZER',
            'TIMELINE',
            'MINESWEEPER',
            'PICTUREGUESS',
            'PIXELPERFECT',
            'PRICEGUESS',
            'SURVIVAL'
        ];
    }
};

// ============================================================
// STATE
// ============================================================

const AppState = {
    socket: null,
    connected: false,
    currentState: 'LOBBY',
    teams: {},
    scores: {},
    timerInterval: null,
    timerRemaining: 0,
    timerTotal: 0,
    // Spotify Web Playback SDK
    spotifyPlayer: null,
    spotifyDeviceId: null,
    spotifyConnected: false,
    spotifyToken: null,
    currentSpotifyUri: null,
    // Audio unlock state (browser autoplay policy)
    audioUnlocked: false
};

// ============================================================
// BOOT SEQUENCE STUB (actual boot handled by Astro component)
// ============================================================

const BootSequence = {
    hasPlayed: true, // Boot sequence handled by Astro component
    skip() { this.hasPlayed = true; }
};

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
        if (withTransition) {
            // Play transition, then switch view
            VHSTransition.play('switch').then(() => {
                this.hideAll();
                const view = document.getElementById(viewId);
                if (view) {
                    view.classList.add('active');
                }
            });
        } else {
            this.hideAll();
            const view = document.getElementById(viewId);
            if (view) {
                view.classList.add('active');
            }
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
            // Use transition if changing from one state to another (not initial load)
            const useTransition = AppState.currentState !== 'LOBBY' || state !== 'LOBBY';
            this.show(viewId, useTransition && BootSequence.hasPlayed);
            AppState.currentState = state;
        } else {
            console.warn(`[ViewManager] Unknown state: ${state}`);
        }
    }
};

// ============================================================
// GAME PROGRESS INDICATOR
// ============================================================

const GameProgress = {
    /**
     * Update the progress indicator based on current game state
     * @param {string} state - The current game state
     */
    update(state) {
        const progressEl = document.getElementById('game-progress');
        const roundEl = document.getElementById('progress-round');
        const fillEl = document.getElementById('progress-fill');

        if (!progressEl || !roundEl || !fillEl) return;

        // Only show during gameplay phases (not LOBBY or VICTORY)
        const phaseIndex = CONFIG.GAME_PHASES.indexOf(state);
        const isGameplayPhase = phaseIndex !== -1;

        if (isGameplayPhase) {
            const currentRound = phaseIndex + 1;
            const totalRounds = CONFIG.GAME_PHASES.length;
            const progressPercent = (currentRound / totalRounds) * 100;

            roundEl.textContent = `Chapter ${currentRound} of ${totalRounds}`;
            fillEl.style.width = `${progressPercent}%`;
            progressEl.classList.add('visible');
        } else if (state === 'VICTORY') {
            // Show completed state on victory
            roundEl.textContent = 'All Chapters Complete';
            fillEl.style.width = '100%';
            progressEl.classList.add('visible');
        } else {
            // Hide during LOBBY
            progressEl.classList.remove('visible');
        }
    }
};

// ============================================================
// UI UPDATERS
// ============================================================

const UI = {
    /**
     * Update lobby teams list
     */
    updateLobbyTeams() {
        const container = document.getElementById('lobby-teams');
        const teamIds = Object.keys(AppState.teams);

        // Update HUD team count orb
        if (window.hudController) {
            window.hudController.updateTeamCount(teamIds.length);
        }

        if (teamIds.length === 0) {
            container.innerHTML = '<p style="color: var(--baby-blue-dim);">No teams connected</p>';
            return;
        }

        // Avatar emoji lookup - use shared module
        const avatarEmojis = window.AVATAR_EMOJIS || {
            'bottle': '🍼', 'pacifier': '👶', 'bear': '🧸', 'duck': '🦆',
            'rattle': '🪇', 'stroller': '🛒', 'footprint': '👣', 'angel': '👼'
        };

        let html = '<div style="display:flex;flex-wrap:wrap;gap:20px;justify-content:center;">';
        teamIds.forEach(id => {
            const team = AppState.teams[id];
            const avatarEmoji = team.avatar ? (avatarEmojis[team.avatar] || '👶') : '👶';
            const borderClass = TeamColors.getBorderClass(id);
            const colorClass = TeamColors.getColorClass(id);
            const players = team.players || [];
            const playersHtml = players.length > 0
                ? `<div class="lobby-team-card__members">${players.join(', ')}</div>`
                : '';
            html += `<div class="lobby-team-card ${borderClass}">
                <span class="lobby-team-card__avatar">${avatarEmoji}</span>
                <div class="lobby-team-card__info">
                    <span class="lobby-team-card__name ${colorClass}">${team.name}</span>
                    ${playersHtml}
                </div>
            </div>`;
        });
        html += '</div>';
        container.innerHTML = html;
    },

    /**
     * Update scoreboard display
     * @param {string} containerId
     */
    updateScoreboard(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const teamIds = Object.keys(AppState.teams);
        if (teamIds.length === 0) {
            container.innerHTML = '';
            return;
        }

        // Sort by score descending
        const sorted = teamIds.sort((a, b) => (AppState.scores[b] || 0) - (AppState.scores[a] || 0));

        let html = '<div class="scoreboard-inline">';
        sorted.forEach((id, index) => {
            const team = AppState.teams[id];
            const score = AppState.scores[id] || 0;
            const colorClass = TeamColors.getColorClass(id);
            const glowClass = TeamColors.getGlowClass(id);
            const colorValue = TeamColors.getColorValue(id);
            const isFirst = index === 0 && score > 0;
            const players = team.players || [];
            const playersHtml = players.length > 0
                ? `<div class="scoreboard-team__members">${players.join(', ')}</div>`
                : '';
            html += `<div class="scoreboard-team ${isFirst ? 'scoreboard-team--leading' : ''}">
                <div class="scoreboard-team__header">
                    <span class="team-color-dot" style="background:${colorValue};"></span>
                    <span class="${colorClass} ${isFirst ? glowClass : ''}" style="font-weight:bold;">${team.name}</span>
                    <span class="scoreboard-team__score">${score}</span>
                </div>
                ${playersHtml}
            </div>`;
        });
        html += '</div>';
        container.innerHTML = html;
    },

    /**
     * Update trivia question display
     * @param {string} question
     */
    updateTriviaQuestion(question) {
        document.getElementById('trivia-question').textContent = question;
    },

    /**
     * Update trivia submission count
     * @param {number} submitted
     * @param {number} total
     */
    updateTriviaSubmissions(submitted, total) {
        document.getElementById('trivia-submission-status').textContent = `${submitted}/${total} teams submitted`;
    },

    /**
     * Reveal trivia answer and show team answers
     * @param {string} answer
     * @param {Array} teamAnswers - Array of {team_name, answer_text}
     */
    revealTriviaAnswer(answer, teamAnswers) {
        const revealEl = document.getElementById('trivia-answer-reveal');
        const answerEl = document.getElementById('trivia-answer-text');

        if (answerEl) answerEl.textContent = answer;
        if (revealEl) revealEl.classList.remove('hidden');

        // Show team answers if provided
        if (teamAnswers && teamAnswers.length > 0) {
            this.showTriviaTeamAnswers(teamAnswers);
        }
    },

    /**
     * Show team answers table for trivia
     * @param {Array} teamAnswers - Array of {team_id, team_name, answer_text}
     */
    showTriviaTeamAnswers(teamAnswers) {
        const container = document.getElementById('trivia-team-answers');
        if (!container) return;

        // Add the scrollable wrapper class
        container.classList.add('tv-team-answers');

        let html = `
            <table class="scoreboard">
                <thead>
                    <tr>
                        <th>TEAM</th>
                        <th>ANSWER</th>
                    </tr>
                </thead>
                <tbody>
        `;

        teamAnswers.forEach(item => {
            // Get team color if team_id is provided
            const colorClass = item.team_id ? TeamColors.getColorClass(item.team_id) : '';
            html += `
                <tr>
                    <td class="${colorClass}">${item.team_name}</td>
                    <td>${item.answer_text || '(no answer)'}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
        container.classList.remove('hidden');
    },

    /**
     * Hide trivia team answers
     */
    hideTriviaTeamAnswers() {
        const container = document.getElementById('trivia-team-answers');
        if (container) {
            container.classList.add('hidden');
            container.innerHTML = '';
        }
    },

    /**
     * Hide trivia answer reveal
     */
    hideTriviaAnswer() {
        document.getElementById('trivia-answer-reveal').classList.add('hidden');
        this.hideTriviaTeamAnswers();
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

            // Use enhanced timer effects
            TimerEffects.updateForTime(seconds, totalSeconds);
        } else if (percent <= 50) {
            display.classList.add('timer-display--warning');
            display.classList.remove('timer-display--critical');
            progressBar.classList.add('timer-progress__bar--warning');
            progressBar.classList.remove('timer-progress__bar--critical');
        } else {
            display.classList.remove('timer-display--warning', 'timer-display--critical');
            progressBar.classList.remove('timer-progress__bar--warning', 'timer-progress__bar--critical');
        }
    },

    /**
     * Update all HUD timer pills across all views (global round timer)
     * @param {number} remainingSeconds - Seconds remaining
     * @param {number} totalSeconds - Total duration
     * @param {string} status - Timer status: 'running', 'paused', 'stopped', 'finished'
     */
    updateHUDTimer(remainingSeconds, totalSeconds, status) {
        const timerPills = document.querySelectorAll('.hud-pill--timer');

        // Format time as MM:SS
        const mins = Math.floor(remainingSeconds / 60);
        const secs = remainingSeconds % 60;
        const timeDisplay = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

        timerPills.forEach(pill => {
            // Update display text
            if (status === 'stopped') {
                pill.textContent = '--:--';
                pill.classList.remove('hud-pill--warning', 'hud-pill--critical', 'hud-pill--paused');
            } else {
                pill.textContent = timeDisplay;

                // Update visual state based on time remaining
                const percent = (remainingSeconds / totalSeconds) * 100;

                pill.classList.remove('hud-pill--warning', 'hud-pill--critical', 'hud-pill--paused');

                if (status === 'paused') {
                    pill.classList.add('hud-pill--paused');
                } else if (status === 'finished' || remainingSeconds <= 0) {
                    pill.classList.add('hud-pill--critical');
                } else if (percent <= 20) {
                    pill.classList.add('hud-pill--critical');
                } else if (percent <= 50) {
                    pill.classList.add('hud-pill--warning');
                }
            }
        });
    },

    /**
     * Show buzzer locked by team
     * @param {string} teamName
     * @param {string} teamId - Optional team ID for color
     */
    showBuzzerLocked(teamName, teamId = null) {
        document.getElementById('buzzer-ready-display').classList.add('hidden');
        document.getElementById('buzzer-locked-display').classList.remove('hidden');
        const teamEl = document.getElementById('buzzer-locked-team');
        teamEl.textContent = teamName;
        // Apply team color if team_id is provided
        if (teamId) {
            teamEl.className = TeamColors.getColorClass(teamId);
        }
    },

    /**
     * Reset buzzer to ready state
     */
    resetBuzzer() {
        document.getElementById('buzzer-locked-display').classList.add('hidden');
        document.getElementById('buzzer-ready-display').classList.remove('hidden');
    },

    /**
     * Load and play HTML5 audio
     * @param {string} audioUrl - URL to audio file
     */
    loadAudioPlayer(audioUrl) {
        const container = document.getElementById('audio-player-container');
        const audio = document.getElementById('audio-player');
        const visualizer = document.getElementById('audio-visualizer');
        const pausedIndicator = document.getElementById('audio-paused-indicator');

        if (!audioUrl) {
            container.classList.add('hidden');
            return;
        }

        audio.src = audioUrl;
        audio.play().catch(err => console.error('[TV] Audio play failed:', err));
        container.classList.remove('hidden');
        visualizer.classList.remove('hidden');
        pausedIndicator.classList.add('hidden');
    },

    /**
     * Hide HTML5 audio player
     */
    hideAudioPlayer() {
        const container = document.getElementById('audio-player-container');
        const audio = document.getElementById('audio-player');
        container.classList.add('hidden');
        audio.pause();
        audio.src = '';
    },

    /**
     * Pause audio (for buzzer lock)
     */
    pauseAudio() {
        // Pause HTML5 audio
        const audio = document.getElementById('audio-player');
        const visualizer = document.getElementById('audio-visualizer');
        const pausedIndicator = document.getElementById('audio-paused-indicator');

        if (audio && audio.src) {
            audio.pause();
            visualizer.classList.add('hidden');
            pausedIndicator.classList.remove('hidden');
        }

        console.log('[TV] Audio paused');
    },

    /**
     * Resume audio (for wrong buzzer answer)
     */
    resumeAudio() {
        // Resume HTML5 audio
        const audio = document.getElementById('audio-player');
        const visualizer = document.getElementById('audio-visualizer');
        const pausedIndicator = document.getElementById('audio-paused-indicator');

        if (audio && audio.src) {
            audio.play().catch(err => console.error('[TV] Audio resume failed:', err));
            visualizer.classList.remove('hidden');
            pausedIndicator.classList.add('hidden');
        }

        console.log('[TV] Audio resumed');
    },

    /**
     * Show audio reveal (track title and artist)
     * @param {string} trackTitle
     * @param {string} artist
     */
    showAudioReveal(trackTitle, artist) {
        const reveal = document.getElementById('audio-reveal');
        document.getElementById('audio-track-title').textContent = trackTitle;
        document.getElementById('audio-artist').textContent = artist;
        reveal.classList.remove('hidden');
    },

    /**
     * Hide audio reveal
     */
    hideAudioReveal() {
        document.getElementById('audio-reveal').classList.add('hidden');
    },

    /**
     * Update timeline team statuses
     * @param {Object} statuses - { team_id: 'thinking' | 'failed' | 'winner' }
     */
    updateTimelineStatuses(statuses) {
        const container = document.getElementById('timeline-team-status');
        let html = '';

        Object.entries(statuses).forEach(([teamId, status]) => {
            const team = AppState.teams[teamId];
            if (!team) return;

            let color = 'var(--baby-blue)';
            let icon = '...';
            if (status === 'failed') {
                color = 'var(--terminal-red)';
                icon = 'X';
            } else if (status === 'winner') {
                color = 'var(--terminal-amber)';
                icon = '!';
            }

            html += `<span style="color:${color};margin:0 15px;">${team.name} [${icon}]</span>`;
        });

        container.innerHTML = html;
    },

    /**
     * Show timeline winner
     * @param {string} teamName
     */
    showTimelineWinner(teamName) {
        document.getElementById('timeline-winner').classList.remove('hidden');
        document.getElementById('timeline-winner-name').textContent = teamName;
    },

    /**
     * Show team submissions table for timeline
     * @param {Array} teamSubmissions - Array of {team_name, order, status}
     * @param {Array} correctLabels - Labels for the correct order
     */
    showTimelineTeamSubmissions(teamSubmissions, correctLabels) {
        const container = document.getElementById('timeline-team-submissions');
        if (!container) return;

        // Add the scrollable wrapper class
        container.classList.add('tv-team-answers');

        let html = `
            <table class="scoreboard">
                <thead>
                    <tr>
                        <th>TEAM</th>
                        <th>SUBMITTED ORDER</th>
                        <th style="text-align: center;">STATUS</th>
                    </tr>
                </thead>
                <tbody>
        `;

        teamSubmissions.forEach(item => {
            // Convert order indices to labels if available
            let orderDisplay = '';
            if (item.order && item.order.length > 0) {
                if (correctLabels && correctLabels.length > 0) {
                    orderDisplay = item.order.map(idx => correctLabels[idx] || `#${idx}`).join(' > ');
                } else {
                    orderDisplay = item.order.join(' > ');
                }
            } else {
                orderDisplay = '(no submission)';
            }

            let statusClass = 'timeline-status-pending';
            let statusText = item.status || 'thinking';
            if (item.status === 'winner') {
                statusClass = 'timeline-status-correct';
                statusText = 'CORRECT';
            } else if (item.status === 'failed') {
                statusClass = 'timeline-status-wrong';
                statusText = 'WRONG';
            }

            const colorClass = item.team_id ? TeamColors.getColorClass(item.team_id) : '';
            html += `
                <tr>
                    <td class="${colorClass}">${item.team_name}</td>
                    <td class="timeline-order">${orderDisplay}</td>
                    <td class="${statusClass}" style="text-align: center;">${statusText}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
        container.classList.remove('hidden');
    },

    /**
     * Hide timeline team submissions
     */
    hideTimelineTeamSubmissions() {
        const container = document.getElementById('timeline-team-submissions');
        if (container) {
            container.classList.add('hidden');
            container.innerHTML = '';
        }
    },

    /**
     * Show timeline waiting state (no items yet)
     */
    showTimelineWaiting() {
        const waitingEl = document.getElementById('timeline-waiting-tv');
        const activeEl = document.getElementById('timeline-active-tv');
        if (waitingEl) waitingEl.classList.remove('hidden');
        if (activeEl) activeEl.classList.add('hidden');
    },

    /**
     * Show timeline active state (items loaded)
     */
    showTimelineActive() {
        const waitingEl = document.getElementById('timeline-waiting-tv');
        const activeEl = document.getElementById('timeline-active-tv');
        if (waitingEl) waitingEl.classList.add('hidden');
        if (activeEl) activeEl.classList.remove('hidden');
    },

    /**
     * Display timeline items (in scrambled order) on TV
     * @param {string[]} items - Array of timeline event labels
     */
    displayTimelineItems(items) {
        const list = document.getElementById('timeline-items-list-tv');
        if (!list) return;

        list.innerHTML = items.map((item, index) => {
            return `<li style="padding: 0.5rem 1rem; margin: 0.5rem 0; border: 1px solid var(--baby-blue-dim); background: rgba(0, 255, 65, 0.05);">
                <span style="color: var(--baby-blue-dim); margin-right: 0.75rem;">${String.fromCharCode(65 + index)}.</span>${item}
            </li>`;
        }).join('');
    },

    /**
     * Clear timeline items from TV display
     */
    clearTimelineItems() {
        const list = document.getElementById('timeline-items-list-tv');
        if (list) list.innerHTML = '';
    },

    /**
     * Update minesweeper teams table
     */
    updateMinesweeperTeams() {
        const tbody = document.getElementById('minesweeper-teams');
        const teamIds = Object.keys(AppState.teams);

        let html = '';
        let activeCount = 0;

        teamIds.forEach(id => {
            const team = AppState.teams[id];
            const score = AppState.scores[id] || 0;
            const eliminated = team.status === 'eliminated';

            if (!eliminated) activeCount++;

            html += `<tr class="${eliminated ? 'eliminated' : ''}">
                <td>${team.name}</td>
                <td>${eliminated ? 'DELETED' : 'ACTIVE'}</td>
                <td>${score}</td>
            </tr>`;
        });

        tbody.innerHTML = html;
        document.getElementById('minesweeper-remaining').textContent = `${activeCount} teams remaining`;
    },

    /**
     * Show final victory scoreboard
     * @param {string} winnerName
     * @param {Object} finalScores
     */
    showVictory(winnerName, finalScores) {
        document.getElementById('victory-winner').textContent = winnerName;

        const tbody = document.getElementById('final-scoreboard');
        const sorted = Object.entries(finalScores).sort((a, b) => b[1] - a[1]);

        let html = '';
        sorted.forEach(([teamId, score], index) => {
            const team = AppState.teams[teamId];
            if (!team) return;
            html += `<tr>
                <td>#${index + 1}</td>
                <td>${team.name}</td>
                <td>${score}</td>
            </tr>`;
        });

        tbody.innerHTML = html;
    },

    /**
     * Show mock mode banner
     */
    showMockModeBanner() {
        document.getElementById('mock-mode-banner').classList.remove('hidden');
    },

    /**
     * Show Spotify error message on screen
     * @param {string} message
     */
    showSpotifyError(message) {
        const hint = document.getElementById('buzzer-hint');
        if (hint) {
            hint.innerHTML = `<span style="color: var(--terminal-red);">ERROR: ${message}</span>`;
        }
    },

    /**
     * Hide Spotify error message
     */
    hideSpotifyError() {
        const hint = document.getElementById('buzzer-hint');
        if (hint && hint.innerHTML.includes('ERROR:')) {
            hint.textContent = 'Listen carefully...';
        }
    },

    /**
     * Show picture for guessing
     * @param {string} imageUrl - URL of the image
     */
    showPictureGuessImage(imageUrl) {
        const img = document.getElementById('pictureguess-image');
        const noImage = document.getElementById('pictureguess-no-image');
        if (img && imageUrl) {
            img.src = imageUrl;
            img.classList.remove('hidden');
            if (noImage) noImage.classList.add('hidden');
        }
    },

    /**
     * Hide picture guess image
     */
    hidePictureGuessImage() {
        const img = document.getElementById('pictureguess-image');
        const noImage = document.getElementById('pictureguess-no-image');
        if (img) {
            img.src = '';
            img.classList.add('hidden');
        }
        if (noImage) noImage.classList.remove('hidden');
    },

    /**
     * Update picture guess hint
     * @param {string} hint
     */
    updatePictureGuessHint(hint) {
        const el = document.getElementById('pictureguess-hint-tv');
        if (el) {
            el.textContent = hint || '';
        }
    },

    /**
     * Update picture guess submission count
     * @param {number} submitted
     * @param {number} total
     */
    updatePictureGuessSubmissions(submitted, total) {
        const el = document.getElementById('pictureguess-submission-status');
        if (el) {
            el.textContent = `${submitted}/${total} teams submitted`;
        }
    },

    /**
     * Reveal picture answer and show team guesses
     * @param {string} answer
     * @param {Array} teamGuesses - Array of {team_name, guess_text}
     */
    revealPictureAnswer(answer, teamGuesses) {
        const revealEl = document.getElementById('pictureguess-answer-reveal');
        const answerEl = document.getElementById('pictureguess-correct-answer');

        if (answerEl) answerEl.textContent = answer;
        if (revealEl) revealEl.classList.remove('hidden');

        // Show team guesses if provided
        if (teamGuesses && teamGuesses.length > 0) {
            this.showPictureGuessTeamAnswers(teamGuesses);
        }
    },

    /**
     * Show team guesses table for picture guess
     * @param {Array} teamGuesses - Array of {team_name, guess_text, team_id}
     */
    showPictureGuessTeamAnswers(teamGuesses) {
        const container = document.getElementById('pictureguess-team-guesses');
        if (!container) return;

        // Add the scrollable wrapper class
        container.classList.add('tv-team-answers');

        let html = `
            <table class="scoreboard">
                <thead>
                    <tr>
                        <th>TEAM</th>
                        <th>GUESS</th>
                    </tr>
                </thead>
                <tbody>
        `;

        teamGuesses.forEach(item => {
            const colorClass = item.team_id ? TeamColors.getColorClass(item.team_id) : '';
            html += `
                <tr>
                    <td class="${colorClass}">${item.team_name}</td>
                    <td>${item.guess_text || '(no guess)'}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
        container.classList.remove('hidden');
    },

    /**
     * Hide picture guess answer reveal
     */
    hidePictureGuessAnswer() {
        const revealEl = document.getElementById('pictureguess-answer-reveal');
        const teamGuessesEl = document.getElementById('pictureguess-team-guesses');

        if (revealEl) revealEl.classList.add('hidden');
        if (teamGuessesEl) {
            teamGuessesEl.classList.add('hidden');
            teamGuessesEl.innerHTML = '';
        }
    },

    // ========== PRICE GUESS ==========

    /**
     * Show price product image
     * @param {string} imageUrl - URL of the product image
     */
    showPriceGuessImage(imageUrl) {
        const img = document.getElementById('priceguess-image');
        const noImage = document.getElementById('priceguess-no-image');
        if (img && imageUrl) {
            img.src = imageUrl;
            img.classList.remove('hidden');
            if (noImage) noImage.classList.add('hidden');
        }
    },

    /**
     * Hide price guess image
     */
    hidePriceGuessImage() {
        const img = document.getElementById('priceguess-image');
        const noImage = document.getElementById('priceguess-no-image');
        if (img) {
            img.src = '';
            img.classList.add('hidden');
        }
        if (noImage) noImage.classList.remove('hidden');
    },

    /**
     * Update price guess hint
     * @param {string} hint
     */
    updatePriceGuessHint(hint) {
        const el = document.getElementById('priceguess-hint-tv');
        if (el) {
            el.textContent = hint || '';
        }
    },

    /**
     * Update price guess submission count
     * @param {number} submitted
     * @param {number} total
     */
    updatePriceGuessSubmissions(submitted, total) {
        const el = document.getElementById('priceguess-submission-status');
        if (el) {
            el.textContent = `${submitted}/${total} teams submitted`;
        }
    },

    /**
     * Update price tag display value
     * @param {string} value - The price value (e.g., "???" or "$129.99")
     */
    updatePriceTagValue(value) {
        const el = document.getElementById('priceguess-price-value');
        if (el) {
            el.textContent = value;
        }
    },

    /**
     * Reveal price answer and show team guesses
     * @param {number} actualPrice - The actual price
     * @param {Array} teamGuesses - Array of {team_name, guess_amount, status}
     */
    revealPriceAnswer(actualPrice, teamGuesses) {
        const revealEl = document.getElementById('priceguess-answer-reveal');
        const answerEl = document.getElementById('priceguess-correct-answer');

        // Format price as currency
        const formattedPrice = `$${parseFloat(actualPrice).toFixed(2)}`;

        if (answerEl) answerEl.textContent = formattedPrice;
        if (revealEl) revealEl.classList.remove('hidden');

        // Update price tag
        this.updatePriceTagValue(formattedPrice);

        // Show sorted team guesses
        if (teamGuesses && teamGuesses.length > 0) {
            this.showPriceGuessTeamAnswers(teamGuesses, actualPrice);
        }
    },

    /**
     * Show sorted team guesses for price guess (number line display)
     * @param {Array} teamGuesses - Array of {team_name, guess_amount, status}
     * @param {number} actualPrice - The actual price for reference
     */
    showPriceGuessTeamAnswers(teamGuesses, actualPrice) {
        const container = document.getElementById('priceguess-team-guesses');
        if (!container) return;

        let html = '<div class="priceguess-number-line">';

        teamGuesses.forEach(item => {
            const formattedAmount = parseFloat(item.guess_amount).toFixed(2);
            let statusClass = 'valid';
            if (item.status === 'winner') {
                statusClass = 'winner';
            } else if (item.status === 'bust') {
                statusClass = 'bust';
            }

            html += `<div class="priceguess-guess-row ${statusClass}">
                <span class="team-name">${item.team_name}</span>
                <span class="guess-amount">$${formattedAmount}</span>
            </div>`;
        });

        html += '</div>';
        container.innerHTML = html;
        container.classList.remove('hidden');
    },

    /**
     * Hide price guess answer reveal
     */
    hidePriceGuessAnswer() {
        const revealEl = document.getElementById('priceguess-answer-reveal');
        const teamGuessesEl = document.getElementById('priceguess-team-guesses');

        if (revealEl) revealEl.classList.add('hidden');
        if (teamGuessesEl) {
            teamGuessesEl.classList.add('hidden');
            teamGuessesEl.innerHTML = '';
        }

        // Reset price tag
        this.updatePriceTagValue('???');
    },

    // ========== SURVIVAL MODE ==========

    /**
     * Update survival question text
     * @param {string} question
     */
    updateSurvivalQuestion(question) {
        const el = document.getElementById('survival-question');
        if (el) el.textContent = question || 'Waiting for question...';
    },

    /**
     * Update survival option labels
     * @param {string} optionA
     * @param {string} optionB
     */
    updateSurvivalOptions(optionA, optionB) {
        const labelA = document.getElementById('survival-option-a')?.querySelector('.survival-option-label');
        const labelB = document.getElementById('survival-option-b')?.querySelector('.survival-option-label');
        if (labelA) labelA.textContent = optionA || 'OPTION A';
        if (labelB) labelB.textContent = optionB || 'OPTION B';
    },

    /**
     * Update survival vote counts display (only called on reveal)
     * @param {Object} voteCounts - { A: number, B: number }
     */
    updateSurvivalVoteCounts(voteCounts) {
        const countA = document.getElementById('survival-count-a');
        const countB = document.getElementById('survival-count-b');
        if (countA) countA.textContent = voteCounts.A || 0;
        if (countB) countB.textContent = voteCounts.B || 0;

        // Update vote bars based on percentages
        const total = (voteCounts.A || 0) + (voteCounts.B || 0);
        const barA = document.getElementById('survival-bar-a');
        const barB = document.getElementById('survival-bar-b');
        if (total > 0) {
            const pctA = ((voteCounts.A || 0) / total) * 100;
            const pctB = ((voteCounts.B || 0) / total) * 100;
            if (barA) barA.style.width = `${pctA}%`;
            if (barB) barB.style.width = `${pctB}%`;
        }
    },

    /**
     * Update survival vote progress without revealing A/B counts
     * Shows total votes cast to indicate activity
     * @param {number} totalVotes
     */
    updateSurvivalVoteProgress(totalVotes) {
        // Show that votes are coming in without revealing the breakdown
        const remainingEl = document.getElementById('survival-remaining');
        if (remainingEl && totalVotes > 0) {
            remainingEl.textContent = `${totalVotes} vote${totalVotes !== 1 ? 's' : ''} cast...`;
            remainingEl.classList.remove('critical');
        }
    },

    /**
     * Hide survival vote counts (show "?" instead)
     */
    hideSurvivalVoteCounts() {
        const countA = document.getElementById('survival-count-a');
        const countB = document.getElementById('survival-count-b');
        const barA = document.getElementById('survival-bar-a');
        const barB = document.getElementById('survival-bar-b');
        if (countA) countA.textContent = '?';
        if (countB) countB.textContent = '?';
        if (barA) barA.style.width = '0%';
        if (barB) barB.style.width = '0%';
    },

    /**
     * Show survival reveal results
     * @param {Object} data - Reveal data from server
     */
    showSurvivalReveal(data) {
        const optionA = document.getElementById('survival-option-a');
        const optionB = document.getElementById('survival-option-b');

        // Clear previous states
        optionA?.classList.remove('is-majority', 'is-minority');
        optionB?.classList.remove('is-majority', 'is-minority');

        if (!data.is_tie) {
            // Mark majority/minority - backend sends game_majority
            if (data.game_majority === 'A') {
                optionA?.classList.add('is-majority');
                optionB?.classList.add('is-minority');
            } else {
                optionB?.classList.add('is-majority');
                optionA?.classList.add('is-minority');
            }
        }

        // Update vote counts
        this.updateSurvivalVoteCounts(data.vote_counts);

        // Update points summary
        const remainingEl = document.getElementById('survival-remaining');
        if (remainingEl) {
            const awardedCount = data.teams_awarded?.length || 0;
            if (data.is_tie) {
                remainingEl.textContent = "It's a tie! No points awarded.";
                remainingEl.classList.remove('critical');
            } else if (awardedCount > 0) {
                remainingEl.textContent = `${awardedCount} team${awardedCount !== 1 ? 's' : ''} earned +${data.points_value} points!`;
                remainingEl.classList.remove('critical');
            } else {
                remainingEl.textContent = 'No teams aligned with the majority!';
                remainingEl.classList.add('critical');
            }
        }

        // Update team statuses in scoreboard
        this.updateSurvivalTeamTable(data.teams_awarded, data.teams_not_awarded);
    },

    /**
     * Update survival teams scoreboard table
     * @param {Array} teamsAwarded - Teams that got points
     * @param {Array} teamsNotAwarded - Teams that didn't get points
     */
    updateSurvivalTeamTable(teamsAwarded, teamsNotAwarded) {
        const tbody = document.getElementById('survival-teams');
        if (!tbody) return;

        let html = '';

        // Show awarded teams first
        (teamsAwarded || []).forEach(team => {
            const colorClass = TeamColors ? TeamColors.getColorClass(team.team_id) : '';
            const score = AppState.scores[team.team_id] || 0;
            const newScore = score + (team.points_awarded || 0);

            html += `<tr class="awarded">
                <td class="${colorClass}">${team.team_name}</td>
                <td class="status-awarded">+${team.points_awarded}</td>
                <td>${newScore}</td>
            </tr>`;
        });

        // Then show not awarded teams
        (teamsNotAwarded || []).forEach(team => {
            const colorClass = TeamColors ? TeamColors.getColorClass(team.team_id) : '';
            const score = AppState.scores[team.team_id] || 0;

            html += `<tr class="not-awarded">
                <td class="${colorClass}">${team.team_name}</td>
                <td class="status-not-awarded">+0</td>
                <td>${score}</td>
            </tr>`;
        });

        tbody.innerHTML = html;
    },

    /**
     * Reset survival round (for new question)
     * @param {Object} data
     */
    resetSurvivalRound(data) {
        // Hide vote counts until reveal
        this.hideSurvivalVoteCounts();

        // Clear majority/minority states
        const optionA = document.getElementById('survival-option-a');
        const optionB = document.getElementById('survival-option-b');
        optionA?.classList.remove('is-majority', 'is-minority');
        optionB?.classList.remove('is-majority', 'is-minority');

        // Clear vote avatars
        const votesA = document.getElementById('survival-votes-a');
        const votesB = document.getElementById('survival-votes-b');
        if (votesA) votesA.innerHTML = '';
        if (votesB) votesB.innerHTML = '';

        // Update question and options
        if (data.question_text) this.updateSurvivalQuestion(data.question_text);
        if (data.option_a || data.option_b) this.updateSurvivalOptions(data.option_a, data.option_b);

        // Reset status text
        const remainingEl = document.getElementById('survival-remaining');
        if (remainingEl) {
            remainingEl.textContent = 'Waiting for votes...';
            remainingEl.classList.remove('critical');
        }

        // Clear team table for new round
        const tbody = document.getElementById('survival-teams');
        if (tbody) tbody.innerHTML = '';
    },

    /**
     * Revive all survival teams
     * @param {Object} data
     */
    reviveSurvivalTeams(data) {
        // Clear all eliminated states in the table
        const tbody = document.getElementById('survival-teams');
        if (tbody) {
            tbody.querySelectorAll('tr.eliminated').forEach(row => {
                row.classList.remove('eliminated');
                const statusTd = row.querySelector('.status-eliminated');
                if (statusTd) {
                    statusTd.classList.remove('status-eliminated');
                    statusTd.classList.add('status-alive');
                    statusTd.textContent = 'ALIVE';
                }
            });
        }

        // Update remaining count
        const remainingEl = document.getElementById('survival-remaining');
        if (remainingEl) {
            remainingEl.textContent = `${data.remaining_count} teams remaining`;
            remainingEl.classList.remove('critical');
        }
    },

    /**
     * Initialize survival view with state data
     * @param {Object} stateData
     */
    initSurvivalView(stateData) {
        this.updateSurvivalQuestion(stateData?.question_text);
        this.updateSurvivalOptions(stateData?.option_a, stateData?.option_b);
        // Hide vote counts until reveal
        this.hideSurvivalVoteCounts();

        // Clear majority/minority states
        const optionA = document.getElementById('survival-option-a');
        const optionB = document.getElementById('survival-option-b');
        optionA?.classList.remove('is-majority', 'is-minority');
        optionB?.classList.remove('is-majority', 'is-minority');

        const remainingEl = document.getElementById('survival-remaining');
        if (remainingEl) {
            remainingEl.textContent = 'Waiting for votes...';
            remainingEl.classList.remove('critical');
        }

        // Clear team table
        const tbody = document.getElementById('survival-teams');
        if (tbody) tbody.innerHTML = '';
    }
};

// ============================================================
// SOCKET HANDLERS
// ============================================================

const SocketHandlers = {
    /**
     * Initialize socket connection and event handlers
     */
    init() {
        if (CONFIG.MOCK_MODE) {
            console.log('[Socket] Mock mode enabled - no server connection');
            UI.showMockModeBanner();
            return;
        }

        AppState.socket = io();
        // Expose socket globally for screensaver and other shared components
        window.socket = AppState.socket;

        // Connection events
        AppState.socket.on('connect', () => {
            console.log('[Socket] Connected');
            AppState.connected = true;
            // Request full state sync for TV (includes scores, teams, current state)
            AppState.socket.emit('request_tv_sync');
            // Notify server of activity on connect
            AppState.socket.emit('screensaver_activity');
        });

        AppState.socket.on('disconnect', () => {
            console.log('[Socket] Disconnected');
            AppState.connected = false;
        });

        // State sync
        AppState.socket.on('sync_state', (data) => {
            console.log('[Socket] State sync received:', data);
            if (data.scores) AppState.scores = data.scores;
            if (data.teams) {
                Object.entries(data.teams).forEach(([id, team]) => {
                    AppState.teams[id] = team;
                });
            }
            this.handleStateChange(data);

            // Initialize footer scoreboard with current teams
            if (window.teamScoreboardController) {
                window.teamScoreboardController.updateTeams(AppState.teams, AppState.scores);
            }
        });

        // Global state change
        AppState.socket.on('state_change', (data) => {
            console.log('[Socket] State change:', data);
            this.handleStateChange(data);
        });

        // Score updates
        AppState.socket.on('score_update', (data) => {
            console.log('[Socket] Score update:', data);

            // Check for score increases and trigger celebrations
            const previousScores = { ...AppState.scores };
            AppState.scores = data.scores;

            // Find teams that scored and the biggest gain
            let maxGain = 0;
            const scoringTeams = [];
            Object.entries(data.scores).forEach(([teamId, score]) => {
                const prev = previousScores[teamId] || 0;
                const gain = score - prev;
                if (gain > 0) {
                    scoringTeams.push(teamId);
                    if (gain > maxGain) {
                        maxGain = gain;
                    }
                }
            });

            if (maxGain > 0) {
                CelebrationEffects.celebrate(maxGain);
            }

            if (data.teams) {
                Object.entries(data.teams).forEach(([id, team]) => {
                    AppState.teams[id] = team;
                });
            }
            this.refreshScoreboards();

            // Update footer scoreboard and highlight scoring teams
            if (window.teamScoreboardController) {
                window.teamScoreboardController.updateTeams(AppState.teams, AppState.scores);
                scoringTeams.forEach(teamId => {
                    window.teamScoreboardController.highlightTeam(teamId);
                });
            }
        });

        // Avatar updates
        AppState.socket.on('avatar_updated', (data) => {
            console.log('[Socket] Avatar updated:', data);
            if (AppState.teams[data.team_id]) {
                AppState.teams[data.team_id].avatar = data.avatar_id;
            }
            // Refresh lobby display to show new avatar
            UI.updateLobbyTeams();
        });

        // Trivia events
        AppState.socket.on('submission_status', (data) => {
            UI.updateTriviaSubmissions(data.submitted_count, data.total_teams);
        });

        AppState.socket.on('answer_revealed', (data) => {
            UI.revealTriviaAnswer(data.correct_answer, data.team_answers);
        });

        // Timer events
        AppState.socket.on('timer_sync', (data) => {
            this.handleTimerSync(data);
        });

        // Round timer events (global HUD timer)
        AppState.socket.on('round_timer_sync', (data) => {
            this.handleRoundTimerSync(data);
        });

        // Buzzer events
        AppState.socket.on('buzzer_locked', (data) => {
            UI.showBuzzerLocked(data.locked_by_team_name, data.locked_by_team_id);
        });

        AppState.socket.on('buzzer_reset', () => {
            UI.resetBuzzer();
        });

        // Audio events (Buzzer mode)
        AppState.socket.on('play_audio', (data) => {
            console.log('[TV] Received play_audio event:', data);

            // Clear previous answer and reset buzzer when new audio starts
            UI.hideAudioReveal();
            UI.resetBuzzer();

            if (data.audio_url) {
                UI.loadAudioPlayer(data.audio_url);
            } else if (data.spotify_uri) {
                // Use Spotify Web Playback SDK
                SpotifyPlayer.play(data.spotify_uri);
            }
        });

        AppState.socket.on('stop_audio', () => {
            UI.hideAudioPlayer();
            SpotifyPlayer.stop();
        });

        AppState.socket.on('pause_audio', () => {
            console.log('[TV] Received pause_audio event');
            UI.pauseAudio();
            // Also pause Spotify Web Playback SDK if connected
            SpotifyPlayer.pause();
        });

        AppState.socket.on('resume_audio', () => {
            UI.resumeAudio();
            // Also resume Spotify Web Playback SDK if connected
            SpotifyPlayer.resume();
        });

        // Music controller events (admin controls)
        AppState.socket.on('music_toggle', () => {
            console.log('[TV] Received music_toggle event');
            BackgroundMusic.togglePlayPause();
        });

        AppState.socket.on('music_next', () => {
            console.log('[TV] Received music_next event');
            BackgroundMusic.playNextTrack();
        });

        AppState.socket.on('music_previous', () => {
            console.log('[TV] Received music_previous event');
            BackgroundMusic.playPreviousTrack();
        });

        AppState.socket.on('reveal_audio', (data) => {
            UI.showAudioReveal(data.track_title, data.artist);
        });

        // Timeline events
        AppState.socket.on('timeline_status', (data) => {
            UI.updateTimelineStatuses(data.team_statuses);
        });

        AppState.socket.on('timeline_complete', (data) => {
            const team = AppState.teams[data.winner_team_id];
            if (team) {
                UI.showTimelineWinner(team.name);
            }
            // Show team submissions if provided
            // Use shuffled_items (how items were displayed) to map submission indices to labels
            if (data.team_submissions && data.team_submissions.length > 0) {
                UI.showTimelineTeamSubmissions(data.team_submissions, data.shuffled_items || data.correct_labels);
            }
        });

        // Picture guess events
        AppState.socket.on('show_picture', (data) => {
            console.log('[TV] Received show_picture event:', data);
            UI.hidePictureGuessAnswer();
            if (data.image_url) {
                UI.showPictureGuessImage(data.image_url);
            }
            if (data.hint) {
                UI.updatePictureGuessHint(data.hint);
            }
        });

        AppState.socket.on('picture_revealed', (data) => {
            console.log('[TV] Received picture_revealed event:', data);
            UI.revealPictureAnswer(data.correct_answer, data.team_guesses);
        });

        // Price Guess events
        AppState.socket.on('show_price_product', (data) => {
            console.log('[TV] Received show_price_product event:', data);
            UI.hidePriceGuessAnswer();
            UI.updatePriceTagValue('???');
            if (data.image_url) {
                UI.showPriceGuessImage(data.image_url);
            }
            if (data.hint) {
                UI.updatePriceGuessHint(data.hint);
            }
        });

        AppState.socket.on('price_revealed', (data) => {
            console.log('[TV] Received price_revealed event:', data);
            UI.revealPriceAnswer(data.actual_price, data.team_guesses, data.winner_team_id);
        });

        // Minesweeper events
        AppState.socket.on('elimination_update', (data) => {
            if (AppState.teams[data.team_id]) {
                const team = AppState.teams[data.team_id];
                const wasActive = team.status !== 'eliminated';
                team.status = data.eliminated ? 'eliminated' : 'active';

                // Show BSOD for newly eliminated team
                if (data.eliminated && wasActive) {
                    BSOD.show(team.name, 4000);
                }

                UI.updateMinesweeperTeams();
            }
        });

        // QR code visibility toggle
        AppState.socket.on('qr_visibility', (data) => {
            console.log('[TV] QR visibility changed:', data.visible);
            const qrCode = document.getElementById('qr-code');
            if (qrCode) {
                if (data.visible) {
                    qrCode.classList.remove('hidden');
                    // Stop Matrix rain when QR code is shown
                    MatrixRain.stop();
                } else {
                    qrCode.classList.add('hidden');
                    // Restart idle timer if we're in LOBBY
                    if (AppState.currentState === 'LOBBY') {
                        MatrixRain.startIdleTimer();
                    }
                }
            }
        });

        // Survival events
        AppState.socket.on('survival_vote_update', (data) => {
            // Don't show vote counts until reveal - just track total votes
            UI.updateSurvivalVoteProgress(data.total_votes);
        });

        AppState.socket.on('survival_reveal', (data) => {
            UI.showSurvivalReveal(data);
        });

        AppState.socket.on('survival_round_reset', (data) => {
            UI.resetSurvivalRound(data);
        });

        AppState.socket.on('survival_revive_all', (data) => {
            UI.reviveSurvivalTeams(data);
        });

        // Pixel Perfect events
        AppState.socket.on('pixelperfect_round_start', (data) => {
            console.log('[TV] Received pixelperfect_round_start event:', data);
            // Initialize the view with the image
            if (window.pixelPerfectController) {
                window.pixelPerfectController.reset();
                const img = document.getElementById('pixel-image');
                const noImg = document.getElementById('pixelperfect-no-image');
                if (img && data.image_url) {
                    img.src = data.image_url;
                    img.classList.remove('hidden');
                    if (noImg) noImg.classList.add('hidden');
                    // Start the clearing animation
                    window.pixelPerfectController.start();
                }
            }
            // Reset buzzer state
            const lockedDisplay = document.getElementById('pixelperfect-locked-display');
            const readyDisplay = document.getElementById('pixelperfect-ready-display');
            if (lockedDisplay) lockedDisplay.classList.add('hidden');
            if (readyDisplay) readyDisplay.classList.remove('hidden');
            // Hide answer reveal
            const answerReveal = document.getElementById('pixelperfect-answer-reveal');
            if (answerReveal) answerReveal.classList.add('hidden');
        });

        AppState.socket.on('pixelperfect_locked', (data) => {
            console.log('[TV] Received pixelperfect_locked event:', data);
            if (window.pixelPerfectController) {
                window.pixelPerfectController.showLocked(data.locked_by_team_name);
            }
        });

        AppState.socket.on('pixelperfect_reset', (data) => {
            console.log('[TV] Received pixelperfect_reset event:', data);
            if (window.pixelPerfectController) {
                window.pixelPerfectController.showReady();
            }
        });

        AppState.socket.on('pixelperfect_reveal', (data) => {
            console.log('[TV] Received pixelperfect_reveal event:', data);
            const answerReveal = document.getElementById('pixelperfect-answer-reveal');
            const answerEl = document.getElementById('pixelperfect-correct-answer');
            if (answerReveal && answerEl) {
                answerEl.textContent = data.correct_answer;
                answerReveal.classList.remove('hidden');
            }
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
        ViewManager.showForState(state);

        // Update game progress indicator
        GameProgress.update(state);

        // Update immersive HUD visibility and chapter name
        if (window.hudController) {
            window.hudController.setState(state);

            // Map state to friendly chapter names
            const chapterNames = {
                'LOBBY': 'Lobby',
                'MACGYVER': 'MacGyver',
                'TRIVIA': 'Trivia',
                'TIMER': 'Challenge',
                'BUZZER': 'Buzzer',
                'TIMELINE': 'Timeline',
                'MINESWEEPER': 'Minesweeper',
                'PICTUREGUESS': 'Picture',
                'PIXELPERFECT': 'Pixel',
                'PRICEGUESS': 'Price',
                'SURVIVAL': 'Survival',
                'VICTORY': 'Victory'
            };
            window.hudController.updateChapter(chapterNames[state] || state);
        }

        // Sync status dashboard with game state
        StatusDashboard.syncWithGameState(state);

        // Handle Matrix rain screensaver
        MatrixRain.onStateChange(state);

        // Handle background music for this round
        BackgroundMusic.onStateChange(state);

        // Handle state-specific data
        switch (state) {
            case 'LOBBY':
                UI.updateLobbyTeams();
                break;

            case 'MACGYVER':
                if (data.state_data?.message) {
                    document.getElementById('macgyver-message').textContent = data.state_data.message;
                }
                UI.updateScoreboard('macgyver-scoreboard');
                break;

            case 'TRIVIA':
                if (data.state_data?.question_text) {
                    UI.updateTriviaQuestion(data.state_data.question_text);
                    UI.hideTriviaAnswer();
                    document.getElementById('trivia-submission-status').textContent = '';
                }
                UI.updateScoreboard('trivia-scoreboard');
                break;

            case 'TIMER':
                if (data.state_data?.message) {
                    document.getElementById('timer-message').textContent = data.state_data.message;
                }
                if (data.state_data?.duration_seconds) {
                    UI.updateTimer(data.state_data.duration_seconds, data.state_data.duration_seconds);
                }
                UI.updateScoreboard('timer-scoreboard');
                break;

            case 'BUZZER':
                UI.resetBuzzer();
                UI.hideAudioReveal();
                if (data.state_data?.audio_hint) {
                    document.getElementById('buzzer-hint').textContent = data.state_data.audio_hint;
                }
                UI.updateScoreboard('buzzer-scoreboard');
                break;

            case 'TIMELINE':
                document.getElementById('timeline-winner').classList.add('hidden');
                document.getElementById('timeline-team-status').innerHTML = '';
                UI.hideTimelineTeamSubmissions();
                UI.clearTimelineItems();
                UI.updateScoreboard('timeline-scoreboard');
                // Show waiting or active state based on whether items are provided
                if (data.state_data?.items && data.state_data.items.length > 0) {
                    UI.displayTimelineItems(data.state_data.items);
                    UI.showTimelineActive();
                } else {
                    UI.showTimelineWaiting();
                }
                break;

            case 'MINESWEEPER':
                UI.updateMinesweeperTeams();
                break;

            case 'PICTUREGUESS':
                UI.hidePictureGuessImage();
                UI.hidePictureGuessAnswer();
                if (data.state_data?.image_url) {
                    UI.showPictureGuessImage(data.state_data.image_url);
                }
                if (data.state_data?.hint) {
                    UI.updatePictureGuessHint(data.state_data.hint);
                } else {
                    UI.updatePictureGuessHint('');
                }
                document.getElementById('pictureguess-submission-status').textContent = '';
                UI.updateScoreboard('pictureguess-scoreboard');
                break;

            case 'PIXELPERFECT':
                // Initialize pixel perfect controller
                if (window.pixelPerfectController) {
                    window.pixelPerfectController.init();
                    window.pixelPerfectController.reset();
                }
                // Reset image state
                const pixelImg = document.getElementById('pixel-image');
                const noPixelImg = document.getElementById('pixelperfect-no-image');
                if (pixelImg) {
                    pixelImg.classList.add('hidden');
                    pixelImg.src = '';
                }
                if (noPixelImg) noPixelImg.classList.remove('hidden');
                // Reset buzzer state
                const ppLockedDisplay = document.getElementById('pixelperfect-locked-display');
                const ppReadyDisplay = document.getElementById('pixelperfect-ready-display');
                if (ppLockedDisplay) ppLockedDisplay.classList.add('hidden');
                if (ppReadyDisplay) ppReadyDisplay.classList.remove('hidden');
                // Hide answer reveal
                const ppAnswerReveal = document.getElementById('pixelperfect-answer-reveal');
                if (ppAnswerReveal) ppAnswerReveal.classList.add('hidden');
                // If state data includes image_url, start the round
                if (data.state_data?.image_url && window.pixelPerfectController) {
                    if (pixelImg) {
                        pixelImg.src = data.state_data.image_url;
                        pixelImg.classList.remove('hidden');
                        if (noPixelImg) noPixelImg.classList.add('hidden');
                        window.pixelPerfectController.start();
                    }
                }
                UI.updateScoreboard('pixelperfect-scoreboard');
                break;

            case 'PRICEGUESS':
                UI.hidePriceGuessImage();
                UI.hidePriceGuessAnswer();
                UI.updatePriceTagValue('???');
                if (data.state_data?.image_url) {
                    UI.showPriceGuessImage(data.state_data.image_url);
                }
                if (data.state_data?.hint) {
                    UI.updatePriceGuessHint(data.state_data.hint);
                } else {
                    UI.updatePriceGuessHint('');
                }
                document.getElementById('priceguess-submission-status').textContent = '';
                UI.updateScoreboard('priceguess-scoreboard');
                break;

            case 'SURVIVAL':
                UI.initSurvivalView(data.state_data);
                break;

            case 'VICTORY':
                if (data.state_data) {
                    // Try to get winner name from local teams, fall back to state_data
                    const winner = AppState.teams[data.state_data.winner_team_id];
                    const winnerName = winner ? winner.name : (data.state_data.winner_team_name || 'Unknown');
                    // Always use live scores from AppState, not the stale snapshot in state_data
                    UI.showVictory(
                        winnerName,
                        AppState.scores
                    );
                    // Trigger victory celebration
                    CelebrationEffects.victory();
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
            if (AppState.timerInterval) {
                clearInterval(AppState.timerInterval);
            }

            AppState.timerRemaining = data.remaining_seconds;
            AppState.timerTotal = data.total_seconds;

            UI.updateTimer(AppState.timerRemaining, AppState.timerTotal);

            AppState.timerInterval = setInterval(() => {
                AppState.timerRemaining--;
                if (AppState.timerRemaining <= 0) {
                    clearInterval(AppState.timerInterval);
                    UI.updateTimer(0, AppState.timerTotal);
                    if (window.hudController) window.hudController.updateTimer(0);
                } else {
                    UI.updateTimer(AppState.timerRemaining, AppState.timerTotal);
                    if (window.hudController) window.hudController.updateTimer(AppState.timerRemaining);
                }
            }, 1000);

            // Update HUD timer orb
            if (window.hudController) {
                window.hudController.showTimer();
                window.hudController.updateTimer(AppState.timerRemaining);
            }

        } else if (data.action === 'pause') {
            if (AppState.timerInterval) {
                clearInterval(AppState.timerInterval);
            }

        } else if (data.action === 'reset') {
            if (AppState.timerInterval) {
                clearInterval(AppState.timerInterval);
            }
            AppState.timerRemaining = data.remaining_seconds;
            AppState.timerTotal = data.total_seconds;
            UI.updateTimer(AppState.timerRemaining, AppState.timerTotal);

        } else if (data.action === 'complete') {
            if (AppState.timerInterval) {
                clearInterval(AppState.timerInterval);
            }
            UI.updateTimer(0, data.total_seconds);
        }
    },

    /**
     * Handle round timer sync event (global HUD timer)
     * @param {Object} data - { remaining_seconds, total_seconds, status, is_running, is_paused }
     */
    handleRoundTimerSync(data) {
        UI.updateHUDTimer(data.remaining_seconds, data.total_seconds, data.status);

        // Update HUD timer orb
        if (window.hudController) {
            if (data.status === 'running') {
                window.hudController.showTimer();
                window.hudController.updateTimer(data.remaining_seconds);
            } else if (data.status === 'stopped' || data.status === 'idle') {
                window.hudController.hideTimer();
            }
        }
    },

    /**
     * Refresh all scoreboards
     */
    refreshScoreboards() {
        UI.updateScoreboard('macgyver-scoreboard');
        UI.updateScoreboard('trivia-scoreboard');
        UI.updateScoreboard('timer-scoreboard');
        UI.updateScoreboard('buzzer-scoreboard');
        UI.updateScoreboard('timeline-scoreboard');
        UI.updateScoreboard('pictureguess-scoreboard');
        UI.updateScoreboard('priceguess-scoreboard');
        UI.updateLobbyTeams();

        // Update HUD score ribbon
        this.updateHUDScores();
    },

    /**
     * Update HUD score ribbon with current team scores
     */
    updateHUDScores() {
        if (!window.hudController) return;

        // Build teams array with scores for HUD
        const teamsWithScores = Object.entries(AppState.teams).map(([id, team]) => ({
            id,
            name: team.name || 'Team',
            score: AppState.scores[id] || 0,
            color: TeamColors.getColor(id)
        }));

        window.hudController.updateScores(teamsWithScores);
    }
};

// ============================================================
// MOCK MODE TEST CONTROLS
// ============================================================

function initMockModeTestControls() {
    if (!CONFIG.MOCK_MODE) return;

    // Add mock teams
    AppState.teams = {
        'team-1': { name: 'ALPHA', status: 'active' },
        'team-2': { name: 'BETA', status: 'active' },
        'team-3': { name: 'GAMMA', status: 'active' },
        'team-4': { name: 'DELTA', status: 'active' }
    };
    AppState.scores = {
        'team-1': 150,
        'team-2': 200,
        'team-3': 100,
        'team-4': 175
    };

    // Add test buttons for cycling through views
    const testControls = document.createElement('div');
    testControls.style.cssText = 'position:fixed;top:10px;right:10px;z-index:9999;display:flex;flex-direction:column;gap:5px;';
    testControls.innerHTML = `
        <button class="terminal-btn" style="padding:5px 10px;font-size:0.7rem;" onclick="MockTestHelper.showLobby()">LOBBY</button>
        <button class="terminal-btn" style="padding:5px 10px;font-size:0.7rem;" onclick="MockTestHelper.showMacgyver()">MACGYVER</button>
        <button class="terminal-btn" style="padding:5px 10px;font-size:0.7rem;" onclick="MockTestHelper.showTrivia()">TRIVIA</button>
        <button class="terminal-btn" style="padding:5px 10px;font-size:0.7rem;" onclick="MockTestHelper.showTimer()">TIMER</button>
        <button class="terminal-btn" style="padding:5px 10px;font-size:0.7rem;" onclick="MockTestHelper.showBuzzer()">BUZZER</button>
        <button class="terminal-btn" style="padding:5px 10px;font-size:0.7rem;" onclick="MockTestHelper.showTimeline()">TIMELINE</button>
        <button class="terminal-btn" style="padding:5px 10px;font-size:0.7rem;" onclick="MockTestHelper.showMinesweeper()">MINESWEEPER</button>
        <button class="terminal-btn" style="padding:5px 10px;font-size:0.7rem;" onclick="MockTestHelper.showPictureGuess()">PICTUREGUESS</button>
        <button class="terminal-btn" style="padding:5px 10px;font-size:0.7rem;" onclick="MockTestHelper.showVictory()">VICTORY</button>
    `;
    document.body.appendChild(testControls);
}

// Mock test helpers
const MockTestHelper = {
    showLobby() {
        ViewManager.showForState('LOBBY');
        UI.updateLobbyTeams();
    },

    showMacgyver() {
        ViewManager.showForState('MACGYVER');
        document.getElementById('macgyver-message').textContent = 'Construct a diaper out of these napkins!';
        UI.updateScoreboard('macgyver-scoreboard');
    },

    showTrivia() {
        ViewManager.showForState('TRIVIA');
        UI.updateTriviaQuestion('How many hours a day does a newborn sleep?');
        UI.updateTriviaSubmissions(2, 4);
        UI.updateScoreboard('trivia-scoreboard');
    },

    showTimer() {
        ViewManager.showForState('TIMER');
        document.getElementById('timer-message').textContent = 'Swaddle the baby securely!';

        let remaining = 180;
        AppState.timerTotal = 180;
        UI.updateTimer(remaining, 180);

        if (AppState.timerInterval) clearInterval(AppState.timerInterval);
        AppState.timerInterval = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(AppState.timerInterval);
            }
            UI.updateTimer(remaining, 180);
        }, 1000);

        UI.updateScoreboard('timer-scoreboard');
    },

    showBuzzer() {
        ViewManager.showForState('BUZZER');
        UI.resetBuzzer();
        document.getElementById('buzzer-hint').textContent = 'Name that lullaby...';
        UI.updateScoreboard('buzzer-scoreboard');

        // Simulate a buzz after 2 seconds
        setTimeout(() => {
            UI.showBuzzerLocked('ALPHA');
        }, 2000);
    },

    showTimeline() {
        ViewManager.showForState('TIMELINE');
        UI.updateTimelineStatuses({
            'team-1': 'thinking',
            'team-2': 'failed',
            'team-3': 'thinking',
            'team-4': 'winner'
        });
        UI.updateScoreboard('timeline-scoreboard');
    },

    showMinesweeper() {
        AppState.teams['team-2'].status = 'eliminated';
        ViewManager.showForState('MINESWEEPER');
        UI.updateMinesweeperTeams();
    },

    showVictory() {
        ViewManager.showForState('VICTORY');
        UI.showVictory('BETA', AppState.scores);
    },

    showPictureGuess() {
        ViewManager.showForState('PICTUREGUESS');
        UI.updatePictureGuessHint('This was the must-have gadget of 1999...');
        UI.updatePictureGuessSubmissions(2, 4);
        UI.updateScoreboard('pictureguess-scoreboard');
    }
};

// ============================================================
// SPOTIFY WEB PLAYBACK SDK
// ============================================================

const SpotifyPlayer = {
    /**
     * Initialize Spotify Web Playback SDK
     */
    async init() {
        console.log('[Spotify] Initializing...');

        // Check if Spotify is configured on server
        try {
            const statusRes = await fetch('/spotify/status');
            const status = await statusRes.json();
            console.log('[Spotify] Server status:', status);

            if (!status.configured) {
                console.log('[Spotify] Not configured - skipping SDK init');
                return;
            }

            if (!status.connected) {
                console.log('[Spotify] OAuth not complete - connect via admin panel first');
                return;
            }
        } catch (err) {
            console.log('[Spotify] Status check failed:', err);
            return;
        }

        // Check if SDK is ready (either already loaded, or callback fired)
        if (window.Spotify && window.spotifySDKReady) {
            console.log('[Spotify] SDK already loaded, connecting player...');
            this.connectPlayer();
        } else if (window.Spotify) {
            // SDK loaded but callback not fired yet - wait a moment
            console.log('[Spotify] SDK loaded, waiting for ready callback...');
            setTimeout(() => this.connectPlayer(), 100);
        } else {
            console.log('[Spotify] Waiting for SDK to load...');
            // SDK not loaded yet - the callback in tv.html will set spotifySDKReady
            // We need to poll or use another mechanism to know when to connect
            const checkSDK = setInterval(() => {
                if (window.Spotify && window.spotifySDKReady) {
                    clearInterval(checkSDK);
                    console.log('[Spotify] SDK now ready, connecting player...');
                    this.connectPlayer();
                }
            }, 100);
        }
    },

    /**
     * Connect the Spotify player
     */
    async connectPlayer() {
        // Get token from server
        try {
            const tokenRes = await fetch('/spotify/token');
            const tokenData = await tokenRes.json();

            if (!tokenData.access_token) {
                console.log('[Spotify] No access token available');
                return;
            }

            AppState.spotifyToken = tokenData.access_token;
        } catch (err) {
            console.error('[Spotify] Failed to get token:', err);
            return;
        }

        // Create the player
        const player = new Spotify.Player({
            name: 'Baby Shower Game',
            getOAuthToken: async cb => {
                // Refresh token if needed
                try {
                    const res = await fetch('/spotify/token');
                    const data = await res.json();
                    if (data.access_token) {
                        AppState.spotifyToken = data.access_token;
                        cb(data.access_token);
                    }
                } catch (err) {
                    console.error('[Spotify] Token refresh failed:', err);
                    cb(AppState.spotifyToken);
                }
            },
            volume: 0.8
        });

        // Error handling
        player.addListener('initialization_error', ({ message }) => {
            console.error('[Spotify] Init error:', message);
        });

        player.addListener('authentication_error', ({ message }) => {
            console.error('[Spotify] Auth error:', message);
            AppState.spotifyConnected = false;
        });

        player.addListener('account_error', ({ message }) => {
            console.error('[Spotify] Account error:', message);
        });

        player.addListener('playback_error', ({ message }) => {
            console.error('[Spotify] Playback error:', message);
        });

        // Playback status updates - for logging/debugging only
        player.addListener('player_state_changed', state => {
            if (!state) return;
            const track = state.track_window?.current_track;
            console.log('[Spotify] State changed:', state.paused ? 'paused' : 'playing', {
                position: state.position,
                duration: state.duration,
                track: track?.name || 'unknown',
                disallows: state.disallows
            });
        });

        // Ready
        player.addListener('ready', ({ device_id }) => {
            console.log('[Spotify] Ready with Device ID:', device_id);
            AppState.spotifyDeviceId = device_id;
            AppState.spotifyConnected = true;
            AppState.spotifyPlayer = player;
        });

        // Not Ready
        player.addListener('not_ready', ({ device_id }) => {
            console.log('[Spotify] Device ID offline:', device_id);
            AppState.spotifyConnected = false;
        });

        // Connect
        const connected = await player.connect();
        if (connected) {
            console.log('[Spotify] Player connected');
        } else {
            console.error('[Spotify] Player connection failed');
        }
    },

    /**
     * Play a track using Spotify URI
     * @param {string} spotifyUri - e.g., "spotify:track:xxx"
     */
    async play(spotifyUri) {
        if (!AppState.spotifyConnected || !AppState.spotifyDeviceId) {
            console.error('[Spotify] Not connected - please connect via admin panel and refresh TV page');
            UI.showSpotifyError('Spotify not connected. Connect via admin panel and refresh TV.');
            return false;
        }

        try {
            // Get fresh token
            const tokenRes = await fetch('/spotify/token');
            const tokenData = await tokenRes.json();

            if (!tokenData.access_token) {
                console.error('[Spotify] No token available');
                UI.showSpotifyError('Spotify token expired. Reconnect via admin panel.');
                return false;
            }

            // Activate the player element for browsers with autoplay restrictions
            if (AppState.spotifyPlayer) {
                try {
                    await AppState.spotifyPlayer.activateElement();
                    console.log('[Spotify] Player element activated');
                } catch (e) {
                    console.log('[Spotify] activateElement not needed or failed:', e);
                }
            }

            // Start playback of the track (device_id param handles transfer automatically)
            const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${AppState.spotifyDeviceId}`, {
                method: 'PUT',
                body: JSON.stringify({ uris: [spotifyUri] }),
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${tokenData.access_token}`
                }
            });

            if (response.ok || response.status === 204) {
                console.log('[Spotify] Playing:', spotifyUri);
                AppState.currentSpotifyUri = spotifyUri;

                // Show audio visualizer
                const container = document.getElementById('audio-player-container');
                const visualizer = document.getElementById('audio-visualizer');
                const pausedIndicator = document.getElementById('audio-paused-indicator');
                container.classList.remove('hidden');
                visualizer.classList.remove('hidden');
                pausedIndicator.classList.add('hidden');

                // Hide any error message
                UI.hideSpotifyError();
                return true;
            } else {
                const errorText = await response.text();
                console.error('[Spotify] Play failed:', response.status, errorText);
                UI.showSpotifyError(`Spotify playback failed: ${response.status}`);
                return false;
            }
        } catch (err) {
            console.error('[Spotify] Play error:', err);
            UI.showSpotifyError('Spotify playback error. Check console.');
            return false;
        }
    },

    /**
     * Pause playback
     */
    async pause() {
        if (!AppState.spotifyPlayer) {
            console.log('[Spotify] No player to pause');
            return;
        }

        try {
            await AppState.spotifyPlayer.pause();
            console.log('[Spotify] Paused');

            // Update visualizer
            const visualizer = document.getElementById('audio-visualizer');
            const pausedIndicator = document.getElementById('audio-paused-indicator');
            visualizer.classList.add('hidden');
            pausedIndicator.classList.remove('hidden');
        } catch (err) {
            console.error('[Spotify] Pause error:', err);
        }
    },

    /**
     * Resume playback
     */
    async resume() {
        if (!AppState.spotifyPlayer) {
            console.log('[Spotify] No player to resume');
            return;
        }

        try {
            await AppState.spotifyPlayer.resume();
            console.log('[Spotify] Resumed');

            // Update visualizer
            const visualizer = document.getElementById('audio-visualizer');
            const pausedIndicator = document.getElementById('audio-paused-indicator');
            visualizer.classList.remove('hidden');
            pausedIndicator.classList.add('hidden');
        } catch (err) {
            console.error('[Spotify] Resume error:', err);
        }
    },

    /**
     * Stop playback
     */
    async stop() {
        AppState.currentSpotifyUri = null;

        if (AppState.spotifyPlayer) {
            try {
                await AppState.spotifyPlayer.pause();
            } catch (err) {
                console.error('[Spotify] Stop error:', err);
            }
        }

        // Hide visualizer
        const container = document.getElementById('audio-player-container');
        container.classList.add('hidden');
    }
};

// ============================================================
// BACKGROUND MUSIC MANAGER
// Plays themed music for each game round
// ============================================================

const BackgroundMusic = {
    soundtracks: null,
    currentState: null,
    currentTrackIndex: 0,
    isPlaying: false,
    trackEndCheckInterval: null,

    /**
     * Initialize - fetch soundtrack data from server
     */
    async init() {
        try {
            const response = await fetch('/api/soundtracks');
            if (response.ok) {
                this.soundtracks = await response.json();
                console.log('[BackgroundMusic] Loaded soundtracks:', Object.keys(this.soundtracks));
            } else {
                console.log('[BackgroundMusic] No soundtracks endpoint, will skip background music');
            }
        } catch (err) {
            console.log('[BackgroundMusic] Failed to load soundtracks:', err);
        }
    },

    /**
     * Handle state change - start appropriate background music
     * @param {string} state - The new game state
     */
    onStateChange(state) {
        // Don't play background music during BUZZER round (it has its own audio)
        if (state === 'BUZZER') {
            console.log('[BackgroundMusic] Skipping BUZZER state (uses game audio)');
            this.stop();
            return;
        }

        // If state hasn't changed, don't restart music
        if (state === this.currentState && this.isPlaying) {
            return;
        }

        this.currentState = state;
        this.currentTrackIndex = 0;
        this.playForState(state);
    },

    /**
     * Play music for a specific state
     */
    async playForState(state) {
        if (!this.soundtracks || !this.soundtracks[state]) {
            console.log('[BackgroundMusic] No soundtrack for state:', state);
            return;
        }

        if (!AppState.spotifyConnected) {
            console.log('[BackgroundMusic] Spotify not connected, skipping background music');
            return;
        }

        const soundtrack = this.soundtracks[state];
        let tracks = [...soundtrack.tracks];

        // Shuffle if configured
        if (soundtrack.shuffle) {
            tracks = this.shuffleArray(tracks);
        }

        // Store shuffled tracks for this session
        this.currentTracks = tracks;
        this.currentTrackIndex = 0;

        await this.playCurrentTrack();
    },

    /**
     * Play the current track in the playlist
     */
    async playCurrentTrack() {
        if (!this.currentTracks || this.currentTracks.length === 0) {
            return;
        }

        const track = this.currentTracks[this.currentTrackIndex];
        console.log('[BackgroundMusic] Playing:', track.title, '-', track.artist);

        const success = await SpotifyPlayer.play(track.spotify_uri);
        if (success) {
            this.isPlaying = true;
            this.startTrackEndMonitor();
            // Show Now Playing indicator
            NowPlaying.show(track.title, track.artist);
        }
    },

    /**
     * Monitor for track end to auto-advance
     */
    startTrackEndMonitor() {
        // Clear any existing monitor
        if (this.trackEndCheckInterval) {
            clearInterval(this.trackEndCheckInterval);
        }

        // Check player state periodically
        this.trackEndCheckInterval = setInterval(async () => {
            if (!AppState.spotifyPlayer || !this.isPlaying) {
                return;
            }

            try {
                const state = await AppState.spotifyPlayer.getCurrentState();
                if (state && state.paused && state.position === 0 && state.duration > 0) {
                    // Track ended, play next
                    this.playNextTrack();
                }
            } catch (err) {
                // Ignore errors
            }
        }, 1000);
    },

    /**
     * Play the next track in the playlist
     */
    async playNextTrack() {
        if (!this.currentTracks || this.currentTracks.length === 0) {
            return;
        }

        this.currentTrackIndex = (this.currentTrackIndex + 1) % this.currentTracks.length;
        await this.playCurrentTrack();
    },

    /**
     * Play the previous track in the playlist
     */
    async playPreviousTrack() {
        if (!this.currentTracks || this.currentTracks.length === 0) {
            return;
        }

        this.currentTrackIndex = (this.currentTrackIndex - 1 + this.currentTracks.length) % this.currentTracks.length;
        await this.playCurrentTrack();
    },

    /**
     * Toggle play/pause for background music
     */
    async togglePlayPause() {
        if (!AppState.spotifyPlayer) {
            console.log('[BackgroundMusic] No Spotify player available');
            return;
        }

        try {
            const state = await AppState.spotifyPlayer.getCurrentState();
            if (!state) {
                console.log('[BackgroundMusic] No playback state, starting music');
                // No active playback - start playing
                if (this.currentTracks && this.currentTracks.length > 0) {
                    await this.playCurrentTrack();
                }
                return;
            }

            if (state.paused) {
                await SpotifyPlayer.resume();
                this.isPlaying = true;
            } else {
                await SpotifyPlayer.pause();
                this.isPlaying = false;
            }
        } catch (err) {
            console.error('[BackgroundMusic] Toggle error:', err);
        }
    },

    /**
     * Stop background music
     */
    stop() {
        this.isPlaying = false;
        if (this.trackEndCheckInterval) {
            clearInterval(this.trackEndCheckInterval);
            this.trackEndCheckInterval = null;
        }
        // Don't actually stop Spotify - let it fade naturally or be overridden
    },

    /**
     * Shuffle an array (Fisher-Yates)
     */
    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }
};

// ============================================================
// NOW PLAYING INDICATOR
// Shows currently playing track on TV
// ============================================================

const NowPlaying = {
    element: null,
    titleEl: null,
    artistEl: null,

    init() {
        this.element = document.getElementById('now-playing');
        this.titleEl = document.getElementById('now-playing-title');
        this.artistEl = document.getElementById('now-playing-artist');
    },

    /**
     * Show the now playing indicator with track info
     */
    show(title, artist) {
        if (!this.element) return;

        this.titleEl.textContent = title || '---';
        this.artistEl.textContent = artist || '---';
        this.element.classList.remove('hidden');
    },

    /**
     * Hide the now playing indicator
     */
    hide() {
        if (!this.element) return;
        this.element.classList.add('hidden');
    }
};

// ============================================================
// MIDNIGHT COUNTDOWN
// Countdown to Y2K (midnight Dec 31)
// ============================================================

const MidnightCountdown = {
    element: null,
    timeEl: null,
    headerBar: null,
    interval: null,
    targetTime: null,

    init() {
        this.element = document.getElementById('midnight-countdown');
        this.timeEl = document.getElementById('midnight-time');
        this.headerBar = document.getElementById('top-header-bar');

        // Set target to next midnight (or current day's midnight if before midnight)
        this.setTargetMidnight();

        // Start the countdown
        this.start();
    },

    setTargetMidnight() {
        const now = new Date();
        // Target is midnight tonight (start of next day)
        this.targetTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);

        // If we're past midnight (early morning), target today's midnight was already passed
        // In that case, we've already hit Y2K - show celebration mode
        if (now.getHours() < 1) {
            // Still in the first hour after midnight - show "HAPPY NEW YEAR"
            this.targetTime = null;
        }
    },

    start() {
        this.update();
        this.interval = setInterval(() => this.update(), 1000);
    },

    update() {
        if (!this.timeEl) return;

        // If no target (we're past midnight), show celebration
        if (!this.targetTime) {
            this.timeEl.textContent = '2025!';
            if (this.element) this.element.classList.add('midnight-countdown--final');
            if (this.headerBar) this.headerBar.classList.add('top-header-bar--final');
            return;
        }

        const now = new Date();
        const diff = this.targetTime - now;

        if (diff <= 0) {
            // Midnight reached!
            this.timeEl.textContent = '00:00:00';
            if (this.element) this.element.classList.add('midnight-countdown--final');
            if (this.headerBar) this.headerBar.classList.add('top-header-bar--final');
            this.triggerCelebration();
            clearInterval(this.interval);
            return;
        }

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        this.timeEl.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        // Add urgency classes to both old element (for backwards compatibility) and new header bar
        if (this.element) {
            this.element.classList.remove('midnight-countdown--imminent', 'midnight-countdown--final');
        }
        if (this.headerBar) {
            this.headerBar.classList.remove('top-header-bar--imminent', 'top-header-bar--final');
        }

        if (diff < 60 * 1000) {
            // Under 1 minute
            if (this.element) this.element.classList.add('midnight-countdown--final');
            if (this.headerBar) this.headerBar.classList.add('top-header-bar--final');
        } else if (diff < 10 * 60 * 1000) {
            // Under 10 minutes
            if (this.element) this.element.classList.add('midnight-countdown--imminent');
            if (this.headerBar) this.headerBar.classList.add('top-header-bar--imminent');
        }
    },

    triggerCelebration() {
        // Trigger confetti and celebration effects
        if (typeof CelebrationEffects !== 'undefined') {
            CelebrationEffects.launchConfetti(100);
        }
        console.log('[MidnightCountdown] HAPPY NEW YEAR!');
    }
};

// ============================================================
// TEAM COLORS - Use shared module, bind to AppState.teams
// ============================================================

// TeamColors loaded from src/scripts/teamColors.js via globals
// We wrap it to use AppState.teams for color lookups
const TeamColors = (() => {
    const base = window.TeamColors || {
        colors: ['#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3', '#DDA0DD', '#87CEEB', '#F4A460', '#98D8C8'],
        maxColors: 8,
        getColorIndex(teamId, teams) {
            const team = teams?.[teamId];
            if (team?.color) return team.color;
            const idx = Object.keys(teams || {}).indexOf(teamId);
            return idx >= 0 ? ((idx % 8) + 1) : 1;
        },
        getColorClass(teamId, teams) { return `team-color-${this.getColorIndex(teamId, teams)}`; },
        getGlowClass(teamId, teams) { return `team-glow-${this.getColorIndex(teamId, teams)}`; },
        getBgClass(teamId, teams) { return `team-bg-${this.getColorIndex(teamId, teams)}`; },
        getBorderClass(teamId, teams) { return `team-card-${this.getColorIndex(teamId, teams)}`; },
        getRowClass(teamId, teams) { return `team-row-${this.getColorIndex(teamId, teams)}`; },
        getIndicatorClass(teamId, teams) { return `team-ind-${this.getColorIndex(teamId, teams)}`; },
        getColorValue(teamId, teams) { return this.colors[this.getColorIndex(teamId, teams) - 1]; },
        getColor(idx) { return this.colors[(idx - 1) % 8]; }
    };

    // Return wrapper that auto-injects AppState.teams
    return {
        colors: base.colors,
        maxColors: base.maxColors,
        getColorIndex(teamId) { return base.getColorIndex(teamId, AppState.teams); },
        getColorClass(teamId) { return base.getColorClass(teamId, AppState.teams); },
        getGlowClass(teamId) { return base.getGlowClass(teamId, AppState.teams); },
        getBgClass(teamId) { return base.getBgClass(teamId, AppState.teams); },
        getBorderClass(teamId) { return base.getBorderClass(teamId, AppState.teams); },
        getRowClass(teamId) { return base.getRowClass(teamId, AppState.teams); },
        getIndicatorClass(teamId) { return base.getIndicatorClass(teamId, AppState.teams); },
        getColorValue(teamId) { return base.getColorValue(teamId, AppState.teams); },
        getColor(idx) { return base.getColor(idx); }
    };
})();

/*
// ============================================================
// BOOT SEQUENCE
// Fake BIOS/DOS startup animation
// ============================================================

const BootSequence = {
    asciiArt: `
 BABY SHOWER
 ═══════════
    `,

    bootLines: [
        { text: 'BABY MONITOR OS v1.0', class: 'boot-line--header', delay: 100 },
        { text: 'Initializing Nursery Systems...', delay: 50 },
        { text: '', delay: 100 },
        { text: 'Checking Bottle Warmer... OK', class: 'boot-line--success', delay: 80 },
        { text: 'Testing Crib Integrity... OK', class: 'boot-line--success', delay: 150 },
        { text: '', delay: 50 },
        { text: 'Detecting Baby... NOT FOUND (Yet)', delay: 120 },
        { text: 'Loading Cuteness Protocols...', delay: 100 },
        { text: '', delay: 50 },
        { text: 'WARNING: Sleep Deprivation Imminent', class: 'boot-line--warning', delay: 150 },
        { text: 'ALERT: Diaper Change Required', class: 'boot-line--error', delay: 200 },
        { text: '', delay: 100 },
        { text: 'Connecting to Family Network...', delay: 150 },
        { text: '', delay: 100 },
        { text: 'READY FOR ARRIVAL', class: 'boot-line--success', delay: 300 },
    ],

    hasPlayed: false,

    async play() {
        // Check if we've already played this session
        if (sessionStorage.getItem('bootPlayed')) {
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

        // Show ASCII art
        asciiEl.textContent = this.asciiArt;

        // Play boot lines one by one
        for (let i = 0; i < this.bootLines.length; i++) {
            const line = this.bootLines[i];
            const lineEl = document.createElement('div');
            lineEl.className = `boot-line ${line.class || ''}`;
            lineEl.textContent = line.text;
            linesEl.appendChild(lineEl);

            await this.sleep(line.delay);
            lineEl.classList.add('visible');
        }

        // Show progress bar
        await this.sleep(200);
        progressEl.style.display = 'flex';

        // Animate progress bar
        for (let i = 0; i <= 100; i += 2) {
            progressFill.style.width = `${i}%`;
            progressText.textContent = `${i}%`;
            await this.sleep(20);
        }

        await this.sleep(300);

        // Fade out with glitch effect
        container.style.transition = 'opacity 0.3s ease';
        container.style.opacity = '0';

        await this.sleep(300);
        container.classList.add('hidden');

        // Mark as played
        sessionStorage.setItem('bootPlayed', 'true');
        this.hasPlayed = true;

        // Trigger a glitch as we transition
        GlitchEffects.trigger('major');
    },

    skip() {
        const container = document.getElementById('boot-sequence');
        if (container) {
            container.classList.add('hidden');
        }
        this.hasPlayed = true;
    },

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};
*/


// ============================================================
// WINDOWS 98 ERROR DIALOG
// Retro error popup for wrong answers/events
// ============================================================

const Win98Dialog = {
    /**
     * Show a Windows 98 style error dialog
     * @param {Object} options
     * @param {string} options.title - Dialog title
     * @param {string} options.message - Error message (can include HTML)
     * @param {string} options.icon - Emoji icon (⚠️, ❌, ℹ️, etc.)
     * @param {number} options.duration - Auto-hide after ms (0 = manual close)
     */
    show(options = {}) {
        const overlay = document.getElementById('win98-overlay');
        const title = document.getElementById('win98-title');
        const message = document.getElementById('win98-message');
        const icon = document.getElementById('win98-icon');

        if (!overlay) return;

        title.textContent = options.title || 'Y2K Error';
        message.innerHTML = options.message || '<strong>An error has occurred.</strong>';
        icon.textContent = options.icon || '⚠️';

        overlay.classList.remove('hidden');

        // Play error sound effect if available
        this.playErrorSound();

        // Auto-hide after duration
        if (options.duration && options.duration > 0) {
            setTimeout(() => this.hide(), options.duration);
        }
    },

    hide() {
        const overlay = document.getElementById('win98-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
    },

    /**
     * Show a "wrong answer" error
     * @param {string} teamName - Team that got it wrong
     */
    showWrongAnswer(teamName) {
        this.show({
            title: 'ANSWER_ERROR.EXE',
            message: `<strong>Incorrect Response Detected</strong>
                ${teamName ? `Team "${teamName}" has submitted an invalid answer.` : 'The submitted answer is incorrect.'}
                <br><br>
                Error code: 0x1999Y2K`,
            icon: '❌',
            duration: 3000
        });
        GlitchEffects.trigger('minor');
    },

    /**
     * Show a generic system error
     * @param {string} message - Error message
     */
    showSystemError(message) {
        this.show({
            title: 'SYSTEM_FAILURE.DLL',
            message: `<strong>Critical System Error</strong>
                ${message}
                <br><br>
                The Y2K bug may have corrupted essential files.`,
            icon: '💀',
            duration: 4000
        });
        GlitchEffects.trigger('major');
    },

    /**
     * Show buzzer lock notification
     * @param {string} teamName - Team that buzzed in
     */
    showBuzzerLock(teamName) {
        this.show({
            title: 'BUZZER.SYS',
            message: `<strong>Signal Intercepted!</strong>
                Team "${teamName}" has locked the transmission.
                <br><br>
                Awaiting response verification...`,
            icon: '🔔',
            duration: 2500
        });
    },

    playErrorSound() {
        // Could add a Windows error sound here if desired
        // For now, just trigger a small screen shake
        GlitchEffects.shake(100);
    }
};

// ============================================================
// BLUE SCREEN OF DEATH
// Dramatic elimination effect
// ============================================================

const BSOD = {
    /**
     * Show Blue Screen of Death for a team elimination
     * @param {string} teamName - Name of eliminated team
     * @param {number} duration - How long to show (ms)
     */
    show(teamName, duration = 4000) {
        const overlay = document.getElementById('bsod-overlay');
        const teamEl = document.getElementById('bsod-team-name');

        if (!overlay) return;

        teamEl.textContent = teamName || 'UNKNOWN';
        overlay.classList.remove('hidden');

        // Major glitch effect
        GlitchEffects.trigger('critical');
        GlitchEffects.shake(500);

        // Auto-hide after duration
        setTimeout(() => {
            this.hide();
        }, duration);

        // Allow click/keypress to dismiss early
        const dismiss = () => {
            this.hide();
            document.removeEventListener('click', dismiss);
            document.removeEventListener('keydown', dismiss);
        };

        setTimeout(() => {
            document.addEventListener('click', dismiss, { once: true });
            document.addEventListener('keydown', dismiss, { once: true });
        }, 1000); // Wait 1s before allowing dismiss
    },

    hide() {
        const overlay = document.getElementById('bsod-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
    }
};

// ============================================================
// VHS TRANSITIONS
// Retro TV channel change effects
// ============================================================

const VHSTransition = {
    /**
     * Play VHS-style channel change transition
     * @param {string} type - 'switch', 'static', or 'sweep'
     */
    async play(type = 'switch') {
        switch (type) {
            case 'switch':
                await this.channelSwitch();
                break;
            case 'static':
                await this.staticBurst();
                break;
            case 'sweep':
                await this.scanlineSweep();
                break;
            default:
                await this.channelSwitch();
        }
    },

    async channelSwitch() {
        const el = document.getElementById('vhs-transition');
        const staticEl = document.getElementById('static-burst');
        if (!el) return;

        // Trigger both effects
        el.classList.add('active');
        staticEl.classList.add('active');

        await this.sleep(400);

        el.classList.remove('active');
        staticEl.classList.remove('active');
    },

    async staticBurst() {
        const el = document.getElementById('static-burst');
        if (!el) return;

        el.classList.add('active');
        await this.sleep(300);
        el.classList.remove('active');
    },

    async scanlineSweep() {
        const el = document.getElementById('scanline-sweep');
        if (!el) return;

        el.classList.add('active');
        await this.sleep(500);
        el.classList.remove('active');
    },

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};

// ============================================================
// TIMER CRITICAL EFFECTS
// Enhanced timer countdown visuals
// ============================================================

const TimerEffects = {
    criticalOverlayActive: false,

    /**
     * Enable/disable the critical timer overlay
     * @param {boolean} active
     */
    setCriticalOverlay(active) {
        const overlay = document.getElementById('timer-critical-overlay');
        if (!overlay) return;

        if (active && !this.criticalOverlayActive) {
            overlay.classList.add('active');
            this.criticalOverlayActive = true;
        } else if (!active && this.criticalOverlayActive) {
            overlay.classList.remove('active');
            this.criticalOverlayActive = false;
        }
    },

    /**
     * Add heartbeat effect to timer display
     * @param {boolean} active
     */
    setHeartbeat(active) {
        const display = document.getElementById('timer-display');
        if (!display) return;

        if (active) {
            display.classList.add('heartbeat');
        } else {
            display.classList.remove('heartbeat');
        }
    },

    /**
     * Update effects based on remaining time
     * @param {number} seconds - Remaining seconds
     * @param {number} total - Total seconds
     */
    updateForTime(seconds, total) {
        const percent = (seconds / total) * 100;

        // Under 20% - enable critical overlay
        if (percent <= 20) {
            this.setCriticalOverlay(true);
        } else {
            this.setCriticalOverlay(false);
        }

        // Under 10% - add heartbeat
        if (percent <= 10) {
            this.setHeartbeat(true);
        } else {
            this.setHeartbeat(false);
        }

        // Final 5 seconds - intensify glitches
        if (seconds <= 5 && seconds > 0) {
            GlitchEffects.trigger('minor');
        }

        // Time's up!
        if (seconds === 0) {
            this.setCriticalOverlay(false);
            this.setHeartbeat(false);
            GlitchEffects.trigger('critical');
            GlitchEffects.shake(500);
        }
    }
};

// ============================================================
// GLITCH EFFECTS
// Enhanced CRT effects for dramatic moments
// ============================================================

const GlitchEffects = {
    /**
     * Trigger a glitch effect
     * @param {string} type - 'minor', 'major', 'critical'
     */
    trigger(type = 'minor') {
        const screen = document.querySelector('.crt-screen');
        if (!screen) return;

        switch (type) {
            case 'minor':
                screen.classList.add('glitch-active');
                setTimeout(() => screen.classList.remove('glitch-active'), 200);
                break;

            case 'major':
                screen.classList.add('glitch-active', 'static-overlay', 'static-active');
                setTimeout(() => {
                    screen.classList.remove('glitch-active', 'static-overlay', 'static-active');
                }, 500);
                break;

            case 'critical':
                screen.classList.add('screen-distort', 'static-overlay', 'static-active', 'glitch-active');
                setTimeout(() => {
                    screen.classList.remove('screen-distort', 'static-overlay', 'static-active', 'glitch-active');
                }, 800);
                break;
        }
    },

    /**
     * Shake the screen
     * @param {number} duration - milliseconds
     */
    shake(duration = 400) {
        const screen = document.querySelector('.crt-screen');
        if (!screen) return;

        screen.classList.add('screen-shake');
        setTimeout(() => screen.classList.remove('screen-shake'), duration);
    },

    /**
     * Start random ambient glitches
     */
    startAmbient() {
        setInterval(() => {
            if (Math.random() > 0.92) {
                this.trigger('minor');
            }
        }, 5000);
    }
};

// ============================================================
// NEWS TICKER
// Scrolling Y2K headlines
// ============================================================

const NewsTickerManager = {
    headlines: [
    "BREAKING: AMAZON DELIVERY DRIVER GRANTED 'UNCLE' STATUS AFTER DAILY VISITS",
    "REPORT: 'SAD BEIGE' NURSERY TREND CONFUSES COLOR-LOVING INFANTS",
    "TECH NEWS: BABY MONITOR PICKING UP NEIGHBOR'S KARAOKE SESSION",
    "SCIENTIFIC BREAKTHROUGH: SHAZAM FOR CRYING BABIES IN DEVELOPMENT",
    "TRENDING: PARENTS PETITION TO REMOVE 'BABY SHARK' FROM THE INTERNET",
    "SCREEN TIME: 'BLUEY' PARENTING TACTICS DEEMED MORE EFFECTIVE THAN THERAPY",
    "UPDATE: GOOGLE SEARCH HISTORY REVEALS 'IS GREEN POOP NORMAL?' SEARCHED 50 TIMES",
    "LOCAL NEWS: WIFI OUTAGE CAUSES PANIC DURING 3AM FEEDING",
    "HEALTH ALERT: COFFEE NOW CLASSIFIED AS A MAIN FOOD GROUP",
    "CRIME WATCH: SILENT SNACK WRAPPER OPENED; BABY WAKES UP INSTANTLY",
    "WEATHER: 100% CHANCE OF SPIT-UP ON OUTFIT YOU JUST CHANGED INTO",
    "ECONOMY: BANK ACCOUNT DRAINED BY CUTE TINY SHOES THE BABY CAN'T WALK IN",
    "TRAVEL ADVISORY: GROCERY TRIP NOW REQUIRES MORE LOGISTICS THAN MOON LANDING",
    "SLEEP STUDY: 'SLEEPING LIKE A BABY' CONFIRMED TO MEAN WAKING UP SCREAMING EVERY 2 HOURS",
    "FASHION: YOGA PANTS DECLARED OFFICIAL UNIFORM OF MATERNITY LEAVE",
    "CONSTRUCTION UPDATE: CRIB ASSEMBLY ENTERS DAY 4; EXTRA SCREWS FOUND",
    "DAD NEWS: HOSPITAL BAG PACKED WITH PLAYSTATION AND ONE PAIR OF SOCKS",
    "GRANDMA ALERT: KNITTING PRODUCTION REACHES INDUSTRIAL LEVELS",
    "OPINION: STRANGER IN TARGET OFFERS UNSOLICITED ADVICE ON SOCKS",
    "UNCLE UPDATE: 'GOT YOUR NOSE' TRICK STILL FAILS TO IMPRESS INFANT",
    "SIBLING RIVALRY: FAMILY DOG OFFICIALLY DEMOTED TO 'JUST THE DOG'",
    "NEGOTIATIONS: DAD SWAPS 3 AM DIAPER CHANGE FOR FUTURE SLEEP-IN CREDITS",
    "ENGINEERING FAILURE: 3AM ONESIE SNAPS MISALIGNED; PARENTS GIVING UP",
    "TRAFFIC ALERT: DOUBLE STROLLER ATTEMPTING TO NAVIGATE COFFEE SHOP DOORWAY",
    "MARKET WATCH: DIAPER BLOWOUT DECLARED LEVEL 5 HAZMAT EVENT",
    "SCIENCE: NEWBORN HEAD SMELL BOTTLED; SOLD AS WORLD'S MOST EXPENSIVE PERFUME",
    "CELEBRATION: GENDER REVEAL CONFETTI FOUND IN CARPET 5 YEARS LATER"
    ],

    init() {
        const ticker = document.getElementById('news-ticker');
        if (!ticker) return;

        const track = ticker.querySelector('.news-ticker__track');
        if (!track) return;

        // Build the headlines HTML (duplicated for seamless loop)
        let html = '';
        const allHeadlines = [...this.headlines, ...this.headlines];

        allHeadlines.forEach((headline, i) => {
            html += `<span class="news-ticker__item">${headline}</span>`;
            html += `<span class="news-ticker__separator">///</span>`;
        });

        track.innerHTML = html;
        console.log('[NewsTicker] Initialized with', this.headlines.length, 'headlines');
    }
};

// ============================================================
// SYSTEM STATUS DASHBOARD
// Animated server status indicators
// ============================================================

const StatusDashboard = {
    states: {
        monitor: 'ok',
        wipes: 'ok',
        bottles: 'ok',
        naps: 'warning'
    },

    init() {
        this.update();
        // Random fluctuations for atmosphere
        setInterval(() => this.randomFluctuation(), 4000);
    },

    update() {
        // Map new states to existing DOM IDs (repurposing them)
        // status-mainframe -> monitor
        // status-network -> wipes
        // status-database -> bottles
        // status-shield -> naps
        
        const mapping = {
            'monitor': 'mainframe',
            'wipes': 'network',
            'bottles': 'database',
            'naps': 'shield'
        };

        Object.entries(this.states).forEach(([key, status]) => {
            const domId = mapping[key];
            const el = document.getElementById(`status-${domId}`);
            if (el) {
                el.className = 'status-light';
                el.classList.add(`status-light--${status}`);
                // Update title if possible (hacky since it's title attr)
                el.title = key.toUpperCase();
            }
        });

        // Update team count
        const teamCount = Object.keys(AppState.teams).length;
        const el = document.getElementById('status-team-count');
        if (el) el.textContent = teamCount;
    },

    /**
     * Set status for a system
     * @param {string} system - mainframe, network, database, shield
     * @param {string} status - ok, warning, critical, offline
     */
    setStatus(system, status) {
        this.states[system] = status;
        this.update();
    },

    /**
     * Update based on game state
     */
    syncWithGameState(state) {
        switch (state) {
            case 'LOBBY':
                this.setStatus('monitor', 'ok');
                this.setStatus('wipes', 'ok');
                this.setStatus('bottles', 'ok');
                this.setStatus('naps', 'warning');
                break;
            case 'TRIVIA':
                this.setStatus('bottles', 'critical');
                this.setStatus('wipes', 'warning');
                break;
            case 'BUZZER':
                this.setStatus('bottles', 'warning');
                this.setStatus('wipes', 'critical');
                break;
            case 'TIMER':
                this.setStatus('naps', 'critical');
                this.setStatus('monitor', 'warning');
                break;
            case 'TIMELINE':
                this.setStatus('bottles', 'critical');
                this.setStatus('naps', 'critical');
                break;
            case 'MINESWEEPER':
                this.setStatus('monitor', 'critical');
                this.setStatus('naps', 'critical');
                this.setStatus('wipes', 'warning');
                break;
            case 'MACGYVER':
                this.setStatus('monitor', 'warning');
                this.setStatus('wipes', 'ok');
                break;
            case 'VICTORY':
                this.setStatus('monitor', 'ok');
                this.setStatus('wipes', 'ok');
                this.setStatus('bottles', 'ok');
                this.setStatus('naps', 'ok');
                break;
        }
    },

    randomFluctuation() {
        // Occasional random warning/recovery for atmosphere
        if (Math.random() > 0.75) {
            const systems = ['monitor', 'wipes', 'bottles'];
            const system = systems[Math.floor(Math.random() * systems.length)];
            const current = this.states[system];

            if (current === 'ok' && Math.random() > 0.6) {
                this.setStatus(system, 'warning');
                setTimeout(() => this.setStatus(system, 'ok'), 2000 + Math.random() * 2000);
            }
        }
    },

    updateTeamIndicators() {
        const container = document.getElementById('team-indicators');
        if (!container) return;

        const teams = Object.entries(AppState.teams);

        if (teams.length === 0) {
            container.innerHTML = '<div class="teams-panel__empty">AWAITING CONNECTIONS...</div>';
            return;
        }

        container.innerHTML = teams.map(([id, team]) => {
            const active = team.lastActivity && (Date.now() - team.lastActivity < 30000);
            const colorIndex = team.color || 1;
            const players = team.players || [];
            const membersHtml = players.length > 0
                ? `<div class="team-panel-card__members">${players.map(p => `<span class="team-panel-card__member">${p}</span>`).join('')}</div>`
                : '';

            return `<div class="team-panel-card team-border-${colorIndex}">
                <div class="team-panel-card__header">
                    <span class="team-panel-card__pulse ${active ? '' : 'team-panel-card__pulse--inactive'}"></span>
                    <span class="team-panel-card__name team-color-${colorIndex}">${team.name}</span>
                </div>
                ${membersHtml}
            </div>`;
        }).join('');
    }
};

// ============================================================
// CELEBRATION EFFECTS
// Confetti and score popups
// ============================================================

const CelebrationEffects = {
    /**
     * Show confetti burst
     * @param {number} count - number of confetti pieces
     */
    confetti(count = 40) {
        const container = document.createElement('div');
        container.className = 'confetti-container';
        document.body.appendChild(container);

        const colors = ['#00FF00', '#FFAA00', '#00AAFF', '#FF0000'];

        for (let i = 0; i < count; i++) {
            const piece = document.createElement('div');
            piece.className = 'confetti';
            piece.style.left = `${Math.random() * 100}%`;
            piece.style.top = '-20px';
            piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            piece.style.animationDelay = `${Math.random() * 0.5}s`;
            piece.style.animationDuration = `${2.5 + Math.random() * 2}s`;
            container.appendChild(piece);
        }

        setTimeout(() => container.remove(), 5000);
    },

    /**
     * Show score popup
     * @param {number} points - points to display
     */
    scorePopup(points) {
        const popup = document.createElement('div');
        popup.className = 'score-popup';
        popup.textContent = `+${points}`;
        document.body.appendChild(popup);

        setTimeout(() => popup.remove(), 1500);
    },

    /**
     * Full celebration (confetti + popup + glitch)
     * @param {number} points - points scored
     */
    celebrate(points) {
        this.confetti(30);
        if (points) this.scorePopup(points);
        GlitchEffects.trigger('minor');
    },

    /**
     * Victory celebration (more intense)
     */
    victory() {
        this.confetti(100);
        GlitchEffects.trigger('major');

        // Multiple confetti bursts
        setTimeout(() => this.confetti(50), 1000);
        setTimeout(() => this.confetti(50), 2000);
    }
};

// ============================================================
// REACTION FEED
// Floating emoji reactions from players
// ============================================================

const ReactionFeed = {
    init() {
        // Listen for reaction events from socket
        if (AppState.socket) {
            AppState.socket.on('reaction', (data) => {
                this.showReaction(data.reaction, data.player_name, data.team_id, data.team_color);
            });
        }
    },

    /**
     * Show a floating reaction
     * @param {string} emoji - the emoji to display
     * @param {string} playerName - name of the player who sent it
     * @param {string} teamId - team ID for color lookup
     * @param {number} teamColor - direct team color index (1-8)
     */
    showReaction(emoji, playerName, teamId = null, teamColor = null) {
        const feed = document.getElementById('reaction-feed');
        if (!feed) return;

        // Use direct team_color if provided, otherwise look up by team ID
        const colorIndex = teamColor || (teamId ? TeamColors.getColorIndex(teamId) : 1);
        const reactionClass = `team-reaction-${colorIndex}`;
        const glowClass = `team-glow-${colorIndex}`;

        const el = document.createElement('div');
        el.className = `floating-reaction ${reactionClass}`;
        el.innerHTML = `
            <span class="floating-reaction__emoji">${emoji}</span>
            <span class="floating-reaction__name ${glowClass}">${playerName || ''}</span>
        `;

        // Random horizontal position and drift
        const startX = 10 + Math.random() * 80;
        el.style.left = `${startX}%`;
        el.style.setProperty('--drift-x', `${(Math.random() - 0.5) * 80}px`);

        feed.appendChild(el);

        // Remove after animation completes
        setTimeout(() => el.remove(), 4000);
    }
};

// ============================================================
// CHAT FEED
// Scrolling chat messages from players
// ============================================================

const ChatFeed = {
    maxMessages: 8, // Maximum messages visible at once

    init() {
        // Listen for chat_message events from socket
        if (AppState.socket) {
            AppState.socket.on('chat_message', (data) => {
                this.showMessage(data.player_name, data.team_name, data.message, data.team_id, data.team_color);
            });
        }
    },

    /**
     * Show a chat message in the feed
     * @param {string} playerName - name of the player who sent it
     * @param {string} teamName - name of the team
     * @param {string} message - the message text
     * @param {string} teamId - team ID for color lookup
     * @param {number} teamColor - direct team color index (1-8)
     */
    showMessage(playerName, teamName, message, teamId = null, teamColor = null) {
        const feed = document.getElementById('chat-feed');
        if (!feed) return;

        // Use direct team_color if provided, otherwise look up by team ID
        const colorIndex = teamColor || (teamId ? TeamColors.getColorIndex(teamId) : 1);
        const chatClass = `team-chat-${colorIndex}`;

        const el = document.createElement('div');
        el.className = `chat-message ${chatClass}`;
        el.innerHTML = `
            <span class="chat-message__sender">${playerName || 'Player'}:</span>
            <span class="chat-message__text">${this.escapeHtml(message)}</span>
        `;

        feed.appendChild(el);

        // Trigger entrance animation
        requestAnimationFrame(() => {
            el.classList.add('chat-message--visible');
        });

        // Remove oldest messages if over limit
        const messages = feed.querySelectorAll('.chat-message');
        while (messages.length > this.maxMessages) {
            const oldest = messages[0];
            oldest.classList.add('chat-message--fading');
            setTimeout(() => oldest.remove(), 300);
            break; // Remove one at a time
        }

        // Auto-remove after 15 seconds
        setTimeout(() => {
            el.classList.add('chat-message--fading');
            setTimeout(() => el.remove(), 300);
        }, 15000);
    },

    /**
     * Escape HTML to prevent XSS
     * @param {string} text
     * @returns {string}
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// ============================================================
// QR CODE GENERATION
// ============================================================

const QRCodeManager = {
    /**
     * Fetch local IP and generate QR codes for WiFi and mobile URL
     */
    async init() {
        try {
            const response = await fetch('/api/local-ip');
            const data = await response.json();

            const hasWifi = data.wifi && data.wifi.ssid && data.wifi.password;

            // Generate WiFi QR code if configured
            if (hasWifi) {
                this.generateWiFiQRCode(data.wifi.ssid, data.wifi.password);

                // Show WiFi container and update label
                const wifiContainer = document.getElementById('qr-wifi-container');
                const wifiLabel = document.getElementById('qr-wifi-label');
                if (wifiContainer) {
                    wifiContainer.classList.remove('hidden');
                }
                if (wifiLabel) {
                    wifiLabel.textContent = data.wifi.ssid;
                }

                // Update game QR step number when WiFi is present
                const gameStep = document.getElementById('qr-game-step');
                if (gameStep) {
                    gameStep.textContent = '2. Join the game';
                }
            }

            // Generate game URL QR code
            if (data.mobile_url) {
                this.generateQRCode(data.mobile_url, 'qr-canvas');
                // Display the URL text
                const urlEl = document.getElementById('qr-url');
                if (urlEl) {
                    urlEl.textContent = data.mobile_url;
                }

                // Update HUD room code badge
                if (window.hudController) {
                    // Extract just the host part for display
                    try {
                        const url = new URL(data.mobile_url);
                        const displayUrl = url.host;
                        window.hudController.updateRoomCode(displayUrl, '');
                    } catch (e) {
                        window.hudController.updateRoomCode(data.mobile_url, '');
                    }
                }
            }
        } catch (err) {
            console.error('[QR] Failed to get local IP:', err);
        }
    },

    /**
     * Generate WiFi QR code
     * Format: WIFI:T:WPA;S:<SSID>;P:<password>;;
     * @param {string} ssid - WiFi network name
     * @param {string} password - WiFi password
     */
    generateWiFiQRCode(ssid, password) {
        // Escape special characters in SSID and password for WiFi QR format
        // Characters that need escaping: \, ;, ,, :, "
        const escapeWiFi = (str) => {
            if (!str) return '';
            return str.replace(/[\\;,:"]/g, '\\$&');
        };

        // WiFi QR code format: WIFI:S:<SSID>;T:<security>;P:<password>;;
        // iOS prefers S: field first, and no H: field for non-hidden networks
        const escapedSsid = escapeWiFi(ssid);
        const escapedPassword = escapeWiFi(password);
        const wifiString = `WIFI:S:${escapedSsid};T:WPA;P:${escapedPassword};;`;

        console.log('[QR] WiFi QR string:', wifiString);
        console.log('[QR] SSID:', ssid, '-> escaped:', escapedSsid);
        console.log('[QR] Password provided:', password ? 'yes (' + password.length + ' chars)' : 'NO - THIS IS THE PROBLEM');

        if (!password) {
            console.error('[QR] WARNING: No password provided for WiFi QR code!');
        }

        this.generateQRCode(wifiString, 'qr-wifi-canvas');
        console.log('[QR] WiFi QR generated for SSID:', ssid);
    },

    /**
     * Generate QR code on canvas
     * @param {string} data - The data to encode
     * @param {string} canvasId - The canvas element ID
     */
    generateQRCode(data, canvasId = 'qr-canvas') {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.error('[QR] Canvas not found:', canvasId);
            return;
        }

        try {
            // Use qrcode-generator library
            const qr = qrcode(0, 'M');
            qr.addData(data);
            qr.make();

            const moduleCount = qr.getModuleCount();
            const cellSize = Math.floor(300 / moduleCount);
            const size = moduleCount * cellSize;

            canvas.width = size;
            canvas.height = size;

            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, size, size);

            ctx.fillStyle = '#000000';
            for (let row = 0; row < moduleCount; row++) {
                for (let col = 0; col < moduleCount; col++) {
                    if (qr.isDark(row, col)) {
                        ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
                    }
                }
            }

            console.log('[QR] Generated for:', canvasId);
        } catch (error) {
            console.error('[QR] Generation failed:', error);
        }
    }
};

// ============================================================
// BALLOON FLOAT SCREENSAVER
// Floating balloons for idle lobby
// ============================================================

const MatrixRain = {
    canvas: null,
    ctx: null,
    balloons: [],
    animationId: null,
    idleTimeout: null,
    isActive: false,

    // Time in ms before screensaver activates (60 seconds)
    IDLE_DELAY: 60000,

    /**
     * Initialize the Balloon canvas
     */
    init() {
        this.canvas = document.getElementById('matrix-rain');
        if (!this.canvas) {
            console.log('[BalloonFloat] Canvas not found');
            return;
        }

        this.ctx = this.canvas.getContext('2d');
        this.resize();

        // Handle window resize
        window.addEventListener('resize', () => this.resize());

        console.log('[BalloonFloat] Initialized');
    },

    /**
     * Resize canvas to fill window
     */
    resize() {
        if (!this.canvas) return;

        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    },

    /**
     * Create a new balloon
     */
    createBalloon(y) {
        const colors = [
            'rgba(255, 181, 167, 0.7)', // Peach
            'rgba(176, 224, 230, 0.7)', // Powder Blue
            'rgba(253, 252, 220, 0.7)', // Cream
            'rgba(189, 224, 254, 0.7)', // Light Sky
            'rgba(205, 180, 219, 0.7)', // Lavender
            'rgba(162, 210, 255, 0.7)', // Baby Blue
            'rgba(255, 200, 221, 0.7)', // Soft Pink
            'rgba(152, 245, 225, 0.7)'  // Mint
        ];
        
        return {
            x: Math.random() * this.canvas.width,
            y: y !== undefined ? y : this.canvas.height + 50,
            radius: 20 + Math.random() * 15,
            color: colors[Math.floor(Math.random() * colors.length)],
            speed: 1 + Math.random() * 1.5,
            wobble: Math.random() * Math.PI * 2,
            wobbleSpeed: 0.02 + Math.random() * 0.03,
            stringLength: 30 + Math.random() * 20
        };
    },

    /**
     * Draw a single frame
     */
    draw() {
        if (!this.ctx || !this.canvas) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Add new balloon occasionally
        if (this.balloons.length < 30 && Math.random() < 0.02) {
            this.balloons.push(this.createBalloon());
        }

        for (let i = 0; i < this.balloons.length; i++) {
            const b = this.balloons[i];

            // Update position
            b.y -= b.speed;
            b.wobble += b.wobbleSpeed;
            const wobbleX = Math.sin(b.wobble) * 1; // Gentle sway

            // Draw balloon string
            this.ctx.beginPath();
            this.ctx.moveTo(b.x + wobbleX, b.y + b.radius);
            // Wavy string
            this.ctx.quadraticCurveTo(
                b.x + wobbleX - 5, b.y + b.radius + b.stringLength / 2,
                b.x + wobbleX, b.y + b.radius + b.stringLength
            );
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();

            // Draw balloon body (oval)
            this.ctx.beginPath();
            this.ctx.ellipse(b.x + wobbleX, b.y, b.radius * 0.8, b.radius, 0, 0, Math.PI * 2);
            this.ctx.fillStyle = b.color;
            this.ctx.fill();
            
            // Balloon shine/reflection
            this.ctx.beginPath();
            this.ctx.ellipse(b.x + wobbleX - b.radius * 0.3, b.y - b.radius * 0.3, b.radius * 0.15, b.radius * 0.25, -0.5, 0, Math.PI * 2);
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            this.ctx.fill();

            // Border
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();

            // Remove if off screen
            if (b.y < -100) {
                this.balloons.splice(i, 1);
                i--;
            }
        }
    },

    /**
     * Animation loop
     */
    animate() {
        if (!this.isActive) return;

        this.draw();
        this.animationId = requestAnimationFrame(() => this.animate());
    },

    /**
     * Start the screensaver
     */
    start() {
        if (this.isActive) return;

        console.log('[BalloonFloat] Starting screensaver');
        this.isActive = true;

        // Initialize some balloons
        this.balloons = [];
        for(let i=0; i<15; i++) {
            this.balloons.push(this.createBalloon(Math.random() * window.innerHeight));
        }

        // Fade in the canvas
        if (this.canvas) {
            this.canvas.classList.add('active');
        }

        // Start animation
        this.animate();
    },

    /**
     * Stop the screensaver
     */
    stop() {
        if (!this.isActive) return;

        console.log('[BalloonFloat] Stopping screensaver');
        this.isActive = false;

        // Cancel animation
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        // Fade out the canvas
        if (this.canvas) {
            this.canvas.classList.remove('active');
        }

        // Clear the idle timeout
        this.clearIdleTimeout();
    },

    /**
     * Start the idle timer (call when entering LOBBY)
     */
    startIdleTimer() {
        this.clearIdleTimeout();

        console.log('[BalloonFloat] Starting idle timer (' + (this.IDLE_DELAY / 1000) + 's)');

        this.idleTimeout = setTimeout(() => {
            // Only start if we're still in LOBBY state
            if (AppState.currentState === 'LOBBY') {
                this.start();
            }
        }, this.IDLE_DELAY);
    },

    /**
     * Clear the idle timeout
     */
    clearIdleTimeout() {
        if (this.idleTimeout) {
            clearTimeout(this.idleTimeout);
            this.idleTimeout = null;
        }
    },

    /**
     * Reset the idle timer (e.g., when team activity occurs)
     */
    resetIdleTimer() {
        if (AppState.currentState === 'LOBBY') {
            this.stop();
            this.startIdleTimer();
        }
    },

    /**
     * Handle state change
     * @param {string} newState - The new game state
     */
    onStateChange(newState) {
        if (newState === 'LOBBY') {
            this.startIdleTimer();
        } else {
            this.stop();
            this.clearIdleTimeout();
        }
    }
};

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[TV] Initializing...');

    // Play boot sequence first (blocks until complete)
    // await BootSequence.play();

    // Initialize socket connection
    SocketHandlers.init();

    // Initialize Spotify Web Playback SDK
    SpotifyPlayer.init();

    // Initialize Background Music Manager
    BackgroundMusic.init();

    // Initialize QR code
    QRCodeManager.init();

    // Initialize new display enhancements
    NewsTickerManager.init();
    StatusDashboard.init();
    GlitchEffects.startAmbient();
    MatrixRain.init();
    NowPlaying.init();
    MidnightCountdown.init();

    // Show lobby view by default
    ViewManager.showForState('LOBBY');

    // Start Matrix rain idle timer for lobby
    MatrixRain.startIdleTimer();

    // Initialize mock mode test controls if enabled
    initMockModeTestControls();

    // Setup audio unlock overlay
    initAudioUnlock();

    // Initialize reaction feed after socket is connected
    setTimeout(() => ReactionFeed.init(), 500);

    // Initialize chat feed after socket is connected
    setTimeout(() => ChatFeed.init(), 500);

    // Initialize activity tracking for screensaver
    initActivityTracking();

    console.log('[TV] Ready');
});

// ============================================================
// ACTIVITY TRACKING (keeps screensaver from activating)
// ============================================================

function initActivityTracking() {
    let lastActivityPing = 0;
    const PING_THROTTLE = 30000; // Only ping every 30 seconds max

    function sendActivityPing() {
        const now = Date.now();
        if (now - lastActivityPing > PING_THROTTLE && AppState.socket && AppState.connected) {
            AppState.socket.emit('screensaver_activity');
            lastActivityPing = now;
            console.log('[TV] Activity ping sent');
        }
    }

    // Track user interactions - TV typically uses mouse/keyboard
    ['click', 'keypress', 'mousemove', 'touchstart'].forEach(evt => {
        document.addEventListener(evt, sendActivityPing);
    });
}

/**
 * Initialize audio unlock overlay
 * Browser autoplay policy requires user interaction before audio can play
 */
function initAudioUnlock() {
    const overlay = document.getElementById('audio-unlock-overlay');
    const btn = document.getElementById('audio-unlock-btn');

    if (!overlay || !btn) {
        console.log('[Audio] No unlock overlay found');
        return;
    }

    const unlockAudio = async () => {
        console.log('[Audio] Unlocking audio...');

        // Activate Spotify player element (must be done in response to user gesture)
        if (AppState.spotifyPlayer) {
            try {
                await AppState.spotifyPlayer.activateElement();
                console.log('[Audio] Spotify player element activated');
            } catch (e) {
                console.log('[Audio] activateElement failed:', e);
            }
        }

        // Also unlock HTML5 audio by playing a silent sound
        const audio = document.getElementById('audio-player');
        if (audio) {
            audio.volume = 0;
            audio.play().then(() => {
                audio.pause();
                audio.volume = 1;
                console.log('[Audio] HTML5 audio unlocked');
            }).catch(e => console.log('[Audio] HTML5 unlock failed:', e));
        }

        AppState.audioUnlocked = true;
        overlay.classList.add('hidden');
        console.log('[Audio] Audio unlocked successfully');
    };

    // Handle click on overlay or button
    overlay.addEventListener('click', unlockAudio);
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        unlockAudio();
    });
}

// Expose to window for debugging
window.ViewManager = ViewManager;
window.AppState = AppState;
window.CONFIG = CONFIG;
window.UI = UI;
window.GameProgress = GameProgress;
window.MockTestHelper = MockTestHelper;
window.QRCodeManager = QRCodeManager;
window.GlitchEffects = GlitchEffects;
window.NewsTickerManager = NewsTickerManager;
window.StatusDashboard = StatusDashboard;
window.CelebrationEffects = CelebrationEffects;
window.ReactionFeed = ReactionFeed;
// window.BootSequence = BootSequence;
window.Win98Dialog = Win98Dialog;
window.BSOD = BSOD;
window.VHSTransition = VHSTransition;
window.TimerEffects = TimerEffects;
window.MatrixRain = MatrixRain;
window.ChatFeed = ChatFeed;
