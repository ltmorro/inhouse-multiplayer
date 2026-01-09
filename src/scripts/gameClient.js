/**
 * gameClient.js
 * Network Director - Singleton managing WebSocket connection
 * Re-dispatches server events as DOM CustomEvents for decoupled UI handling
 *
 * Usage:
 *   import { gameClient } from '../scripts/gameClient.js';
 *
 *   // Initialize (call once on page load)
 *   gameClient.init();
 *
 *   // Listen to events
 *   gameClient.on('state-change', (data) => {
 *       console.log('State changed to:', data.current_state);
 *   });
 *
 *   // Or use standard DOM events
 *   document.addEventListener('game:state-change', (e) => {
 *       console.log('State:', e.detail.current_state);
 *   });
 *
 *   // Emit events to server
 *   gameClient.emit('submit_answer', { answer_text: 'My answer' });
 */

// All socket events that should be mapped to DOM CustomEvents
const SOCKET_EVENTS = [
    // Connection
    'connect',
    'disconnect',
    'error',

    // Authentication & Registration
    'admin_auth_result',
    'creation_result',
    'join_result',
    'rejoin_result',
    'player_joined',
    'team_kicked',

    // State Management
    'sync_state',
    'state_change',
    'score_update',

    // Timer
    'timer_sync',
    'round_timer_sync',

    // Trivia
    'answer_result',
    'answer_revealed',
    'answer_sync',
    'answer_submitted',
    'answer_received',
    'submission_status',

    // Buzzer
    'buzzer_locked',
    'buzzer_reset',
    'buzzer_lockout',

    // Timeline
    'timeline_result',
    'timeline_complete',
    'timeline_sync',
    'timeline_status',
    'timeline_submission',

    // Picture Guess
    'picture_guess_result',
    'picture_guess_sync',
    'picture_guess_submitted',
    'picture_guess_received',
    'show_picture',
    'picture_revealed',

    // Price Guess
    'price_guess_result',
    'price_guess_sync',
    'price_guess_submitted',
    'price_guess_received',
    'show_price_product',
    'price_revealed',

    // Pixel Perfect
    'pixelperfect_locked',
    'pixelperfect_reset',
    'pixelperfect_lockout',
    'pixelperfect_round_start',
    'pixelperfect_reveal',

    // Survival
    'survival_vote_confirmed',
    'survival_vote_update',
    'survival_vote_received',
    'survival_reveal',
    'survival_eliminated',
    'survival_round_reset',
    'survival_round_complete',
    'survival_revive_all',

    // Elimination
    'eliminated',
    'elimination_update',

    // Audio/Music
    'play_audio',
    'stop_audio',
    'pause_audio',
    'resume_audio',
    'reveal_audio',
    'music_toggle',
    'music_next',
    'music_previous',

    // UI
    'avatar_updated',
    'qr_visibility',
    'reaction',
    'chat_message'
];

/**
 * GameClient class - manages socket connection and event dispatching
 */
class GameClientClass {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.initialized = false;
        this.eventListeners = new Map();
    }

    /**
     * Initialize the socket connection
     * @param {object} options - Optional configuration
     */
    init(options = {}) {
        if (this.initialized) {
            console.warn('[GameClient] Already initialized');
            return;
        }

        // Check if Socket.IO is loaded
        if (typeof io === 'undefined') {
            console.error('[GameClient] Socket.IO not loaded');
            return;
        }

        // Create socket connection
        this.socket = io(options.url || undefined, {
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            ...options.socketOptions
        });

        // Expose socket globally for legacy compatibility
        window.socket = this.socket;

        // Set up event mappings
        this._setupEventMappings();

        this.initialized = true;
        console.log('[GameClient] Initialized');
    }

    /**
     * Set up socket event to DOM CustomEvent mappings
     * @private
     */
    _setupEventMappings() {
        SOCKET_EVENTS.forEach(event => {
            this.socket.on(event, (data) => {
                // Convert snake_case to kebab-case for DOM events
                const eventName = event.replace(/_/g, '-');
                this._dispatch(eventName, data);

                // Special handling for connection events
                if (event === 'connect') {
                    this.connected = true;
                } else if (event === 'disconnect') {
                    this.connected = false;
                }
            });
        });
    }

    /**
     * Dispatch a DOM CustomEvent
     * @param {string} eventName - Event name (without 'game:' prefix)
     * @param {*} detail - Event detail/data
     * @private
     */
    _dispatch(eventName, detail = {}) {
        const fullEventName = `game:${eventName}`;
        const event = new CustomEvent(fullEventName, {
            detail,
            bubbles: true,
            cancelable: true
        });
        document.dispatchEvent(event);

        // Also call registered listeners
        const listeners = this.eventListeners.get(eventName) || [];
        listeners.forEach(callback => {
            try {
                callback(detail);
            } catch (err) {
                console.error(`[GameClient] Error in listener for ${eventName}:`, err);
            }
        });
    }

    /**
     * Register an event listener
     * @param {string} event - Event name (without 'game:' prefix)
     * @param {function} callback - Callback function
     */
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    /**
     * Remove an event listener
     * @param {string} event - Event name
     * @param {function} callback - Callback to remove
     */
    off(event, callback) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    /**
     * Emit an event to the server
     * @param {string} event - Event name
     * @param {*} data - Data to send
     */
    emit(event, data) {
        if (!this.socket) {
            console.warn('[GameClient] Socket not initialized');
            return;
        }

        if (!this.connected) {
            console.warn('[GameClient] Not connected, queuing event:', event);
        }

        this.socket.emit(event, data);
    }

    /**
     * Check if connected
     * @returns {boolean}
     */
    isConnected() {
        return this.connected;
    }

    /**
     * Get the raw socket instance (for legacy compatibility)
     * @returns {Socket|null}
     */
    getSocket() {
        return this.socket;
    }

    /**
     * Disconnect the socket
     */
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.connected = false;
        }
    }

    /**
     * Reconnect the socket
     */
    reconnect() {
        if (this.socket) {
            this.socket.connect();
        }
    }
}

// Export singleton instance
export const gameClient = new GameClientClass();

// Export class for potential subclassing
export { GameClientClass };

// Expose to window for legacy compatibility
if (typeof window !== 'undefined') {
    window.gameClient = gameClient;
}

export default gameClient;
