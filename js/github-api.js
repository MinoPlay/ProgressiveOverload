// GitHub API Wrapper
// Handles all interactions with GitHub REST API v3

import { Auth } from './auth.js';

const GITHUB_API = 'https://api.github.com';
const REPO_OWNER = 'MinoPlay';
const REPO_NAME = 'ProgressiveOverload';

export const GitHubAPI = {
    /**
     * Get common headers for API requests
     * @returns {object} Headers object
     */
    getHeaders() {
        return {
            'Authorization': `token ${Auth.getToken()}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        };
    },

    /**
     * Get file from repository
     * @param {string} path - File path in repository (e.g., 'data/exercises.json')
     * @returns {Promise<{content: object, sha: string}|null>} File content and SHA
     */
    async getFile(path) {
        try {
            const response = await fetch(
                `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`,
                { headers: this.getHeaders() }
            );

            if (response.status === 404) {
                // File doesn't exist yet
                return null;
            }

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            
            // Decode base64 content
            const content = JSON.parse(atob(data.content));
            
            return {
                content,
                sha: data.sha
            };
        } catch (error) {
            console.error('Error fetching file:', error);
            throw error;
        }
    },

    /**
     * Create or update file in repository
     * @param {string} path - File path in repository
     * @param {object} content - Content to write (will be JSON stringified)
     * @param {string} message - Commit message
     * @param {string|null} sha - File SHA for updates (null for new files)
     * @returns {Promise<object>} Response from GitHub
     */
    async putFile(path, content, message, sha = null) {
        try {
            // Encode content to base64
            const encodedContent = btoa(JSON.stringify(content, null, 2));

            const body = {
                message,
                content: encodedContent
            };

            // Include SHA if updating existing file
            if (sha) {
                body.sha = sha;
            }

            const response = await fetch(
                `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`,
                {
                    method: 'PUT',
                    headers: this.getHeaders(),
                    body: JSON.stringify(body)
                }
            );

            if (!response.ok) {
                if (response.status === 409) {
                    throw new Error('File has been modified. Please refresh and try again.');
                }
                throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error updating file:', error);
            throw error;
        }
    },

    /**
     * Get exercises from repository
     * @returns {Promise<{exercises: array, sha: string}>}
     */
    async getExercises() {
        const result = await this.getFile('data/exercises.json');
        
        if (!result) {
            // Return empty structure if file doesn't exist
            return {
                exercises: [],
                sha: null
            };
        }

        return {
            exercises: result.content.exercises || [],
            sha: result.sha
        };
    },

    /**
     * Save exercises to repository
     * @param {array} exercises - Array of exercise objects
     * @param {string|null} sha - Current file SHA
     * @returns {Promise<object>}
     */
    async saveExercises(exercises, sha = null) {
        // WARNING: This file accepts unlimited growth. 
        // If you create hundreds of exercises, it may eventually exceed 
        // GitHub's 1MB API limit. For typical use (50-100 exercises), this won't be an issue.
        
        const content = { exercises };
        const message = sha 
            ? `Update exercises (${exercises.length} total)`
            : 'Initialize exercises';

        return await this.putFile('data/exercises.json', content, message, sha);
    },

    /**
     * Get workout file path for a given date
     * @param {Date} date - Date object
     * @returns {string} File path (e.g., 'data/workouts-2026-01.json')
     */
    getWorkoutFilePath(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `data/workouts-${year}-${month}.json`;
    },

    /**
     * Get workouts for a specific month
     * @param {Date} date - Any date within the target month
     * @returns {Promise<{workouts: array, sha: string, path: string}>}
     */
    async getWorkouts(date) {
        const path = this.getWorkoutFilePath(date);
        const result = await this.getFile(path);
        
        if (!result) {
            // Return empty structure if file doesn't exist
            return {
                workouts: [],
                sha: null,
                path
            };
        }

        return {
            workouts: result.content.workouts || [],
            sha: result.sha,
            path
        };
    },

    /**
     * Save workouts for a specific month
     * @param {Date} date - Any date within the target month
     * @param {array} workouts - Array of workout objects
     * @param {string|null} sha - Current file SHA
     * @returns {Promise<object>}
     */
    async saveWorkouts(date, workouts, sha = null) {
        const path = this.getWorkoutFilePath(date);
        const content = { workouts };
        
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const message = sha 
            ? `Update workouts for ${year}-${month}`
            : `Initialize workouts for ${year}-${month}`;

        return await this.putFile(path, content, message, sha);
    },

    /**
     * Get workouts across multiple months
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @returns {Promise<array>} Combined array of workouts
     */
    async getWorkoutsInRange(startDate, endDate) {
        const workouts = [];
        const current = new Date(startDate);
        
        // Iterate through each month in the range
        while (current <= endDate) {
            try {
                const monthData = await this.getWorkouts(current);
                workouts.push(...monthData.workouts);
            } catch (error) {
                console.warn(`Could not fetch workouts for ${current.toISOString().slice(0, 7)}:`, error);
            }
            
            // Move to next month
            current.setMonth(current.getMonth() + 1);
        }

        return workouts;
    },

    /**
     * Check API rate limit status
     * @returns {Promise<object>} Rate limit information
     */
    async getRateLimit() {
        try {
            const response = await fetch(
                `${GITHUB_API}/rate_limit`,
                { headers: this.getHeaders() }
            );

            if (response.ok) {
                return await response.json();
            }
            return null;
        } catch (error) {
            console.error('Error checking rate limit:', error);
            return null;
        }
    }
};
