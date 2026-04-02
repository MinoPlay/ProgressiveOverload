// Main Application
// Initializes and coordinates all modules

import { Auth } from './auth.js';
import { Storage } from './storage.js';
import { Exercises } from './exercises.js';
import { Workouts } from './workouts.js';
import { Charts } from './charts.js';
import { History } from './history.js';
import { Templates } from './templates.js';
import { CONFIG, loadConfig, isGitHubConfigured } from './config.js';

/**
 * Theme management
 */
const Theme = {
    STORAGE_KEY: 'theme',

    /** Apply saved theme before content renders to avoid flash */
    applyEarly() {
        const saved = localStorage.getItem(this.STORAGE_KEY) || 'light';
        document.documentElement.setAttribute('data-theme', saved);
        this._applyChartDefaults(saved);
    },

    /** Wire up the toggle button and sync its icon */
    init() {
        const saved = localStorage.getItem(this.STORAGE_KEY) || 'light';
        document.documentElement.setAttribute('data-theme', saved);
        this._syncIcon(saved);
        this._applyChartDefaults(saved);

        const btn = document.getElementById('themeToggleBtn');
        if (btn) {
            btn.addEventListener('click', () => this.toggle());
        }

    },

    toggle() {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        const next = current === 'light' ? 'dark' : current === 'dark' ? 'green' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem(this.STORAGE_KEY, next);
        this._syncIcon(next);
        this._applyChartDefaults(next);
        // Re-render charts so they pick up new grid/label colors
        window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: next } }));
    },

    /** Update Chart.js global defaults to match current theme */
    _applyChartDefaults(theme) {
        if (typeof window.Chart === 'undefined') return;
        const isDark = theme === 'dark' || theme === 'green';
        const textColor   = theme === 'green' ? '#00b82e' : isDark ? '#9090aa' : '#666666';
        const gridColor   = theme === 'green' ? 'rgba(0, 255, 65, 0.1)' : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
        const borderColor = theme === 'green' ? 'rgba(0, 230, 118, 0.15)' : isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)';

        window.Chart.defaults.color = textColor;
        window.Chart.defaults.borderColor = borderColor;
        if (window.Chart.defaults.scale) {
            if (!window.Chart.defaults.scale.grid) window.Chart.defaults.scale.grid = {};
            window.Chart.defaults.scale.grid.color = gridColor;
        }
        if (window.Chart.defaults.scales) {
            ['x', 'y', 'r'].forEach(axis => {
                if (window.Chart.defaults.scales[axis]) {
                    if (!window.Chart.defaults.scales[axis].grid) window.Chart.defaults.scales[axis].grid = {};
                    window.Chart.defaults.scales[axis].grid.color = gridColor;
                    if (!window.Chart.defaults.scales[axis].ticks) window.Chart.defaults.scales[axis].ticks = {};
                    window.Chart.defaults.scales[axis].ticks.color = textColor;
                }
            });
        }
        // Legend and title
        if (window.Chart.defaults.plugins?.legend?.labels) {
            window.Chart.defaults.plugins.legend.labels.color = textColor;
        }
    },

    _syncIcon(theme) {
        const iconEl = document.getElementById('themeToggleIcon');
        if (!iconEl) return;
        const icons = { light: 'moon', dark: 'terminal', green: 'sun' };
        iconEl.setAttribute('data-lucide', icons[theme] || 'moon');
        if (window.lucide) window.lucide.createIcons();
    }
};

// Apply theme immediately to avoid flash of unstyled content
Theme.applyEarly();

/**
 * Main App object
 */
const App = {
    /**
     * Initialize application
     */
    async init() {
        console.log('Progressive Pumping!!! - Initializing...');

        // Load configuration first
        loadConfig();

        // In dev mode, skip authentication
        if (CONFIG.devMode) {
            console.log('🧪 Running in DEVELOPMENT MODE');
            console.log('📝 Using local dummy data - changes will not be saved');
        } else if (!isGitHubConfigured()) {
            // No GitHub config — activate guest/demo mode using dev-data
            CONFIG.devMode = true;
            console.log('👤 No GitHub config found — running in guest demo mode');
        }

        // Show app
        document.getElementById('app').style.display = 'block';

        // Initialize theme toggle
        Theme.init();

        // Initialize
        await this.initApp();

        // Initialize Lucide icons
        if (window.lucide) {
            window.lucide.createIcons();
        }
    },

    /**
     * Initialize main application after authentication
     */
    async initApp() {
        try {
            // Show loading
            showLoading(true);

            // Initialize navigation early so config menu stays usable
            // even if GitHub initialization fails (e.g., expired token)
            this.initNavigation();

            console.log('Initializing storage...');

            // In dev mode, replace Storage methods with DevStorage
            if (CONFIG.devMode) {
                const { DevStorage } = await import('./dev-storage.js');
                Object.assign(Storage, DevStorage);
            }

            // Initialize storage
            await Storage.initialize();
            
            // Debug: Check if exercises loaded
            console.log(`Loaded ${Storage.getExercises().length} exercises`);

            // Initialize iframe bridge (send exercise data to embedded iframes)
            IframeBridge.init();
            
            // Give iframes a moment to set up their message listeners, then broadcast data
            setTimeout(() => {
                IframeBridge.broadcastExercises();
                IframeBridge.broadcastTemplates();
                IframeBridge.broadcastWorkouts();
            }, 100);

            console.log('Initializing UI modules...');
            // Initialize always-needed modules
            Exercises.init();
            Workouts.init();
            Templates.init();
            // Initialize whichever tab is currently active (History/Statistics are lazy)
            this.initActiveTab?.();

            // Hide loading
            showLoading(false);

            console.log('Application initialized successfully');
        } catch (error) {
            console.error('Error initializing application:', error);
            showToast(`Failed to initialize app: ${error.message}`, 'error');
            showLoading(false);

            // Show app anyway so user isn't stuck
            document.getElementById('app').style.display = 'block';
        }
    },

    /**
     * Initialize navigation between sections
     */
    initNavigation() {
        const navElements = document.querySelectorAll('.nav-btn[data-section]');

        const configTrigger = document.getElementById('configNavTrigger');
        const configContent = document.getElementById('configNavContent');
        const appContent = document.querySelector('.app-content');
        const workoutPane = document.getElementById('workoutPane');

        const updateWorkoutPaneHeight = () => {
            if (!appContent || !workoutPane) return;
            const styles = window.getComputedStyle(appContent);
            const paddingBottom = parseFloat(styles.paddingBottom) || 0;
            const workoutSection = document.getElementById('workoutSection');
            const viewportHeight = Math.floor(window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight);
            const workoutTop = workoutSection?.getBoundingClientRect().top ?? appContent.getBoundingClientRect().top;
            const availableHeight = Math.max(320, Math.floor(viewportHeight - workoutTop - paddingBottom));

            if (workoutSection) {
                workoutSection.style.height = `${availableHeight}px`;
                workoutSection.style.minHeight = `${availableHeight}px`;
                workoutSection.style.overflow = 'hidden';
            }
            workoutPane.style.height = `${availableHeight}px`;
        };

        const closeConfig = () => {
            if (configTrigger && configContent) {
                configTrigger.setAttribute('aria-expanded', 'false');
                configContent.style.display = 'none';
            }
        };

        const _initializedTabs = new Set();

        const switchSection = (targetSection, skipLazyInit = false) => {
            if (!targetSection) return;

            const targetSectionElement = document.getElementById(`${targetSection}Section`);
            if (!targetSectionElement) {
                targetSection = 'workout';
            }

            // Update active state for nav icons
            navElements.forEach(el => {
                if (el.dataset.section === targetSection) {
                    el.classList.add('active');
                    el.setAttribute('aria-current', 'page');
                } else {
                    el.classList.remove('active');
                    el.removeAttribute('aria-current');
                }
            });

            // Update active section visibility
            const sections = document.querySelectorAll('.content-section');
            sections.forEach(section => {
                section.classList.toggle('active', section.id === `${targetSection}Section`);
            });

            if (targetSection === 'workout') {
                updateWorkoutPaneHeight();
            }

            // Lazy-initialize tabs on first visit (skip during initial restore — storage not ready yet)
            if (!skipLazyInit && !_initializedTabs.has(targetSection)) {
                _initializedTabs.add(targetSection);
                if (targetSection === 'history') {
                    History.init();
                } else if (targetSection === 'statistics') {
                    Charts.init();
                }
            }

            // Save to localStorage for persistence
            localStorage.setItem('activeSection', targetSection);
        };

        // Nav icon clicks — switch section
        navElements.forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const targetSection = el.dataset.section;
                if (targetSection) {
                    switchSection(targetSection);
                }
            });
        });

        // Config dropdown toggle
        if (configTrigger && configContent) {
            configTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const isExpanded = configTrigger.getAttribute('aria-expanded') === 'true';
                configTrigger.setAttribute('aria-expanded', String(!isExpanded));
                configContent.style.display = isExpanded ? 'none' : 'block';
            });

            configContent.addEventListener('click', (e) => {
                e.stopPropagation();
            });

            document.addEventListener('pointerdown', (e) => {
                const navContainer = configTrigger.closest('.nav-dropdown');
                if (!navContainer || !navContainer.contains(e.target)) {
                    closeConfig();
                }
            }, true);
        }

        window.addEventListener('resize', () => {
            const activeSection = localStorage.getItem('activeSection') || 'workout';
            if (activeSection === 'workout') {
                updateWorkoutPaneHeight();
            }
        });

        // Restore saved section on load — skip lazy init (storage not ready yet)
        const savedSection = localStorage.getItem('activeSection') || 'workout';
        switchSection(savedSection, true);

        // Expose switchSection for potential use from other modules
        this.switchSection = switchSection;

        // Called by initApp after storage is ready to init the active tab
        this.initActiveTab = () => {
            const active = localStorage.getItem('activeSection') || 'workout';
            if (!_initializedTabs.has(active)) {
                _initializedTabs.add(active);
                if (active === 'history') History.init();
                else if (active === 'statistics') Charts.init();
            }
        };
    }
};

/**
 * Show/hide loading indicator
 * @param {boolean} show - Whether to show or hide
 */
export function showLoading(show) {
    const loader = document.getElementById('loadingIndicator');
    loader.style.display = show ? 'flex' : 'none';
}

/**
 * Show toast notification
 * @param {string} message - Message to display
 * @param {string} type - Type: 'success', 'error', 'info'
 */
export function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');

    const span = document.createElement('span');
    span.textContent = message; // Automatically escaped, safe from XSS
    toast.appendChild(span);

    container.appendChild(toast);

    // Auto remove after configured duration
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            if (container.contains(toast)) {
                container.removeChild(toast);
            }
        }, CONFIG.toast.fadeOutDuration);
    }, CONFIG.toast.duration);
}

/**
 * Deprecated: Use textContent instead
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 * @deprecated
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Iframe Bridge
 * Sends exercise data and templates from parent Storage to embedded iframes via postMessage.
 * Listens for iframe requests and forwards exercisesUpdated / templatesUpdated events.
 */
const IframeBridge = {
    frames: [],

    init() {
        const workoutFrame = document.querySelector('#workoutPane iframe');
        this.frames = [workoutFrame].filter(Boolean);

        if (!this.frames.length) return;

        // Listen for messages from iframes
        window.addEventListener('message', (e) => this.handleMessage(e));

        // Send data when each iframe (re)loads
        this.frames.forEach(frame => {
            frame.addEventListener('load', () => this.sendAllData(frame));
        });

        // Forward parent events to iframes
        window.addEventListener('exercisesUpdated', () => this.broadcastExercises());
        window.addEventListener('templatesUpdated', () => this.broadcastTemplates());

        console.log('Iframe bridge initialized');
    },

    /** Send exercises + templates + workouts to a single iframe */
    sendAllData(frame) {
        try {
            this.sendExercises(frame);
            this.sendTemplates(frame);
            this.sendWorkouts(frame);
        } catch (err) {
            console.warn('IframeBridge: could not send data to iframe', err);
        }
    },

    sendExercises(frame) {
        const exercises = Storage.getExercises();
        console.log(`[IframeBridge] Sending ${exercises.length} exercises to iframe`);
        frame.contentWindow?.postMessage({ type: 'po-exercises', exercises }, '*');
    },

    sendTemplates(frame) {
        const templates = Storage.sessionTemplates || [];
        frame.contentWindow?.postMessage({ type: 'po-templates', templates }, '*');
    },

    sendWorkouts(frame) {
        const workouts = Storage.currentMonthWorkouts || [];
        frame.contentWindow?.postMessage({ type: 'po-workouts', workouts }, '*');
    },

    /** Broadcast exercises to every iframe */
    broadcastExercises() {
        this.frames.forEach(f => this.sendExercises(f));
    },

    /** Broadcast templates to every iframe */
    broadcastTemplates() {
        this.frames.forEach(f => this.sendTemplates(f));
    },

    /** Broadcast workouts to every iframe */
    broadcastWorkouts() {
        this.frames.forEach(f => this.sendWorkouts(f));
    },

    /** Handle incoming postMessage from iframes */
    handleMessage(event) {
        const msg = event.data;
        if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('po-')) return;

        // Find the frame that sent the message
        const sourceFrame = this.frames.find(f => f.contentWindow === event.source);
        if (!sourceFrame) return;

        switch (msg.type) {
            case 'po-request-exercises':
                this.sendExercises(sourceFrame);
                break;
            case 'po-request-templates':
                this.sendTemplates(sourceFrame);
                break;
            case 'po-request-workouts':
                this.sendWorkouts(sourceFrame);
                break;
            case 'po-save-workouts':
                Storage.addWorkoutsBatch(msg.workouts)
                    .then(() => {
                        event.source.postMessage({ type: 'po-workouts-saved' }, '*');
                        this.broadcastWorkouts();
                    })
                    .catch(err => {
                        event.source.postMessage({ type: 'po-save-error', error: err.message }, '*');
                    });
                break;
            default:
                break;
        }
    }
};

// Initialize app when DOM is ready — only on the main app page (index.html)
if (document.getElementById('app')) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => App.init());
    } else {
        App.init();
    }
}

// Make showToast available globally
window.showToast = showToast;
