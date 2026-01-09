/**
 * index.js
 * Barrel export for all shared scripts
 *
 * Usage:
 *   import { STATE_VIEW_MAP, Haptics, viewManager } from '../scripts';
 *   // or
 *   import * as GameUtils from '../scripts';
 */

// Configuration
export {
    STATE_VIEW_MAP,
    GAME_PHASES,
    AVATARS,
    AVATAR_EMOJIS,
    DEFAULT_CONFIG
} from './config.js';

// Team colors
export { TeamColors } from './teamColors.js';

// Haptic feedback
export { Haptics } from './haptics.js';

// Visual effects
export {
    GlitchEffects,
    VHSTransition,
    TimerEffects,
    BSOD,
    Win98Dialog
} from './effects.ts';

// View management
export { viewManager, ViewManagerClass } from './viewManager.js';

// Network Director
export { gameClient, GameClientClass } from './gameClient.js';
