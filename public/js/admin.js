/**
 * ADMIN.JS - Admin Dashboard Controller
 * Placeholder implementation - full functionality in WP5
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
    qrVisible: false
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

    updateTeamList() {
        const list = document.getElementById('team-list');
        const select = document.getElementById('point-team');
        const teams = Object.entries(AppState.teams);

        if (teams.length === 0) {
            list.innerHTML = '<li style="color: var(--terminal-green-dim);">No teams connected</li>';
            select.innerHTML = '<option value="">-- No teams --</option>';
            return;
        }

        list.innerHTML = teams.map(([id, team]) => {
            const score = AppState.scores[id] || 0;
            return `<li style="padding: 0.5rem; border-bottom: 1px solid var(--terminal-green-dim);">
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

        // Show/hide section-specific controls
        document.getElementById('buzzer-section').style.display = state === 'BUZZER' ? 'block' : 'none';
        document.getElementById('trivia-section').style.display = state === 'TRIVIA' ? 'block' : 'none';
        document.getElementById('timeline-section').style.display = state === 'TIMELINE' ? 'block' : 'none';
        document.getElementById('timer-section').style.display = state === 'TIMER' ? 'block' : 'none';
        document.getElementById('pictureguess-section').style.display = state === 'PICTUREGUESS' ? 'block' : 'none';
    },

    updateTimerDisplay(remaining, total, status) {
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        document.getElementById('timer-remaining').textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        document.getElementById('timer-status').textContent = status;
    },

    updateBuzzerLocker(teamName) {
        document.getElementById('buzzer-locker').textContent = teamName || '---';
    },

    addAnswer(teamId, teamName, answer) {
        const list = document.getElementById('answer-list');
        const existingId = `answer-${teamId}`;
        let li = document.getElementById(existingId);

        if (!li) {
            li = document.createElement('li');
            li.id = existingId;
            list.appendChild(li);
        }

        li.style.cssText = 'padding: 0.5rem; border-bottom: 1px solid var(--terminal-green-dim);';
        li.innerHTML = `
            <strong>${teamName}:</strong> ${answer}
            <button class="terminal-btn" style="padding: 2px 8px; font-size: 0.7rem; margin-left: 10px; background: #004400;"
                onclick="AdminActions.gradeAnswer('${teamId}', true)">CORRECT</button>
            <button class="terminal-btn" style="padding: 2px 8px; font-size: 0.7rem; margin-left: 5px; background: #440000;"
                onclick="AdminActions.gradeAnswer('${teamId}', false)">WRONG</button>
        `;
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
            list.innerHTML = '<li style="color: var(--terminal-green-dim);">No submissions yet</li>';
            return;
        }

        list.innerHTML = submissions.map(sub => {
            const statusColor = sub.status === 'winner' ? '#004400' : '#440000';
            const statusText = sub.status === 'winner' ? 'CORRECT' : 'INCORRECT';
            const playerInfo = sub.player_name ? ` (${sub.player_name})` : '';
            return `<li style="padding: 0.5rem; border-bottom: 1px solid var(--terminal-green-dim); background: ${statusColor};">
                <strong>${sub.team_name}</strong>${playerInfo}: ${statusText}
                <br><small style="color: var(--terminal-green-dim);">Order: [${sub.order.join(', ')}]</small>
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
        if (!list) return;

        const existingId = `pictureguess-${teamId}`;
        let li = document.getElementById(existingId);

        if (!li) {
            li = document.createElement('li');
            li.id = existingId;
            list.appendChild(li);
        }

        li.style.cssText = 'padding: 0.5rem; border-bottom: 1px solid var(--terminal-green-dim);';
        li.innerHTML = `
            <strong>${teamName}:</strong> ${guessText}
            <button class="terminal-btn" style="padding: 2px 8px; font-size: 0.7rem; margin-left: 10px; background: #004400;"
                onclick="AdminActions.gradePictureGuess('${teamId}', true)">CORRECT</button>
            <button class="terminal-btn" style="padding: 2px 8px; font-size: 0.7rem; margin-left: 5px; background: #440000;"
                onclick="AdminActions.gradePictureGuess('${teamId}', false)">WRONG</button>
        `;
    },

    clearPictureGuessList() {
        const list = document.getElementById('pictureguess-list');
        if (list) list.innerHTML = '';
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
            status.style.color = 'var(--terminal-green)';
        } else {
            btn.textContent = 'SHOW QR CODE';
            status.textContent = 'QR hidden';
            status.style.color = 'var(--terminal-green-dim)';
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
    }
};

// ============================================================
// SOCKET HANDLERS
// ============================================================

function initSocket() {
    AppState.socket = io();

    AppState.socket.on('connect', () => {
        console.log('[Admin] Connected to server');
        AppState.connected = true;
    });

    AppState.socket.on('disconnect', () => {
        console.log('[Admin] Disconnected');
        AppState.connected = false;
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
        AppState.buzzerLockedBy = data.locked_by_team_id;
        UI.updateBuzzerLocker(data.locked_by_team_name);
    });

    AppState.socket.on('buzzer_reset', () => {
        AppState.buzzerLockedBy = null;
        UI.updateBuzzerLocker(null);
    });

    AppState.socket.on('answer_received', (data) => {
        UI.addAnswer(data.team_id, data.team_name, data.answer_text);
    });

    // Timeline submission handler
    AppState.socket.on('timeline_submission', (data) => {
        UI.updateTimelineSubmission(data);
    });

    // Picture guess handler
    AppState.socket.on('picture_guess_received', (data) => {
        UI.addPictureGuess(data.team_id, data.team_name, data.guess_text);
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

            UI.populateTriviaPresets();
            UI.populateTimelinePresets();
            UI.populateAudioTracks();
            UI.populatePictureGuessPresets();

            console.log('[Admin] Loaded preset content:', {
                trivia: AppState.triviaQuestions.length,
                timeline: AppState.timelinePuzzles.length,
                audio: AppState.audioTracks.length,
                pictureGuesses: AppState.pictureGuesses.length
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
        statusText.style.color = 'var(--terminal-green)';
        loginBtn.classList.add('hidden');
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
    } else if (urlParams.has('spotify_error')) {
        statusText.textContent = 'Connection failed: ' + urlParams.get('spotify_error');
        statusText.style.color = 'var(--terminal-red)';
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
                statusText.style.color = 'var(--terminal-amber)';
                loginBtn.classList.add('hidden');
            } else if (data.connected) {
                statusText.textContent = 'Connected (Web Playback SDK ready)';
                statusText.style.color = 'var(--terminal-green)';
                loginBtn.classList.add('hidden');
            } else {
                statusText.textContent = 'Not connected';
                statusText.style.color = 'var(--terminal-amber)';
                loginBtn.classList.remove('hidden');
            }
        }
    } catch (err) {
        console.error('[Admin] Failed to check Spotify status:', err);
        statusText.textContent = 'Status check failed';
        statusText.style.color = 'var(--terminal-red)';
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
    console.log('[Admin] Ready');
});

// Expose for debugging
window.AppState = AppState;
window.AdminActions = AdminActions;
