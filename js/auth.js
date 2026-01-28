// Authentication Module
// Handles GitHub Personal Access Token storage and validation

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
     * Remove token from localStorage
     */
    clearToken() {
        localStorage.removeItem(AUTH_KEY);
    },

    /**
     * Check if user is authenticated
     * @returns {boolean} True if token exists
     */
    isAuthenticated() {
        return !!this.getToken();
    },

    /**
     * Validate token by making test API call to GitHub
     * @param {string} token - Token to validate
     * @returns {Promise<{valid: boolean, user?: object, error?: string}>}
     */
    async validateToken(token) {
        try {
            const response = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                const user = await response.json();
                return { valid: true, user };
            } else if (response.status === 401) {
                return { valid: false, error: 'Invalid token. Please check and try again.' };
            } else if (response.status === 403) {
                return { valid: false, error: 'Token does not have required permissions. Ensure "repo" scope is enabled.' };
            } else {
                return { valid: false, error: `GitHub API error: ${response.status}` };
            }
        } catch (error) {
            return { valid: false, error: `Network error: ${error.message}` };
        }
    },

    /**
     * Initialize authentication UI
     */
    initAuthModal() {
        const modal = document.getElementById('authModal');
        const tokenInput = document.getElementById('tokenInput');
        const submitBtn = document.getElementById('authSubmit');
        const errorDiv = document.getElementById('authError');

        // Show/hide modal based on auth state
        if (this.isAuthenticated()) {
            modal.style.display = 'none';
            return true;
        } else {
            modal.style.display = 'flex';
            tokenInput.focus();
        }

        // Handle form submission
        const handleSubmit = async () => {
            const token = tokenInput.value.trim();
            
            if (!token) {
                this.showError(errorDiv, 'Please enter your Personal Access Token');
                return;
            }

            // Disable button during validation
            submitBtn.disabled = true;
            submitBtn.textContent = 'Validating...';
            errorDiv.style.display = 'none';

            // Validate token
            const result = await this.validateToken(token);

            if (result.valid) {
                // Store token and reload app
                this.setToken(token);
                modal.style.display = 'none';
                document.getElementById('app').style.display = 'block';
                
                // Dispatch event for app initialization
                window.dispatchEvent(new CustomEvent('authenticated', { detail: result.user }));
            } else {
                // Show error
                this.showError(errorDiv, result.error);
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save & Continue';
            }
        };

        // Event listeners
        submitBtn.addEventListener('click', handleSubmit);
        tokenInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleSubmit();
            }
        });

        return false;
    },

    /**
     * Initialize logout button
     */
    initLogoutButton() {
        const logoutBtn = document.getElementById('logoutBtn');
        
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to logout? Your token will be removed from this browser.')) {
                    this.clearToken();
                    window.location.reload();
                }
            });
        }
    },

    /**
     * Show error message in auth modal
     * @param {HTMLElement} errorDiv - Error message container
     * @param {string} message - Error message to display
     */
    showError(errorDiv, message) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }
};
