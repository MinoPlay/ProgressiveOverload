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
            const newWorkout = {
                id: generateId(),
                exerciseId: workout.exerciseId,
                date: workout.date,
                reps: parseInt(workout.reps, 10),
                weight: workout.weight ? parseFloat(workout.weight) : null
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
                id: generateId(),
                exerciseId: workout.exerciseId,
                date: workout.date,
                reps: parseInt(workout.reps, 10),
                weight: workout.weight ? parseFloat(workout.weight) : null
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
     * Get recent workouts (last N)
     * @returns {array} Array of recent workouts
     */
    getRecentWorkouts() {
        return this.currentMonthWorkouts
            .slice()
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, CONFIG.limits.recentWorkoutsCount);
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
    }
};
// Note: generateId, parseDate, and formatDate are now imported from utils.js
