// Configuration Constants
// Central location for application configuration

export const CONFIG = {
    // Supabase public browser configuration
    supabase: {
        url: 'https://clkhiheomufzytfxrezn.supabase.co',
        publishableKey: 'sb_publishable_51bQnrp9ags37FqQxeXYew_gbTj5e1e',
        schema: 'progressive_overload'
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

/**
 * Check if public Supabase browser configuration is available.
 * @returns {boolean}
 */
export function isSupabaseConfigured() {
    return !!(CONFIG.supabase.url && CONFIG.supabase.publishableKey);
}

/**
 * Invalidate the service worker cache and reload with the latest version from the remote
 */
window.refreshCache = async function () {
    try {
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(key => caches.delete(key)));
        }
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(reg => reg.unregister()));
        }
        showStatus('Cache cleared, reloading...', 'success');
        setTimeout(() => location.reload(true), 500);
    } catch (err) {
        console.warn('Failed to refresh cache:', err);
        showStatus('Failed to refresh cache', 'error');
    }
};

// Show status message helper
function showStatus(message, type) {
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
    } else {
        console.log(`[${type}] ${message}`);
    }
}
