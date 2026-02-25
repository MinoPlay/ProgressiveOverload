// Main Application
// Initializes and coordinates all modules

import { Auth } from './auth.js';
import { Storage } from './storage.js';
import { Exercises } from './exercises.js';
import { Workouts } from './workouts.js';
import { Charts } from './charts.js';
import { History } from './history.js';
import { CONFIG, loadConfig } from './config.js';

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

            console.log('Initializing storage...');

            // In dev mode, replace Storage methods with DevStorage
            if (CONFIG.devMode) {
                const { DevStorage } = await import('./dev-storage.js');
                Object.assign(Storage, DevStorage);
            }

            // Initialize storage
            await Storage.initialize();

            console.log('Initializing UI modules...');
            // Initialize all modules
            this.initNavigation();
            Exercises.init();
            Workouts.init();
            History.init();
            Charts.init();

            // Hide loading
            showLoading(false);

            console.log('Application initialized successfully');
            showToast('Welcome to Progressive Pumping!!!', 'success');
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
            workout: 'Log Workout',
            history: 'History',
            statistics: 'Statistics',
            exercises: 'Manage'
        };

        const activeNavLabel = document.getElementById('activeNavLabel');
        const dropdownTrigger = document.getElementById('mainNavTrigger');
        const dropdownContent = document.getElementById('mainNavContent');

        const closeDropdown = () => {
            if (dropdownTrigger && dropdownContent) {
                dropdownTrigger.setAttribute('aria-expanded', 'false');
                dropdownContent.style.display = 'none';
            }
        };

        const switchSection = (targetSection) => {
            if (!targetSection) return;

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

            // Close dropdown when clicking outside
            document.addEventListener('click', () => {
                closeDropdown();
            });
        }

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

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
} else {
    App.init();
}

// Make showToast available globally
window.showToast = showToast;
