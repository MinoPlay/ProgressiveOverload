// Storage Module
// Central data management layer for exercises and workouts

import { GitHubAPI } from './github-api.js';

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
        const defaultExercises = [
            { id: this.generateId(), name: 'Bench Press', equipmentType: 'barbell', requiresWeight: true, createdAt: new Date().toISOString() },
            { id: this.generateId(), name: 'Squat', equipmentType: 'barbell', requiresWeight: true, createdAt: new Date().toISOString() },
            { id: this.generateId(), name: 'Deadlift', equipmentType: 'barbell', requiresWeight: true, createdAt: new Date().toISOString() },
            { id: this.generateId(), name: 'Pull-ups', equipmentType: 'bodyweight', requiresWeight: false, createdAt: new Date().toISOString() },
            { id: this.generateId(), name: 'Overhead Press', equipmentType: 'barbell', requiresWeight: true, createdAt: new Date().toISOString() },
            { id: this.generateId(), name: 'Barbell Rows', equipmentType: 'barbell', requiresWeight: true, createdAt: new Date().toISOString() },
            { id: this.generateId(), name: 'Dips', equipmentType: 'bodyweight', requiresWeight: false, createdAt: new Date().toISOString() },
            { id: this.generateId(), name: 'Bicep Curls', equipmentType: 'dumbbell', requiresWeight: true, createdAt: new Date().toISOString() }
        ];

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

        const newExercise = {
            id: this.generateId(),
            name: exercise.name,
            equipmentType: exercise.equipmentType,
            requiresWeight: exercise.equipmentType !== 'bodyweight',
            createdAt: new Date().toISOString()
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
        if (updates.name && updates.name !== this.exercises[index].name) {
            if (this.exercises.some(ex => ex.id !== id && ex.name.toLowerCase() === updates.name.toLowerCase())) {
                throw new Error('An exercise with this name already exists');
            }
        }

        // Update exercise
        this.exercises[index] = {
            ...this.exercises[index],
            ...updates,
            requiresWeight: updates.equipmentType ? updates.equipmentType !== 'bodyweight' : this.exercises[index].requiresWeight,
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
     * Add workout entry
     * @param {object} workout - Workout object
     * @returns {Promise<object>} Added workout
     */
    async addWorkout(workout) {
        const workoutDate = this.parseDate(workout.date);
        const now = new Date();
        const isSameMonth = workoutDate.getMonth() === now.getMonth() && 
                           workoutDate.getFullYear() === now.getFullYear();

        // If workout is for current month, use cached data
        if (isSameMonth) {
            const newWorkout = {
                id: this.generateId(),
                exerciseId: workout.exerciseId,
                date: workout.date,
                reps: parseInt(workout.reps),
                weight: workout.weight ? parseFloat(workout.weight) : null,
                notes: workout.notes || '',
                timestamp: new Date().toISOString()
            };

            this.currentMonthWorkouts.push(newWorkout);

            // Save to GitHub
            const result = await GitHubAPI.saveWorkouts(now, this.currentMonthWorkouts, this.currentMonthSha);
            this.currentMonthSha = result.content.sha;

            return newWorkout;
        } else {
            // Load different month, add workout, save
            const monthData = await GitHubAPI.getWorkouts(workoutDate);
            const newWorkout = {
                id: this.generateId(),
                exerciseId: workout.exerciseId,
                date: workout.date,
                reps: parseInt(workout.reps),
                weight: workout.weight ? parseFloat(workout.weight) : null,
                notes: workout.notes || '',
                timestamp: new Date().toISOString()
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
     * Get recent workouts (last 20)
     * @returns {array} Array of recent workouts
     */
    getRecentWorkouts() {
        return this.currentMonthWorkouts
            .slice()
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 20);
    },

    /**
     * Generate unique ID
     * @returns {string} Unique ID
     */
    generateId() {
        return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },

    /**
     * Parse date string (MM-DD-YYYY) to Date object
     * @param {string} dateStr - Date string
     * @returns {Date} Date object
     */
    parseDate(dateStr) {
        const [month, day, year] = dateStr.split('-').map(n => parseInt(n));
        return new Date(year, month - 1, day);
    },

    /**
     * Format date to MM-DD-YYYY
     * @param {Date} date - Date object
     * @returns {string} Formatted date string
     */
    formatDate(date) {
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const year = date.getFullYear();
        return `${month}-${day}-${year}`;
    }
};
