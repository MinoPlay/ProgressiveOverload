// Main Application
// Initializes and coordinates all modules

import { Auth } from './auth.js';
import { Storage } from './storage.js';
import { Exercises } from './exercises.js';
import { Workouts } from './workouts.js';
import { Charts } from './charts.js';
import { History } from './history.js';
import { CONFIG } from './config.js';

/**
 * Main App object
 */
const App = {
    /**
     * Initialize application
     */
    async init() {
        console.log('Progressive Pumping!!! - Initializing...');

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
        const navBtns = document.querySelectorAll('.nav-btn');
        const sections = document.querySelectorAll('.content-section');

        navBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetSection = btn.dataset.section;

                // Update active nav button
                navBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Update active section
                sections.forEach(section => {
                    if (section.id === `${targetSection}Section`) {
                        section.classList.add('active');
                    } else {
                        section.classList.remove('active');
                    }
                });
            });
        });
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
