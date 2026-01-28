// Main Application
// Initializes and coordinates all modules

import { Auth } from './auth.js';
import { Storage } from './storage.js';
import { Exercises } from './exercises.js';
import { Workouts } from './workouts.js';
import { Charts } from './charts.js';

/**
 * Main App object
 */
const App = {
    /**
     * Initialize application
     */
    async init() {
        console.log('Progressive Overload Tracker - Initializing...');

        // Check for token
        if (!Auth.isAuthenticated()) {
            const token = Auth.promptForToken();
            if (!token) {
                alert('GitHub token is required to use this app.');
                return;
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
            // Initialize storage (load data from GitHub)
            await Storage.initialize();

            console.log('Initializing UI modules...');
            // Initialize all modules
            this.initNavigation();
            Exercises.init();
            Workouts.init();
            Charts.init();

            // Hide loading
            showLoading(false);

            console.log('Application initialized successfully');
            showToast('Welcome to Progressive Overload Tracker!', 'success');
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
    toast.innerHTML = `
        <span>${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    // Auto remove after 4 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            container.removeChild(toast);
        }, 300);
    }, 4000);
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
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
