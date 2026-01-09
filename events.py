"""
Socket.IO Event Handlers for Y2K Party Game (Refactored).
Delegates game events to EventRouter and handles platform events via SessionManager.
"""

import logging
import time
import threading
from flask import request
from flask_socketio import emit, join_room, leave_room

logger = logging.getLogger(__name__)

# =============================================================================
# SCREENSAVER / INACTIVITY TRACKING
# =============================================================================

SCREENSAVER_TIMEOUT = 5 * 60  # 5 minutes in seconds

class ActivityTracker:
    """Tracks activity from admin/TV and triggers screensaver after inactivity."""

    def __init__(self):
        self.last_activity_time = time.time()
        self.is_sleeping = False
        self._timer = None
        self._lock = threading.Lock()
        self._socketio = None

    def init(self, socketio):
        """Initialize with socketio instance and start monitoring."""
        self._socketio = socketio
        self._schedule_check()

    def record_activity(self):
        """Record activity from admin or TV - resets the idle timer."""
        with self._lock:
            self.last_activity_time = time.time()
            was_sleeping = self.is_sleeping
            self.is_sleeping = False

        # If we were sleeping, broadcast wake event
        if was_sleeping and self._socketio:
            logger.info("Activity detected - waking up screensaver")
            self._socketio.emit('screensaver_wake', {})

    def _schedule_check(self):
        """Schedule the next inactivity check."""
        if self._timer:
            self._timer.cancel()
        self._timer = threading.Timer(10.0, self._check_inactivity)  # Check every 10 seconds
        self._timer.daemon = True
        self._timer.start()

    def _check_inactivity(self):
        """Check if we've been inactive long enough to trigger screensaver."""
        try:
            with self._lock:
                elapsed = time.time() - self.last_activity_time
                should_sleep = elapsed >= SCREENSAVER_TIMEOUT

            if should_sleep and not self.is_sleeping:
                logger.info(f"Inactivity timeout ({SCREENSAVER_TIMEOUT}s) - activating screensaver")
                with self._lock:
                    self.is_sleeping = True
                if self._socketio:
                    self._socketio.emit('screensaver_sleep', {})
        finally:
            # Schedule next check
            self._schedule_check()

    def get_status(self):
        """Return current screensaver status."""
        with self._lock:
            return {
                'is_sleeping': self.is_sleeping,
                'seconds_until_sleep': max(0, SCREENSAVER_TIMEOUT - (time.time() - self.last_activity_time))
            }

# Global activity tracker instance
activity_tracker = ActivityTracker()


# =============================================================================
# ROUND TIMER - Global timer for all game rounds
# =============================================================================

class RoundTimer:
    """
    Global round timer that works across all game states.
    Displays in the HUD timer pill on TV views.
    """

    def __init__(self):
        self._timer = None
        self._lock = threading.Lock()
        self._socketio = None
        self.remaining_seconds = 0
        self.total_seconds = 0
        self.is_running = False
        self.is_paused = False

    def init(self, socketio):
        """Initialize with socketio instance."""
        self._socketio = socketio

    def start(self, duration_seconds: int):
        """Start or restart the round timer."""
        with self._lock:
            self._cancel_timer()
            self.total_seconds = duration_seconds
            self.remaining_seconds = duration_seconds
            self.is_running = True
            self.is_paused = False

        self._broadcast_sync('running')
        self._schedule_tick()
        logger.info(f"Round timer started: {duration_seconds}s")

    def pause(self):
        """Pause the timer."""
        with self._lock:
            if self.is_running and not self.is_paused:
                self._cancel_timer()
                self.is_paused = True
        self._broadcast_sync('paused')
        logger.info("Round timer paused")

    def resume(self):
        """Resume a paused timer."""
        with self._lock:
            if self.is_running and self.is_paused:
                self.is_paused = False
        self._schedule_tick()
        self._broadcast_sync('running')
        logger.info("Round timer resumed")

    def stop(self):
        """Stop and reset the timer."""
        with self._lock:
            self._cancel_timer()
            self.is_running = False
            self.is_paused = False
            self.remaining_seconds = 0
        self._broadcast_sync('stopped')
        logger.info("Round timer stopped")

    def add_time(self, seconds: int):
        """Add time to the running timer."""
        with self._lock:
            if self.is_running:
                self.remaining_seconds += seconds
                self.total_seconds += seconds
        self._broadcast_sync('running' if not self.is_paused else 'paused')

    def _cancel_timer(self):
        """Cancel the internal timer thread."""
        if self._timer:
            self._timer.cancel()
            self._timer = None

    def _schedule_tick(self):
        """Schedule the next tick."""
        if self._timer:
            self._timer.cancel()
        self._timer = threading.Timer(1.0, self._tick)
        self._timer.daemon = True
        self._timer.start()

    def _tick(self):
        """Called every second while timer is running."""
        try:
            with self._lock:
                if not self.is_running or self.is_paused:
                    return

                self.remaining_seconds -= 1

                if self.remaining_seconds <= 0:
                    self.remaining_seconds = 0
                    self.is_running = False
                    self._broadcast_sync('expired')
                    logger.info("Round timer expired")
                    return

            self._broadcast_sync('running')
            self._schedule_tick()
        except Exception as e:
            logger.error(f"Round timer tick error: {e}")

    def _broadcast_sync(self, status: str):
        """Broadcast timer state to all clients."""
        if self._socketio:
            self._socketio.emit('round_timer_sync', {
                'remaining_seconds': self.remaining_seconds,
                'total_seconds': self.total_seconds,
                'status': status,  # 'running', 'paused', 'stopped', 'expired'
                'is_running': self.is_running,
                'is_paused': self.is_paused
            })

    def get_status(self):
        """Return current timer status."""
        with self._lock:
            return {
                'remaining_seconds': self.remaining_seconds,
                'total_seconds': self.total_seconds,
                'status': 'paused' if self.is_paused else ('running' if self.is_running else 'stopped'),
                'is_running': self.is_running,
                'is_paused': self.is_paused
            }


# Global round timer instance
round_timer = RoundTimer()

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

    # Initialize activity tracker for screensaver
    activity_tracker.init(sio)

    # Initialize round timer
    round_timer.init(sio)

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

    # Screensaver activity event (admin/TV send this to keep awake)
    sio.on_event('screensaver_activity', on_screensaver_activity)
    sio.on_event('request_screensaver_status', on_request_screensaver_status)

    # Round timer events
    sio.on_event('round_timer_control', on_round_timer_control)
    sio.on_event('request_round_timer_status', on_request_round_timer_status)

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

    # Admin is actively controlling the game - record activity
    activity_tracker.record_activity()

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

# =============================================================================
# SCREENSAVER HANDLERS
# =============================================================================

def on_screensaver_activity(data=None):
    """Called by admin/TV to indicate activity and reset the idle timer."""
    activity_tracker.record_activity()

def on_request_screensaver_status(data=None):
    """Return current screensaver status to the requesting client."""
    status = activity_tracker.get_status()
    emit('screensaver_status', status)


# =============================================================================
# ROUND TIMER HANDLERS
# =============================================================================

def on_round_timer_control(data):
    """
    Control the global round timer.
    Actions: 'start', 'pause', 'resume', 'stop', 'add_time'
    """
    action = data.get('action', '')

    # Record admin activity
    activity_tracker.record_activity()

    if action == 'start':
        duration = data.get('duration_seconds', 60)
        round_timer.start(duration)
    elif action == 'pause':
        round_timer.pause()
    elif action == 'resume':
        round_timer.resume()
    elif action == 'stop':
        round_timer.stop()
    elif action == 'add_time':
        seconds = data.get('seconds', 30)
        round_timer.add_time(seconds)
    else:
        logger.warning(f"Unknown round timer action: {action}")


def on_request_round_timer_status(data=None):
    """Return current round timer status to the requesting client."""
    status = round_timer.get_status()
    emit('round_timer_sync', status)
