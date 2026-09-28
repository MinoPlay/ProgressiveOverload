// Storage Adapter Selector
// Routes the stable Storage module to GitHub or Supabase persistence.

import { getStorageBackend } from './config.js';
import { GitHubAPI } from './github-api.js';
import { SupabaseAPI } from './supabase-api.js';

function getAdapter() {
    return getStorageBackend() === 'supabase' ? SupabaseAPI : GitHubAPI;
}

export const StorageAPI = {
    initializeUser(...args) {
        return getAdapter().initializeUser?.(...args);
    },
    listFiles(...args) {
        return getAdapter().listFiles(...args);
    },
    getWorkoutFilePath(...args) {
        return getAdapter().getWorkoutFilePath(...args);
    },
    getExercises(...args) {
        return getAdapter().getExercises(...args);
    },
    saveExercises(...args) {
        return getAdapter().saveExercises(...args);
    },
    getWorkouts(...args) {
        return getAdapter().getWorkouts(...args);
    },
    saveWorkouts(...args) {
        return getAdapter().saveWorkouts(...args);
    },
    getWorkoutsInRange(...args) {
        return getAdapter().getWorkoutsInRange(...args);
    },
    getSessionTemplates(...args) {
        return getAdapter().getSessionTemplates(...args);
    },
    saveSessionTemplates(...args) {
        return getAdapter().saveSessionTemplates(...args);
    },
    getStatsSummary(...args) {
        return getAdapter().getStatsSummary(...args);
    },
    saveStatsSummary(...args) {
        return getAdapter().saveStatsSummary(...args);
    },
    getRateLimit(...args) {
        return getAdapter().getRateLimit(...args);
    }
};
