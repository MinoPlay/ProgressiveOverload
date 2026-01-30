// Configuration Constants
// Central location for application configuration

export const CONFIG = {
    // ═══════════════════════════════════════════════════════════════
    // DEVELOPMENT MODE
    // ═══════════════════════════════════════════════════════════════
    // Set to 'true' for local testing with dummy data (no GitHub required)
    // Set to 'false' for production (uses GitHub API)
    // 
    // ⚠️  IMPORTANT: Must be 'false' when deploying to production!
    // ═══════════════════════════════════════════════════════════════
    devMode: false,

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
