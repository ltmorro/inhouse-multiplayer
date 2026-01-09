/**
 * effects.ts
 * Visual effects utilities - neutralized for Winter Storybook theme
 * Glitch/VHS effects disabled, but structure preserved for easy re-enabling
 */

// ============================================================
// GLITCH EFFECTS - DISABLED for winter theme
// ============================================================

export const GlitchEffects = {
    /**
     * Trigger a glitch effect (disabled for winter theme)
     * @param type - 'minor' | 'major' | 'critical'
     */
    trigger(type: 'minor' | 'major' | 'critical' = 'minor'): void {
        // No-op for winter theme
        // Original code applied CSS classes: glitch-active, static-overlay, screen-distort
    },

    /**
     * Shake the screen (disabled for winter theme)
     * @param duration - Duration in milliseconds
     */
    shake(duration: number = 300): void {
        // No-op for winter theme
        // Original code applied screen-shake class
    }
};

// ============================================================
// VHS TRANSITIONS - DISABLED for winter theme
// ============================================================

export const VHSTransition = {
    /**
     * Play a VHS-style transition (minimal delay for winter theme)
     * @param type - Transition type
     */
    async play(type: string = 'switch'): Promise<void> {
        // Simple delay to mimic async behavior without visual effect
        await this.sleep(50);
    },

    /**
     * Sleep utility
     * @param ms - Milliseconds to sleep
     */
    sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};

// ============================================================
// TIMER EFFECTS - Critical timer visual feedback
// ============================================================

export const TimerEffects = {
    criticalOverlayActive: false,

    /**
     * Toggle the critical timer overlay
     * @param active - Whether to show the overlay
     */
    setCriticalOverlay(active: boolean): void {
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
     * Toggle heartbeat animation on timer display
     * @param active - Whether to enable heartbeat
     */
    setHeartbeat(active: boolean): void {
        const display = document.getElementById('timer-display');
        if (!display) return;

        if (active) {
            display.classList.add('heartbeat');
        } else {
            display.classList.remove('heartbeat');
        }
    },

    /**
     * Update effects based on time remaining
     * @param seconds - Seconds remaining
     * @param total - Total duration
     */
    updateForTime(seconds: number, total: number): void {
        const percent = (seconds / total) * 100;

        // Critical overlay at 20%
        if (percent <= 20) {
            this.setCriticalOverlay(true);
        } else {
            this.setCriticalOverlay(false);
        }

        // Heartbeat at 10%
        if (percent <= 10) {
            this.setHeartbeat(true);
            // Gentle haptic at critical time
            if (navigator.vibrate && seconds > 0) {
                navigator.vibrate(15);
            }
        } else {
            this.setHeartbeat(false);
        }

        // Time's up
        if (seconds === 0) {
            this.setCriticalOverlay(false);
            this.setHeartbeat(false);
        }
    },

    /**
     * Reset all timer effects
     */
    reset(): void {
        this.setCriticalOverlay(false);
        this.setHeartbeat(false);
    }
};

// ============================================================
// BSOD - Blue Screen of Death overlay
// ============================================================

export const BSOD = {
    /**
     * Show BSOD overlay
     * @param teamName - Team name to display
     * @param duration - How long to show (ms)
     */
    show(teamName: string, duration: number = 3000): void {
        const overlay = document.getElementById('bsod-overlay');
        const teamEl = document.getElementById('bsod-team-name');

        if (!overlay) return;

        if (teamEl) {
            teamEl.textContent = teamName || 'ELIMINATED';
        }
        overlay.classList.remove('hidden');

        // Haptic impact
        if (navigator.vibrate) {
            navigator.vibrate([100, 50, 100, 50, 100]);
        }

        // Auto-hide after duration
        setTimeout(() => this.hide(), duration);

        // Allow dismiss on click/touch
        const dismiss = () => {
            this.hide();
            document.removeEventListener('click', dismiss);
            document.removeEventListener('touchstart', dismiss);
        };

        setTimeout(() => {
            document.addEventListener('click', dismiss, { once: true });
            document.addEventListener('touchstart', dismiss, { once: true });
        }, 500);
    },

    /**
     * Hide BSOD overlay
     */
    hide(): void {
        const overlay = document.getElementById('bsod-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
    }
};

// ============================================================
// WINDOW 98 DIALOG - Error/notification dialog
// ============================================================

export const Win98Dialog = {
    /**
     * Show a Windows 98 style dialog
     * @param options - Dialog options
     */
    show(options: {
        title?: string;
        message?: string;
        icon?: string;
        duration?: number;
    } = {}): void {
        const overlay = document.getElementById('win98-overlay');
        const title = document.getElementById('win98-title');
        const message = document.getElementById('win98-message');
        const icon = document.getElementById('win98-icon');

        if (!overlay) return;

        if (title) title.textContent = options.title || 'Alert';
        if (message) message.innerHTML = options.message || '<strong>An event has occurred.</strong>';
        if (icon) icon.textContent = options.icon || '!';

        overlay.classList.remove('hidden');

        if (options.duration && options.duration > 0) {
            setTimeout(() => this.hide(), options.duration);
        }
    },

    /**
     * Hide the dialog
     */
    hide(): void {
        const overlay = document.getElementById('win98-overlay');
        if (overlay) overlay.classList.add('hidden');
    },

    /**
     * Show wrong answer dialog
     * @param context - Additional context
     */
    showWrongAnswer(context?: string): void {
        this.show({
            title: 'Incorrect',
            message: `<strong>That's not quite right.</strong>${context ? '<br>' + context : ''}`,
            icon: '!',
            duration: 2500
        });
    },

    /**
     * Show buzzer locked dialog
     * @param teamName - Team that locked the buzzer
     */
    showBuzzerLock(teamName?: string): void {
        this.show({
            title: 'Buzzer Locked',
            message: teamName ? `<strong>${teamName}</strong> buzzed first!` : 'Another team buzzed first.',
            icon: '!',
            duration: 2000
        });
    },

    /**
     * Show freeze penalty dialog
     * @param seconds - Freeze duration
     */
    showFreeze(seconds: number): void {
        this.show({
            title: 'Timeout',
            message: `<strong>Wrong answer penalty</strong><br>Buzzer frozen for ${seconds} seconds.`,
            icon: '!',
            duration: 2000
        });
    }
};

// Expose to window for global access (legacy compatibility)
if (typeof window !== 'undefined') {
    (window as any).GlitchEffects = GlitchEffects;
    (window as any).VHSTransition = VHSTransition;
    (window as any).TimerEffects = TimerEffects;
    (window as any).BSOD = BSOD;
    (window as any).Win98Dialog = Win98Dialog;
}
