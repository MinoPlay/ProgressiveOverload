// Storage Module
// Central data management layer for exercises and workouts.

import { CONFIG } from './config.js';
import { generateId, parseDate } from './utils.js';

export const Storage = {
    // In-memory cache
    exercises: [],
    workouts: [],
    sessionTemplates: [],
    _adapter: null,
    _emit: null,
    _refreshPromise: null,
    _pendingWrites: 0,

    /**
     * Initialize storage by loading exercises, cached workouts and templates.
     * @param {object} options
     * @param {object} options.adapter - Persistence adapter
     * @param {function} options.emit - Event emitter callback
     * @returns {Promise<void>}
     */
    async initialize({ adapter, emit } = {}) {
        this._adapter = adapter || await this._loadDefaultAdapter();
        this._emit = emit || (eventName => window.dispatchEvent(new CustomEvent(eventName)));
        this.exercises = [];
        this.workouts = [];
        this.sessionTemplates = [];
        await this._adapter.initializeUser();
        await this.loadExercises();
        await this._loadCurrentWorkoutWindow();
        await this.migrateSequenceNumbers();
        await this.loadSessionTemplates();
    },

    async _loadDefaultAdapter() {
        const { SupabaseAPI } = await import('./supabase-api.js');
        return SupabaseAPI;
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
     * Reload exercises, cached workouts and templates; concurrent calls share one fetch.
     * Fires the matching *Updated events only for data that actually changed.
     * @returns {Promise<void>}
     */
    _refreshNow() {
        if (!this._refreshPromise) {
            this._refreshPromise = (async () => {
                const before = {
                    exercisesUpdated: JSON.stringify(this.exercises),
                    workoutsUpdated: JSON.stringify(this.workouts),
                    templatesUpdated: JSON.stringify(this.sessionTemplates)
                };
                await Promise.all([
                    this.loadExercises(),
                    this._loadCurrentWorkoutWindow(),
                    this.loadSessionTemplates()
                ]);
                const after = {
                    exercisesUpdated: JSON.stringify(this.exercises),
                    workoutsUpdated: JSON.stringify(this.workouts),
                    templatesUpdated: JSON.stringify(this.sessionTemplates)
                };
                Object.keys(before)
                    .filter(eventName => before[eventName] !== after[eventName])
                    .forEach(eventName => this._emit(eventName));
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
        if (removedIds.length) await this._adapter.deleteExercises(removedIds);
        if (changed.length) await this._adapter.upsertExercises(changed);
    },

    /**
     * Persist workout changes.
     * @param {array} changed - Workouts to insert/update
     * @param {array} removedIds - Workout IDs to delete
     * @returns {Promise<void>}
     */
    async _persistWorkouts(changed = [], removedIds = []) {
        if (removedIds.length) await this._adapter.deleteWorkouts(removedIds);
        if (changed.length) await this._adapter.upsertWorkouts(changed);
    },

    /**
     * Persist session template changes.
     * @param {array} changed - Templates to insert/update
     * @param {array} removedIds - Template IDs to delete
     * @returns {Promise<void>}
     */
    async _persistSessionTemplates(changed = [], removedIds = []) {
        if (removedIds.length) await this._adapter.deleteSessionTemplates(removedIds);
        if (changed.length) await this._adapter.upsertSessionTemplates(changed);
    },

    /**
     * Migrate existing workouts to add sequence numbers based on ID timestamps
     * @returns {Promise<void>}
     */
    async migrateSequenceNumbers() {
        const migrated = [];

        // Group workouts by date
        const workoutsByDate = new Map();
        for (const workout of this.workouts) {
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
        const data = await this._adapter.getExercises();
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
     * Load workouts for the current cache window.
     * @returns {Promise<void>}
     */
    async _loadCurrentWorkoutWindow() {
        const { start, end } = this._cacheWindow();
        this.workouts = await this._adapter.getWorkoutsInRange(start, end);
    },

    /**
     * Date range held in the in-memory workout cache (the current month).
     * @returns {{start: Date, end: Date}}
     */
    _cacheWindow() {
        const now = new Date();
        return {
            start: new Date(now.getFullYear(), now.getMonth(), 1),
            end: new Date(now.getFullYear(), now.getMonth() + 1, 0)
        };
    },

    /**
     * Whether a date falls inside the cached workout window.
     * @param {string} date - Date (YYYY-MM-DD)
     * @returns {boolean}
     */
    _isCached(date) {
        const workoutDate = parseDate(date);
        const { start, end } = this._cacheWindow();
        return !!workoutDate && workoutDate >= start && workoutDate <= end;
    },

    /**
     * Workouts logged on one date: cached objects inside the window, fetched otherwise.
     * @param {string} date - Date (YYYY-MM-DD)
     * @returns {Promise<array>}
     */
    async _workoutsOnDate(date) {
        const workoutDate = parseDate(date);
        if (!workoutDate) {
            throw new Error('Invalid workout date');
        }
        return this._isCached(date)
            ? this.workouts.filter(w => w.date === date)
            : await this.getWorkoutsInRange(workoutDate, workoutDate);
    },

    /**
     * Get all exercises
     * @returns {array} Array of exercise objects
     */
    getExercises() {
        return this.exercises;
    },

    /**
     * Get workouts currently cached in memory.
     * @returns {array} Array of workout objects
     */
    getCachedWorkouts() {
        return this.workouts;
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
        return this._write(async () => {
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
        });
    },

    /**
     * Update existing exercise
     * @param {string} id - Exercise ID
     * @param {object} updates - Updated fields
     * @returns {Promise<object>} Updated exercise
     */
    async updateExercise(id, updates) {
        return this._write(async () => {
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
        });
    },

    /**
     * Delete exercise
     * @param {string} id - Exercise ID
     * @returns {Promise<void>}
     */
    async deleteExercise(id) {
        return this._write(async () => {
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
        });
    },

    /**
     * Add workout
     * @param {object} workout - Workout object
     * @returns {Promise<object>} Added workout
     */
    async addWorkout(workout) {
        return this._write(async () => {
            const sameDateWorkouts = await this._workoutsOnDate(workout.date);
            const newWorkout = this.buildWorkoutRecord(workout, sameDateWorkouts.length + 1);

            if (this._isCached(workout.date)) this.workouts.push(newWorkout);
            await this._persistWorkouts([newWorkout]);

            // Gather all sets for this exercise on this date to build complete lastSets
            const allSetsForExercise = [...sameDateWorkouts, newWorkout]
                .filter(w => w.exerciseId === newWorkout.exerciseId);
            await this._syncExerciseLastSets(allSetsForExercise);

            return newWorkout;
        });
    },

    /**
     * Add multiple workouts in a single submit flow
     * @param {array} workouts - Workout entries to persist
     * @returns {Promise<array>} Added workouts
     */
    async addWorkoutsBatch(workouts) {
        return this._write(async () => {
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

            const sameDateWorkouts = await this._workoutsOnDate(targetDate);
            const startSequence = sameDateWorkouts.length + 1;
            const newWorkouts = workouts.map((entry, index) => this.buildWorkoutRecord(entry, startSequence + index));

            if (this._isCached(targetDate)) this.workouts.push(...newWorkouts);
            await this._persistWorkouts(newWorkouts);

            await this._syncExerciseLastSets(newWorkouts);
            return newWorkouts;
        });
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
        return await this._adapter.getWorkoutsInRange(startDate, endDate);
    },


    /**
     * Update workout sequences after drag-and-drop reordering
     * @param {string} date - Date of workouts to update
     * @param {array} workoutIds - Array of workout IDs in new order
     * @returns {Promise<void>}
     */
    async updateWorkoutSequences(date, workoutIds) {
        return this._write(async () => {
            const sameDateWorkouts = await this._workoutsOnDate(date);
            const changed = [];
            workoutIds.forEach((id, index) => {
                const workout = sameDateWorkouts.find(w => w.id === id);
                if (workout) {
                    workout.sequence = index + 1;
                    changed.push(workout);
                }
            });

            await this._persistWorkouts(changed);
        });
    },

    /**
     * Overwrite superset links for a day. Every workout of an exercise listed in
     * the assignments gets the given group ID, or has the link removed when null.
     * @param {string} date - Date of workouts to update (YYYY-MM-DD)
     * @param {object} assignments - Map of exerciseId to supersetGroupId (or null to unlink)
     * @returns {Promise<void>}
     */
    async updateWorkoutSupersets(date, assignments) {
        return this._write(async () => {
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

            const changed = apply(await this._workoutsOnDate(date));
            await this._persistWorkouts(changed);
        });
    },

    /**
     * Update an existing workout entry
     * @param {string} id - Workout entry ID
     * @param {string} date - Workout entry date
     * @param {object} updates - Updates to apply (reps, weight)
     * @returns {Promise<object>} Updated workout entry
     */
    async updateWorkout(id, date, updates) {
        return this._write(async () => {
            const workout = (await this._workoutsOnDate(date)).find(w => w.id === id);
            if (!workout) {
                throw new Error('Workout not found');
            }

            Object.assign(workout, updates, {
                reps: parseInt(updates.reps, 10),
                weight: updates.weight ? parseFloat(updates.weight) : null
            });

            await this._persistWorkouts([workout]);
            return workout;
        });
    },

    /**
     * Delete a workout entry
     * @param {string} id - Workout entry ID
     * @param {string} date - Workout entry date
     * @returns {Promise<void>}
     */
    async deleteWorkout(id, date) {
        return this._write(async () => {
            const sameDateWorkouts = await this._workoutsOnDate(date);
            if (!sameDateWorkouts.some(w => w.id === id)) {
                throw new Error('Workout not found');
            }

            // Re-sequence remaining workouts for the same date
            const remaining = sameDateWorkouts
                .filter(w => w.id !== id)
                .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
            remaining.forEach((w, i) => {
                w.sequence = i + 1;
            });

            this.workouts = this.workouts.filter(w => w.id !== id);
            await this._persistWorkouts(remaining, [id]);
        });
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
        const data = await this._adapter.getSessionTemplates();
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
        return this._write(async () => {
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
        });
    },

    /**
     * Update existing session template
     * @param {string} id
     * @param {object} template - { name, rows }
     * @returns {Promise<object>}
     */
    async updateSessionTemplate(id, template) {
        return this._write(async () => {
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
        });
    },

    /**
     * Delete session template
     * @param {string} id
     * @returns {Promise<void>}
     */
    async deleteSessionTemplate(id) {
        return this._write(async () => {
            const index = this.sessionTemplates.findIndex(t => t.id === id);
            if (index === -1) throw new Error('Template not found');
            this.sessionTemplates.splice(index, 1);
            await this._persistSessionTemplates([], [id]);
        });
    },

    /**
     * Load all workouts from the persistence adapter.
     * @returns {Promise<array|null>} Array of workout objects or null
     */
    async getAllWorkouts() {
        try {
            return await this._adapter.getAllWorkouts();
        } catch {
            return null;
        }
    }
};
