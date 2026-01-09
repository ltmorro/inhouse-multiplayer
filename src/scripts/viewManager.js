/**
 * viewManager.js
 * View switching logic - manages which view is currently visible
 */

import { STATE_VIEW_MAP } from './config.js';

/**
 * ViewManager class - handles view switching with optional transitions
 */
class ViewManagerClass {
    constructor() {
        this.currentState = 'LOBBY';
        this.transitionEnabled = true;
        this.bootCompleted = false;
    }

    /**
     * Hide all views
     */
    hideAll() {
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
        });
    }

    /**
     * Show a specific view by ID
     * @param {string} viewId - The view element ID
     * @param {boolean} withTransition - Whether to play transition effect
     */
    async show(viewId, withTransition = false) {
        if (withTransition && this.transitionEnabled && this.bootCompleted) {
            // Use VHSTransition if available (from window)
            const VHSTransition = window.VHSTransition;
            if (VHSTransition && typeof VHSTransition.play === 'function') {
                await VHSTransition.play();
            }
        }

        this.hideAll();
        const view = document.getElementById(viewId);
        if (view) {
            view.classList.add('active');
        }
        console.log(`[ViewManager] Showing: ${viewId}`);
    }

    /**
     * Show view based on game state
     * @param {string} state - The game state enum value
     * @param {boolean} useTransition - Whether to use transition (default: true)
     */
    showForState(state, useTransition = true) {
        const viewId = STATE_VIEW_MAP[state];
        if (viewId) {
            // Use transition when changing between states
            const shouldTransition = useTransition && this.currentState !== state;
            this.show(viewId, shouldTransition);
            this.currentState = state;
        } else {
            console.warn(`[ViewManager] Unknown state: ${state}`);
        }
    }

    /**
     * Show registration view
     */
    showRegister() {
        this.show('view-register');
    }

    /**
     * Show team created view
     */
    showTeamCreated() {
        this.show('view-team-created');
    }

    /**
     * Show eliminated view
     */
    showEliminated() {
        this.show('view-eliminated');
    }

    /**
     * Show kicked view
     */
    showKicked() {
        this.show('view-kicked');
    }

    /**
     * Show victory view
     */
    showVictory() {
        this.show('view-victory');
    }

    /**
     * Get current state
     * @returns {string}
     */
    getCurrentState() {
        return this.currentState;
    }

    /**
     * Set whether transitions are enabled
     * @param {boolean} enabled
     */
    setTransitionsEnabled(enabled) {
        this.transitionEnabled = enabled;
    }

    /**
     * Mark boot sequence as completed (enables transitions)
     */
    setBootCompleted() {
        this.bootCompleted = true;
    }
}

// Export singleton instance
export const viewManager = new ViewManagerClass();

// Export class for potential subclassing
export { ViewManagerClass };

// Expose to window for legacy compatibility
if (typeof window !== 'undefined') {
    window.viewManager = viewManager;
}

export default viewManager;
