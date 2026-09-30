// Configuration Constants
// Central location for application configuration

export const CONFIG = {
    // GitHub Configuration
    github: {
        apiUrl: 'https://api.github.com',
        owner: 'MinoPlay',
        repo: 'ProgressiveOverload',
        branch: 'main'
    },

    // Supabase public browser configuration
    supabase: {
        url: 'https://clkhiheomufzytfxrezn.supabase.co',
        publishableKey: 'sb_publishable_51bQnrp9ags37FqQxeXYew_gbTj5e1e',
        schema: 'progressive_overload'
    },

    // Storage Keys
    storage: {
        authKey: 'github_pat'
    },

    // File Paths
    paths: {
        exercises: 'progressive-overload/exercises.json',
        workoutsPrefix: 'progressive-overload/workouts-',
        sessionTemplates: 'progressive-overload/session-templates.json',
        statsSummary: 'progressive-overload/stats-summary.json'
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
        { name: 'Bench Press', equipmentType: 'barbell', muscle: 'chest' },
        { name: 'Squat', equipmentType: 'barbell', muscle: 'legs' },
        { name: 'Deadlift', equipmentType: 'barbell', muscle: 'legs' },
        { name: 'Pull-ups', equipmentType: 'bodyweight', muscle: 'back' },
        { name: 'Overhead Press', equipmentType: 'barbell', muscle: 'shoulders' },
        { name: 'Barbell Rows', equipmentType: 'barbell', muscle: 'back' },
        { name: 'Dips', equipmentType: 'bodyweight', muscle: 'triceps' },
        { name: 'Bicep Curls', equipmentType: 'dumbbell', muscle: 'biceps' }
    ],

    // Equipment Types
    equipmentTypes: {
        barbell: { label: 'Barbell', requiresWeight: true },
        dumbbell: { label: 'Dumbbell', requiresWeight: true },
        kettlebell: { label: 'Kettlebell', requiresWeight: true },
        machines: { label: 'Machines', requiresWeight: true },
        bodyweight: { label: 'Bodyweight', requiresWeight: false },
        'bodyweight+': { label: 'Bodyweight+', requiresWeight: true },
        bands: { label: 'Bands', requiresWeight: false }
    }
};

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION MANAGEMENT
// ═══════════════════════════════════════════════════════════════

const CONFIG_KEY = 'app_config';

// Global config state
let config = {
    mode: 'github',
    storageBackend: 'github',
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
        const tokenEl = document.getElementById('github-token');
        const ownerEl = document.getElementById('repo-owner');
        const repoEl  = document.getElementById('repo-name');
        if (tokenEl) tokenEl.value = config.token || '';
        if (ownerEl) ownerEl.value = config.owner || '';
        if (repoEl)  repoEl.value  = config.repo  || '';
        config.mode = config.mode || 'github';
        config.storageBackend = config.storageBackend || config.mode;
    } else {
        config.mode = 'github';
        config.storageBackend = 'github';
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

    // Close the navigation dropdown
    const trigger = document.getElementById('mainNavTrigger');
    const content = document.getElementById('mainNavContent');
    if (trigger && content) {
        trigger.setAttribute('aria-expanded', 'false');
        content.style.display = 'none';
    }

    // Reload the page to apply new configuration
    setTimeout(() => {
        location.reload();
    }, 1000);
};

/**
 * Get the selected persistence backend.
 * @returns {'local'|'github'|'supabase'}
 */
export function getStorageBackend() {
    const c = getConfig();
    return c.storageBackend || c.mode || 'github';
}

/**
 * Check if GitHub configuration is complete (token + owner + repo all set)
 */
export function isGitHubConfigured() {
    const c = getConfig();
    return !!(c.token && c.owner && c.repo);
}

/**
 * Check if public Supabase browser configuration is available.
 * @returns {boolean}
 */
export function isSupabaseConfigured() {
    return !!(CONFIG.supabase.url && CONFIG.supabase.publishableKey);
}

/**
 * Set persistence mode.
 */
window.setMode = function (mode) {
    config.mode = mode;
    config.storageBackend = mode;
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    updateModeUI();
    const labels = {
        local: 'Local',
        github: 'GitHub',
        supabase: 'Supabase'
    };
    showStatus(`Switched to ${labels[mode] || mode} mode. Reload to apply.`, 'success');
};

/**
 * Update UI based on current mode
 */
function updateModeUI() {
    const backend = config.storageBackend || config.mode || 'github';
    const isLocal = backend === 'local';
    const isGitHub = backend === 'github';
    const isSupabase = backend === 'supabase';

    const modeLocal    = document.getElementById('mode-local');
    const modeGithub   = document.getElementById('mode-github');
    const modeSupabase = document.getElementById('mode-supabase');
    const githubConfig = document.getElementById('github-config');
    const supabaseConfig = document.getElementById('supabase-config');
    const localControls = document.getElementById('local-controls');
    const githubHelp   = document.getElementById('github-help');
    const supabaseHelp = document.getElementById('supabase-help');
    const localHelp    = document.getElementById('local-help');

    if (modeLocal)     modeLocal.classList.toggle('active', isLocal);
    if (modeGithub)    modeGithub.classList.toggle('active', isGitHub);
    if (modeSupabase)  modeSupabase.classList.toggle('active', isSupabase);
    if (githubConfig)  githubConfig.style.display = isGitHub ? 'flex' : 'none';
    if (supabaseConfig) supabaseConfig.style.display = isSupabase ? 'flex' : 'none';
    if (localControls) localControls.style.display = isLocal ? 'flex'  : 'none';
    if (githubHelp)    githubHelp.style.display = isGitHub ? 'block' : 'none';
    if (supabaseHelp)  supabaseHelp.style.display = isSupabase ? 'block' : 'none';
    if (localHelp)     localHelp.style.display     = isLocal ? 'block' : 'none';
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
 * Invalidate the service worker cache and reload with the latest version from the remote
 */
window.refreshCache = async function () {
    try {
        // Only this deploy's caches/SW — main and branch previews share the origin
        const deployId = DeployEnv.currentDeployId();
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.filter(key => DeployEnv.isOwnCache(key, deployId)).map(key => caches.delete(key)));
        }
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations
                .filter(reg => DeployEnv.getDeployId(new URL(reg.scope).pathname) === deployId)
                .map(reg => reg.unregister()));
        }
        showStatus('Cache cleared, reloading...', 'success');
        setTimeout(() => location.reload(true), 500);
    } catch (err) {
        console.warn('Failed to refresh cache:', err);
        showStatus('Failed to refresh cache', 'error');
    }
};

/**
 * Get current configuration
 */
export function getConfig() {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (saved) {
        return { ...config, ...JSON.parse(saved) };
    }
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
