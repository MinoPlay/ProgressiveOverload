// Storage Module
// Central data management layer for exercises and workouts

import { SupabaseAPI } from './supabase-api.js';
import { CONFIG } from './config.js';
import { generateId, parseDate } from './utils.js';

export const Storage = {
    // In-memory cache
    exercises: [],
    currentMonthWorkouts: [],
    sessionTemplates: [],
    _refreshPromise: null,
    _pendingWrites: 0,

    /**
     * Initialize storage by loading exercises and current month workouts
     * @returns {Promise<void>}
     */
    async initialize() {
        await SupabaseAPI.initializeUser();
        await this.loadExercises();
        await this.loadCurrentMonthWorkouts();
        await this.migrateSequenceNumbers();
        await this.loadSessionTemplates();
    },

    /**
     * Re-fetch the in-memory snapshot from Supabase.
     * Skipped while a write is running, since the write refreshes on its own.
     * @returns {Promise<void>}
     */
    async refreshFromRemote() {
        if (this._pendingWrites > 0) return;
        await this._refreshNow();
    },

    /**
     * Reload exercises, current month workouts and templates; concurrent calls share one fetch.
     * Fires the matching *Updated events only for data that actually changed.
     * @returns {Promise<void>}
     */
    _refreshNow() {
        if (!this._refreshPromise) {
            this._refreshPromise = (async () => {
                const before = {
                    exercisesUpdated: JSON.stringify(this.exercises),
                    workoutsUpdated: JSON.stringify(this.currentMonthWorkouts),
                    templatesUpdated: JSON.stringify(this.sessionTemplates)
                };
                await Promise.all([
                    this.loadExercises(),
                    this.loadCurrentMonthWorkouts(),
                    this.loadSessionTemplates()
                ]);
                const after = {
                    exercisesUpdated: JSON.stringify(this.exercises),
                    workoutsUpdated: JSON.stringify(this.currentMonthWorkouts),
                    templatesUpdated: JSON.stringify(this.sessionTemplates)
                };
                Object.keys(before)
                    .filter(eventName => before[eventName] !== after[eventName])
                    .forEach(eventName => window.dispatchEvent(new CustomEvent(eventName)));
            })().finally(() => {
                this._refreshPromise = null;
            });
        }
        return this._refreshPromise;
    },

    /**
     * Run a mutation against fresh Supabase data, blocking background refreshes meanwhile.
     * @param {function} mutate
     * @returns {Promise<*>}
     */
    async _write(mutate) {
        this._pendingWrites++;
        try {
            await this._refreshNow();
            return await mutate();
        } finally {
            this._pendingWrites--;
        }
    },

    /**
     * Persist exercise changes.
     * @param {array} changed - Exercises to insert/update
     * @param {array} removedIds - Exercise IDs to delete
     * @returns {Promise<void>}
     */
    async _persistExercises(changed = [], removedIds = []) {
        if (removedIds.length) await SupabaseAPI.deleteExercises(removedIds);
        if (changed.length) await SupabaseAPI.upsertExercises(changed);
    },

    /**
     * Persist workout changes.
     * @param {array} changed - Workouts to insert/update
     * @param {array} removedIds - Workout IDs to delete
     * @returns {Promise<void>}
     */
    async _persistWorkouts(changed = [], removedIds = []) {
        if (removedIds.length) await SupabaseAPI.deleteWorkouts(removedIds);
        if (changed.length) await SupabaseAPI.upsertWorkouts(changed);
    },

    /**
     * Persist session template changes.
     * @param {array} changed - Templates to insert/update
     * @param {array} removedIds - Template IDs to delete
     * @returns {Promise<void>}
     */
    async _persistSessionTemplates(changed = [], removedIds = []) {
        if (removedIds.length) await SupabaseAPI.deleteSessionTemplates(removedIds);
        if (changed.length) await SupabaseAPI.upsertSessionTemplates(changed);
    },

    /**
     * Migrate existing workouts to add sequence numbers based on ID timestamps
     * @returns {Promise<void>}
     */
    async migrateSequenceNumbers() {
        const migrated = [];

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
                    migrated.push(workout);
                }
            });
        }

        // Save if any migrations were performed
        if (migrated.length > 0) {
            await this._persistWorkouts(migrated);
            console.log('Migrated sequence numbers for current month workouts');
        }
    },

    /**
     * Load exercises from Supabase
     * @returns {Promise<void>}
     */
    async loadExercises() {
        const data = await SupabaseAPI.getExercises();
        this.exercises = data.exercises;

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
        await this._persistExercises(defaultExercises);
    },

    /**
     * Load workouts for current month
     * @returns {Promise<void>}
     */
    async loadCurrentMonthWorkouts() {
        const now = new Date();
        const data = await SupabaseAPI.getWorkouts(now);
        this.currentMonthWorkouts = data.workouts;
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

        await this._persistExercises([newExercise]);

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

        await this._persistExercises([this.exercises[index]]);

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

        const [removedExercise] = this.exercises.splice(index, 1);

        try {
            await this._persistExercises([], [removedExercise.id]);
        } catch (error) {
            this.exercises.splice(index, 0, removedExercise);
            throw error;
        }
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

        let newWorkout;

        // If workout is for current month, use cached data
        if (isSameMonth) {
            // Calculate sequence number for this date
            const sameDateWorkouts = this.currentMonthWorkouts.filter(w => w.date === workout.date);
            const sequence = sameDateWorkouts.length + 1;

            newWorkout = this.buildWorkoutRecord(workout, sequence);

            this.currentMonthWorkouts.push(newWorkout);

            await this._persistWorkouts([newWorkout]);
            this.generateAndSaveStatsSummary();
        } else {
            // Load different month, add workout, save
            const monthData = await SupabaseAPI.getWorkouts(workoutDate);

            // Calculate sequence number for this date
            const sameDateWorkouts = monthData.workouts.filter(w => w.date === workout.date);
            const sequence = sameDateWorkouts.length + 1;

            newWorkout = this.buildWorkoutRecord(workout, sequence);

            monthData.workouts.push(newWorkout);
            await this._persistWorkouts([newWorkout]);
            this.generateAndSaveStatsSummary();
        }

        // Gather all sets for this exercise on this date to build complete lastSets
        const allSetsForExercise = this.currentMonthWorkouts
            .filter(w => w.exerciseId === newWorkout.exerciseId && w.date === newWorkout.date);
        await this._syncExerciseLastSets(allSetsForExercise);

        return newWorkout;
    },

    /**
     * Add multiple workouts in a single submit flow
     * @param {array} workouts - Workout entries to persist
     * @returns {Promise<array>} Added workouts
     */
    async addWorkoutsBatch(workouts) {
        if (!Array.isArray(workouts) || workouts.length === 0) {
            throw new Error('No workouts to save');
        }

        const targetDate = workouts[0].date;
        if (!targetDate) {
            throw new Error('Invalid workout date');
        }

        const differentDate = workouts.some(entry => entry.date !== targetDate);
        if (differentDate) {
            throw new Error('Batch submit requires a single date');
        }

        const workoutDate = parseDate(targetDate);
        if (!workoutDate) {
            throw new Error('Invalid workout date');
        }

        const now = new Date();
        const isSameMonth = workoutDate.getMonth() === now.getMonth() &&
            workoutDate.getFullYear() === now.getFullYear();

        let newWorkouts;

        if (isSameMonth) {
            const sameDateWorkouts = this.currentMonthWorkouts.filter(w => w.date === targetDate);
            const startSequence = sameDateWorkouts.length + 1;
            newWorkouts = workouts.map((entry, index) => this.buildWorkoutRecord(entry, startSequence + index));

            this.currentMonthWorkouts.push(...newWorkouts);

            await this._persistWorkouts(newWorkouts);
            this.generateAndSaveStatsSummary();
        } else {
            const monthData = await SupabaseAPI.getWorkouts(workoutDate);
            const sameDateWorkouts = monthData.workouts.filter(w => w.date === targetDate);
            const startSequence = sameDateWorkouts.length + 1;
            newWorkouts = workouts.map((entry, index) => this.buildWorkoutRecord(entry, startSequence + index));

            monthData.workouts.push(...newWorkouts);
            await this._persistWorkouts(newWorkouts);
            this.generateAndSaveStatsSummary();
        }

        await this._syncExerciseLastSets(newWorkouts);
        return newWorkouts;
    },

    /**
     * Build persisted workout record with optional metadata fields
     * @param {object} workout - Workout input
     * @param {number} sequence - Sequence number for date ordering
     * @returns {object}
     */
    buildWorkoutRecord(workout, sequence) {
        const weightValue = workout.weight !== null && workout.weight !== undefined && workout.weight !== ''
            ? parseFloat(workout.weight)
            : null;

        const record = {
            id: generateId(),
            exerciseId: workout.exerciseId,
            date: workout.date,
            reps: parseInt(workout.reps, 10),
            weight: Number.isFinite(weightValue) ? weightValue : null,
            sequence
        };

        const optionalFields = ['sessionId', 'plannedSetId', 'supersetGroupId', 'supersetRound', 'source', 'supersetExercises'];
        optionalFields.forEach(field => {
            if (workout[field] !== undefined && workout[field] !== null && workout[field] !== '') {
                record[field] = workout[field];
            }
        });

        return record;
    },

    /**
     * Update exercise lastSets/lastDate after workouts are saved.
     * Groups saved workouts by exercise, compares dates, persists if changed.
     * @param {array} savedWorkouts - Workout records just saved
     * @returns {Promise<void>}
     */
    async _syncExerciseLastSets(savedWorkouts) {
        if (!savedWorkouts.length) return;

        const byExercise = {};
        savedWorkouts.forEach(w => {
            if (!byExercise[w.exerciseId]) byExercise[w.exerciseId] = [];
            byExercise[w.exerciseId].push(w);
        });

        const changed = [];
        for (const [exerciseId, sets] of Object.entries(byExercise)) {
            const exercise = this.exercises.find(ex => ex.id === exerciseId);
            if (!exercise) continue;

            const date = sets[0].date;
            if (exercise.lastDate && date < exercise.lastDate) continue;

            const newLastSets = sets
                .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
                .map(s => ({ reps: s.reps, weight: s.weight ?? null }));

            if (exercise.lastDate === date && JSON.stringify(exercise.lastSets) === JSON.stringify(newLastSets)) continue;

            exercise.lastSets = newLastSets;
            exercise.lastDate = date;
            changed.push(exercise);
        }

        if (changed.length > 0) {
            await this._persistExercises(changed);
        }
    },

    /**
     * Get workouts for date range
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @returns {Promise<array>} Array of workout objects
     */
    async getWorkoutsInRange(startDate, endDate) {
        return await SupabaseAPI.getWorkoutsInRange(startDate, endDate);
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
     * Searches the last 12 months.
     * @param {string} exerciseId - Exercise ID
     * @param {number} sessionCount - Number of sessions to retrieve
     * @returns {Promise<array>} Array of session objects {date, sets[]}
     */
    async getLastWorkoutSessionsForExercise(exerciseId, sessionCount = 3) {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        const matches = (await SupabaseAPI.getWorkoutsInRange(start, now))
            .filter(workout => workout.exerciseId === exerciseId);
        const groups = {};
        matches.forEach(workout => {
            if (!groups[workout.date]) groups[workout.date] = [];
            groups[workout.date].push(workout);
        });
        return Object.entries(groups)
            .map(([date, sets]) => ({
                date,
                sets: sets.sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
            }))
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, sessionCount);
    },
    /**
     * Get workouts for a specific month
     * @param {number} year - Year (e.g., 2025)
     * @param {number} month - Month (1-12)
     * @returns {Promise<array>} Array of workout objects
     */
    async getWorkoutsByMonth(year, month) {
        const date = new Date(year, month - 1, 1);
        const data = await SupabaseAPI.getWorkouts(date);
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

        // 2. If no workouts in current month, check the previous 12 months
        if (workouts.length === 0) {
            try {
                const now = new Date();
                const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
                const recentWorkouts = await SupabaseAPI.getWorkoutsInRange(start, now);
                const dates = [...new Set(recentWorkouts.map(workout => workout.date))];
                if (dates.length > 0) {
                    dates.sort((a, b) => new Date(b) - new Date(a));
                    newestDate = dates[0];
                    workouts = recentWorkouts.filter(workout => workout.date === newestDate);
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
            const changed = [];
            workoutIds.forEach((id, index) => {
                const workout = this.currentMonthWorkouts.find(w => w.id === id);
                if (workout && workout.date === date) {
                    workout.sequence = index + 1;
                    changed.push(workout);
                }
            });

            await this._persistWorkouts(changed);
        } else {
            // Load different month, update sequences, save
            const monthData = await SupabaseAPI.getWorkouts(workoutDate);

            const changed = [];
            workoutIds.forEach((id, index) => {
                const workout = monthData.workouts.find(w => w.id === id);
                if (workout && workout.date === date) {
                    workout.sequence = index + 1;
                    changed.push(workout);
                }
            });

            await this._persistWorkouts(changed);
        }
    },

    /**
     * Overwrite superset links for a day. Every workout of an exercise listed in
     * the assignments gets the given group ID, or has the link removed when null.
     * @param {string} date - Date of workouts to update (YYYY-MM-DD)
     * @param {object} assignments - Map of exerciseId to supersetGroupId (or null to unlink)
     * @returns {Promise<void>}
     */
    async updateWorkoutSupersets(date, assignments) {
        const workoutDate = parseDate(date);
        if (!workoutDate) {
            throw new Error('Invalid workout date');
        }

        const apply = (workouts) => {
            const changed = [];
            workouts.forEach(workout => {
                if (workout.date !== date) return;
                if (!Object.prototype.hasOwnProperty.call(assignments, workout.exerciseId)) return;

                const groupId = assignments[workout.exerciseId];
                if (groupId) {
                    workout.supersetGroupId = groupId;
                } else {
                    delete workout.supersetGroupId;
                }
                changed.push(workout);
            });
            return changed;
        };

        const now = new Date();
        const isSameMonth = workoutDate.getMonth() === now.getMonth() &&
            workoutDate.getFullYear() === now.getFullYear();

        if (isSameMonth) {
            const changed = apply(this.currentMonthWorkouts);
            await this._persistWorkouts(changed);
        } else {
            const monthData = await SupabaseAPI.getWorkouts(workoutDate);
            const changed = apply(monthData.workouts);
            await this._persistWorkouts(changed);
        }

        this.generateAndSaveStatsSummary();
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

            await this._persistWorkouts([this.currentMonthWorkouts[index]]);
            this.generateAndSaveStatsSummary();
            return this.currentMonthWorkouts[index];
        } else {
            const monthData = await SupabaseAPI.getWorkouts(workoutDate);
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

            await this._persistWorkouts([monthData.workouts[index]]);
            this.generateAndSaveStatsSummary();
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

            await this._persistWorkouts(sameDateWorkouts, [id]);
            this.generateAndSaveStatsSummary();
        } else {
            const monthData = await SupabaseAPI.getWorkouts(workoutDate);
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

            await this._persistWorkouts(sameDateWorkouts, [id]);
            this.generateAndSaveStatsSummary();
        }
    },

    // ─── Session Templates ───────────────────────────────────────────────────

    /**
     * Normalize template rows loaded from storage to ensure required fields
     * (type, set IDs) are present, regardless of when the data was created.
     * @param {array} rows
     * @returns {array}
     */
    normalizeTemplateRows(rows) {
        return (rows || []).map((row, rowIdx) => {
            const r = { ...row };
            if (!r.id) r.id = `tpl-row-norm-${rowIdx}-${Date.now()}`;
            if (!r.type) r.type = 'single';

            if (r.type === 'single') {
                r.sets = (r.sets || []).map((set, i) => ({
                    id: set.id || `${r.id}-set-${i + 1}`,
                    reps: set.reps ?? '',
                    weight: set.weight ?? ''
                }));
            } else {
                r.exercises = (r.exercises || []).map((ex, exIdx) => {
                    const exId = ex.id || `${r.id}-ex-${exIdx}`;
                    return {
                        ...ex,
                        id: exId,
                        sets: (ex.sets || []).map((set, i) => ({
                            id: set.id || `${exId}-set-${i + 1}`,
                            reps: set.reps ?? '',
                            weight: set.weight ?? ''
                        }))
                    };
                });
            }
            return r;
        });
    },

    /**
     * Load session templates from Supabase
     * @returns {Promise<void>}
     */
    async loadSessionTemplates() {
        const data = await SupabaseAPI.getSessionTemplates();
        this.sessionTemplates = data.templates.map(t => ({
            ...t,
            rows: this.normalizeTemplateRows(t.rows)
        }));
    },

    /**
     * Get all session templates
     * @returns {array}
     */
    getSessionTemplates() {
        return this.sessionTemplates;
    },

    /**
     * Get session template by ID
     * @param {string} id
     * @returns {object|null}
     */
    getSessionTemplateById(id) {
        return this.sessionTemplates.find(t => t.id === id) || null;
    },

    /**
     * Add new session template
     * @param {object} template - { name, rows }
     * @returns {Promise<object>}
     */
    async addSessionTemplate(template) {
        if (!template.name || !template.name.trim()) {
            throw new Error('Template name is required');
        }
        const trimmedName = template.name.trim();
        if (this.sessionTemplates.some(t => t.name.toLowerCase() === trimmedName.toLowerCase())) {
            throw new Error('A template with this name already exists');
        }

        const newTemplate = {
            id: generateId(),
            name: trimmedName,
            rows: template.rows || []
        };

        this.sessionTemplates.push(newTemplate);
        await this._persistSessionTemplates([newTemplate]);
        return newTemplate;
    },

    /**
     * Update existing session template
     * @param {string} id
     * @param {object} template - { name, rows }
     * @returns {Promise<object>}
     */
    async updateSessionTemplate(id, template) {
        const index = this.sessionTemplates.findIndex(t => t.id === id);
        if (index === -1) throw new Error('Template not found');

        const trimmedName = template.name.trim();
        if (this.sessionTemplates.some(t => t.id !== id && t.name.toLowerCase() === trimmedName.toLowerCase())) {
            throw new Error('A template with this name already exists');
        }

        this.sessionTemplates[index] = {
            id: this.sessionTemplates[index].id,
            name: trimmedName,
            rows: template.rows
        };

        await this._persistSessionTemplates([this.sessionTemplates[index]]);
        return this.sessionTemplates[index];
    },

    /**
     * Delete session template
     * @param {string} id
     * @returns {Promise<void>}
     */
    async deleteSessionTemplate(id) {
        const index = this.sessionTemplates.findIndex(t => t.id === id);
        if (index === -1) throw new Error('Template not found');
        this.sessionTemplates.splice(index, 1);
        await this._persistSessionTemplates([], [id]);
    },

    // ─── Stats Summary ───────────────────────────────────────────────────────

    /**
     * Load all workouts from Supabase in compact summary format.
     * @returns {Promise<array|null>} Array of full workout objects or null
     */
    async loadStatsSummaryWorkouts() {
        try {
            const result = await SupabaseAPI.getStatsSummary();
            if (!result) return null;
            return (result.content.workouts || []).map(w => ({
                exerciseId: w.e,
                date: w.d,
                reps: w.r,
                weight: w.w,
                sequence: w.seq,
                supersetGroupId: w.g || null
            }));
        } catch {
            return null;
        }
    },

    /**
     * Supabase summaries are derived from live workout rows and need no persistence.
     */
    async generateAndSaveStatsSummary() {}
};

// On Supabase every public mutation first re-fetches the snapshot, so edits never build on stale data
[
    'addExercise', 'updateExercise', 'deleteExercise',
    'addWorkout', 'addWorkoutsBatch', 'updateWorkout', 'deleteWorkout',
    'updateWorkoutSequences', 'updateWorkoutSupersets',
    'addSessionTemplate', 'updateSessionTemplate', 'deleteSessionTemplate'
].forEach(name => {
    const mutate = Storage[name];
    Storage[name] = (...args) => Storage._write(() => mutate.apply(Storage, args));
});
