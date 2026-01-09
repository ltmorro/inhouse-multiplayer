/**
 * haptics.js
 * Comprehensive haptic feedback for mobile devices
 */

export const Haptics = {
    /**
     * Check if vibration API is supported
     * @returns {boolean}
     */
    isSupported() {
        return 'vibrate' in navigator;
    },

    /**
     * Light tap - for button presses
     */
    tap() {
        if (this.isSupported()) {
            navigator.vibrate(10);
        }
    },

    /**
     * Medium feedback - for form submissions
     */
    confirm() {
        if (this.isSupported()) {
            navigator.vibrate(30);
        }
    },

    /**
     * Success pattern - for correct answers
     */
    success() {
        if (this.isSupported()) {
            navigator.vibrate([20, 50, 20]);
        }
    },

    /**
     * Error pattern - for wrong answers
     */
    error() {
        if (this.isSupported()) {
            navigator.vibrate([50, 30, 50]);
        }
    },

    /**
     * Urgent pattern - for buzzer press
     */
    buzzer() {
        if (this.isSupported()) {
            navigator.vibrate([30, 20, 30, 20, 30]);
        }
    },

    /**
     * Heavy impact - for eliminations, BSOD
     */
    impact() {
        if (this.isSupported()) {
            navigator.vibrate([100, 50, 100, 50, 100]);
        }
    },

    /**
     * Warning - for timer critical, lockouts
     */
    warning() {
        if (this.isSupported()) {
            navigator.vibrate([50, 30, 50]);
        }
    },

    /**
     * Countdown tick - subtle pulse for final countdown
     */
    tick() {
        if (this.isSupported()) {
            navigator.vibrate(15);
        }
    },

    /**
     * State change - when game state transitions
     */
    stateChange() {
        if (this.isSupported()) {
            navigator.vibrate([20, 40, 20]);
        }
    },

    /**
     * Custom vibration pattern
     * @param {number|number[]} pattern - Duration or array of [vibrate, pause, vibrate, ...]
     */
    vibrate(pattern) {
        if (this.isSupported()) {
            navigator.vibrate(pattern);
        }
    }
};

export default Haptics;
