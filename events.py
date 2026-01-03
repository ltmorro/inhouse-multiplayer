"""
Socket.IO Event Handlers for Y2K Party Game.
Implements the event contract defined in events_spec.md.
"""

import logging
import re
from flask import request
from flask_socketio import emit, join_room, leave_room

logger = logging.getLogger(__name__)


def _strip_parenthetical(text: str) -> str:
    """Strip parenthetical values (like years) from a string."""
    return re.sub(r'\s*\([^)]*\)\s*$', '', text).strip()


def _sanitize_state_data_for_clients(state_data: dict, current_state: str) -> dict:
    """
    Sanitize state_data before sending to clients.
    For TIMELINE state, strips parenthetical values (years) from items
    so players can't see the answers.
    """
    if not state_data:
        return state_data

    # Make a shallow copy to avoid modifying the original
    sanitized = dict(state_data)

    # Strip years from timeline items
    if current_state == 'TIMELINE' and 'items' in sanitized:
        sanitized['items'] = [_strip_parenthetical(item) for item in sanitized['items']]

    return sanitized

# Global reference to game_manager and socketio, set by init_events()
game_manager = None
socketio = None


def init_events(sio, gm):
    """Initialize event handlers with socketio and game_manager instances."""
    global socketio, game_manager
    socketio = sio
    game_manager = gm


# =============================================================================
# CONNECTION & SESSION EVENTS
# =============================================================================

def on_connect():
    """
    Handle client connection.
    Implements the "Refresh Fix" - if session has existing team, sync state.
    """
    session_id = request.sid
    logger.info(f"Client connected: {session_id}")

    # Check if this session has an existing team
    session_data = game_manager.get_team_for_session(session_id)

    if session_data:
        team_id = session_data.get('team_id')
        player_id = session_data.get('player_id')

        if team_id and game_manager.get_team(team_id):
            # Reconnecting player - rejoin team room
            join_room(f'team:{team_id}')

            # Send sync_state with player info (sanitize state_data for clients)
            sync_data = game_manager.get_sync_state(team_id, player_id)
            sync_data['state_data'] = _sanitize_state_data_for_clients(
                sync_data.get('state_data', {}),
                sync_data.get('current_state', '')
            )
            emit('sync_state', sync_data)
            logger.info(f"Sent sync_state to reconnecting player: {player_id} on team: {team_id}")

            # Also send current scores
            emit('score_update', {
                'scores': game_manager.get_scores(),
                'teams': game_manager.get_teams_info()
            })


def on_disconnect():
    """
    Handle client disconnection.
    Per spec: Log it, but do NOT delete the team from the registry.
    """
    session_id = request.sid
    session_data = game_manager.get_team_for_session(session_id)

    team_name = 'Unknown'
    player_name = 'Unknown'
    if session_data:
        team_id = session_data.get('team_id')
        player_id = session_data.get('player_id')
        team = game_manager.get_team(team_id) if team_id else None
        if team:
            team_name = team['name']
            if player_id and 'players' in team:
                player_data = team['players'].get(player_id, {})
                player_name = player_data.get('name', 'Unknown')

    logger.info(f"Client disconnected: {session_id} (Team: {team_name}, Player: {player_name})")


def on_rejoin_session(data):
    """
    Handle session rejoin after page refresh.
    Client sends stored team_id and player_id from localStorage.

    Expected payload:
        { "team_id": "string", "player_id": "string" }

    Emits:
        rejoin_result to caller (success/failure)
        sync_state to caller (if successful)
    """
    session_id = request.sid
    team_id = data.get('team_id')
    player_id = data.get('player_id')

    logger.info(f"Rejoin attempt: team={team_id}, player={player_id}, session={session_id}")

    # Validate team exists
    team = game_manager.get_team(team_id)
    if not team:
        emit('rejoin_result', {
            'success': False,
            'message': 'Team not found'
        })
        return

    # Validate player exists on team
    if not player_id or 'players' not in team or player_id not in team['players']:
        emit('rejoin_result', {
            'success': False,
            'message': 'Player not found on team'
        })
        return

    # Reassociate session with this player
    game_manager.reassociate_session(session_id, team_id, player_id)

    # Join team room
    join_room(f'team:{team_id}')

    # Send success result
    emit('rejoin_result', {'success': True})

    # Send full sync state (sanitize state_data for clients)
    sync_data = game_manager.get_sync_state(team_id, player_id)
    sync_data['state_data'] = _sanitize_state_data_for_clients(
        sync_data.get('state_data', {}),
        sync_data.get('current_state', '')
    )
    emit('sync_state', sync_data)

    # Also send current scores
    emit('score_update', {
        'scores': game_manager.get_scores(),
        'teams': game_manager.get_teams_info()
    })

    player_name = team['players'][player_id].get('name', 'Unknown')
    logger.info(f"Player {player_name} rejoined team {team['name']} (session: {session_id})")


def on_request_tv_sync():
    """
    Handle TV sync request.
    TV emits this on connect to get the full game state including scores and teams.

    Emits:
        state_change to caller with current state and state_data
        score_update to caller with current scores and teams
    """
    session_id = request.sid
    logger.info(f"TV sync requested: {session_id}")

    # Sanitize state_data before sending to clients (e.g., strip years from timeline)
    current_state = game_manager.current_state.value
    client_state_data = _sanitize_state_data_for_clients(game_manager.state_data, current_state)

    # Send state change with current state and state_data
    emit('state_change', {
        'current_state': current_state,
        'state_data': client_state_data
    })

    # Send score update with all teams and scores
    emit('score_update', {
        'scores': game_manager.get_scores(),
        'teams': game_manager.get_teams_info()
    })


# =============================================================================
# TEAM REGISTRATION
# =============================================================================

def on_create_team(data):
    """
    Handle team creation (first player).

    Expected payload:
        { "team_name": "string (1-20 chars)", "player_name": "string (1-20 chars)" }

    Emits:
        creation_result to caller
        score_update to all clients (if successful)
    """
    team_name = data.get('team_name', '').strip()
    player_name = data.get('player_name', '').strip()
    session_id = request.sid

    result = game_manager.create_team(team_name, player_name, session_id)
    emit('creation_result', result)

    if result['success']:
        # Join team-specific room for real-time sync
        team_id = result['team_id']
        join_room(f'team:{team_id}')

        # Broadcast updated teams/scores to all clients
        socketio.emit('score_update', {
            'scores': game_manager.get_scores(),
            'teams': game_manager.get_teams_info()
        })

        logger.info(f"Player {player_name} created team {team_name}, joined room team:{team_id}")


def on_join_team(data):
    """
    Handle joining an existing team via join code.

    Expected payload:
        { "join_code": "string (4 chars)", "player_name": "string (1-20 chars)" }

    Emits:
        join_result to caller
        player_joined to team room (so teammates see the new player)
    """
    join_code = data.get('join_code', '').strip()
    player_name = data.get('player_name', '').strip()
    session_id = request.sid

    result = game_manager.join_team(join_code, player_name, session_id)
    emit('join_result', result)

    if result['success']:
        # Join team-specific room for real-time sync
        team_id = result['team_id']
        join_room(f'team:{team_id}')

        # Notify teammates that a new player joined
        socketio.emit('player_joined', {
            'player_id': result['player_id'],
            'player_name': player_name,
            'players': result['players']
        }, room=f'team:{team_id}')

        # Broadcast updated teams to all clients (so TV updates the roster)
        socketio.emit('score_update', {
            'scores': game_manager.get_scores(),
            'teams': game_manager.get_teams_info()
        })

        logger.info(f"Player {player_name} joined team via code {join_code}")


# =============================================================================
# ADMIN CONTROL EVENTS
# =============================================================================

def on_admin_auth(data):
    """
    Handle admin authentication.

    Expected payload:
        { "password": "string" }

    TODO: Implement proper password checking
    """
    password = data.get('password', '')
    # Simple password check - should be configurable
    success = password == "y2k2025"

    emit('admin_auth_result', {
        'success': success,
        'message': 'Access granted' if success else 'Access denied'
    })

    if success:
        join_room('admin')
        logger.info(f"Admin authenticated: {request.sid}")

        # Send current game state and teams to admin
        emit('state_change', {
            'current_state': game_manager.current_state.value
        })
        emit('score_update', {
            'scores': game_manager.get_scores(),
            'teams': game_manager.get_teams_info()
        })


def on_set_state(data):
    """
    Handle game state change from admin.

    Expected payload:
        { "new_state": "LOBBY | MACGYVER | ...", "state_data": {} }

    Emits:
        state_change to all clients
    """
    new_state = data.get('new_state')
    state_data = data.get('state_data', {})

    if game_manager.set_state(new_state, state_data):
        # Sanitize state_data before sending to clients (e.g., strip years from timeline)
        client_state_data = _sanitize_state_data_for_clients(state_data, new_state)
        socketio.emit('state_change', {
            'current_state': new_state,
            'state_data': client_state_data
        })
    else:
        emit('error', {
            'code': 'INVALID_STATE',
            'message': f'Invalid state: {new_state}'
        })


def on_add_points(data):
    """
    Handle manual point adjustment from admin.

    Expected payload:
        { "team_id": "string", "points": 50, "reason": "string (optional)" }

    Emits:
        score_update to all clients
    """
    team_id = data.get('team_id')
    points = data.get('points', 0)
    reason = data.get('reason', '')

    if game_manager.add_points(team_id, points, reason):
        socketio.emit('score_update', {
            'scores': game_manager.get_scores(),
            'teams': game_manager.get_teams_info()
        })
    else:
        emit('error', {
            'code': 'INVALID_TEAM',
            'message': f'Team not found: {team_id}'
        })


def on_reset_game(data):
    """
    Handle full game reset from admin.

    Expected payload:
        { "confirm": true, "preserve_teams": false }

    Emits:
        state_change to all clients
        score_update to all clients
    """
    if not data.get('confirm'):
        emit('error', {
            'code': 'UNAUTHORIZED',
            'message': 'Reset must be confirmed'
        })
        return

    preserve_teams = data.get('preserve_teams', False)
    game_manager.reset_game(preserve_teams)

    socketio.emit('state_change', {
        'current_state': 'LOBBY',
        'state_data': {}
    })

    socketio.emit('score_update', {
        'scores': game_manager.get_scores(),
        'teams': game_manager.get_teams_info()
    })


def on_kick_team(data):
    """
    Handle team removal from admin.

    Expected payload:
        { "team_id": "string" }

    Emits:
        team_kicked to team room (all players on team)
        score_update to all clients
    """
    team_id = data.get('team_id')

    if game_manager.kick_team(team_id):
        # Notify all players on the team via team room
        socketio.emit('team_kicked', {
            'message': 'TERMINATED BY ADMINISTRATOR'
        }, room=f'team:{team_id}')

        socketio.emit('score_update', {
            'scores': game_manager.get_scores(),
            'teams': game_manager.get_teams_info()
        })
    else:
        emit('error', {
            'code': 'INVALID_TEAM',
            'message': f'Team not found: {team_id}'
        })


# =============================================================================
# PROTOCOL 2: TRIVIA EVENTS
# =============================================================================

def on_submit_answer(data):
    """
    Handle trivia answer submission.

    Expected payload:
        { "team_id": "string", "question_id": "int", "answer_text": "string" }

    Emits:
        answer_received to admin room (with player info)
        submission_status to all clients
        answer_submitted to team room (notify teammates)
    """
    session_id = request.sid
    session_data = game_manager.get_team_for_session(session_id)

    # Get team_id from session or payload (fallback for compatibility)
    if session_data:
        team_id = session_data.get('team_id')
        player_id = session_data.get('player_id')
    else:
        team_id = data.get('team_id')
        player_id = None

    question_id = data.get('question_id')
    answer_text = data.get('answer_text', '')

    team = game_manager.get_team(team_id)
    if not team:
        emit('error', {
            'code': 'INVALID_TEAM',
            'message': 'Team not found'
        })
        return

    # Get player name
    player_name = ''
    if player_id and 'players' in team:
        player_data = team['players'].get(player_id, {})
        player_name = player_data.get('name', '')

    if game_manager.submit_answer(team_id, question_id, answer_text, player_id, player_name):
        # Notify admin with player info
        socketio.emit('answer_received', {
            'team_id': team_id,
            'team_name': team['name'],
            'player_id': player_id,
            'player_name': player_name,
            'answer_text': answer_text,
            'question_id': question_id
        }, room='admin')

        # Notify teammates that answer was submitted
        socketio.emit('answer_submitted', {
            'player_id': player_id,
            'player_name': player_name,
            'answer_text': answer_text
        }, room=f'team:{team_id}')

        # Broadcast submission count
        submitted, total = game_manager.get_submission_count()
        socketio.emit('submission_status', {
            'submitted_count': submitted,
            'total_teams': total
        })


def on_grade_answer(data):
    """
    Handle admin grading an answer.

    Expected payload:
        { "team_id": "string", "question_id": "int", "correct": true, "points": 50 }

    Emits:
        answer_result to the team room (all players see result)
        score_update to all clients (if points awarded)
    """
    team_id = data.get('team_id')
    correct = data.get('correct', False)
    points = data.get('points', 0)

    # Send result to all players on the team
    socketio.emit('answer_result', {
        'correct': correct,
        'points_awarded': points if correct else 0
    }, room=f'team:{team_id}')

    if correct and points:
        game_manager.add_points(team_id, points, 'Trivia correct answer')
        socketio.emit('score_update', {
            'scores': game_manager.get_scores(),
            'teams': game_manager.get_teams_info()
        })


def on_reveal_answer(data):
    """
    Handle admin revealing correct answer on TV.

    Expected payload:
        { "question_id": "int" }

    Emits:
        answer_revealed to all clients (includes all team answers for display)
    """
    question_id = data.get('question_id')
    correct_answer = data.get('correct_answer', '')

    # Collect all team answers before clearing
    team_answers = []
    for team_id, answer_data in game_manager.current_answers.items():
        team = game_manager.get_team(team_id)
        if team:
            team_answers.append({
                'team_id': team_id,
                'team_name': team['name'],
                'answer_text': answer_data.get('answer_text', ''),
                'player_name': answer_data.get('player_name', '')
            })

    socketio.emit('answer_revealed', {
        'question_id': question_id,
        'correct_answer': correct_answer,
        'team_answers': team_answers
    })

    # Clear stored answers for next question
    game_manager.clear_answers()


# =============================================================================
# PROTOCOL 7: PICTURE GUESS EVENTS
# =============================================================================

def on_submit_picture_guess(data):
    """
    Handle picture guess submission.
    Reuses the same submission pattern as trivia.

    Expected payload:
        { "team_id": "string", "picture_id": "int", "guess_text": "string" }

    Emits:
        picture_guess_received to admin room (with player info)
        submission_status to all clients
        picture_guess_submitted to team room (notify teammates)
    """
    session_id = request.sid
    session_data = game_manager.get_team_for_session(session_id)

    # Get team_id from session or payload (fallback for compatibility)
    if session_data:
        team_id = session_data.get('team_id')
        player_id = session_data.get('player_id')
    else:
        team_id = data.get('team_id')
        player_id = None

    picture_id = data.get('picture_id')
    guess_text = data.get('guess_text', '')

    team = game_manager.get_team(team_id)
    if not team:
        emit('error', {
            'code': 'INVALID_TEAM',
            'message': 'Team not found'
        })
        return

    # Get player name
    player_name = ''
    if player_id and 'players' in team:
        player_data = team['players'].get(player_id, {})
        player_name = player_data.get('name', '')

    # Reuse the trivia submission method
    if game_manager.submit_answer(team_id, picture_id, guess_text, player_id, player_name):
        # Notify admin with player info
        socketio.emit('picture_guess_received', {
            'team_id': team_id,
            'team_name': team['name'],
            'player_id': player_id,
            'player_name': player_name,
            'guess_text': guess_text,
            'picture_id': picture_id
        }, room='admin')

        # Notify teammates that guess was submitted
        socketio.emit('picture_guess_submitted', {
            'player_id': player_id,
            'player_name': player_name,
            'guess_text': guess_text
        }, room=f'team:{team_id}')

        # Broadcast submission count
        submitted, total = game_manager.get_submission_count()
        socketio.emit('submission_status', {
            'submitted_count': submitted,
            'total_teams': total
        })


def on_grade_picture_guess(data):
    """
    Handle admin grading a picture guess.

    Expected payload:
        { "team_id": "string", "picture_id": "int", "correct": true, "points": 50 }

    Emits:
        picture_guess_result to the team room (all players see result)
        score_update to all clients (if points awarded)
    """
    team_id = data.get('team_id')
    correct = data.get('correct', False)
    points = data.get('points', 0)

    # Send result to all players on the team
    socketio.emit('picture_guess_result', {
        'correct': correct,
        'points_awarded': points if correct else 0
    }, room=f'team:{team_id}')

    if correct and points:
        game_manager.add_points(team_id, points, 'Picture guess correct')
        socketio.emit('score_update', {
            'scores': game_manager.get_scores(),
            'teams': game_manager.get_teams_info()
        })


def on_reveal_picture(data):
    """
    Handle admin revealing correct answer for picture on TV.

    Expected payload:
        { "picture_id": "int", "correct_answer": "string" }

    Emits:
        picture_revealed to all clients (includes all team guesses for display)
    """
    picture_id = data.get('picture_id')
    correct_answer = data.get('correct_answer', '')

    # Collect all team guesses before clearing
    team_guesses = []
    for team_id, answer_data in game_manager.current_answers.items():
        team = game_manager.get_team(team_id)
        if team:
            team_guesses.append({
                'team_id': team_id,
                'team_name': team['name'],
                'guess_text': answer_data.get('answer_text', ''),
                'player_name': answer_data.get('player_name', '')
            })

    socketio.emit('picture_revealed', {
        'picture_id': picture_id,
        'correct_answer': correct_answer,
        'team_guesses': team_guesses
    })

    # Clear stored guesses for next picture
    game_manager.clear_answers()


def on_picture_guess_typing(data):
    """
    Handle real-time picture guess typing from a player.
    Syncs the partial guess to all teammates.

    Expected payload:
        { "text": "partial guess..." }

    Emits:
        picture_guess_sync to team room (excluding sender)
    """
    session_id = request.sid
    session_data = game_manager.get_team_for_session(session_id)

    if not session_data:
        return

    team_id = session_data.get('team_id')
    player_id = session_data.get('player_id')

    team = game_manager.get_team(team_id)
    if not team:
        return

    # Get player name
    player_name = ''
    if player_id and 'players' in team:
        player_data = team['players'].get(player_id, {})
        player_name = player_data.get('name', '')

    text = data.get('text', '')

    # Broadcast to team room, excluding the sender
    socketio.emit('picture_guess_sync', {
        'text': text,
        'from_player_id': player_id,
        'from_player_name': player_name
    }, room=f'team:{team_id}', skip_sid=session_id)


def on_show_picture(data):
    """
    Handle admin sending a picture to display on TV.

    Expected payload:
        { "picture_id": "int", "image_url": "string", "hint": "string" }

    Emits:
        show_picture to all clients (for TV display)
    """
    picture_id = data.get('picture_id')
    image_url = data.get('image_url')
    hint = data.get('hint', '')

    socketio.emit('show_picture', {
        'picture_id': picture_id,
        'image_url': image_url,
        'hint': hint
    })


# =============================================================================
# PROTOCOL 4: BUZZER EVENTS
# =============================================================================

def on_press_buzzer(data):
    """
    Handle buzzer press.

    Expected payload:
        { "team_id": "string", "timestamp": 1703980800000 }

    Emits:
        buzzer_locked to all clients (if this press won) with player info
        pause_audio to all clients (auto-pause when buzzed)
    """
    session_id = request.sid
    session_data = game_manager.get_team_for_session(session_id)

    # Get team_id from session or payload
    if session_data:
        team_id = session_data.get('team_id')
        player_id = session_data.get('player_id')
    else:
        team_id = data.get('team_id')
        player_id = None

    team = game_manager.get_team(team_id)
    if not team:
        return

    # Get player name
    player_name = ''
    if player_id and 'players' in team:
        player_data = team['players'].get(player_id, {})
        player_name = player_data.get('name', '')

    locked_by = game_manager.press_buzzer(team_id, player_id, player_name)

    if locked_by:
        socketio.emit('buzzer_locked', {
            'locked_by_team_id': locked_by['team_id'],
            'locked_by_team_name': locked_by['team_name'],
            'locked_by_player_id': locked_by['player_id'],
            'locked_by_player_name': locked_by['player_name']
        })
        # Auto-pause audio when buzzer is locked
        socketio.emit('pause_audio', {})


def on_judge_buzzer(data):
    """
    Handle admin judging buzzer answer.

    Expected payload:
        { "team_id": "string", "correct": true, "points": 75 }

    Emits:
        buzzer_reset to all clients (with player info)
        score_update to all clients (if points awarded)
        resume_audio to all clients (if answer was incorrect)
        buzzer_lockout to the team room (if answer was incorrect, with freeze duration)
    """
    team_id = data.get('team_id')
    correct = data.get('correct', False)
    points = data.get('points', 0)

    previous = game_manager.reset_buzzer()

    if correct and points:
        game_manager.add_points(team_id, points, 'Buzzer correct answer')

    # If incorrect, apply a 10-second freeze penalty to the team
    freeze_seconds = 0
    if not correct and team_id:
        freeze_seconds = 10
        game_manager.freeze_team_buzzer(team_id, freeze_seconds)

        # Notify the team they're frozen
        socketio.emit('buzzer_lockout', {
            'freeze_seconds': freeze_seconds,
            'message': f'Frozen for {freeze_seconds} seconds'
        }, room=f'team:{team_id}')

    # previous is now a dict with team_id, team_name, player_id, player_name
    socketio.emit('buzzer_reset', {
        'previous_team_id': previous.get('team_id') if previous else None,
        'previous_team_name': previous.get('team_name') if previous else None,
        'previous_player_id': previous.get('player_id') if previous else None,
        'previous_player_name': previous.get('player_name') if previous else None,
        'result': 'correct' if correct else 'incorrect',
        'freeze_seconds': freeze_seconds
    })

    socketio.emit('score_update', {
        'scores': game_manager.get_scores(),
        'teams': game_manager.get_teams_info()
    })

    # Auto-resume audio if answer was incorrect
    if not correct:
        socketio.emit('resume_audio', {})


# =============================================================================
# PROTOCOL 5: TIMELINE EVENTS
# =============================================================================

def on_submit_timeline(data):
    """
    Handle timeline puzzle submission.

    Expected payload:
        { "team_id": "string", "puzzle_id": "int", "order": [2, 0, 3, 1] }

    Emits:
        timeline_result to the team room (all players see result)
        timeline_status to all clients
    """
    session_id = request.sid
    session_data = game_manager.get_team_for_session(session_id)

    # Get team_id from session or payload
    if session_data:
        team_id = session_data.get('team_id')
        player_id = session_data.get('player_id')
    else:
        team_id = data.get('team_id')
        player_id = None

    puzzle_id = data.get('puzzle_id', 0)
    submitted_order = data.get('order', [])

    team = game_manager.get_team(team_id)
    if not team:
        emit('error', {
            'code': 'INVALID_TEAM',
            'message': 'Team not found'
        })
        return

    # Get player name for attribution
    player_name = ''
    if player_id and 'players' in team:
        player_data = team['players'].get(player_id, {})
        player_name = player_data.get('name', '')

    result = game_manager.submit_timeline(team_id, puzzle_id, submitted_order,
                                           player_id, player_name)

    # Add player info to result
    result['player_id'] = player_id
    result['player_name'] = player_name

    # Send result to all players on the team
    socketio.emit('timeline_result', result, room=f'team:{team_id}')

    # Notify admin of the submission for scoring
    socketio.emit('timeline_submission', {
        'team_id': team_id,
        'team_name': team['name'],
        'player_id': player_id,
        'player_name': player_name,
        'order': submitted_order,
        'status': 'winner' if result.get('correct') else 'failed'
    }, room='admin')

    # Broadcast status update to all
    socketio.emit('timeline_status', {
        'team_statuses': game_manager.get_timeline_statuses()
    })

    # If this was a winner, also broadcast score update
    if result.get('correct'):
        socketio.emit('score_update', {
            'scores': game_manager.get_scores(),
            'teams': game_manager.get_teams_info()
        })


def on_complete_timeline(data):
    """
    Admin-triggered timeline completion / reveal.

    Expected payload:
        { "correct_order": [0, 1, 2, 3], "correct_labels": ["A", "B", "C", "D"] }

    Emits:
        timeline_complete to all clients (includes all team submissions for display)
    """
    correct_order = data.get('correct_order', [])
    correct_labels = data.get('correct_labels', [])

    winner_team_id = game_manager.get_timeline_winner()

    # Get all team submissions for display on TV
    team_submissions = game_manager.get_timeline_submissions()

    # Get the shuffled items that were displayed to players
    # (needed to correctly map submission indices to labels)
    shuffled_items = game_manager.state_data.get('items', [])

    socketio.emit('timeline_complete', {
        'winner_team_id': winner_team_id,
        'correct_order': correct_order,
        'correct_labels': correct_labels,
        'shuffled_items': shuffled_items,
        'team_submissions': team_submissions
    })


# =============================================================================
# PROTOCOL 4: AUDIO/SPOTIFY EVENTS
# =============================================================================

def on_play_audio(data):
    """
    Admin-triggered audio playback on TV.

    Expected payload:
        { "audio_url": "/static/audio/track.mp3", "spotify_uri": "spotify:track:xxx", "start_ms": 0, "duration_ms": 30000 }

    Emits:
        buzzer_reset to all clients (clear previous answer state)
        play_audio to all clients (TV will handle playback)
    """
    # Reset buzzer state when new audio starts (clears previous answer from player screens)
    # Note: We reset the state but emit buzzer_reset AFTER play_audio to avoid race conditions
    game_manager.reset_buzzer()

    audio_url = data.get('audio_url', '')
    spotify_uri = data.get('spotify_uri', '')
    start_ms = data.get('start_ms', 0)
    duration_ms = data.get('duration_ms', 30000)

    socketio.emit('play_audio', {
        'audio_url': audio_url,
        'spotify_uri': spotify_uri,
        'start_ms': start_ms,
        'duration_ms': duration_ms
    })

    # Emit buzzer_reset after play_audio to avoid any race conditions
    socketio.emit('buzzer_reset', {
        'previous_team_id': None,
        'previous_team_name': None,
        'previous_player_id': None,
        'previous_player_name': None,
        'result': 'new_audio'
    })


def on_stop_audio(data):
    """
    Admin-triggered audio stop on TV.

    Emits:
        stop_audio to all clients
    """
    socketio.emit('stop_audio', {})


def on_reveal_audio(data):
    """
    Admin-triggered audio answer reveal on TV.

    Expected payload:
        { "track_title": "string", "artist": "string" }

    Emits:
        reveal_audio to all clients
    """
    socketio.emit('reveal_audio', {
        'track_title': data.get('track_title', ''),
        'artist': data.get('artist', '')
    })


# =============================================================================
# MUSIC CONTROLLER EVENTS (Admin controls TV playback)
# =============================================================================

def on_music_toggle(data):
    """
    Admin-triggered play/pause toggle on TV.

    Emits:
        music_toggle to all clients (TV will toggle playback)
    """
    socketio.emit('music_toggle', {})
    logger.info("Music toggle requested")


def on_music_next(data):
    """
    Admin-triggered skip to next track on TV.

    Emits:
        music_next to all clients (TV will skip to next)
    """
    socketio.emit('music_next', {})
    logger.info("Music next requested")


def on_music_previous(data):
    """
    Admin-triggered skip to previous track on TV.

    Emits:
        music_previous to all clients (TV will skip to previous)
    """
    socketio.emit('music_previous', {})
    logger.info("Music previous requested")


# =============================================================================
# PROTOCOL 6: MINESWEEPER EVENTS
# =============================================================================

def on_toggle_elimination(data):
    """
    Handle admin toggling team elimination.

    Expected payload:
        { "team_id": "string", "eliminated": true }

    Emits:
        elimination_update to all clients
        eliminated to the team room (all players on team)
    """
    team_id = data.get('team_id')
    eliminated = data.get('eliminated', True)

    team = game_manager.get_team(team_id)
    if not team:
        emit('error', {
            'code': 'INVALID_TEAM',
            'message': 'Team not found'
        })
        return

    if game_manager.toggle_elimination(team_id, eliminated):
        # Broadcast to all
        socketio.emit('elimination_update', {
            'team_id': team_id,
            'team_name': team['name'],
            'eliminated': eliminated,
            'remaining_teams': game_manager.get_remaining_teams()
        })

        # Notify all players on the team
        if eliminated:
            socketio.emit('eliminated', {
                'message': 'SYSTEM DELETED'
            }, room=f'team:{team_id}')


# =============================================================================
# QR CODE VISIBILITY
# =============================================================================

def on_toggle_qr_code(data):
    """
    Handle admin toggling QR code visibility on TV.

    Expected payload:
        { "visible": true }

    Emits:
        qr_visibility to all clients
    """
    visible = data.get('visible', False)

    socketio.emit('qr_visibility', {
        'visible': visible
    })

    logger.info(f"QR code visibility set to: {visible}")


# =============================================================================
# TIMER EVENTS
# =============================================================================

def on_timer_control(data):
    """
    Handle timer control from admin (start, pause, resume, reset).

    Expected payload:
        { "action": "start|pause|resume|reset", "duration_seconds": 180, "message": "string" }

    Emits:
        timer_sync to all clients
    """
    action = data.get('action')
    duration_seconds = data.get('duration_seconds', 180)
    message = data.get('message', '')

    if action == 'start':
        game_manager.start_timer(duration_seconds, message)
        socketio.emit('timer_sync', {
            'action': 'start',
            'remaining_seconds': duration_seconds,
            'total_seconds': duration_seconds,
            'message': message
        })

    elif action == 'pause':
        remaining = game_manager.pause_timer()
        socketio.emit('timer_sync', {
            'action': 'pause',
            'remaining_seconds': remaining,
            'total_seconds': game_manager.get_timer_total()
        })

    elif action == 'resume':
        remaining = game_manager.resume_timer()
        socketio.emit('timer_sync', {
            'action': 'resume',
            'remaining_seconds': remaining,
            'total_seconds': game_manager.get_timer_total()
        })

    elif action == 'reset':
        game_manager.reset_timer(duration_seconds)
        socketio.emit('timer_sync', {
            'action': 'reset',
            'remaining_seconds': duration_seconds,
            'total_seconds': duration_seconds
        })


# =============================================================================
# REAL-TIME TEAM SYNC EVENTS
# =============================================================================

def on_timeline_update(data):
    """
    Handle real-time timeline order update from a player.
    Syncs the timeline order to all teammates.

    Expected payload:
        { "order": [2, 0, 3, 1] }

    Emits:
        timeline_sync to team room (excluding sender)
    """
    session_id = request.sid
    session_data = game_manager.get_team_for_session(session_id)

    if not session_data:
        return

    team_id = session_data.get('team_id')
    player_id = session_data.get('player_id')

    team = game_manager.get_team(team_id)
    if not team:
        return

    # Get player name
    player_name = ''
    if player_id and 'players' in team:
        player_data = team['players'].get(player_id, {})
        player_name = player_data.get('name', '')

    order = data.get('order', [])

    # Broadcast to team room, excluding the sender
    socketio.emit('timeline_sync', {
        'order': order,
        'from_player_id': player_id,
        'from_player_name': player_name
    }, room=f'team:{team_id}', skip_sid=session_id)


def on_answer_typing(data):
    """
    Handle real-time answer typing from a player.
    Syncs the partial answer to all teammates.

    Expected payload:
        { "text": "partial answer..." }

    Emits:
        answer_sync to team room (excluding sender)
    """
    session_id = request.sid
    session_data = game_manager.get_team_for_session(session_id)

    if not session_data:
        return

    team_id = session_data.get('team_id')
    player_id = session_data.get('player_id')

    team = game_manager.get_team(team_id)
    if not team:
        return

    # Get player name
    player_name = ''
    if player_id and 'players' in team:
        player_data = team['players'].get(player_id, {})
        player_name = player_data.get('name', '')

    text = data.get('text', '')

    # Broadcast to team room, excluding the sender
    socketio.emit('answer_sync', {
        'text': text,
        'from_player_id': player_id,
        'from_player_name': player_name
    }, room=f'team:{team_id}', skip_sid=session_id)


# =============================================================================
# TV DISPLAY ENHANCEMENT EVENTS
# =============================================================================

# Per-player reaction throttle tracking
_reaction_throttle = {}

# Per-player chat message throttle tracking
_chat_throttle = {}


def on_select_avatar(data):
    """
    Handle team avatar selection.

    Expected payload:
        { "team_id": "string", "avatar_id": "string" }

    Emits:
        avatar_updated to all clients (for TV display)
    """
    team_id = data.get('team_id')
    avatar_id = data.get('avatar_id')

    team = game_manager.get_team(team_id)
    if not team:
        return

    # Store avatar on the team
    game_manager.set_team_avatar(team_id, avatar_id)

    # Broadcast to all clients
    socketio.emit('avatar_updated', {
        'team_id': team_id,
        'team_name': team['name'],
        'avatar_id': avatar_id
    })


def on_send_reaction(data):
    """
    Handle player sending an emoji reaction.

    Expected payload:
        { "team_id": "string", "player_id": "string", "player_name": "string", "reaction": "emoji" }

    Emits:
        reaction to all clients (for TV display)
    """
    import time

    player_id = data.get('player_id')
    player_name = data.get('player_name', '')
    reaction = data.get('reaction', '')
    team_id = data.get('team_id')

    if not player_id or not reaction:
        return

    # Throttle: 2 seconds per player
    now = time.time()
    last_time = _reaction_throttle.get(player_id, 0)

    if now - last_time < 2.0:
        # Throttled
        return

    _reaction_throttle[player_id] = now

    # Get team name and color for display
    team_name = ''
    team_color = 1
    team = game_manager.get_team(team_id)
    if team:
        team_name = team.get('name', '')
        team_color = team.get('color', 1)

    # Broadcast to all clients (TV will display)
    socketio.emit('reaction', {
        'player_id': player_id,
        'player_name': player_name,
        'team_name': team_name,
        'team_color': team_color,
        'reaction': reaction
    })


def on_send_chat_message(data):
    """
    Handle player sending a chat message.

    Expected payload:
        { "team_id": "string", "player_id": "string", "player_name": "string", "message": "string" }

    Emits:
        chat_message to all clients (for TV display)
    """
    import time

    player_id = data.get('player_id')
    player_name = data.get('player_name', '')
    message = data.get('message', '').strip()
    team_id = data.get('team_id')

    if not player_id or not message:
        return

    # Limit message length to 100 characters
    message = message[:100]

    # Throttle: 3 seconds per player
    now = time.time()
    last_time = _chat_throttle.get(player_id, 0)

    if now - last_time < 3.0:
        # Throttled
        return

    _chat_throttle[player_id] = now

    # Get team name and color for display
    team_name = ''
    team_color = 1
    team = game_manager.get_team(team_id)
    if team:
        team_name = team.get('name', '')
        team_color = team.get('color', 1)

    # Broadcast to all clients (TV will display)
    socketio.emit('chat_message', {
        'player_id': player_id,
        'player_name': player_name,
        'team_name': team_name,
        'team_color': team_color,
        'message': message
    })


# =============================================================================
# HELPER: Register all events with socketio
# =============================================================================

def register_events(sio, gm):
    """Register all Socket.IO event handlers."""
    init_events(sio, gm)

    # Connection events
    sio.on_event('connect', on_connect)
    sio.on_event('disconnect', on_disconnect)
    sio.on_event('rejoin_session', on_rejoin_session)
    sio.on_event('request_tv_sync', on_request_tv_sync)

    # Team registration (new multi-player system)
    sio.on_event('create_team', on_create_team)
    sio.on_event('join_team', on_join_team)

    # Admin
    sio.on_event('admin_auth', on_admin_auth)
    sio.on_event('set_state', on_set_state)
    sio.on_event('add_points', on_add_points)
    sio.on_event('reset_game', on_reset_game)
    sio.on_event('kick_team', on_kick_team)

    # Trivia
    sio.on_event('submit_answer', on_submit_answer)
    sio.on_event('grade_answer', on_grade_answer)
    sio.on_event('reveal_answer', on_reveal_answer)

    # Buzzer
    sio.on_event('press_buzzer', on_press_buzzer)
    sio.on_event('judge_buzzer', on_judge_buzzer)

    # Audio (Buzzer mode)
    sio.on_event('play_audio', on_play_audio)
    sio.on_event('stop_audio', on_stop_audio)
    sio.on_event('reveal_audio', on_reveal_audio)

    # Music Controller (Admin controls TV playback)
    sio.on_event('music_toggle', on_music_toggle)
    sio.on_event('music_next', on_music_next)
    sio.on_event('music_previous', on_music_previous)

    # Timeline
    sio.on_event('submit_timeline', on_submit_timeline)
    sio.on_event('complete_timeline', on_complete_timeline)

    # Minesweeper
    sio.on_event('toggle_elimination', on_toggle_elimination)

    # Timer
    sio.on_event('timer_control', on_timer_control)

    # Real-time team sync
    sio.on_event('timeline_update', on_timeline_update)
    sio.on_event('answer_typing', on_answer_typing)

    # TV Display Enhancements
    sio.on_event('select_avatar', on_select_avatar)
    sio.on_event('send_reaction', on_send_reaction)
    sio.on_event('send_chat_message', on_send_chat_message)

    # Picture Guess
    sio.on_event('submit_picture_guess', on_submit_picture_guess)
    sio.on_event('grade_picture_guess', on_grade_picture_guess)
    sio.on_event('reveal_picture', on_reveal_picture)
    sio.on_event('picture_guess_typing', on_picture_guess_typing)
    sio.on_event('show_picture', on_show_picture)

    # QR Code Visibility
    sio.on_event('toggle_qr_code', on_toggle_qr_code)

    logger.info("Socket.IO events registered")