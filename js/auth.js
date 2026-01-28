// Authentication Module
// Handles GitHub Personal Access Token storage

import { CONFIG } from './config.js';

export const Auth = {
    /**
     * Get stored token from localStorage
     * @returns {string|null} The stored token or null
     */
    getToken() {
        return localStorage.getItem(CONFIG.storage.authKey);
    },

    /**
     * Store token in localStorage
     * @param {string} token - The GitHub Personal Access Token
     */
    setToken(token) {
        if (!token || typeof token !== 'string') {
            throw new Error('Invalid token');
        }
        const trimmed = token.trim();
        if (trimmed.length < 10) {
            throw new Error('Token appears to be invalid (too short)');
        }
        localStorage.setItem(CONFIG.storage.authKey, trimmed);
    },

    /**
     * Remove token from localStorage
     */
    clearToken() {
        localStorage.removeItem(CONFIG.storage.authKey);
    },

    /**
     * Check if user is authenticated
     * @returns {boolean} True if token exists
     */
    isAuthenticated() {
        return !!this.getToken();
    },

    /**
     * Get token from user if not stored
     * @returns {string|null}
     */
    promptForToken() {
        const token = prompt(
            'Please enter your GitHub Personal Access Token:\n\n' +
            '1. Go to https://github.com/settings/tokens\n' +
            '2. Generate new token (classic) with "repo" scope\n' +
            '3. Copy and paste it here'
        );
        
        if (token && token.trim()) {
            try {
                this.setToken(token.trim());
                return token.trim();
            } catch (error) {
                alert('Invalid token: ' + error.message);
                return null;
            }
        }
        return null;
    }
};
