/**
 * teamColors.js
 * Team color utilities - assigns and manages distinct colors for each team
 */

// Color palette for teams
const TEAM_COLORS = [
    '#FF6B6B', // 1: Coral Red
    '#4ECDC4', // 2: Teal
    '#FFE66D', // 3: Yellow
    '#95E1D3', // 4: Mint
    '#DDA0DD', // 5: Plum
    '#87CEEB', // 6: Sky Blue
    '#F4A460', // 7: Sandy Brown
    '#98D8C8'  // 8: Sea Green
];

const MAX_COLORS = 8;

/**
 * TeamColors utility object
 * Note: This requires access to a teams state object to be passed in or accessed globally
 */
export const TeamColors = {
    colors: TEAM_COLORS,
    maxColors: MAX_COLORS,

    /**
     * Get color index for a team
     * @param {string} teamId - The team identifier
     * @param {object} teamsState - Optional teams state object (falls back to window.AppState?.teams)
     * @returns {number} Color index (1-8)
     */
    getColorIndex(teamId, teamsState = null) {
        // Try to get teams from passed state, window.AppState, or return fallback
        const teams = teamsState || window.AppState?.teams || {};
        const team = teams[teamId];

        if (team && team.color) {
            return team.color;
        }

        // Fallback: cycle through colors based on team position
        const teamIds = Object.keys(teams);
        const index = teamIds.indexOf(teamId);
        return index >= 0 ? ((index % this.maxColors) + 1) : 1;
    },

    /**
     * Get CSS class for team text color
     * @param {string} teamId
     * @param {object} teamsState
     * @returns {string} CSS class name
     */
    getColorClass(teamId, teamsState = null) {
        return `team-color-${this.getColorIndex(teamId, teamsState)}`;
    },

    /**
     * Get CSS class for team glow effect
     * @param {string} teamId
     * @param {object} teamsState
     * @returns {string} CSS class name
     */
    getGlowClass(teamId, teamsState = null) {
        return `team-glow-${this.getColorIndex(teamId, teamsState)}`;
    },

    /**
     * Get CSS class for team background
     * @param {string} teamId
     * @param {object} teamsState
     * @returns {string} CSS class name
     */
    getBgClass(teamId, teamsState = null) {
        return `team-bg-${this.getColorIndex(teamId, teamsState)}`;
    },

    /**
     * Get CSS class for team border/card
     * @param {string} teamId
     * @param {object} teamsState
     * @returns {string} CSS class name
     */
    getBorderClass(teamId, teamsState = null) {
        return `team-card-${this.getColorIndex(teamId, teamsState)}`;
    },

    /**
     * Get CSS class for team row (scoreboard)
     * @param {string} teamId
     * @param {object} teamsState
     * @returns {string} CSS class name
     */
    getRowClass(teamId, teamsState = null) {
        return `team-row-${this.getColorIndex(teamId, teamsState)}`;
    },

    /**
     * Get CSS class for team indicator
     * @param {string} teamId
     * @param {object} teamsState
     * @returns {string} CSS class name
     */
    getIndicatorClass(teamId, teamsState = null) {
        return `team-ind-${this.getColorIndex(teamId, teamsState)}`;
    },

    /**
     * Get the actual hex color value for a team
     * @param {string} teamId
     * @param {object} teamsState
     * @returns {string} Hex color value
     */
    getColorValue(teamId, teamsState = null) {
        const index = this.getColorIndex(teamId, teamsState);
        return this.colors[index - 1] || this.colors[0];
    },

    /**
     * Get color by index directly (1-8)
     * @param {number} index
     * @returns {string} Hex color value
     */
    getColor(index) {
        return this.colors[(index - 1) % this.maxColors] || this.colors[0];
    }
};

export default TeamColors;
