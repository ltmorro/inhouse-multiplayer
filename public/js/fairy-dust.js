/**
 * Fairy Dust Particle System
 * Lightweight particle effects for storybook magic
 * "Every interaction leaves a trail of wonder"
 */

(function() {
    'use strict';

    // Particle colors by variant
    const COLORS = {
        gold: ['#FFE5B4', '#FFCC80', '#FFF8DC', '#FFD699'],
        ice: ['#87CEEB', '#ADD8E6', '#E0F4FF', '#B8C5E8'],
        mixed: ['#FFE5B4', '#87CEEB', '#B8C5E8', '#FFF8DC']
    };

    /**
     * FairyDustEmitter class
     * Creates and manages particle bursts
     */
    class FairyDustEmitter {
        constructor() {
            this.container = null;
            this.init();
        }

        init() {
            // Create container if it doesn't exist
            if (!this.container) {
                this.container = document.createElement('div');
                this.container.className = 'fairy-dust-container';
                this.container.setAttribute('aria-hidden', 'true');
                document.body.appendChild(this.container);
            }
        }

        /**
         * Emit particles at a position
         * @param {number} x - X position
         * @param {number} y - Y position
         * @param {Object} options - Configuration options
         */
        emit(x, y, options = {}) {
            const {
                count = 8,
                variant = 'gold',
                spread = 40,
                duration = 800,
                size = 6
            } = options;

            const palette = COLORS[variant] || COLORS.gold;

            for (let i = 0; i < count; i++) {
                this.createParticle(x, y, {
                    color: palette[Math.floor(Math.random() * palette.length)],
                    angle: (Math.random() * 360) * (Math.PI / 180),
                    distance: 15 + Math.random() * spread,
                    duration: duration + Math.random() * 200,
                    delay: Math.random() * 100,
                    size: size * (0.5 + Math.random() * 0.5)
                });
            }
        }

        /**
         * Create a single particle
         */
        createParticle(x, y, config) {
            const particle = document.createElement('div');
            particle.className = 'fairy-particle';

            // Style the particle
            Object.assign(particle.style, {
                left: `${x}px`,
                top: `${y}px`,
                width: `${config.size}px`,
                height: `${config.size}px`,
                background: config.color,
                boxShadow: `0 0 ${config.size}px ${config.color}`,
                '--angle': `${config.angle}rad`,
                '--distance': `${config.distance}px`,
                animationDuration: `${config.duration}ms`,
                animationDelay: `${config.delay}ms`
            });

            this.container.appendChild(particle);

            // Remove after animation
            setTimeout(() => {
                if (particle.parentNode) {
                    particle.remove();
                }
            }, config.duration + config.delay + 100);
        }

        /**
         * Emit particles from an element's center
         * @param {HTMLElement} element
         * @param {Object} options
         */
        emitFromElement(element, options = {}) {
            if (!element) return;

            const rect = element.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;

            this.emit(x, y, options);
        }

        /**
         * Create a trail effect (for dragging)
         * @param {number} x
         * @param {number} y
         */
        trail(x, y) {
            this.emit(x, y, {
                count: 2,
                variant: 'ice',
                spread: 15,
                duration: 500,
                size: 4
            });
        }

        /**
         * Celebration burst (for victories)
         * @param {number} x
         * @param {number} y
         */
        celebrate(x, y) {
            this.emit(x, y, {
                count: 20,
                variant: 'mixed',
                spread: 80,
                duration: 1200,
                size: 8
            });
        }

        /**
         * Gentle sparkle (for correct answers)
         * @param {number} x
         * @param {number} y
         */
        sparkle(x, y) {
            this.emit(x, y, {
                count: 6,
                variant: 'gold',
                spread: 30,
                duration: 600,
                size: 5
            });
        }

        /**
         * Ice shimmer (for buttons)
         * @param {number} x
         * @param {number} y
         */
        shimmer(x, y) {
            this.emit(x, y, {
                count: 4,
                variant: 'ice',
                spread: 25,
                duration: 500,
                size: 4
            });
        }
    }

    /**
     * Soft Haptics helper
     * Provides gentle vibration feedback when supported
     */
    const Haptics = {
        gentle() {
            if ('vibrate' in navigator) {
                navigator.vibrate(10);
            }
        },

        medium() {
            if ('vibrate' in navigator) {
                navigator.vibrate(15);
            }
        },

        celebration() {
            if ('vibrate' in navigator) {
                navigator.vibrate([10, 50, 10, 50, 20]);
            }
        },

        error() {
            if ('vibrate' in navigator) {
                navigator.vibrate([50, 30, 50]);
            }
        }
    };

    /**
     * Auto-attach fairy dust to buttons
     * Adds sparkle effect on click/tap
     */
    function attachToButtons() {
        document.addEventListener('click', (e) => {
            const button = e.target.closest('button, .frost-btn, .enchanted-btn');
            if (button && !button.disabled) {
                window.fairyDust.shimmer(e.clientX, e.clientY);
                Haptics.gentle();
            }
        });
    }

    // Initialize and expose globally
    window.fairyDust = new FairyDustEmitter();
    // Note: Do NOT set window.Haptics here - it's set by globals.ts with a more complete API

    // Auto-attach when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachToButtons);
    } else {
        attachToButtons();
    }

    // Re-attach after Astro page transitions
    document.addEventListener('astro:page-load', attachToButtons);

})();
