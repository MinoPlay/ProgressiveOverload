// Development Storage Module
// Uses local dev-data.json file instead of GitHub API

const DEV_API_URL = 'http://localhost:3000/api/dev-data';

export const DevStorage = {
    // In-memory cache
    exercises: [],
    exercisesSha: 'dev-sha-exercises',
    currentMonthWorkouts: [],
    currentMonthSha: 'dev-sha-workouts',
    currentMonthPath: null,

    /**
     * Initialize storage by loading from dev-data.json
     * @returns {Promise<void>}
     */
    async initialize() {
        console.log('🧪 DEV MODE: Loading data from dev-data.json');

        try {
            const response = await fetch(DEV_API_URL);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            this.exercises = data.exercises || [];
            this.currentMonthWorkouts = data.workouts || [];

            // Set current month path
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            this.currentMonthPath = `data/workouts-${year}-${month}.json`;

            console.log(`📦 Loaded ${this.exercises.length} exercises`);
            console.log(`📦 Loaded ${this.currentMonthWorkouts.length} workouts`);
            console.log('💾 Changes will be saved to data/dev-data.json');
        } catch (error) {
            console.error('❌ Failed to load dev data:', error);
            throw new Error('Could not load dev data. Make sure the server is running.');
        }
    },

    /**
     * Save current state to dev-data.json
     * @returns {Promise<void>}
     */
    async saveToFile() {
        try {
            const data = {
                exercises: this.exercises,
                workouts: this.currentMonthWorkouts
            };

            const response = await fetch(DEV_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            console.log('💾 DEV MODE: Saved to dev-data.json');
        } catch (error) {
            console.error('❌ Failed to save dev data:', error);
            throw new Error('Could not save changes');
        }
    },

    /**
     * Get all exercises
     * @returns {Array}
     */
    getExercises() {
        return [...this.exercises];
    },

    /**
     * Get exercise by ID
     * @param {string} id
     * @returns {Object|null}
     */
    getExerciseById(id) {
        return this.exercises.find(ex => ex.id === id) || null;
    },

    /**
     * Add new exercise
     * @param {Object} exercise
     * @returns {Promise<Object>}
     */
    async addExercise(exercise) {
        console.log('🧪 DEV MODE: Adding exercise');
        this.exercises.push(exercise);
        await this.saveToFile();
        return exercise;
    },

    /**
     * Update exercise
     * @param {Object} exercise
     * @returns {Promise<Object>}
     */
    async updateExercise(exercise) {
        console.log('🧪 DEV MODE: Updating exercise');
        const index = this.exercises.findIndex(ex => ex.id === exercise.id);
        if (index !== -1) {
            this.exercises[index] = exercise;
        }
        await this.saveToFile();
        return exercise;
    },

    /**
     * Delete exercise
     * @param {string} id
     * @returns {Promise<void>}
     */
    async deleteExercise(id) {
        console.log('🧪 DEV MODE: Deleting exercise');
        this.exercises = this.exercises.filter(ex => ex.id !== id);
        await this.saveToFile();
    },

    /**
     * Get workouts for a specific month
     * @param {number} year
     * @param {number} month
     * @returns {Promise<Array>}
     */
    async getWorkoutsForMonth(year, month) {
        const monthStr = String(month).padStart(2, '0');
        const prefix = `${year}-${monthStr}`;
        return this.currentMonthWorkouts.filter(w => w.date.startsWith(prefix));
    },

    /**
     * Get workouts for current month
     * @returns {Array}
     */
    getCurrentMonthWorkouts() {
        return [...this.currentMonthWorkouts];
    },

    /**
     * Add new workout
     * @param {Object} workout
     * @returns {Promise<Object>}
     */
    async addWorkout(workout) {
        console.log('🧪 DEV MODE: Adding workout');

        // Add sequence number if not present
        if (!workout.sequence) {
            const sameDay = this.currentMonthWorkouts.filter(w => w.date === workout.date);
            workout.sequence = sameDay.length + 1;
        }

        this.currentMonthWorkouts.push(workout);
        await this.saveToFile();
        return workout;
    },

    /**
     * Update workout
     * @param {Object} workout
     * @returns {Promise<Object>}
     */
    async updateWorkout(id, date, updates) {
        console.log('🧪 DEV MODE: Updating workout');
        const index = this.currentMonthWorkouts.findIndex(w => w.id === id);
        if (index !== -1) {
            this.currentMonthWorkouts[index] = {
                ...this.currentMonthWorkouts[index],
                ...updates
            };
        }
        await this.saveToFile();
        return this.currentMonthWorkouts[index];
    },

    /**
     * Delete workout
     * @param {string} id
     * @returns {Promise<void>}
     */
    async deleteWorkout(id, date) {
        console.log('🧪 DEV MODE: Deleting workout');
        this.currentMonthWorkouts = this.currentMonthWorkouts.filter(w => w.id !== id);

        // Re-sequence
        const sameDateWorkouts = this.currentMonthWorkouts
            .filter(w => w.date === date)
            .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

        sameDateWorkouts.forEach((w, i) => {
            w.sequence = i + 1;
        });

        await this.saveToFile();
    },

    /**
     * Get workouts for a specific date
     * @param {string} date - Date in YYYY-MM-DD format
     * @returns {Array}
     */
    getWorkoutsForDate(date) {
        return this.currentMonthWorkouts.filter(w => w.date === date);
    },

    /**
     * Get workout by ID
     * @param {string} id
     * @returns {Object|null}
     */
    getWorkoutById(id) {
        return this.currentMonthWorkouts.find(w => w.id === id) || null;
    },

    /**
     * Get recent workouts
     * @param {number} count - Number of recent workouts to return
     * @returns {Array}
     */
    getRecentWorkouts(count = 20) {
        return [...this.currentMonthWorkouts]
            .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
            .slice(0, count);
    },

    /**
     * Get workouts for a specific exercise
     * @param {string} exerciseId
     * @returns {Array}
     */
    getWorkoutsForExercise(exerciseId) {
        return this.currentMonthWorkouts
            .filter(w => w.exerciseId === exerciseId)
            .sort((a, b) => a.date.localeCompare(b.date));
    },

    /**
     * Get workouts within a date range
     * @param {Date|string} startDate - Date object or YYYY-MM-DD string
     * @param {Date|string} endDate - Date object or YYYY-MM-DD string
     * @returns {Promise<Array>}
     */
    async getWorkoutsInRange(startDate, endDate) {
        // Normalize to YYYY-MM-DD strings for comparison to avoid timezone issues
        let startStr, endStr;

        if (startDate instanceof Date) {
            // Convert Date to YYYY-MM-DD in local timezone (not UTC)
            const year = startDate.getFullYear();
            const month = String(startDate.getMonth() + 1).padStart(2, '0');
            const day = String(startDate.getDate()).padStart(2, '0');
            startStr = `${year}-${month}-${day}`;
        } else {
            startStr = startDate.split('T')[0];
        }

        if (endDate instanceof Date) {
            // Convert Date to YYYY-MM-DD in local timezone (not UTC)
            const year = endDate.getFullYear();
            const month = String(endDate.getMonth() + 1).padStart(2, '0');
            const day = String(endDate.getDate()).padStart(2, '0');
            endStr = `${year}-${month}-${day}`;
        } else {
            endStr = endDate.split('T')[0];
        }

        const filtered = this.currentMonthWorkouts.filter(w => {
            // Compare date strings directly (YYYY-MM-DD format)
            return w.date >= startStr && w.date <= endStr;
        });

        console.log(`🧪 DEV MODE: getWorkoutsInRange(${startStr} to ${endStr}) returned ${filtered.length} workouts`);
        return filtered;
    },

    /**
     * Update workout sequences for a specific date
     * @param {string} date - Date in YYYY-MM-DD format
     * @param {Array<string>} workoutIds - Ordered array of workout IDs
     * @returns {Promise<void>}
     */
    async updateWorkoutSequences(date, workoutIds) {
        console.log('🧪 DEV MODE: Updating workout sequences');
        console.log('  Date:', date);
        console.log('  Workout IDs to update:', workoutIds);

        // Update sequence numbers based on the provided order
        let updatedCount = 0;
        workoutIds.forEach((id, index) => {
            const workout = this.currentMonthWorkouts.find(w => w.id === id && w.date === date);
            if (workout) {
                const oldSequence = workout.sequence;
                workout.sequence = index + 1;
                console.log(`  Updated ${id}: sequence ${oldSequence} -> ${workout.sequence}`);
                updatedCount++;
            } else {
                console.warn(`  Workout not found: ${id} on date ${date}`);
            }
        });

        console.log(`  Total updated: ${updatedCount}/${workoutIds.length}`);

        // Save to file to persist the changes
        await this.saveToFile();
    }
};
