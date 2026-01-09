"""
Y2K System Failure Protocol - Main Flask Application
Entry point for the NYE 2025 party game server.
"""

import os
import json
import logging
import secrets
import base64
import argparse
import subprocess
import requests
from urllib.parse import urlencode
from flask import Flask, render_template, jsonify, redirect, request, session, send_from_directory
from flask_socketio import SocketIO
from pathlib import Path

# New Architecture Imports
from server.core.session_manager import SessionManager
from server.core.event_router import EventRouter
from server.games.game_registry import GameRegistry
from server.games import ALL_GAMES
from events import register_events

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
# Point to 'dist' folder for static assets. We won't use template_folder since we serve static HTML.
app = Flask(__name__, static_folder='dist', static_url_path='')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'y2k-party-secret-key-2025')

# Initialize Socket.IO with CORS for local network access
socketio = SocketIO(app, cors_allowed_origins="*")

# Initialize System
session_manager = SessionManager(data_dir='data')
game_registry = GameRegistry(session_manager)

# Register Games
for game_class in ALL_GAMES:
    game_registry.register(game_class)

event_router = EventRouter(socketio, session_manager, game_registry)

# Register Socket.IO event handlers
register_events(socketio, session_manager, event_router, game_registry)

# Initialize LOBBY if no state (or restore state)
if session_manager.current_state:
    logger.info(f"Restoring game state: {session_manager.current_state}")
    event_router.current_game_id = session_manager.current_state
    
    # Restore game-specific state
    game = game_registry.get_game(session_manager.current_state)
    if game:
        try:
            # We use on_enter to restore state from persistence
            game.on_enter(session_manager.state_data)
        except Exception as e:
            logger.error(f"Failed to restore game state: {e}")
else:
    logger.info("Starting fresh in LOBBY")
    event_router.set_state("LOBBY", {})

# =============================================================================
# SPOTIFY WEB PLAYBACK SDK INTEGRATION
# =============================================================================

# Spotify OAuth configuration (set these in environment or .env file)
SPOTIFY_CLIENT_ID = os.environ.get('SPOTIFY_CLIENT_ID', '')
SPOTIFY_CLIENT_SECRET = os.environ.get('SPOTIFY_CLIENT_SECRET', '')
SPOTIFY_REDIRECT_URI = os.environ.get('SPOTIFY_REDIRECT_URI', 'http://127.0.0.1:13370/spotify/callback')

# In-memory storage for Spotify tokens (shared across TV instances)
spotify_tokens = {
    'access_token': None,
    'refresh_token': None,
    'expires_at': 0
}


# =============================================================================
# HTTP ROUTES
# =============================================================================

@app.route('/')
def index():
    """Main landing page - serves mobile controller (has registration built-in)."""
    return send_from_directory('dist', 'mobile.html')


@app.route('/mobile')
def mobile():
    """Mobile controller view for players (alias for /)."""
    return send_from_directory('dist', 'mobile.html')


@app.route('/tv')
def tv():
    """TV display view - main screen output."""
    return send_from_directory('dist', 'tv.html')


@app.route('/admin')
def admin():
    """Admin dashboard for host control."""
    return send_from_directory('dist', 'admin.html')


@app.route('/health')
def health():
    """Health check endpoint."""
    return {
        'status': 'ok',
        'game_state': session_manager.current_state,
        'teams_count': len(session_manager.teams)
    }


@app.route('/api/local-ip')
def get_local_ip():
    """Get the local IP address, mobile URL, and optional WiFi config for QR code generation."""
    import socket
    try:
        # Create a socket to determine local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        local_ip = '127.0.0.1'

    # Get port from request (reflects actual running port)
    port = request.environ.get('SERVER_PORT', 13370)
    mobile_url = f'http://{local_ip}:{port}/mobile'

    response = {
        'local_ip': local_ip,
        'port': port,
        'mobile_url': mobile_url
    }

    # Include WiFi config if available
    if wifi_config['ssid'] and wifi_config['password']:
        response['wifi'] = {
            'ssid': wifi_config['ssid'],
            'password': wifi_config['password']
        }

    return jsonify(response)


@app.route('/api/content')
def get_content():
    """API endpoint to get pre-prepared game content."""
    questions_file = Path('data/questions.json')
    if questions_file.exists():
        with open(questions_file, 'r') as f:
            content = json.load(f)
        return jsonify(content)
    return jsonify({
        'trivia_questions': [],
        'timeline_puzzles': [],
        'audio_tracks': [],
        'picture_guesses': []
    })


@app.route('/api/soundtracks')
def get_soundtracks():
    """API endpoint to get round soundtracks for background music."""
    questions_file = Path('data/questions.json')
    if questions_file.exists():
        with open(questions_file, 'r') as f:
            content = json.load(f)
        return jsonify(content.get('round_soundtracks', {}))
    return jsonify({})


# =============================================================================
# SPOTIFY OAUTH ROUTES
# =============================================================================

@app.route('/spotify/login')
def spotify_login():
    """Initiate Spotify OAuth flow."""
    if not SPOTIFY_CLIENT_ID:
        return jsonify({'error': 'Spotify credentials not configured'}), 500

    # Generate state for CSRF protection
    state = secrets.token_urlsafe(16)
    session['spotify_state'] = state

    # Scopes needed for Web Playback SDK
    scopes = 'streaming user-read-email user-read-private user-modify-playback-state'

    params = {
        'response_type': 'code',
        'client_id': SPOTIFY_CLIENT_ID,
        'scope': scopes,
        'redirect_uri': SPOTIFY_REDIRECT_URI,
        'state': state
    }

    auth_url = 'https://accounts.spotify.com/authorize?' + urlencode(params)
    return redirect(auth_url)


@app.route('/spotify/callback')
def spotify_callback():
    """Handle Spotify OAuth callback."""
    error = request.args.get('error')
    if error:
        logger.error(f"Spotify auth error: {error}")
        return redirect('/admin?spotify_error=' + error)

    code = request.args.get('code')
    state = request.args.get('state')

    # Verify state
    if state != session.get('spotify_state'):
        logger.error("Spotify state mismatch")
        return redirect('/admin?spotify_error=state_mismatch')

    # Exchange code for tokens
    auth_header = base64.b64encode(
        f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}".encode()
    ).decode()

    response = requests.post(
        'https://accounts.spotify.com/api/token',
        data={
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': SPOTIFY_REDIRECT_URI
        },
        headers={
            'Authorization': f'Basic {auth_header}',
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    )

    if response.status_code != 200:
        logger.error(f"Spotify token error: {response.text}")
        return redirect('/admin?spotify_error=token_error')

    data = response.json()

    # Store tokens globally (shared across all TV instances)
    import time
    spotify_tokens['access_token'] = data['access_token']
    spotify_tokens['refresh_token'] = data.get('refresh_token')
    spotify_tokens['expires_at'] = time.time() + data.get('expires_in', 3600)

    logger.info("Spotify authentication successful")
    return redirect('/admin?spotify_success=true')


@app.route('/spotify/token')
def spotify_token():
    """Return current Spotify access token (for Web Playback SDK)."""
    import time

    if not spotify_tokens['access_token']:
        return jsonify({'access_token': None, 'connected': False})

    # Check if token needs refresh
    if time.time() > spotify_tokens['expires_at'] - 60:
        # Refresh the token
        if spotify_tokens['refresh_token']:
            auth_header = base64.b64encode(
                f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}".encode()
            ).decode()

            response = requests.post(
                'https://accounts.spotify.com/api/token',
                data={
                    'grant_type': 'refresh_token',
                    'refresh_token': spotify_tokens['refresh_token']
                },
                headers={
                    'Authorization': f'Basic {auth_header}',
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            )

            if response.status_code == 200:
                data = response.json()
                spotify_tokens['access_token'] = data['access_token']
                spotify_tokens['expires_at'] = time.time() + data.get('expires_in', 3600)
                if 'refresh_token' in data:
                    spotify_tokens['refresh_token'] = data['refresh_token']
                logger.info("Spotify token refreshed")
            else:
                logger.error(f"Spotify token refresh failed: {response.text}")
                spotify_tokens['access_token'] = None
                return jsonify({'access_token': None, 'connected': False})

    return jsonify({
        'access_token': spotify_tokens['access_token'],
        'connected': True
    })


@app.route('/spotify/status')
def spotify_status():
    """Check if Spotify is connected."""
    return jsonify({
        'connected': spotify_tokens['access_token'] is not None,
        'configured': bool(SPOTIFY_CLIENT_ID)
    })


# =============================================================================
# WIFI QR CODE CONFIGURATION
# =============================================================================

# WiFi configuration for QR code generation
# Can be set via environment variables or command line arguments
wifi_config = {
    'ssid': None,
    'password': None
}


def get_current_ssid():
    """Attempt to get the current WiFi SSID (cross-platform)."""
    import platform
    system = platform.system()

    try:
        if system == 'Darwin':  # macOS
            result = subprocess.run(
                ['/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport', '-I'],
                capture_output=True,
                text=True,
                timeout=5
            )
            for line in result.stdout.split('\n'):
                if ' SSID:' in line:
                    return line.split(':')[1].strip()

        elif system == 'Windows':
            result = subprocess.run(
                ['netsh', 'wlan', 'show', 'interfaces'],
                capture_output=True,
                text=True,
                timeout=5
            )
            for line in result.stdout.split('\n'):
                if 'SSID' in line and 'BSSID' not in line:
                    parts = line.split(':')
                    if len(parts) >= 2:
                        return parts[1].strip()

        elif system == 'Linux':
            # Try nmcli first (NetworkManager)
            result = subprocess.run(
                ['nmcli', '-t', '-f', 'active,ssid', 'dev', 'wifi'],
                capture_output=True,
                text=True,
                timeout=5
            )
            for line in result.stdout.split('\n'):
                if line.startswith('yes:'):
                    return line.split(':')[1]

    except Exception as e:
        logger.debug(f"Could not auto-detect SSID: {e}")

    return None


def init_wifi_config(args):
    """Initialize WiFi configuration from env vars and CLI args."""
    # Start with environment variables
    ssid = os.environ.get('WIFI_SSID', '')
    password = os.environ.get('WIFI_PASSWORD', '')

    # CLI args override env vars
    if args.wifi_ssid:
        ssid = args.wifi_ssid
    if args.wifi_password:
        password = args.wifi_password

    # Auto-detect SSID if not provided but password is
    if not ssid and password:
        detected = get_current_ssid()
        if detected:
            ssid = detected
            logger.info(f"Auto-detected WiFi SSID: {ssid}")

    wifi_config['ssid'] = ssid if ssid else None
    wifi_config['password'] = password if password else None

    if wifi_config['ssid'] and wifi_config['password']:
        logger.info(f"WiFi QR code enabled for network: {wifi_config['ssid']}")
    elif wifi_config['ssid'] or wifi_config['password']:
        logger.warning("WiFi QR code disabled: both SSID and password are required")
        wifi_config['ssid'] = None
        wifi_config['password'] = None


# =============================================================================
# MAIN
# =============================================================================

def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description='Y2K Party Game Server',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
WiFi QR Code Configuration:
  The TV lobby can display a WiFi QR code alongside the game join QR code.
  Configure via environment variables or command line arguments:

  Environment variables:
    WIFI_SSID      - WiFi network name
    WIFI_PASSWORD  - WiFi password

  If only WIFI_PASSWORD is set, the SSID will be auto-detected from the
  current WiFi connection (works on macOS, Windows, and Linux with NetworkManager).
        """
    )
    parser.add_argument(
        '--wifi-ssid',
        type=str,
        help='WiFi network name for QR code'
    )
    parser.add_argument(
        '--wifi-password',
        type=str,
        help='WiFi password for QR code'
    )
    parser.add_argument(
        '--port',
        type=int,
        default=13370,
        help='Server port (default: 13370)'
    )
    parser.add_argument(
        '--no-debug',
        action='store_true',
        help='Disable debug mode'
    )
    return parser.parse_args()


if __name__ == '__main__':
    args = parse_args()

    # Initialize WiFi configuration
    init_wifi_config(args)

    # Run with host='0.0.0.0' to expose to local network
    logger.info("Starting Y2K Party Game Server...")
    logger.info(f"TV View: http://<your-ip>:{args.port}/tv")
    logger.info(f"Mobile: http://<your-ip>:{args.port}/mobile")
    logger.info(f"Admin: http://<your-ip>:{args.port}/admin")

    socketio.run(
        app,
        host='0.0.0.0',
        port=args.port,
        debug=not args.no_debug,
        allow_unsafe_werkzeug=True
    )