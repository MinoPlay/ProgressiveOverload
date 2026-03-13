// Main Application
// Initializes and coordinates all modules

import { Auth } from './auth.js';
import { Storage } from './storage.js';
import { Exercises } from './exercises.js';
import { Workouts } from './workouts.js';
import { Charts } from './charts.js';
import { History } from './history.js';
import { Templates } from './templates.js';
import { CONFIG, loadConfig } from './config.js';

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
        const next = current === 'dark' ? 'light' : 'dark';
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
        const isDark = theme === 'dark';
        const textColor    = isDark ? '#9090aa' : '#666666';
        const gridColor    = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
        const borderColor  = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)';

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
        iconEl.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
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
        } else {
            // Check for token in production mode
            if (!Auth.isAuthenticated()) {
                const token = Auth.promptForToken();
                if (!token) {
                    alert('GitHub token is required to use this app.');
                    return;
                }
            }
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
            // Initialize all modules
            Exercises.init();
            Workouts.init();
            History.init();
            Charts.init();
            Templates.init();

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
        const navElements = document.querySelectorAll('.nav-btn[data-section], .dropdown-item[data-section]');

        // Section label map for the trigger button
        const sectionLabels = {
            workout: 'Workout',
            history: 'History',
            statistics: 'Statistics',
            exercises: 'Manage'
        };

        const activeNavLabel = document.getElementById('activeNavLabel');
        const dropdownTrigger = document.getElementById('mainNavTrigger');
        const dropdownContent = document.getElementById('mainNavContent');
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

        const closeDropdown = () => {
            if (dropdownTrigger && dropdownContent) {
                dropdownTrigger.setAttribute('aria-expanded', 'false');
                dropdownContent.style.display = 'none';
            }
        };

        const switchSection = (targetSection) => {
            if (!targetSection) return;

            const targetSectionElement = document.getElementById(`${targetSection}Section`);
            if (!targetSectionElement) {
                targetSection = 'workout';
            }

            // Update the trigger label
            if (activeNavLabel && sectionLabels[targetSection]) {
                activeNavLabel.textContent = sectionLabels[targetSection];
            }

            // Update active state for dropdown items
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

            // Save to localStorage for persistence
            localStorage.setItem('activeSection', targetSection);
        };

        // Nav item clicks — switch section and close dropdown
        navElements.forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const targetSection = el.dataset.section;
                if (targetSection) {
                    switchSection(targetSection);
                    closeDropdown();
                }
            });
        });

        // Toggle dropdown on trigger click
        if (dropdownTrigger && dropdownContent) {
            dropdownTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const isExpanded = dropdownTrigger.getAttribute('aria-expanded') === 'true';
                dropdownTrigger.setAttribute('aria-expanded', String(!isExpanded));
                dropdownContent.style.display = isExpanded ? 'none' : 'block';
            });

            // Keep dropdown open when clicking inside the config area
            dropdownContent.addEventListener('click', (e) => {
                // Only stop propagation for config interactions (not nav items — those close it)
                if (!e.target.closest('.nav-btn[data-section]') && !e.target.closest('.dropdown-item[data-section]')) {
                    e.stopPropagation();
                }
            });

            // Close dropdown when clicking outside (capture phase so it's reliable
            // even when inner controls stop bubbling click events)
            document.addEventListener('pointerdown', (e) => {
                const navContainer = dropdownTrigger.closest('.main-nav-dropdown');
                if (!navContainer) {
                    closeDropdown();
                    return;
                }

                if (!navContainer.contains(e.target)) {
                    closeDropdown();
                }
            }, true);
        }

        window.addEventListener('resize', () => {
            const activeSection = localStorage.getItem('activeSection') || 'workout';
            if (activeSection === 'workout') {
                updateWorkoutPaneHeight();
            }
        });

        // Config collapsible toggle
        const configToggleBtn = document.getElementById('configToggleBtn');
        const configBody = document.getElementById('configBody');
        const configChevron = document.getElementById('configChevron');
        if (configToggleBtn && configBody) {
            configToggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isHidden = configBody.style.display === 'none';
                configBody.style.display = isHidden ? 'block' : 'none';
                if (configChevron) {
                    configChevron.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
                }
            });
        }

        // Restore saved section on load
        const savedSection = localStorage.getItem('activeSection') || 'workout';
        switchSection(savedSection);

        // Expose switchSection for potential use from other modules
        this.switchSection = switchSection;
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
