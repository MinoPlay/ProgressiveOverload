// Storage Module
// Central data management layer for exercises and workouts

import { GitHubAPI } from './github-api.js';
import { CONFIG } from './config.js';
import { generateId, parseDate, formatDate } from './utils.js';

export const Storage = {
    // In-memory cache
    exercises: [],
    exercisesSha: null,
    currentMonthWorkouts: [],
    currentMonthSha: null,
    currentMonthPath: null,

    /**
     * Initialize storage by loading exercises and current month workouts
     * @returns {Promise<void>}
     */
    async initialize() {
        await this.loadExercises();
        await this.loadCurrentMonthWorkouts();
        await this.migrateSequenceNumbers();
    },

    /**
     * Migrate existing workouts to add sequence numbers based on ID timestamps
     * @returns {Promise<void>}
     */
    async migrateSequenceNumbers() {
        let needsSave = false;

        // Group workouts by date
        const workoutsByDate = new Map();
        for (const workout of this.currentMonthWorkouts) {
            if (!workoutsByDate.has(workout.date)) {
                workoutsByDate.set(workout.date, []);
            }
            workoutsByDate.get(workout.date).push(workout);
        }

        // Assign sequence numbers to workouts without them
        for (const [date, workouts] of workoutsByDate) {
            // Sort by ID (which includes timestamp) to determine original order
            workouts.sort((a, b) => a.id.localeCompare(b.id));

            workouts.forEach((workout, index) => {
                if (workout.sequence === undefined || workout.sequence === null) {
                    workout.sequence = index + 1;
                    needsSave = true;
                }
            });
        }

        // Save if any migrations were performed
        if (needsSave && this.currentMonthWorkouts.length > 0) {
            const now = new Date();
            const result = await GitHubAPI.saveWorkouts(now, this.currentMonthWorkouts, this.currentMonthSha);
            this.currentMonthSha = result.content.sha;
            console.log('Migrated sequence numbers for current month workouts');
        }
    },

    /**
     * Load exercises from GitHub
     * @returns {Promise<void>}
     */
    async loadExercises() {
        const data = await GitHubAPI.getExercises();
        this.exercises = data.exercises;
        this.exercisesSha = data.sha;

        // Initialize with default exercises if empty
        if (this.exercises.length === 0) {
            await this.initializeDefaultExercises();
        }
    },

    /**
     * Initialize repository with default exercises
     * @returns {Promise<void>}
     */
    async initializeDefaultExercises() {
        const defaultExercises = CONFIG.defaultExercises.map(ex => ({
            id: generateId(),
            name: ex.name,
            equipmentType: ex.equipmentType,
            muscle: ex.muscle,
            requiresWeight: CONFIG.equipmentTypes[ex.equipmentType].requiresWeight
        }));

        this.exercises = defaultExercises;
        const result = await GitHubAPI.saveExercises(this.exercises, this.exercisesSha);
        this.exercisesSha = result.content.sha;
    },

    /**
     * Load workouts for current month
     * @returns {Promise<void>}
     */
    async loadCurrentMonthWorkouts() {
        const now = new Date();
        const data = await GitHubAPI.getWorkouts(now);
        this.currentMonthWorkouts = data.workouts;
        this.currentMonthSha = data.sha;
        this.currentMonthPath = data.path;

        // Initialize empty file if it doesn't exist
        if (!data.sha && this.currentMonthWorkouts.length === 0) {
            try {
                const result = await GitHubAPI.saveWorkouts(now, this.currentMonthWorkouts, null);
                this.currentMonthSha = result.content.sha;
            } catch (error) {
                console.warn('Could not initialize workout file:', error);
                // Continue anyway - file will be created when first workout is added
            }
        }
    },

    /**
     * Get all exercises
     * @returns {array} Array of exercise objects
     */
    getExercises() {
        return this.exercises;
    },

    /**
     * Get exercise by ID
     * @param {string} id - Exercise ID
     * @returns {object|null} Exercise object or null
     */
    getExerciseById(id) {
        return this.exercises.find(ex => ex.id === id) || null;
    },

    /**
     * Add new exercise
     * @param {object} exercise - Exercise object
     * @returns {Promise<object>} Added exercise
     */
    async addExercise(exercise) {
        // Validate name uniqueness
        if (this.exercises.some(ex => ex.name.toLowerCase() === exercise.name.toLowerCase())) {
            throw new Error('An exercise with this name already exists');
        }
        const trimmedName = exercise.name.trim();
        if (this.exercises.some(ex => ex.name.toLowerCase() === trimmedName.toLowerCase())) {
            throw new Error('An exercise with this name already exists');
        }

        const requiresWeight = CONFIG.equipmentTypes[exercise.equipmentType]?.requiresWeight ?? true;

        const newExercise = {
            id: generateId(),
            name: trimmedName,
            equipmentType: exercise.equipmentType,
            muscle: exercise.muscle,
            requiresWeight
        };

        this.exercises.push(newExercise);

        // Save to GitHub
        const result = await GitHubAPI.saveExercises(this.exercises, this.exercisesSha);
        this.exercisesSha = result.content.sha;

        return newExercise;
    },

    /**
     * Update existing exercise
     * @param {string} id - Exercise ID
     * @param {object} updates - Updated fields
     * @returns {Promise<object>} Updated exercise
     */
    async updateExercise(id, updates) {
        const index = this.exercises.findIndex(ex => ex.id === id);
        if (index === -1) {
            throw new Error('Exercise not found');
        }

        // Check name uniqueness if name is being updated
        if (updates.name) {
            const trimmedName = updates.name.trim();
            if (trimmedName !== this.exercises[index].name) {
                if (this.exercises.some(ex => ex.id !== id && ex.name.toLowerCase() === trimmedName.toLowerCase())) {
                    throw new Error('An exercise with this name already exists');
                }
            }
            updates.name = trimmedName;
        }

        // Determine requiresWeight based on equipment type
        if (updates.equipmentType) {
            updates.requiresWeight = CONFIG.equipmentTypes[updates.equipmentType]?.requiresWeight ?? true;
        }

        // Update exercise
        this.exercises[index] = {
            ...this.exercises[index],
            ...updates,
            updatedAt: new Date().toISOString()
        };

        // Save to GitHub
        const result = await GitHubAPI.saveExercises(this.exercises, this.exercisesSha);
        this.exercisesSha = result.content.sha;

        return this.exercises[index];
    },

    /**
     * Delete exercise
     * @param {string} id - Exercise ID
     * @returns {Promise<void>}
     */
    async deleteExercise(id) {
        const index = this.exercises.findIndex(ex => ex.id === id);
        if (index === -1) {
            throw new Error('Exercise not found');
        }

        this.exercises.splice(index, 1);

        // Save to GitHub
        const result = await GitHubAPI.saveExercises(this.exercises, this.exercisesSha);
        this.exercisesSha = result.content.sha;
    },

    /**
     * Add workout
     * @param {object} workout - Workout object
     * @returns {Promise<object>} Added workout
     */
    async addWorkout(workout) {
        const workoutDate = parseDate(workout.date);
        if (!workoutDate) {
            throw new Error('Invalid workout date');
        }

        const now = new Date();
        const isSameMonth = workoutDate.getMonth() === now.getMonth() &&
            workoutDate.getFullYear() === now.getFullYear();

        // If workout is for current month, use cached data
        if (isSameMonth) {
            // Calculate sequence number for this date
            const sameDateWorkouts = this.currentMonthWorkouts.filter(w => w.date === workout.date);
            const sequence = sameDateWorkouts.length + 1;

            const newWorkout = {
                id: generateId(),
                exerciseId: workout.exerciseId,
                date: workout.date,
                reps: parseInt(workout.reps, 10),
                weight: workout.weight ? parseFloat(workout.weight) : null,
                sequence: sequence
            };

            this.currentMonthWorkouts.push(newWorkout);

            // Save to GitHub
            const result = await GitHubAPI.saveWorkouts(now, this.currentMonthWorkouts, this.currentMonthSha);
            this.currentMonthSha = result.content.sha;

            return newWorkout;
        } else {
            // Load different month, add workout, save
            const monthData = await GitHubAPI.getWorkouts(workoutDate);

            // Calculate sequence number for this date
            const sameDateWorkouts = monthData.workouts.filter(w => w.date === workout.date);
            const sequence = sameDateWorkouts.length + 1;

            const newWorkout = {
                id: generateId(),
                exerciseId: workout.exerciseId,
                date: workout.date,
                reps: parseInt(workout.reps, 10),
                weight: workout.weight ? parseFloat(workout.weight) : null,
                sequence: sequence
            };

            monthData.workouts.push(newWorkout);
            await GitHubAPI.saveWorkouts(workoutDate, monthData.workouts, monthData.sha);

            return newWorkout;
        }
    },

    /**
     * Get workouts for date range
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @returns {Promise<array>} Array of workout objects
     */
    async getWorkoutsInRange(startDate, endDate) {
        return await GitHubAPI.getWorkoutsInRange(startDate, endDate);
    },

    /**
     * Get workouts for specific exercise
     * @param {string} exerciseId - Exercise ID
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @returns {Promise<array>} Array of workout objects
     */
    async getWorkoutsForExercise(exerciseId, startDate, endDate) {
        const allWorkouts = await this.getWorkoutsInRange(startDate, endDate);
        return allWorkouts.filter(w => w.exerciseId === exerciseId)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
    },

    /**
     * Get recent workouts (last N, deduplicated by exercise)
     * @returns {array} Array of recent workouts (one per unique exercise)
     */
    getRecentWorkouts() {
        // Create a map to store the most recent workout per exercise
        const exerciseMap = new Map();

        // Sort all workouts by date descending (newest first)
        const sortedWorkouts = this.currentMonthWorkouts
            .slice()
            .sort((a, b) => {
                const dateComparison = new Date(b.date) - new Date(a.date);
                if (dateComparison !== 0) return dateComparison;
                // If same date, sort by ID (which includes timestamp)
                return b.id.localeCompare(a.id);
            });

        // Keep only the most recent workout per exercise
        for (const workout of sortedWorkouts) {
            if (!exerciseMap.has(workout.exerciseId)) {
                exerciseMap.set(workout.exerciseId, workout);
            }
        }

        // Convert map to array and return top N
        return Array.from(exerciseMap.values()).slice(0, CONFIG.limits.recentWorkoutsCount);
    },

    /**
     * Get workout entries for the last N distinct days a specific exercise was performed
     * Searches backwards through months if not found in current month
     * @param {string} exerciseId - Exercise ID
     * @param {number} sessionCount - Number of sessions to retrieve
     * @returns {Promise<array>} Array of session objects {date, sets[]}
     */
    async getLastWorkoutSessionsForExercise(exerciseId, sessionCount = 3) {
        let allMatches = [];

        // 1. Check current month
        const currentMonthMatches = this.currentMonthWorkouts
            .filter(w => w.exerciseId === exerciseId);
        allMatches.push(...currentMonthMatches);

        // Helper to group, sort and format sessions
        const getGroupedSessions = (matches) => {
            const groups = {};
            matches.forEach(w => {
                if (!groups[w.date]) groups[w.date] = [];
                groups[w.date].push(w);
            });

            // Return as array of {date, sets}, sorted by date desc
            return Object.entries(groups)
                .map(([date, sets]) => ({
                    date,
                    sets: sets.sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
                }))
                .sort((a, b) => new Date(b.date) - new Date(a.date));
        };

        let sessions = getGroupedSessions(allMatches);

        if (sessions.length >= sessionCount) {
            return sessions.slice(0, sessionCount);
        }

        // 2. If not enough sessions, look at other files in data directory
        try {
            const dataPath = CONFIG.paths.workoutsPrefix.substring(0, CONFIG.paths.workoutsPrefix.lastIndexOf('/')) || 'data';
            const files = await GitHubAPI.listFiles(dataPath);

            const prefix = CONFIG.paths.workoutsPrefix.split('/').pop();
            const workoutFiles = files
                .filter(file => file.name.startsWith(prefix) && file.name.endsWith('.json'))
                .map(file => file.name)
                .sort((a, b) => b.localeCompare(a)); // Sort descending (newest first)

            const currentMonthFile = GitHubAPI.getWorkoutFilePath(new Date()).split('/').pop();
            const olderFiles = workoutFiles.filter(f => f !== currentMonthFile);

            const regex = new RegExp(`${prefix}(\\d{4})-(\\d{2})\\.json`);

            // Search back up to 12 months if needed
            for (let i = 0; i < Math.min(olderFiles.length, 12); i++) {
                const filename = olderFiles[i];
                const match = filename.match(regex);

                if (!match) continue;

                const date = new Date(parseInt(match[1]), parseInt(match[2]) - 1, 1);
                const monthData = await GitHubAPI.getWorkouts(date);

                const monthMatches = monthData.workouts.filter(w => w.exerciseId === exerciseId);

                if (monthMatches.length > 0) {
                    allMatches.push(...monthMatches);
                    sessions = getGroupedSessions(allMatches);

                    if (sessions.length >= sessionCount) {
                        return sessions.slice(0, sessionCount);
                    }
                }
            }
        } catch (error) {
            console.warn('Error searching for last workout sessions:', error);
        }

        return sessions;
    },
    /**
     * Get workouts for a specific month
     * @param {number} year - Year (e.g., 2025)
     * @param {number} month - Month (1-12)
     * @returns {Promise<array>} Array of workout objects
     */
    async getWorkoutsByMonth(year, month) {
        const date = new Date(year, month - 1, 1);
        const data = await GitHubAPI.getWorkouts(date);
        return data.workouts;
    },

    /**
     * Get workouts across multiple months by date range
     * @param {string} startDateStr - Start date in YYYY-MM-DD format
     * @param {string} endDateStr - End date in YYYY-MM-DD format
     * @returns {Promise<array>} Array of workout objects
     */
    async getWorkoutsByDateRange(startDateStr, endDateStr) {
        const startDate = parseDate(startDateStr);
        const endDate = parseDate(endDateStr);

        if (!startDate || !endDate) {
            throw new Error('Invalid date range');
        }

        return await this.getWorkoutsInRange(startDate, endDate);
    },

    /**
     * Get the most recent full workout session (all exercises from the last day a workout was logged)
     * @returns {Promise<object|null>} Object with {date, exercises: {name, sets: []}} or null
     */
    async getLastWorkoutSession() {
        let workouts = [];
        let newestDate = null;

        // 1. Check current month first
        if (this.currentMonthWorkouts.length > 0) {
            // Find newest date
            const dates = [...new Set(this.currentMonthWorkouts.map(w => w.date))];
            if (dates.length > 0) {
                dates.sort((a, b) => new Date(b) - new Date(a));
                newestDate = dates[0];
                workouts = this.currentMonthWorkouts.filter(w => w.date === newestDate);
            }
        }

        // 2. If no workouts in current month, check previous months
        if (workouts.length === 0) {
            try {
                const dataPath = CONFIG.paths.workoutsPrefix.substring(0, CONFIG.paths.workoutsPrefix.lastIndexOf('/')) || 'data';
                const files = await GitHubAPI.listFiles(dataPath);

                const prefix = CONFIG.paths.workoutsPrefix.split('/').pop();
                const workoutFiles = files
                    .filter(file => file.name.startsWith(prefix) && file.name.endsWith('.json'))
                    .map(file => file.name)
                    .sort((a, b) => b.localeCompare(a)); // Sort descending (newest first)

                const currentMonthFile = GitHubAPI.getWorkoutFilePath(new Date()).split('/').pop();
                const olderFiles = workoutFiles.filter(f => f !== currentMonthFile);

                const regex = new RegExp(`${prefix}(\\d{4})-(\\d{2})\\.json`);

                for (let i = 0; i < Math.min(olderFiles.length, 12); i++) {
                    const filename = olderFiles[i];
                    const match = filename.match(regex);
                    if (!match) continue;

                    const date = new Date(parseInt(match[1]), parseInt(match[2]) - 1, 1);
                    const monthData = await GitHubAPI.getWorkouts(date);

                    if (monthData.workouts.length > 0) {
                        const dates = [...new Set(monthData.workouts.map(w => w.date))];
                        if (dates.length > 0) {
                            dates.sort((a, b) => new Date(b) - new Date(a));
                            newestDate = dates[0];
                            workouts = monthData.workouts.filter(w => w.date === newestDate);
                            break;
                        }
                    }
                }
            } catch (error) {
                console.warn('Error fetching last workout session:', error);
            }
        }

        if (workouts.length === 0) return null;

        // Group by exercise and sort by sequence
        const grouped = {};
        workouts.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

        workouts.forEach(w => {
            const exercise = this.getExerciseById(w.exerciseId);
            if (!exercise) return;

            if (!grouped[w.exerciseId]) {
                grouped[w.exerciseId] = {
                    name: exercise.name,
                    sets: []
                };
            }
            grouped[w.exerciseId].sets.push(w);
        });

        return {
            date: newestDate,
            exercises: Object.values(grouped)
        };
    },


    /**
     * Update workout sequences after drag-and-drop reordering
     * @param {string} date - Date of workouts to update
     * @param {array} workoutIds - Array of workout IDs in new order
     * @returns {Promise<void>}
     */
    async updateWorkoutSequences(date, workoutIds) {
        const workoutDate = parseDate(date);
        if (!workoutDate) {
            throw new Error('Invalid workout date');
        }

        const now = new Date();
        const isSameMonth = workoutDate.getMonth() === now.getMonth() &&
            workoutDate.getFullYear() === now.getFullYear();

        if (isSameMonth) {
            // Update sequences in current month workouts
            workoutIds.forEach((id, index) => {
                const workout = this.currentMonthWorkouts.find(w => w.id === id);
                if (workout && workout.date === date) {
                    workout.sequence = index + 1;
                }
            });

            // Save to GitHub
            const result = await GitHubAPI.saveWorkouts(now, this.currentMonthWorkouts, this.currentMonthSha);
            this.currentMonthSha = result.content.sha;
        } else {
            // Load different month, update sequences, save
            const monthData = await GitHubAPI.getWorkouts(workoutDate);

            workoutIds.forEach((id, index) => {
                const workout = monthData.workouts.find(w => w.id === id);
                if (workout && workout.date === date) {
                    workout.sequence = index + 1;
                }
            });

            await GitHubAPI.saveWorkouts(workoutDate, monthData.workouts, monthData.sha);
        }
    },

    /**
     * Update an existing workout entry
     * @param {string} id - Workout entry ID
     * @param {string} date - Workout entry date
     * @param {object} updates - Updates to apply (reps, weight)
     * @returns {Promise<object>} Updated workout entry
     */
    async updateWorkout(id, date, updates) {
        const workoutDate = parseDate(date);
        if (!workoutDate) {
            throw new Error('Invalid workout date');
        }

        const now = new Date();
        const isSameMonth = workoutDate.getMonth() === now.getMonth() &&
            workoutDate.getFullYear() === now.getFullYear();

        if (isSameMonth) {
            const index = this.currentMonthWorkouts.findIndex(w => w.id === id);
            if (index === -1) {
                throw new Error('Workout not found');
            }

            this.currentMonthWorkouts[index] = {
                ...this.currentMonthWorkouts[index],
                ...updates,
                reps: parseInt(updates.reps, 10),
                weight: updates.weight ? parseFloat(updates.weight) : null
            };

            const result = await GitHubAPI.saveWorkouts(now, this.currentMonthWorkouts, this.currentMonthSha);
            this.currentMonthSha = result.content.sha;
            return this.currentMonthWorkouts[index];
        } else {
            const monthData = await GitHubAPI.getWorkouts(workoutDate);
            const index = monthData.workouts.findIndex(w => w.id === id);
            if (index === -1) {
                throw new Error('Workout not found');
            }

            monthData.workouts[index] = {
                ...monthData.workouts[index],
                ...updates,
                reps: parseInt(updates.reps, 10),
                weight: updates.weight ? parseFloat(updates.weight) : null
            };

            const result = await GitHubAPI.saveWorkouts(workoutDate, monthData.workouts, monthData.sha);
            return monthData.workouts[index];
        }
    },

    /**
     * Delete a workout entry
     * @param {string} id - Workout entry ID
     * @param {string} date - Workout entry date
     * @returns {Promise<void>}
     */
    async deleteWorkout(id, date) {
        const workoutDate = parseDate(date);
        if (!workoutDate) {
            throw new Error('Invalid workout date');
        }

        const now = new Date();
        const isSameMonth = workoutDate.getMonth() === now.getMonth() &&
            workoutDate.getFullYear() === now.getFullYear();

        if (isSameMonth) {
            const index = this.currentMonthWorkouts.findIndex(w => w.id === id);
            if (index === -1) {
                throw new Error('Workout not found');
            }

            this.currentMonthWorkouts.splice(index, 1);

            // Re-sequence remaining workouts for the same date
            const sameDateWorkouts = this.currentMonthWorkouts
                .filter(w => w.date === date)
                .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

            sameDateWorkouts.forEach((w, i) => {
                w.sequence = i + 1;
            });

            const result = await GitHubAPI.saveWorkouts(now, this.currentMonthWorkouts, this.currentMonthSha);
            this.currentMonthSha = result.content.sha;
        } else {
            const monthData = await GitHubAPI.getWorkouts(workoutDate);
            const index = monthData.workouts.findIndex(w => w.id === id);
            if (index === -1) {
                throw new Error('Workout not found');
            }

            monthData.workouts.splice(index, 1);

            // Re-sequence remaining workouts for the same date
            const sameDateWorkouts = monthData.workouts
                .filter(w => w.date === date)
                .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

            sameDateWorkouts.forEach((w, i) => {
                w.sequence = i + 1;
            });

            await GitHubAPI.saveWorkouts(workoutDate, monthData.workouts, monthData.sha);
        }
    }
};
// Note: generateId, parseDate, and formatDate are now imported from utils.js
