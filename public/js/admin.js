/**
 * ADMIN.JS - Admin Dashboard Controller
 * Placeholder implementation - full functionality in WP5
 *
 * Uses shared modules from src/scripts/ (exposed via window globals):
 * - window.STATE_VIEW_MAP, window.GAME_PHASES (if needed)
 * - window.TeamColors for team color utilities
 */

// ============================================================
// STATE
// ============================================================

const AppState = {
    socket: null,
    connected: false,
    authenticated: false,
    currentState: 'LOBBY',
    teams: {},
    scores: {},
    buzzerLockedBy: null,
    // Pre-loaded content from server
    triviaQuestions: [],
    timelinePuzzles: [],
    audioTracks: [],
    pictureGuesses: [],
    // Currently selected trivia answer (for reveal)
    currentTriviaAnswer: '',
    // Currently selected picture guess answer (for reveal)
    currentPictureGuessAnswer: '',
    // Timer state
    timerRunning: false,
    timerPaused: false,
    timerRemaining: 0,
    timerTotal: 0,
    timerInterval: null,
    // Timeline submissions (team_id -> submission data)
    timelineSubmissions: {},
    // QR code visibility (default hidden)
    qrVisible: false,
    // Pixel Perfect state
    pixelperfectLockedBy: null,
    pixelperfectImages: [],
    // Price Guess state
    priceProducts: [],
    // Survival questions
    survivalQuestions: []
};

// ============================================================
// UI HELPERS
// ============================================================

const UI = {
    showView(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const view = document.getElementById(viewId);
        if (view) view.classList.add('active');
    },

    showAuthError(message) {
        document.getElementById('auth-error').textContent = message;
    },

    updateConnectionStatus(connected, message = null) {
        let indicator = document.getElementById('connection-status');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'connection-status';
            indicator.style.cssText = `
                position: fixed; top: 10px; right: 10px; z-index: 1000;
                padding: 8px 16px; border-radius: 4px; font-size: 0.85rem;
                font-family: var(--font-whimsy, sans-serif);
                transition: all 0.3s ease;
            `;
            document.body.appendChild(indicator);
        }
        if (connected) {
            indicator.textContent = 'Connected';
            indicator.style.background = 'rgba(34, 197, 94, 0.9)';
            indicator.style.color = 'white';
            // Auto-hide after 2 seconds when connected
            setTimeout(() => { indicator.style.opacity = '0'; }, 2000);
        } else {
            indicator.textContent = message || 'Disconnected';
            indicator.style.background = 'rgba(239, 68, 68, 0.9)';
            indicator.style.color = 'white';
            indicator.style.opacity = '1';
        }
    },

    updateTeamList() {
        const list = document.getElementById('team-list');
        const select = document.getElementById('point-team');
        const teams = Object.entries(AppState.teams);

        if (teams.length === 0) {
            list.innerHTML = '<li style="color: var(--ice-soft);">No teams connected</li>';
            select.innerHTML = '<option value="">-- No teams --</option>';
            return;
        }

        list.innerHTML = teams.map(([id, team]) => {
            const score = AppState.scores[id] || 0;
            return `<li style="padding: 0.5rem; border-bottom: 1px solid var(--ice-soft);">
                ${team.name} - ${score} pts
                <button class="terminal-btn" style="padding: 2px 8px; font-size: 0.7rem; margin-left: 10px;"
                    onclick="AdminActions.kickTeam('${id}')">KICK</button>
            </li>`;
        }).join('');

        select.innerHTML = teams.map(([id, team]) =>
            `<option value="${id}">${team.name}</option>`
        ).join('');
    },

    updateCurrentState(state) {
        document.getElementById('current-state').textContent = `STATE: ${state}`;
        AppState.currentState = state;

        // Show/hide section-specific controls (with null checks)
        const sections = {
            'buzzer-section': 'BUZZER',
            'trivia-section': 'TRIVIA',
            'timeline-section': 'TIMELINE',
            'timer-section': 'TIMER',
            'pictureguess-section': 'PICTUREGUESS',
            'pixelperfect-section': 'PIXELPERFECT',
            'priceguess-section': 'PRICEGUESS',
            'survival-section': 'SURVIVAL'
        };

        Object.entries(sections).forEach(([id, sectionState]) => {
            const el = document.getElementById(id);
            if (el) el.style.display = state === sectionState ? 'block' : 'none';
        });
    },

    updateTimerDisplay(remaining, total, status) {
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        document.getElementById('timer-remaining').textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        document.getElementById('timer-status').textContent = status;
    },

    updateBuzzerLocker(teamName) {
        const el = document.getElementById('buzzer-locker');
        console.log('[Admin] updateBuzzerLocker:', teamName, 'element found:', !!el);
        if (el) el.textContent = teamName || '---';
    },

    addAnswer(teamId, teamName, answer) {
        const list = document.getElementById('answer-list');
        console.log('[Admin] addAnswer:', { teamId, teamName, answer }, 'list found:', !!list);
        if (!list) {
            console.error('[Admin] answer-list element not found!');
            return;
        }
        const existingId = `answer-${teamId}`;
        let li = document.getElementById(existingId);

        if (!li) {
            li = document.createElement('li');
            li.id = existingId;
            list.appendChild(li);
        }

        li.style.cssText = 'padding: 0.5rem; border-bottom: 1px solid var(--ice-soft);';
        li.innerHTML = `
            <strong>${teamName}:</strong> ${answer}
            <span class="grading-buttons">
                <button class="terminal-btn" style="padding: 2px 8px; font-size: 0.7rem; margin-left: 10px; background: #004400;"
                    onclick="AdminActions.gradeAnswer('${teamId}', true)">CORRECT</button>
                <button class="terminal-btn" style="padding: 2px 8px; font-size: 0.7rem; margin-left: 5px; background: #440000;"
                    onclick="AdminActions.gradeAnswer('${teamId}', false)">WRONG</button>
            </span>
            <span class="graded-status" style="display: none; margin-left: 10px; font-weight: bold;"></span>
        `;
    },

    markAnswerGraded(teamId, correct, points) {
        const li = document.getElementById(`answer-${teamId}`);
        if (!li) return;

        const buttons = li.querySelector('.grading-buttons');
        const status = li.querySelector('.graded-status');

        if (buttons) buttons.style.display = 'none';
        if (status) {
            status.style.display = 'inline';
            status.style.color = correct ? '#00ff00' : '#ff4444';
            status.textContent = correct ? `CORRECT (+${points} pts)` : 'WRONG';
        }
    },

    populateTriviaPresets() {
        const select = document.getElementById('trivia-preset-select');
        select.innerHTML = '<option value="">-- Select a question or type custom --</option>';

        AppState.triviaQuestions.forEach((q, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `Q${q.id}: ${q.question.substring(0, 50)}${q.question.length > 50 ? '...' : ''}`;
            select.appendChild(option);
        });
    },

    populateTimelinePresets() {
        const select = document.getElementById('timeline-preset-select');
        select.innerHTML = '<option value="">-- Select a puzzle or type custom --</option>';

        AppState.timelinePuzzles.forEach((p, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `${p.name} (${p.events.length} events)`;
            select.appendChild(option);
        });
    },

    populateAudioTracks() {
        const select = document.getElementById('audio-track-select');
        select.innerHTML = '<option value="">-- Select a track --</option>';

        AppState.audioTracks.forEach((track, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `${track.title} - ${track.artist}${track.hint ? ` (${track.hint})` : ''}`;
            select.appendChild(option);
        });
    },

    updateSpotifyWarning(connected) {
        const warning = document.getElementById('spotify-warning');
        if (warning) {
            if (connected) {
                warning.classList.add('hidden');
            } else {
                warning.classList.remove('hidden');
            }
        }
    },

    updateTimelineSubmission(data) {
        // Store/overwrite submission for this team
        AppState.timelineSubmissions[data.team_id] = data;
        this.renderTimelineSubmissions();
    },

    clearTimelineSubmissions() {
        AppState.timelineSubmissions = {};
        this.renderTimelineSubmissions();
    },

    renderTimelineSubmissions() {
        const list = document.getElementById('timeline-submission-list');
        if (!list) return;

        const submissions = Object.values(AppState.timelineSubmissions);

        if (submissions.length === 0) {
            list.innerHTML = '<li style="color: var(--ice-soft);">No submissions yet</li>';
            return;
        }

        list.innerHTML = submissions.map(sub => {
            const statusColor = sub.status === 'winner' ? '#004400' : '#440000';
            const statusText = sub.status === 'winner' ? 'CORRECT' : 'INCORRECT';
            const playerInfo = sub.player_name ? ` (${sub.player_name})` : '';
            return `<li style="padding: 0.5rem; border-bottom: 1px solid var(--ice-soft); background: ${statusColor};">
                <strong>${sub.team_name}</strong>${playerInfo}: ${statusText}
                <br><small style="color: var(--ice-soft);">Order: [${sub.order.join(', ')}]</small>
            </li>`;
        }).join('');
    },

    populatePictureGuessPresets() {
        const select = document.getElementById('pictureguess-preset-select');
        if (!select) return;

        select.innerHTML = '<option value="">-- Select a picture or enter custom URL --</option>';

        AppState.pictureGuesses.forEach((p, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `#${p.id}: ${p.answer.substring(0, 40)}${p.answer.length > 40 ? '...' : ''}`;
            select.appendChild(option);
        });
    },

    addPictureGuess(teamId, teamName, guessText) {
        const list = document.getElementById('pictureguess-list');
        console.log('[Admin] addPictureGuess:', { teamId, teamName, guessText }, 'list found:', !!list);
        if (!list) {
            console.error('[Admin] pictureguess-list element not found!');
            return;
        }

        const existingId = `pictureguess-${teamId}`;
        let li = document.getElementById(existingId);

        if (!li) {
            li = document.createElement('li');
            li.id = existingId;
            list.appendChild(li);
        }

        li.style.cssText = 'padding: 0.5rem; border-bottom: 1px solid var(--ice-soft);';
        li.innerHTML = `
            <strong>${teamName}:</strong> ${guessText}
            <span class="grading-buttons">
                <button class="terminal-btn" style="padding: 2px 8px; font-size: 0.7rem; margin-left: 10px; background: #004400;"
                    onclick="AdminActions.gradePictureGuess('${teamId}', true)">CORRECT</button>
                <button class="terminal-btn" style="padding: 2px 8px; font-size: 0.7rem; margin-left: 5px; background: #440000;"
                    onclick="AdminActions.gradePictureGuess('${teamId}', false)">WRONG</button>
            </span>
            <span class="graded-status" style="display: none; margin-left: 10px; font-weight: bold;"></span>
        `;
    },

    markPictureGuessGraded(teamId, correct, points) {
        const li = document.getElementById(`pictureguess-${teamId}`);
        if (!li) return;

        const buttons = li.querySelector('.grading-buttons');
        const status = li.querySelector('.graded-status');

        if (buttons) buttons.style.display = 'none';
        if (status) {
            status.style.display = 'inline';
            status.style.color = correct ? '#00ff00' : '#ff4444';
            status.textContent = correct ? `CORRECT (+${points} pts)` : 'WRONG';
        }
    },

    clearPictureGuessList() {
        const list = document.getElementById('pictureguess-list');
        if (list) list.innerHTML = '';
    },

    // ========== PRICE GUESS ==========

    addPriceGuess(teamId, teamName, guessAmount) {
        const list = document.getElementById('priceguess-list');
        if (!list) return;

        const existingId = `priceguess-${teamId}`;
        let li = document.getElementById(existingId);

        if (!li) {
            li = document.createElement('li');
            li.id = existingId;
            list.appendChild(li);
        }

        const formattedAmount = parseFloat(guessAmount).toFixed(2);
        li.style.cssText = 'padding: 0.5rem; border-bottom: 1px solid var(--ice-soft);';
        li.innerHTML = `<strong>${teamName}:</strong> $${formattedAmount}`;
    },

    clearPriceGuessList() {
        const list = document.getElementById('priceguess-list');
        if (list) list.innerHTML = '';
    },

    showPriceGuessResults(actualPrice, teamGuesses) {
        const list = document.getElementById('priceguess-list');
        if (!list) return;

        list.innerHTML = teamGuesses.map(guess => {
            let statusClass = '';
            let statusText = '';
            if (guess.status === 'winner') {
                statusClass = 'background: #004400;';
                statusText = ' - WINNER!';
            } else if (guess.status === 'bust') {
                statusClass = 'background: #440000;';
                statusText = ' - BUST';
            }
            const formattedAmount = parseFloat(guess.guess_amount).toFixed(2);
            return `<li style="padding: 0.5rem; border-bottom: 1px solid var(--ice-soft); ${statusClass}">
                <strong>${guess.team_name}:</strong> $${formattedAmount}${statusText}
            </li>`;
        }).join('');
    },

    // ========== SURVIVAL MODE ==========

    updateSurvivalVotes(voteCounts, votersA, votersB) {
        const countA = document.getElementById('admin-vote-count-a');
        const countB = document.getElementById('admin-vote-count-b');
        const listA = document.getElementById('admin-voters-a');
        const listB = document.getElementById('admin-voters-b');

        if (countA) countA.textContent = voteCounts.A || 0;
        if (countB) countB.textContent = voteCounts.B || 0;

        if (listA && votersA) {
            listA.innerHTML = votersA.map(v => `<li>${v.team_name}</li>`).join('');
        }
        if (listB && votersB) {
            listB.innerHTML = votersB.map(v => `<li>${v.team_name}</li>`).join('');
        }
    },

    addSurvivalVote(teamName, vote) {
        const listId = vote === 'A' ? 'admin-voters-a' : 'admin-voters-b';
        const countId = vote === 'A' ? 'admin-vote-count-a' : 'admin-vote-count-b';
        const list = document.getElementById(listId);
        const countEl = document.getElementById(countId);

        if (list) {
            const li = document.createElement('li');
            li.textContent = teamName;
            list.appendChild(li);
        }
        if (countEl) {
            countEl.textContent = parseInt(countEl.textContent || 0, 10) + 1;
        }
    },

    clearSurvivalVotes() {
        const listA = document.getElementById('admin-voters-a');
        const listB = document.getElementById('admin-voters-b');
        const countA = document.getElementById('admin-vote-count-a');
        const countB = document.getElementById('admin-vote-count-b');

        if (listA) listA.innerHTML = '';
        if (listB) listB.innerHTML = '';
        if (countA) countA.textContent = '0';
        if (countB) countB.textContent = '0';
    },

    updateSurvivalTeamList(teams) {
        const list = document.getElementById('survival-team-list');
        if (!list) return;

        const teamIds = Object.keys(teams);
        if (teamIds.length === 0) {
            list.innerHTML = '<li style="color: var(--ice-soft);">No teams</li>';
            return;
        }

        list.innerHTML = teamIds.map(id => {
            const team = teams[id];
            return `<li style="padding: 0.25rem 0.5rem; color: var(--ice-glow);">
                ${team.name}
            </li>`;
        }).join('');
    },

    populateSurvivalPresets() {
        const select = document.getElementById('survival-preset-select');
        if (!select) return;

        select.innerHTML = '<option value="">-- Select a question or type custom --</option>';

        AppState.survivalQuestions.forEach((q, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `Q${q.id}: ${q.question.substring(0, 50)}${q.question.length > 50 ? '...' : ''}`;
            select.appendChild(option);
        });
    },

    // ========== PIXEL PERFECT ==========

    updatePixelPerfectLocker(teamName) {
        const el = document.getElementById('pixelperfect-locker');
        if (el) el.textContent = teamName || '---';
    },

    populatePixelPerfectPresets() {
        const select = document.getElementById('pixelperfect-preset-select');
        if (!select) return;

        select.innerHTML = '<option value="">-- Select an image or enter custom URL --</option>';

        AppState.pixelperfectImages.forEach((img, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `#${img.id}: ${img.answer.substring(0, 40)}${img.answer.length > 40 ? '...' : ''}`;
            select.appendChild(option);
        });
    },

    populatePriceGuessPresets() {
        const select = document.getElementById('priceguess-preset-select');
        if (!select) return;

        select.innerHTML = '<option value="">-- Select a product or enter custom --</option>';

        AppState.priceProducts.forEach((p, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `#${p.id}: ${p.name.substring(0, 40)}${p.name.length > 40 ? '...' : ''}`;
            select.appendChild(option);
        });
    },

    // ========== ROUND TIMER (Global HUD) ==========

    updateRoundTimerDisplay(remaining, total, status) {
        const display = document.getElementById('round-timer-display');
        const statusEl = document.getElementById('round-timer-status');

        if (!display) return;

        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;

        if (status === 'stopped') {
            display.textContent = '--:--';
            if (statusEl) statusEl.textContent = '(stopped)';
        } else {
            display.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            if (statusEl) {
                if (status === 'paused') {
                    statusEl.textContent = '(paused)';
                } else if (status === 'finished') {
                    statusEl.textContent = '(finished)';
                } else {
                    statusEl.textContent = '(running)';
                }
            }
        }
    }
};

// ============================================================
// ADMIN ACTIONS
// ============================================================

const AdminActions = {
    authenticate(password) {
        if (AppState.socket) {
            AppState.socket.emit('admin_auth', { password });
        }
    },

    setState(state) {
        if (AppState.socket && AppState.authenticated) {
            let stateData = {};

            // For VICTORY state, determine the winning team (highest score)
            if (state === 'VICTORY') {
                const teamEntries = Object.entries(AppState.scores);
                if (teamEntries.length > 0) {
                    // Find the team with the highest score
                    const [winnerTeamId] = teamEntries.reduce((best, current) =>
                        current[1] > best[1] ? current : best
                    );
                    const winnerTeam = AppState.teams[winnerTeamId];
                    stateData = {
                        winner_team_id: winnerTeamId,
                        winner_team_name: winnerTeam ? winnerTeam.name : 'Unknown',
                        final_scores: AppState.scores
                    };
                }
            }

            AppState.socket.emit('set_state', { new_state: state, state_data: stateData });
        }
    },

    addPoints() {
        const teamId = document.getElementById('point-team').value;
        const points = parseInt(document.getElementById('point-amount').value, 10);
        if (teamId && points && AppState.socket) {
            AppState.socket.emit('add_points', { team_id: teamId, points });
        }
    },

    kickTeam(teamId) {
        if (AppState.socket && confirm('Kick this team?')) {
            AppState.socket.emit('kick_team', { team_id: teamId });
        }
    },

    gradeAnswer(teamId, correct) {
        if (AppState.socket) {
            AppState.socket.emit('grade_answer', {
                team_id: teamId,
                correct,
                points: correct ? 50 : 0
            });
        }
    },

    judgeBuzzer(correct, points = 0) {
        if (AppState.socket && AppState.buzzerLockedBy) {
            AppState.socket.emit('judge_buzzer', {
                team_id: AppState.buzzerLockedBy,
                correct,
                points: points
            });
        }
    },

    revealAnswer() {
        const answer = document.getElementById('correct-answer').value;
        if (AppState.socket && answer) {
            AppState.socket.emit('reveal_answer', { correct_answer: answer });
        }
    },

    sendTriviaQuestion() {
        const questionText = document.getElementById('trivia-question-input').value.trim();
        const questionId = parseInt(document.getElementById('trivia-question-id').value, 10);

        if (AppState.socket && questionText) {
            AppState.socket.emit('set_state', {
                new_state: 'TRIVIA',
                state_data: {
                    question_id: questionId,
                    question_text: questionText
                }
            });
            // Clear the answer list for new question
            document.getElementById('answer-list').innerHTML = '';
        }
    },

    playAudio() {
        const selectEl = document.getElementById('audio-track-select');
        const index = selectEl.value;

        if (index === '' || !AppState.audioTracks[index]) {
            alert('Please select a track first');
            return;
        }

        const track = AppState.audioTracks[index];
        AppState.selectedAudioTrack = track;

        if (AppState.socket) {
            AppState.socket.emit('play_audio', {
                audio_url: null,
                spotify_uri: track.spotify_uri
            });
        }
    },

    stopAudio() {
        if (AppState.socket) {
            AppState.socket.emit('stop_audio', {});
        }
    },

    revealAudio() {
        const track = AppState.selectedAudioTrack;
        if (!track) {
            alert('No track selected');
            return;
        }

        if (AppState.socket) {
            AppState.socket.emit('reveal_audio', {
                track_title: track.title,
                artist: track.artist
            });
        }
    },

    sendTimelinePuzzle() {
        const itemsText = document.getElementById('timeline-items-input').value.trim();
        const puzzleId = parseInt(document.getElementById('timeline-puzzle-id').value, 10);

        if (!itemsText) return;

        // Parse items (one per line) - these are in CORRECT order
        const items = itemsText.split('\n').filter(item => item.trim());
        if (items.length < 2) {
            alert('Please enter at least 2 items');
            return;
        }

        // Shuffle items for display to players
        const shuffledItems = [...items];
        for (let i = shuffledItems.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledItems[i], shuffledItems[j]] = [shuffledItems[j], shuffledItems[i]];
        }

        // Create correct_order: for each item in the original/correct order,
        // what is its position in the shuffled array?
        // When player drags items to correct order, they submit indices from shuffled array,
        // so this is what we need to compare against.
        const correctOrder = items.map(item => shuffledItems.indexOf(item));

        if (AppState.socket) {
            // Clear previous submissions for new puzzle
            UI.clearTimelineSubmissions();

            AppState.socket.emit('set_state', {
                new_state: 'TIMELINE',
                state_data: {
                    puzzle_id: puzzleId,
                    items: shuffledItems,  // Shuffled items for display
                    correct_order: correctOrder  // The shuffled indices in correct chronological order
                }
            });
        }
    },

    completeTimeline() {
        const itemsText = document.getElementById('timeline-items-input').value.trim();
        const items = itemsText.split('\n').filter(item => item.trim());
        const correctOrder = items.map((_, i) => i);

        if (AppState.socket) {
            AppState.socket.emit('complete_timeline', {
                correct_order: correctOrder,
                correct_labels: items
            });
        }
    },

    resetGame() {
        if (AppState.socket && confirm('Reset the entire game? This will clear all scores!')) {
            AppState.socket.emit('reset_game', { confirm: true, preserve_teams: false });
        }
    },

    // Timer actions
    startTimer() {
        const duration = parseInt(document.getElementById('timer-duration').value, 10) || 180;
        const message = document.getElementById('timer-message-input').value.trim() || 'Time remaining';

        if (AppState.socket) {
            // First set the state with message and duration
            AppState.socket.emit('set_state', {
                new_state: 'TIMER',
                state_data: {
                    message: message,
                    duration_seconds: duration
                }
            });
            // Then start the timer
            AppState.socket.emit('timer_control', {
                action: 'start',
                duration_seconds: duration,
                message: message
            });
        }
    },

    pauseTimer() {
        if (AppState.socket) {
            AppState.socket.emit('timer_control', { action: 'pause' });
        }
    },

    resumeTimer() {
        if (AppState.socket) {
            AppState.socket.emit('timer_control', { action: 'resume' });
        }
    },

    resetTimer() {
        const duration = parseInt(document.getElementById('timer-duration').value, 10) || 180;
        if (AppState.socket) {
            AppState.socket.emit('timer_control', {
                action: 'reset',
                duration_seconds: duration
            });
        }
    },

    // Round Timer actions (global HUD timer)
    startRoundTimer() {
        const duration = parseInt(document.getElementById('round-timer-duration').value, 10) || 60;
        if (AppState.socket) {
            AppState.socket.emit('round_timer_control', {
                action: 'start',
                duration_seconds: duration
            });
        }
    },

    pauseRoundTimer() {
        if (AppState.socket) {
            AppState.socket.emit('round_timer_control', { action: 'pause' });
        }
    },

    resumeRoundTimer() {
        if (AppState.socket) {
            AppState.socket.emit('round_timer_control', { action: 'resume' });
        }
    },

    stopRoundTimer() {
        if (AppState.socket) {
            AppState.socket.emit('round_timer_control', { action: 'stop' });
        }
    },

    addRoundTimerTime(seconds) {
        if (AppState.socket) {
            AppState.socket.emit('round_timer_control', {
                action: 'add_time',
                seconds: seconds
            });
        }
    },

    sendPicture() {
        const imageUrl = document.getElementById('pictureguess-url-input').value.trim();
        const hint = document.getElementById('pictureguess-hint-input').value.trim();
        const pictureId = parseInt(document.getElementById('pictureguess-id').value, 10);

        if (!imageUrl) {
            alert('Please enter a picture URL');
            return;
        }

        if (AppState.socket) {
            // Clear previous guesses
            UI.clearPictureGuessList();

            // Set state with picture data
            AppState.socket.emit('set_state', {
                new_state: 'PICTUREGUESS',
                state_data: {
                    picture_id: pictureId,
                    image_url: imageUrl,
                    hint: hint
                }
            });

            // Emit show_picture event for TV
            AppState.socket.emit('show_picture', {
                picture_id: pictureId,
                image_url: imageUrl,
                hint: hint
            });
        }
    },

    gradePictureGuess(teamId, correct) {
        if (AppState.socket) {
            AppState.socket.emit('grade_picture_guess', {
                team_id: teamId,
                correct,
                points: correct ? 50 : 0
            });
        }
    },

    revealPicture() {
        const answer = document.getElementById('pictureguess-correct-answer').value.trim();
        const pictureId = parseInt(document.getElementById('pictureguess-id').value, 10);

        if (!answer) {
            alert('Please enter the correct answer');
            return;
        }

        if (AppState.socket) {
            AppState.socket.emit('reveal_picture', {
                picture_id: pictureId,
                correct_answer: answer
            });
        }
    },

    toggleQRCode() {
        if (!AppState.socket) return;

        // Toggle the state
        AppState.qrVisible = !AppState.qrVisible;

        // Emit to server
        AppState.socket.emit('toggle_qr_code', { visible: AppState.qrVisible });

        // Update button and status text
        const btn = document.getElementById('toggle-qr-btn');
        const status = document.getElementById('qr-status');

        if (AppState.qrVisible) {
            btn.textContent = 'HIDE QR CODE';
            status.textContent = 'QR visible';
            status.style.color = 'var(--ice-glow)';
        } else {
            btn.textContent = 'SHOW QR CODE';
            status.textContent = 'QR hidden';
            status.style.color = 'var(--ice-soft)';
        }
    },

    // ========== PRICE GUESS ==========

    sendProduct() {
        const imageUrl = document.getElementById('priceguess-url-input').value.trim();
        const hint = document.getElementById('priceguess-hint-input').value.trim();
        const productId = parseInt(document.getElementById('priceguess-id').value, 10);

        if (!imageUrl) {
            alert('Please enter a product image URL');
            return;
        }

        if (AppState.socket) {
            // Clear previous guesses
            UI.clearPriceGuessList();

            // Set state with product data
            AppState.socket.emit('set_state', {
                new_state: 'PRICEGUESS',
                state_data: {
                    product_id: productId,
                    image_url: imageUrl,
                    hint: hint
                }
            });

            // Emit show_price_product event for TV
            AppState.socket.emit('show_price_product', {
                product_id: productId,
                image_url: imageUrl,
                hint: hint
            });
        }
    },

    revealPrice() {
        const actualPrice = parseFloat(document.getElementById('priceguess-actual-price').value);
        const productId = parseInt(document.getElementById('priceguess-id').value, 10);

        if (isNaN(actualPrice) || actualPrice < 0) {
            alert('Please enter a valid actual price');
            return;
        }

        if (AppState.socket) {
            AppState.socket.emit('reveal_price', {
                product_id: productId,
                actual_price: actualPrice,
                points: 100
            });
        }
    },

    // Music controller actions
    musicToggle() {
        if (AppState.socket) {
            AppState.socket.emit('music_toggle', {});
            console.log('[Admin] Music toggle emitted');
        }
    },

    musicNext() {
        if (AppState.socket) {
            AppState.socket.emit('music_next', {});
            console.log('[Admin] Music next emitted');
        }
    },

    musicPrevious() {
        if (AppState.socket) {
            AppState.socket.emit('music_previous', {});
            console.log('[Admin] Music previous emitted');
        }
    },

    // ========== SURVIVAL MODE ==========

    sendSurvivalQuestion() {
        const questionText = document.getElementById('survival-question-input').value.trim();
        const optionA = document.getElementById('survival-option-a').value.trim() || 'YES';
        const optionB = document.getElementById('survival-option-b').value.trim() || 'NO';
        const roundId = parseInt(document.getElementById('survival-round-id').value, 10);

        if (!questionText) {
            alert('Please enter a question');
            return;
        }

        if (AppState.socket) {
            UI.clearSurvivalVotes();
            AppState.socket.emit('set_state', {
                new_state: 'SURVIVAL',
                state_data: {
                    round_id: roundId,
                    question_text: questionText,
                    option_a: optionA,
                    option_b: optionB
                }
            });

            // Update option labels in admin UI
            const labelA = document.getElementById('admin-vote-label-a');
            const labelB = document.getElementById('admin-vote-label-b');
            if (labelA) labelA.textContent = optionA;
            if (labelB) labelB.textContent = optionB;
        }
    },

    survivalReveal() {
        if (AppState.socket) {
            AppState.socket.emit('survival_reveal', {});
        }
    },

    survivalResetRound() {
        if (AppState.socket) {
            const questionText = document.getElementById('survival-question-input').value.trim();
            const optionA = document.getElementById('survival-option-a').value.trim() || 'YES';
            const optionB = document.getElementById('survival-option-b').value.trim() || 'NO';
            const roundId = parseInt(document.getElementById('survival-round-id').value, 10) + 1;

            // Increment round number
            document.getElementById('survival-round-id').value = roundId;

            UI.clearSurvivalVotes();
            AppState.socket.emit('survival_reset_round', {
                round_id: roundId,
                question_text: questionText,
                option_a: optionA,
                option_b: optionB
            });
        }
    },

    // ========== PIXEL PERFECT ==========

    startPixelPerfectRound() {
        const imageUrl = document.getElementById('pixelperfect-url-input').value.trim();
        const correctAnswer = document.getElementById('pixelperfect-correct-answer').value.trim();
        const roundId = parseInt(document.getElementById('pixelperfect-round-id').value, 10);

        if (!imageUrl) {
            alert('Please enter an image URL');
            return;
        }

        if (AppState.socket) {
            // Set state to PIXELPERFECT
            AppState.socket.emit('set_state', {
                new_state: 'PIXELPERFECT',
                state_data: {
                    round_id: roundId,
                    image_url: imageUrl,
                    correct_answer: correctAnswer
                }
            });

            // Start the round
            AppState.socket.emit('start_pixelperfect_round', {
                round_id: roundId,
                image_url: imageUrl,
                correct_answer: correctAnswer
            });
        }
    },

    judgePixelPerfect(correct, points = 0) {
        if (AppState.socket && AppState.pixelperfectLockedBy) {
            AppState.socket.emit('judge_pixelperfect', {
                team_id: AppState.pixelperfectLockedBy,
                correct,
                points: points
            });
        }
    },

    revealPixelPerfect() {
        const answer = document.getElementById('pixelperfect-correct-answer').value.trim();
        if (AppState.socket && answer) {
            AppState.socket.emit('reveal_pixelperfect', {
                correct_answer: answer
            });
        }
    }
};

// ============================================================
// SOCKET HANDLERS
// ============================================================

function initSocket() {
    AppState.socket = io();
    // Expose socket globally for screensaver and other shared components
    window.socket = AppState.socket;

    // Heartbeat interval
    let heartbeatInterval = null;
    const HEARTBEAT_INTERVAL = 30000; // 30 seconds

    AppState.socket.on('connect', () => {
        console.log('[Admin] Connected to server');
        AppState.connected = true;
        UI.updateConnectionStatus(true);
        // Notify server of activity on connect
        AppState.socket.emit('screensaver_activity');

        // Start heartbeat to keep session alive
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => {
            if (AppState.connected) {
                AppState.socket.emit('heartbeat');
            }
        }, HEARTBEAT_INTERVAL);

        // If already authenticated, request state sync
        if (AppState.authenticated) {
            console.log('[Admin] Reconnected while authenticated - requesting state sync');
            AppState.socket.emit('request_tv_sync');
        }
    });

    AppState.socket.on('disconnect', (reason) => {
        console.log('[Admin] Disconnected:', reason);
        AppState.connected = false;
        UI.updateConnectionStatus(false);
        // Stop heartbeat on disconnect
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
        }
    });

    // Connection error handling
    AppState.socket.on('connect_error', (error) => {
        console.error('[Admin] Connection error:', error.message);
        UI.updateConnectionStatus(false, 'Connection error');
    });

    AppState.socket.io.on('reconnect_attempt', (attempt) => {
        console.log(`[Admin] Reconnect attempt ${attempt}`);
        UI.updateConnectionStatus(false, `Reconnecting (${attempt})...`);
    });

    AppState.socket.io.on('reconnect', (attempt) => {
        console.log(`[Admin] Reconnected after ${attempt} attempts`);
        UI.updateConnectionStatus(true);
    });

    AppState.socket.io.on('reconnect_failed', () => {
        console.error('[Admin] Reconnection failed');
        UI.updateConnectionStatus(false, 'Connection lost');
    });

    AppState.socket.on('admin_auth_result', (data) => {
        if (data.success) {
            AppState.authenticated = true;
            UI.showView('dashboard-view');
        } else {
            UI.showAuthError(data.message || 'Authentication failed');
        }
    });

    AppState.socket.on('state_change', (data) => {
        UI.updateCurrentState(data.current_state);
    });

    AppState.socket.on('score_update', (data) => {
        AppState.scores = data.scores;
        if (data.teams) {
            Object.entries(data.teams).forEach(([id, team]) => {
                AppState.teams[id] = team;
            });
        }
        UI.updateTeamList();
    });

    AppState.socket.on('buzzer_locked', (data) => {
        console.log('[Admin] buzzer_locked received:', data);
        AppState.buzzerLockedBy = data.locked_by_team_id;
        UI.updateBuzzerLocker(data.locked_by_team_name);
    });

    AppState.socket.on('buzzer_reset', () => {
        AppState.buzzerLockedBy = null;
        UI.updateBuzzerLocker(null);
    });

    AppState.socket.on('answer_received', (data) => {
        console.log('[Admin] answer_received:', data);
        UI.addAnswer(data.team_id, data.team_name, data.answer_text);
    });

    // Timeline submission handler
    AppState.socket.on('timeline_submission', (data) => {
        console.log('[Admin] Timeline submission received:', data);
        UI.updateTimelineSubmission(data);
    });

    // Picture guess handler
    AppState.socket.on('picture_guess_received', (data) => {
        console.log('[Admin] picture_guess_received:', data);
        UI.addPictureGuess(data.team_id, data.team_name, data.guess_text);
    });

    // Grading confirmation handlers - prevent double-grading
    AppState.socket.on('answer_graded', (data) => {
        console.log('[Admin] answer_graded:', data);
        UI.markAnswerGraded(data.team_id, data.correct, data.points_awarded);
    });

    AppState.socket.on('picture_guess_graded', (data) => {
        console.log('[Admin] picture_guess_graded:', data);
        UI.markPictureGuessGraded(data.team_id, data.correct, data.points_awarded);
    });

    AppState.socket.on('already_graded', (data) => {
        console.log('[Admin] already_graded:', data);
        // Show brief warning - team was already graded
        alert(data.message || 'Team already graded for this round');
    });

    // Timer sync handler
    AppState.socket.on('timer_sync', (data) => {
        if (AppState.timerInterval) {
            clearInterval(AppState.timerInterval);
            AppState.timerInterval = null;
        }

        AppState.timerRemaining = data.remaining_seconds;
        AppState.timerTotal = data.total_seconds;

        if (data.action === 'start' || data.action === 'resume') {
            AppState.timerRunning = true;
            AppState.timerPaused = false;
            UI.updateTimerDisplay(AppState.timerRemaining, AppState.timerTotal, 'RUNNING');

            AppState.timerInterval = setInterval(() => {
                AppState.timerRemaining--;
                if (AppState.timerRemaining <= 0) {
                    clearInterval(AppState.timerInterval);
                    AppState.timerInterval = null;
                    AppState.timerRunning = false;
                    UI.updateTimerDisplay(0, AppState.timerTotal, 'COMPLETE');
                } else {
                    UI.updateTimerDisplay(AppState.timerRemaining, AppState.timerTotal, 'RUNNING');
                }
            }, 1000);

        } else if (data.action === 'pause') {
            AppState.timerRunning = false;
            AppState.timerPaused = true;
            UI.updateTimerDisplay(AppState.timerRemaining, AppState.timerTotal, 'PAUSED');

        } else if (data.action === 'reset') {
            AppState.timerRunning = false;
            AppState.timerPaused = false;
            UI.updateTimerDisplay(AppState.timerRemaining, AppState.timerTotal, 'STOPPED');

        } else if (data.action === 'complete') {
            AppState.timerRunning = false;
            AppState.timerPaused = false;
            UI.updateTimerDisplay(0, AppState.timerTotal, 'COMPLETE');
        }
    });

    // Price guess handlers
    AppState.socket.on('price_guess_received', (data) => {
        UI.addPriceGuess(data.team_id, data.team_name, data.guess_amount);
    });

    AppState.socket.on('price_revealed', (data) => {
        UI.showPriceGuessResults(data.actual_price, data.team_guesses);
    });

    // Survival handlers
    AppState.socket.on('survival_vote_received', (data) => {
        console.log('[Admin] Survival vote received:', data);
        // Show player name with team in vote list
        const displayName = data.player_name ? `${data.player_name} (${data.team_name})` : data.team_name;
        UI.addSurvivalVote(displayName, data.vote);
    });

    AppState.socket.on('survival_round_complete', (data) => {
        console.log('[Admin] Survival round complete:', data);
        // Just log the results - no elimination tracking needed
    });

    // Pixel Perfect handlers
    AppState.socket.on('pixelperfect_locked', (data) => {
        AppState.pixelperfectLockedBy = data.locked_by_team_id;
        UI.updatePixelPerfectLocker(data.locked_by_team_name);
    });

    AppState.socket.on('pixelperfect_reset', () => {
        AppState.pixelperfectLockedBy = null;
        UI.updatePixelPerfectLocker(null);
    });

    // Round timer sync handler (global HUD timer)
    AppState.socket.on('round_timer_sync', (data) => {
        UI.updateRoundTimerDisplay(data.remaining_seconds, data.total_seconds, data.status);
    });
}

// ============================================================
// EVENT BINDINGS
// ============================================================

function initEventBindings() {
    // Auth form
    document.getElementById('auth-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const password = document.getElementById('admin-password').value;
        AdminActions.authenticate(password);
    });

    // State buttons
    document.querySelectorAll('.state-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            AdminActions.setState(btn.dataset.state);
        });
    });

    // Add points
    document.getElementById('add-points-btn').addEventListener('click', () => {
        AdminActions.addPoints();
    });

    // QR code toggle
    document.getElementById('toggle-qr-btn').addEventListener('click', () => {
        AdminActions.toggleQRCode();
    });

    // Buzzer controls
    document.getElementById('buzzer-correct-full').addEventListener('click', () => {
        AdminActions.judgeBuzzer(true, 60);  // Artist + Song = 60 pts
    });

    document.getElementById('buzzer-correct-song').addEventListener('click', () => {
        AdminActions.judgeBuzzer(true, 30);  // Song only = 30 pts
    });

    document.getElementById('buzzer-wrong').addEventListener('click', () => {
        AdminActions.judgeBuzzer(false, 0);
    });

    // Reveal answer
    document.getElementById('reveal-btn').addEventListener('click', () => {
        AdminActions.revealAnswer();
    });

    // Trivia - Send question
    document.getElementById('send-trivia-btn').addEventListener('click', () => {
        AdminActions.sendTriviaQuestion();
    });

    // Audio controls
    document.getElementById('play-audio-btn').addEventListener('click', () => {
        AdminActions.playAudio();
    });

    document.getElementById('stop-audio-btn').addEventListener('click', () => {
        AdminActions.stopAudio();
    });

    document.getElementById('reveal-audio-btn').addEventListener('click', () => {
        AdminActions.revealAudio();
    });

    // Timeline controls
    document.getElementById('send-timeline-btn').addEventListener('click', () => {
        AdminActions.sendTimelinePuzzle();
    });

    document.getElementById('complete-timeline-btn').addEventListener('click', () => {
        AdminActions.completeTimeline();
    });

    // Trivia preset selector
    document.getElementById('trivia-preset-select').addEventListener('change', (e) => {
        const index = e.target.value;
        if (index !== '' && AppState.triviaQuestions[index]) {
            const q = AppState.triviaQuestions[index];
            document.getElementById('trivia-question-input').value = q.question;
            document.getElementById('trivia-question-id').value = q.id;
            document.getElementById('correct-answer').value = q.answer;
            AppState.currentTriviaAnswer = q.answer;
        }
    });

    // Timeline preset selector
    document.getElementById('timeline-preset-select').addEventListener('change', (e) => {
        const index = e.target.value;
        if (index !== '' && AppState.timelinePuzzles[index]) {
            const p = AppState.timelinePuzzles[index];
            document.getElementById('timeline-items-input').value = p.events.join('\n');
            document.getElementById('timeline-puzzle-id').value = p.id;
        }
    });

    // Reset
    document.getElementById('reset-btn').addEventListener('click', () => {
        AdminActions.resetGame();
    });

    // Picture guess controls
    document.getElementById('send-picture-btn').addEventListener('click', () => {
        AdminActions.sendPicture();
    });

    document.getElementById('reveal-picture-btn').addEventListener('click', () => {
        AdminActions.revealPicture();
    });

    // Picture guess preset selector
    document.getElementById('pictureguess-preset-select').addEventListener('change', (e) => {
        const index = e.target.value;
        if (index !== '' && AppState.pictureGuesses[index]) {
            const p = AppState.pictureGuesses[index];
            document.getElementById('pictureguess-url-input').value = p.image_url;
            document.getElementById('pictureguess-hint-input').value = p.hint || '';
            document.getElementById('pictureguess-id').value = p.id;
            document.getElementById('pictureguess-correct-answer').value = p.answer;
            AppState.currentPictureGuessAnswer = p.answer;
        }
    });

    // Timer controls
    document.getElementById('timer-start-btn').addEventListener('click', () => {
        AdminActions.startTimer();
    });

    document.getElementById('timer-pause-btn').addEventListener('click', () => {
        AdminActions.pauseTimer();
    });

    document.getElementById('timer-resume-btn').addEventListener('click', () => {
        AdminActions.resumeTimer();
    });

    document.getElementById('timer-reset-btn').addEventListener('click', () => {
        AdminActions.resetTimer();
    });

    // Round Timer controls (global HUD timer)
    const roundTimerStartBtn = document.getElementById('round-timer-start-btn');
    if (roundTimerStartBtn) {
        roundTimerStartBtn.addEventListener('click', () => {
            AdminActions.startRoundTimer();
        });
    }

    const roundTimerPauseBtn = document.getElementById('round-timer-pause-btn');
    if (roundTimerPauseBtn) {
        roundTimerPauseBtn.addEventListener('click', () => {
            AdminActions.pauseRoundTimer();
        });
    }

    const roundTimerResumeBtn = document.getElementById('round-timer-resume-btn');
    if (roundTimerResumeBtn) {
        roundTimerResumeBtn.addEventListener('click', () => {
            AdminActions.resumeRoundTimer();
        });
    }

    const roundTimerStopBtn = document.getElementById('round-timer-stop-btn');
    if (roundTimerStopBtn) {
        roundTimerStopBtn.addEventListener('click', () => {
            AdminActions.stopRoundTimer();
        });
    }

    const roundTimerAdd30Btn = document.getElementById('round-timer-add30-btn');
    if (roundTimerAdd30Btn) {
        roundTimerAdd30Btn.addEventListener('click', () => {
            AdminActions.addRoundTimerTime(30);
        });
    }

    const roundTimerAdd60Btn = document.getElementById('round-timer-add60-btn');
    if (roundTimerAdd60Btn) {
        roundTimerAdd60Btn.addEventListener('click', () => {
            AdminActions.addRoundTimerTime(60);
        });
    }

    // Music controller
    document.getElementById('music-toggle-btn').addEventListener('click', () => {
        AdminActions.musicToggle();
    });

    document.getElementById('music-next-btn').addEventListener('click', () => {
        AdminActions.musicNext();
    });

    document.getElementById('music-prev-btn').addEventListener('click', () => {
        AdminActions.musicPrevious();
    });

    // Price guess controls
    document.getElementById('send-priceguess-btn').addEventListener('click', () => {
        AdminActions.sendProduct();
    });

    document.getElementById('reveal-priceguess-btn').addEventListener('click', () => {
        AdminActions.revealPrice();
    });

    // Price guess preset selector
    const priceguessPresetSelect = document.getElementById('priceguess-preset-select');
    if (priceguessPresetSelect) {
        priceguessPresetSelect.addEventListener('change', (e) => {
            const index = e.target.value;
            if (index !== '' && AppState.priceProducts[index]) {
                const p = AppState.priceProducts[index];
                document.getElementById('priceguess-url-input').value = p.image_url;
                document.getElementById('priceguess-hint-input').value = p.hint || '';
                document.getElementById('priceguess-id').value = p.id;
                document.getElementById('priceguess-actual-price').value = p.actual_price;
            }
        });
    }

    // Survival preset selector
    const survivalPresetSelect = document.getElementById('survival-preset-select');
    if (survivalPresetSelect) {
        survivalPresetSelect.addEventListener('change', (e) => {
            const index = e.target.value;
            if (index !== '' && AppState.survivalQuestions[index]) {
                const q = AppState.survivalQuestions[index];
                document.getElementById('survival-question-input').value = q.question;
                document.getElementById('survival-option-a').value = q.option_a;
                document.getElementById('survival-option-b').value = q.option_b;
            }
        });
    }

    // Survival controls
    const sendSurvivalBtn = document.getElementById('send-survival-btn');
    if (sendSurvivalBtn) {
        sendSurvivalBtn.addEventListener('click', () => {
            AdminActions.sendSurvivalQuestion();
        });
    }

    const survivalRevealBtn = document.getElementById('survival-reveal-btn');
    if (survivalRevealBtn) {
        survivalRevealBtn.addEventListener('click', () => {
            AdminActions.survivalReveal();
        });
    }

    const survivalResetBtn = document.getElementById('survival-reset-btn');
    if (survivalResetBtn) {
        survivalResetBtn.addEventListener('click', () => {
            AdminActions.survivalResetRound();
        });
    }


    // Pixel Perfect controls
    const startPixelperfectBtn = document.getElementById('start-pixelperfect-btn');
    if (startPixelperfectBtn) {
        startPixelperfectBtn.addEventListener('click', () => {
            AdminActions.startPixelPerfectRound();
        });
    }

    const pixelperfectCorrectBtn = document.getElementById('pixelperfect-correct-btn');
    if (pixelperfectCorrectBtn) {
        pixelperfectCorrectBtn.addEventListener('click', () => {
            AdminActions.judgePixelPerfect(true, 100);
        });
    }

    const pixelperfectWrongBtn = document.getElementById('pixelperfect-wrong-btn');
    if (pixelperfectWrongBtn) {
        pixelperfectWrongBtn.addEventListener('click', () => {
            AdminActions.judgePixelPerfect(false, 0);
        });
    }

    const revealPixelperfectBtn = document.getElementById('reveal-pixelperfect-btn');
    if (revealPixelperfectBtn) {
        revealPixelperfectBtn.addEventListener('click', () => {
            AdminActions.revealPixelPerfect();
        });
    }

    // Pixel Perfect preset selector
    const pixelperfectPresetSelect = document.getElementById('pixelperfect-preset-select');
    if (pixelperfectPresetSelect) {
        pixelperfectPresetSelect.addEventListener('change', (e) => {
            const index = e.target.value;
            if (index !== '' && AppState.pixelperfectImages[index]) {
                const img = AppState.pixelperfectImages[index];
                document.getElementById('pixelperfect-url-input').value = img.image_url;
                document.getElementById('pixelperfect-correct-answer').value = img.answer;
                document.getElementById('pixelperfect-round-id').value = img.id;
            }
        });
    }
}

// ============================================================
// CONTENT LOADING
// ============================================================

async function loadPresetContent() {
    try {
        const response = await fetch('/api/content');
        if (response.ok) {
            const data = await response.json();
            AppState.triviaQuestions = data.trivia_questions || [];
            AppState.timelinePuzzles = data.timeline_puzzles || [];
            AppState.audioTracks = data.audio_tracks || [];
            AppState.pictureGuesses = data.picture_guesses || [];
            AppState.survivalQuestions = data.survival_questions || [];
            AppState.pixelperfectImages = data.pixelperfect_images || [];
            AppState.priceProducts = data.price_products || [];

            UI.populateTriviaPresets();
            UI.populateTimelinePresets();
            UI.populateAudioTracks();
            UI.populatePictureGuessPresets();
            UI.populateSurvivalPresets();
            UI.populatePixelPerfectPresets();
            UI.populatePriceGuessPresets();

            console.log('[Admin] Loaded preset content:', {
                trivia: AppState.triviaQuestions.length,
                timeline: AppState.timelinePuzzles.length,
                audio: AppState.audioTracks.length,
                survival: AppState.survivalQuestions.length,
                pictureGuesses: AppState.pictureGuesses.length,
                pixelperfect: AppState.pixelperfectImages.length,
                priceProducts: AppState.priceProducts.length
            });
        }
    } catch (err) {
        console.error('[Admin] Failed to load preset content:', err);
    }
}

async function checkSpotifyStatus() {
    const statusText = document.getElementById('spotify-status-text');
    const loginBtn = document.getElementById('spotify-login-btn');

    // Check for URL parameters (success/error from OAuth callback)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('spotify_success')) {
        statusText.textContent = 'Connected! (refresh TV page)';
        statusText.style.color = 'var(--ice-glow)';
        loginBtn.classList.add('hidden');
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
    } else if (urlParams.has('spotify_error')) {
        statusText.textContent = 'Connection failed: ' + urlParams.get('spotify_error');
        statusText.style.color = 'var(--status-oops)';
        loginBtn.classList.remove('hidden');
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
    }

    try {
        const response = await fetch('/spotify/status');
        if (response.ok) {
            const data = await response.json();

            if (!data.configured) {
                statusText.textContent = 'Not configured (set SPOTIFY_CLIENT_ID/SECRET)';
                statusText.style.color = 'var(--gold-candle)';
                loginBtn.classList.add('hidden');
            } else if (data.connected) {
                statusText.textContent = 'Connected (Web Playback SDK ready)';
                statusText.style.color = 'var(--ice-glow)';
                loginBtn.classList.add('hidden');
            } else {
                statusText.textContent = 'Not connected';
                statusText.style.color = 'var(--gold-candle)';
                loginBtn.classList.remove('hidden');
            }
        }
    } catch (err) {
        console.error('[Admin] Failed to check Spotify status:', err);
        statusText.textContent = 'Status check failed';
        statusText.style.color = 'var(--status-oops)';
    }
}

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('[Admin] Initializing...');
    initSocket();
    initEventBindings();
    loadPresetContent();
    checkSpotifyStatus();
    initActivityTracking();
    console.log('[Admin] Ready');
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
            console.log('[Admin] Activity ping sent');
        }
    }

    // Track user interactions
    ['click', 'keypress', 'mousemove', 'touchstart'].forEach(evt => {
        document.addEventListener(evt, sendActivityPing);
    });
}

// Expose for debugging
window.AppState = AppState;
window.AdminActions = AdminActions;
