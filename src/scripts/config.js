/**
 * config.js
 * Shared configuration - single source of truth for game states and constants
 */

// States mapping to view IDs
export const STATE_VIEW_MAP = {
    'LOBBY': 'view-lobby',
    'MACGYVER': 'view-macgyver',
    'TRIVIA': 'view-trivia',
    'TIMER': 'view-timer',
    'BUZZER': 'view-buzzer',
    'TIMELINE': 'view-timeline',
    'MINESWEEPER': 'view-minesweeper',
    'PICTUREGUESS': 'view-pictureguess',
    'PIXELPERFECT': 'view-pixelperfect',
    'PRICEGUESS': 'view-priceguess',
    'SURVIVAL': 'view-survival',
    'VICTORY': 'view-victory'
};

// Game phases in order (excludes LOBBY and VICTORY which are not gameplay rounds)
export const GAME_PHASES = [
    // 'MACGYVER',
    'TRIVIA',
    // 'TIMER',
    'BUZZER',
    'TIMELINE',
    // 'MINESWEEPER',
    'PICTUREGUESS',
    'PIXELPERFECT',
    'PRICEGUESS',
    'SURVIVAL'
];

// Avatar configuration for team selection
export const AVATARS = [
    { id: 'bottle', emoji: '🍼', name: 'BOTTLE' },
    { id: 'pacifier', emoji: '👶', name: 'BABY' },
    { id: 'bear', emoji: '🧸', name: 'TEDDY' },
    { id: 'duck', emoji: '🦆', name: 'DUCKY' },
    { id: 'rattle', emoji: '🪇', name: 'RATTLE' },
    { id: 'stroller', emoji: '🛒', name: 'STROLLER' },
    { id: 'footprint', emoji: '👣', name: 'FEET' },
    { id: 'angel', emoji: '👼', name: 'ANGEL' }
];

// Avatar emoji lookup (for quick access)
export const AVATAR_EMOJIS = {
    'bottle': '🍼',
    'pacifier': '👶',
    'bear': '🧸',
    'duck': '🦆',
    'rattle': '🪇',
    'stroller': '🛒',
    'footprint': '👣',
    'angel': '👼'
};

// Default configuration
export const DEFAULT_CONFIG = {
    MOCK_MODE: false,
    MOCK_DELAY: 500
};
