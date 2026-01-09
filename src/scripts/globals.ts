/**
 * globals.ts
 * Loads all shared modules and exposes them to window for legacy JS files
 * Import this script in layouts to make shared utilities available globally.
 */

// Import all shared modules
import { STATE_VIEW_MAP, GAME_PHASES, AVATARS, AVATAR_EMOJIS, DEFAULT_CONFIG } from './config.js';
import { TeamColors } from './teamColors.js';
import { Haptics } from './haptics.js';
import { GlitchEffects, VHSTransition, TimerEffects, BSOD, Win98Dialog } from './effects';
import { viewManager } from './viewManager.js';
import { gameClient } from './gameClient.js';

// Expose to window for legacy compatibility
if (typeof window !== 'undefined') {
    // Config
    (window as any).STATE_VIEW_MAP = STATE_VIEW_MAP;
    (window as any).GAME_PHASES = GAME_PHASES;
    (window as any).AVATARS = AVATARS;
    (window as any).AVATAR_EMOJIS = AVATAR_EMOJIS;
    (window as any).DEFAULT_CONFIG = DEFAULT_CONFIG;

    // Utilities
    (window as any).TeamColors = TeamColors;
    (window as any).Haptics = Haptics;

    // Effects (already exposed in effects.ts, but ensure consistency)
    (window as any).GlitchEffects = GlitchEffects;
    (window as any).VHSTransition = VHSTransition;
    (window as any).TimerEffects = TimerEffects;
    (window as any).BSOD = BSOD;
    (window as any).Win98Dialog = Win98Dialog;

    // View management
    (window as any).viewManager = viewManager;

    // Network
    (window as any).gameClient = gameClient;

    console.log('[Globals] Shared modules loaded');
}

export {
    STATE_VIEW_MAP,
    GAME_PHASES,
    AVATARS,
    AVATAR_EMOJIS,
    DEFAULT_CONFIG,
    TeamColors,
    Haptics,
    GlitchEffects,
    VHSTransition,
    TimerEffects,
    BSOD,
    Win98Dialog,
    viewManager,
    gameClient
};
