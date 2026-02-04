// Configuration Constants
// Central location for application configuration

export const CONFIG = {
    // ═══════════════════════════════════════════════════════════════
    // DEVELOPMENT MODE
    // ═══════════════════════════════════════════════════════════════
    // Set to 'true' for local testing with dummy data (no GitHub required)
    // Set to 'false' for production (uses GitHub API)
    // 
    // 🧂 Automatically detects local environment
    // ═══════════════════════════════════════════════════════════════
    devMode: window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.protocol === 'file:',

    // GitHub Configuration
    github: {
        apiUrl: 'https://api.github.com',
        owner: 'MinoPlay',
        repo: 'ProgressiveOverload',
        branch: 'main'
    },

    // Storage Keys
    storage: {
        authKey: 'github_pat'
    },

    // File Paths
    paths: {
        exercises: 'data/exercises.json',
        workoutsPrefix: 'data/workouts-'
    },

    // UI Limits
    limits: {
        recentWorkoutsCount: 20,
        maxExerciseNameLength: 100,
        maxNotesLength: 500,
        maxReps: 999,
        minReps: 1,
        maxWeight: 9999,
        minWeight: 0
    },

    // Toast Settings
    toast: {
        duration: 4000,
        fadeOutDuration: 300
    },

    // Chart Settings
    charts: {
        defaultView: '10sessions',
        maxSessionsView: 10,
        maxChartHeight: 400,
        colors: {
            primary: 'rgb(102, 126, 234)',
            primaryLight: 'rgba(102, 126, 234, 0.1)',
            secondary: 'rgba(102, 126, 234, 0.6)'
        }
    },

    // Default Exercises
    defaultExercises: [
        { name: 'Bench Press', equipmentType: 'barbell' },
        { name: 'Squat', equipmentType: 'barbell' },
        { name: 'Deadlift', equipmentType: 'barbell' },
        { name: 'Pull-ups', equipmentType: 'bodyweight' },
        { name: 'Overhead Press', equipmentType: 'barbell' },
        { name: 'Barbell Rows', equipmentType: 'barbell' },
        { name: 'Dips', equipmentType: 'bodyweight' },
        { name: 'Bicep Curls', equipmentType: 'dumbbell' }
    ],

    // Equipment Types
    equipmentTypes: {
        barbell: { label: 'Barbell', requiresWeight: true },
        dumbbell: { label: 'Dumbbell', requiresWeight: true },
        kettlebell: { label: 'Kettlebell', requiresWeight: true },
        machines: { label: 'Machines', requiresWeight: true },
        bodyweight: { label: 'Bodyweight', requiresWeight: false },
        'bodyweight+': { label: 'Bodyweight+', requiresWeight: true }
    }
};

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION MANAGEMENT
// ═══════════════════════════════════════════════════════════════

const CONFIG_KEY = 'app_config';

// Global config state
let config = {
    mode: 'local',
    token: '',
    owner: '',
    repo: ''
};

/**
 * Load configuration from localStorage
 */
export function loadConfig() {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (saved) {
        config = JSON.parse(saved);
        document.getElementById('github-token').value = config.token || '';
        document.getElementById('repo-owner').value = config.owner || '';
        document.getElementById('repo-name').value = config.repo || '';
        config.mode = config.mode || 'local';

        if (config.mode === 'local' || isConfigured()) {
            document.getElementById('config-section').classList.add('collapsed');
        }
    } else {
        config.mode = 'local';
    }

    // Update UI to reflect current mode
    updateModeUI();
}

/**
 * Save configuration to localStorage
 */
window.saveConfig = function () {
    config.token = document.getElementById('github-token').value.trim();
    config.owner = document.getElementById('repo-owner').value.trim();
    config.repo = document.getElementById('repo-name').value.trim();

    if (!config.token || !config.owner || !config.repo) {
        showStatus('Please fill in all configuration fields', 'error');
        return;
    }

    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    showStatus('Configuration saved! Reloading...', 'success');
    document.getElementById('config-section').classList.add('collapsed');

    // Reload the page to apply new configuration
    setTimeout(() => {
        location.reload();
    }, 1000);
};


/**
 * Toggle configuration panel visibility
 */
window.toggleConfig = function () {
    document.getElementById('config-section').classList.toggle('collapsed');
};

/**
 * Check if GitHub configuration is complete
 */
function isConfigured() {
    return config.token && config.owner && config.repo;
}

/**
 * Set mode (local or github)
 */
window.setMode = function (mode) {
    config.mode = mode;
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    updateModeUI();
    showStatus(`Switched to ${mode === 'local' ? 'Local' : 'GitHub'} mode`, 'success');
};

/**
 * Update UI based on current mode
 */
function updateModeUI() {
    const isLocal = config.mode === 'local';

    // Update mode buttons
    document.getElementById('mode-local').classList.toggle('active', isLocal);
    document.getElementById('mode-github').classList.toggle('active', !isLocal);

    // Show/hide appropriate controls
    document.getElementById('github-config').style.display = isLocal ? 'none' : 'block';
    document.getElementById('local-controls').style.display = isLocal ? 'flex' : 'none';
    document.getElementById('github-help').style.display = isLocal ? 'none' : 'block';
    document.getElementById('local-help').style.display = isLocal ? 'block' : 'none';
}

/**
 * Generate dummy data for local testing
 */
window.generateDummyData = function () {
    if (confirm('Generate sample workout and exercise data? This will not overwrite existing data.')) {
        // This function should be implemented to generate sample data
        showStatus('Sample data generation not yet implemented', 'info');
    }
};

/**
 * Clear all local data
 */
window.clearLocalData = function () {
    if (confirm('⚠️ This will delete ALL local data including exercises and workouts. Are you sure?')) {
        localStorage.clear();
        showStatus('All local data cleared', 'success');
        setTimeout(() => location.reload(), 1000);
    }
};

/**
 * Get current configuration
 */
export function getConfig() {
    return { ...config };
}

// Show status message helper
function showStatus(message, type) {
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
    } else {
        console.log(`[${type}] ${message}`);
    }
}
