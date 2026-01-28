// Workouts Module
// Handles workout logging UI and interactions

import { Storage } from './storage.js';
import { showToast } from './app.js';
import { CONFIG } from './config.js';
import { isValidDate, validateNumber, formatDate } from './utils.js';

export const Workouts = {
    /**
     * Initialize workout logging UI
     */
    init() {
        this.bindEvents();
        this.populateExerciseDropdown();
        this.setDefaultDate();
        this.renderRecentWorkouts();

        // Listen for exercise updates
        window.addEventListener('exercisesUpdated', () => {
            this.populateExerciseDropdown();
        });
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        const form = document.getElementById('workoutFormElement');
        const exerciseSelect = document.getElementById('workoutExercise');

        form.addEventListener('submit', (e) => this.handleSubmit(e));
        
        // Show/hide weight field based on exercise selection
        exerciseSelect.addEventListener('change', () => {
            this.updateWeightField();
        });
    },

    /**
     * Populate exercise dropdown
     */
    populateExerciseDropdown() {
        const select = document.getElementById('workoutExercise');
        const exercises = Storage.getExercises();

        // Keep first option (placeholder)
        select.innerHTML = '<option value="">-- Select Exercise --</option>';

        exercises.forEach(exercise => {
            const option = document.createElement('option');
            option.value = exercise.id;
            option.textContent = exercise.name;
            option.dataset.requiresWeight = exercise.requiresWeight;
            select.appendChild(option);
        });
    },

    /**
     * Update weight field visibility based on selected exercise
     */
    updateWeightField() {
        const select = document.getElementById('workoutExercise');
        const weightGroup = document.getElementById('weightGroup');
        const weightInput = document.getElementById('workoutWeight');

        if (select.value) {
            const selectedOption = select.options[select.selectedIndex];
            const requiresWeight = selectedOption.dataset.requiresWeight === 'true';

            if (requiresWeight) {
                weightGroup.style.display = 'block';
                weightInput.required = true;
            } else {
                weightGroup.style.display = 'none';
                weightInput.required = false;
                weightInput.value = '';
            }
        }
    },

    /**
     * Set default date to today
     */
    setDefaultDate() {
        const dateInput = document.getElementById('workoutDate');
        const today = new Date();
        dateInput.value = formatDate(today);
    },

    /**
     * Handle form submission
     * @param {Event} e - Submit event
     */
    async handleSubmit(e) {
        e.preventDefault();

        const exerciseId = document.getElementById('workoutExercise').value;
        const reps = document.getElementById('workoutReps').value;
        const weight = document.getElementById('workoutWeight').value;
        const date = document.getElementById('workoutDate').value;
        const notes = document.getElementById('workoutNotes').value;

        // Validate required fields
        if (!exerciseId || !reps || !date) {
            showToast('Please fill in all required fields', 'error');
            return;
        }

        // Validate date format
        if (!isValidDate(date)) {
            showToast('Invalid date format. Use MM-DD-YYYY', 'error');
            return;
        }

        // Validate reps
        const repsValidation = validateNumber(
            reps, 
            CONFIG.limits.minReps, 
            CONFIG.limits.maxReps, 
            'Reps'
        );
        if (!repsValidation.valid) {
            showToast(repsValidation.error, 'error');
            return;
        }

        // Validate weight if provided
        if (weight) {
            const weightValidation = validateNumber(
                weight, 
                CONFIG.limits.minWeight, 
                CONFIG.limits.maxWeight, 
                'Weight'
            );
            if (!weightValidation.valid) {
                showToast(weightValidation.error, 'error');
                return;
            }
        }

        // Validate notes length
        if (notes && notes.length > CONFIG.limits.maxNotesLength) {
            showToast(`Notes must be ${CONFIG.limits.maxNotesLength} characters or less`, 'error');
            return;
        }

        try {
            const workout = {
                exerciseId,
                reps: repsValidation.value,
                weight: weight ? parseFloat(weight) : null,
                date,
                notes: notes.trim()
            };

            await Storage.addWorkout(workout);
            
            const exercise = Storage.getExerciseById(exerciseId);
            showToast(`Workout logged: ${exercise.name}`, 'success');

            // Reset form
            document.getElementById('workoutFormElement').reset();
            this.setDefaultDate();
            this.renderRecentWorkouts();

            // Update weight field visibility
            document.getElementById('weightGroup').style.display = 'block';
        } catch (error) {
            showToast(error.message, 'error');
        }
    },

    /**
     * Render recent workouts list
     */
    renderRecentWorkouts() {
        const container = document.getElementById('recentWorkoutsList');
        const workouts = Storage.getRecentWorkouts();

        if (workouts.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No workouts logged yet. Start tracking your progress!</p>
                </div>
            `;
            return;
        }

        // Clear and rebuild with safe DOM methods
        container.innerHTML = '';
        
        workouts.forEach(workout => {
            const item = this.createWorkoutItem(workout);
            container.appendChild(item);
        });
    },

    /**
     * Create workout item element (XSS-safe)
     * @param {object} workout - Workout object
     * @returns {HTMLElement} Workout item element
     */
    createWorkoutItem(workout) {
        const exercise = Storage.getExerciseById(workout.exerciseId);
        
        const item = document.createElement('div');
        item.className = 'workout-item fade-in';

        const header = document.createElement('div');
        header.className = 'workout-item-header';

        const title = document.createElement('h4');
        title.textContent = exercise ? exercise.name : 'Unknown Exercise';

        const dateSpan = document.createElement('span');
        dateSpan.className = 'workout-date';
        dateSpan.textContent = workout.date;

        header.appendChild(title);
        header.appendChild(dateSpan);
        item.appendChild(header);

        const details = document.createElement('div');
        details.className = 'workout-details';

        // Add reps
        const repsDetail = this.createWorkoutDetail('Reps', workout.reps);
        details.appendChild(repsDetail);

        // Add weight if present
        if (workout.weight) {
            const weightDetail = this.createWorkoutDetail('Weight', `${workout.weight} lbs`);
            details.appendChild(weightDetail);

            const volumeDetail = this.createWorkoutDetail('Volume', `${(workout.weight * workout.reps).toFixed(0)} lbs`);
            details.appendChild(volumeDetail);
        }

        item.appendChild(details);

        // Add notes if present
        if (workout.notes) {
            const notes = document.createElement('div');
            notes.className = 'workout-notes';
            notes.textContent = workout.notes; // Safe from XSS
            item.appendChild(notes);
        }

        return item;
    },

    /**
     * Create workout detail element
     * @param {string} label - Detail label
     * @param {string|number} value - Detail value
     * @returns {HTMLElement} Detail element
     */
    createWorkoutDetail(label, value) {
        const detail = document.createElement('div');
        detail.className = 'workout-detail';

        const labelSpan = document.createElement('span');
        labelSpan.className = 'workout-detail-label';
        labelSpan.textContent = label;

        const valueSpan = document.createElement('span');
        valueSpan.className = 'workout-detail-value';
        valueSpan.textContent = value;

        detail.appendChild(labelSpan);
        detail.appendChild(valueSpan);

        return detail;
    }
};

// Remove deprecated methods
// isValidDate is now imported from utils.js
// escapeHtml is now imported from utils.js
