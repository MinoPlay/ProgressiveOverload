// Authentication Module
// Handles GitHub Personal Access Token storage

const AUTH_KEY = 'github_pat';

export const Auth = {
    /**
     * Get stored token from localStorage
     * @returns {string|null} The stored token or null
     */
    getToken() {
        return localStorage.getItem(AUTH_KEY);
    },

    /**
     * Store token in localStorage
     * @param {string} token - The GitHub Personal Access Token
     */
    setToken(token) {
        localStorage.setItem(AUTH_KEY, token.trim());
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
            this.setToken(token.trim());
            return token.trim();
        }
        return null;
    }
};
