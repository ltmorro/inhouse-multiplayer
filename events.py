"""
Socket.IO Event Handlers for Y2K Party Game (Refactored).
Delegates game events to EventRouter and handles platform events via SessionManager.
"""

import logging
from flask import request
from flask_socketio import emit, join_room, leave_room

logger = logging.getLogger(__name__)

# Global references
game_registry = None
event_router = None
session_manager = None
socketio = None

def register_events(sio, sm, er, gr):
    """Register all Socket.IO event handlers."""
    global socketio, session_manager, event_router, game_registry
    socketio = sio
    session_manager = sm
    event_router = er
    game_registry = gr
    
    # Platform events
    sio.on_event('connect', on_connect)
    sio.on_event('disconnect', on_disconnect)
    sio.on_event('rejoin_session', on_rejoin_session)
    sio.on_event('request_tv_sync', on_request_tv_sync)
    sio.on_event('create_team', on_create_team)
    sio.on_event('join_team', on_join_team)
    
    # Admin Platform events
    sio.on_event('admin_auth', on_admin_auth)
    sio.on_event('set_state', on_set_state)
    sio.on_event('add_points', on_add_points)
    sio.on_event('reset_game', on_reset_game)
    sio.on_event('kick_team', on_kick_team)
    
    # TV Display events
    sio.on_event('toggle_qr_code', on_toggle_qr_code)
    sio.on_event('select_avatar', on_select_avatar)
    sio.on_event('send_reaction', on_send_reaction)
    sio.on_event('send_chat_message', on_send_chat_message)
    
    # Dynamic Game Event Registration
    for event_name in game_registry.get_all_events():
        sio.on_event(event_name, make_handler(event_name))
        
    logger.info("Socket.IO events registered (New Architecture)")

def make_handler(event_name):
    def handler(data=None):
        if data is None: data = {}
        event_router.handle_event(event_name, data, request.sid)
    return handler

# =============================================================================
# PLATFORM HANDLERS
# =============================================================================

def on_connect():
    session_id = request.sid
    logger.info(f"Client connected: {session_id}")
    
    session_data = session_manager.get_team_for_session(session_id)
    if session_data:
        team_id = session_data.get('team_id')
        player_id = session_data.get('player_id')
        
        if team_id and session_manager.get_team(team_id):
            join_room(f'team:{team_id}')
            
            # Sync state
            sync_data = session_manager.get_sync_state(team_id, player_id)
            
            # Add current game state data (sanitized)
            current_state = session_manager.current_state
            game = game_registry.get_game(current_state)
            if game:
                sync_data['state_data'] = game.get_sanitized_state_data()
                sync_data['current_state'] = current_state
            
            emit('sync_state', sync_data)
            emit('score_update', {
                'scores': session_manager.get_scores(),
                'teams': session_manager.get_teams_info()
            })

def on_disconnect():
    session_id = request.sid
    # Just log it
    logger.info(f"Client disconnected: {session_id}")

def on_rejoin_session(data):
    session_id = request.sid
    team_id = data.get('team_id')
    player_id = data.get('player_id')
    
    if session_manager.reassociate_session(session_id, team_id, player_id):
        join_room(f'team:{team_id}')
        emit('rejoin_result', {'success': True})
        
        # Sync
        sync_data = session_manager.get_sync_state(team_id, player_id)
        current_state = session_manager.current_state
        game = game_registry.get_game(current_state)
        if game:
            sync_data['state_data'] = game.get_sanitized_state_data()
            sync_data['current_state'] = current_state
            
        emit('sync_state', sync_data)
        emit('score_update', {
            'scores': session_manager.get_scores(),
            'teams': session_manager.get_teams_info()
        })
    else:
        emit('rejoin_result', {'success': False, 'message': 'Invalid session/team'})

def on_request_tv_sync():
    current_state = session_manager.current_state
    game = game_registry.get_game(current_state)
    state_data = {}
    if game:
        state_data = game.get_sanitized_state_data()
    else:
        state_data = session_manager.state_data
        
    emit('state_change', {
        'current_state': current_state,
        'state_data': state_data
    })
    emit('score_update', {
        'scores': session_manager.get_scores(),
        'teams': session_manager.get_teams_info()
    })

def on_create_team(data):
    result = session_manager.create_team(data.get('team_name', ''), data.get('player_name', ''), request.sid)
    emit('creation_result', result)
    
    if result['success']:
        join_room(f"team:{result['team_id']}")
        socketio.emit('score_update', {
            'scores': session_manager.get_scores(),
            'teams': session_manager.get_teams_info()
        })

def on_join_team(data):
    result = session_manager.join_team(data.get('join_code', ''), data.get('player_name', ''), request.sid)
    emit('join_result', result)
    
    if result['success']:
        team_id = result['team_id']
        join_room(f"team:{team_id}")
        
        socketio.emit('player_joined', {
            'player_id': result['player_id'],
            'player_name': result['player_name'],
            'players': result['players']
        }, room=f'team:{team_id}')
        
        socketio.emit('score_update', {
            'scores': session_manager.get_scores(),
            'teams': session_manager.get_teams_info()
        })

def on_admin_auth(data):
    password = data.get('password', '')
    success = password == "y2k2025"
    
    emit('admin_auth_result', {
        'success': success,
        'message': 'Access granted' if success else 'Access denied'
    })
    
    if success:
        join_room('admin')
        emit('state_change', {
            'current_state': session_manager.current_state
        })
        emit('score_update', {
            'scores': session_manager.get_scores(),
            'teams': session_manager.get_teams_info()
        })

def on_set_state(data):
    new_state = data.get('new_state')
    state_data = data.get('state_data', {})
    
    # EventRouter handles state transitions (exit old, enter new)
    event_router.set_state(new_state, state_data)

def on_add_points(data):
    team_id = data.get('team_id')
    points = data.get('points', 0)
    reason = data.get('reason', '')
    
    if session_manager.add_points(team_id, points, reason):
        socketio.emit('score_update', {
            'scores': session_manager.get_scores(),
            'teams': session_manager.get_teams_info()
        })

def on_reset_game(data):
    if not data.get('confirm'):
        return
    
    preserve_teams = data.get('preserve_teams', False)
    session_manager.reset_game(preserve_teams)
    
    # Also reset router state?
    # reset_game defaults to LOBBY in session_manager logic (actually it clears things)
    # We should probably explicitly set state to LOBBY
    event_router.set_state('LOBBY', {})

def on_kick_team(data):
    team_id = data.get('team_id')
    if session_manager.kick_team(team_id):
        socketio.emit('team_kicked', {'message': 'TERMINATED'}, room=f'team:{team_id}')
        socketio.emit('score_update', {
            'scores': session_manager.get_scores(),
            'teams': session_manager.get_teams_info()
        })

# TV Display handlers
def on_toggle_qr_code(data):
    socketio.emit('qr_visibility', {'visible': data.get('visible', False)})

def on_select_avatar(data):
    team_id = data.get('team_id')
    avatar_id = data.get('avatar_id')
    session_manager.set_team_avatar(team_id, avatar_id)
    team = session_manager.get_team(team_id)
    socketio.emit('avatar_updated', {
        'team_id': team_id,
        'team_name': team['name'] if team else '',
        'avatar_id': avatar_id
    })

def on_send_reaction(data):
    # Pass through
    socketio.emit('reaction', data)

def on_send_chat_message(data):
    # Pass through
    socketio.emit('chat_message', data)
