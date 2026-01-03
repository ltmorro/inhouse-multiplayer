/**
 * EFFECTS.TS - Neutralized for Winter Theme
 * Glitch effects and shaking are disabled.
 * Haptics preserved for tactile feedback if desired.
 */

// ============================================================
// GLITCH EFFECTS - DISABLED
// ============================================================

export const GlitchEffects = {
    trigger(type: 'minor' | 'major' | 'critical' = 'minor'): void {
        // No-op for winter theme
        // console.log('Glitch effect triggered but disabled:', type);
    },

    shake(duration: number = 300): void {
        // No-op for winter theme
        // console.log('Shake effect triggered but disabled');
    }
};

// ============================================================
// VHS TRANSITIONS - DISABLED
// ============================================================

export const VHSTransition = {
    async play(type: string = 'switch'): Promise<void> {
        // Simple delay to mimic async behavior without visual effect
        await this.sleep(50); 
    },

    sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};

// ============================================================
// HAPTICS - PRESERVED (Maybe softer?)
// ============================================================

export const Haptics = {
    isSupported(): boolean {
        return 'vibrate' in navigator;
    },

    tap(): void {
        if (this.isSupported()) {
            navigator.vibrate(5); // Very soft tap
        }
    },

    confirm(): void {
        if (this.isSupported()) {
            navigator.vibrate(10);
        }
    },

    success(): void {
        if (this.isSupported()) {
            navigator.vibrate([10, 30, 10]);
        }
    },

    error(): void {
        if (this.isSupported()) {
            navigator.vibrate([30, 20, 30]);
        }
    },

    stateChange(): void {
        if (this.isSupported()) {
            navigator.vibrate([10, 20, 10]);
        }
    }
};

// Expose to window for global access
if (typeof window !== 'undefined') {
    (window as any).GlitchEffects = GlitchEffects;
    (window as any).VHSTransition = VHSTransition;
    (window as any).Haptics = Haptics;
}