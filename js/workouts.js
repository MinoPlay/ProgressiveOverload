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

        // Validate required fields
        if (!exerciseId || !reps || !date) {
            showToast('Please fill in all required fields', 'error');
            return;
        }

        // Validate date format
        if (!isValidDate(date)) {
            showToast('Invalid date format. Use YYYY-MM-DD', 'error');
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

        try {
            const workout = {
                exerciseId,
                reps: repsValidation.value,
                weight: weight ? parseFloat(weight) : null,
                date
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
        
        // Show last 5 workouts with repeat functionality at the top
        const quickViewWorkouts = workouts.slice(0, 5);
        
        quickViewWorkouts.forEach(workout => {
            const item = this.createWorkoutItemWithRepeat(workout);
            container.appendChild(item);
        });

        // If there are more workouts, show remaining ones without repeat button
        if (workouts.length > 5) {
            const remainingWorkouts = workouts.slice(5);
            remainingWorkouts.forEach(workout => {
                const item = this.createWorkoutItem(workout);
                container.appendChild(item);
            });
        }
    },

    /**
     * Create workout item element with Repeat button (XSS-safe)
     * @param {object} workout - Workout object
     * @returns {HTMLElement} Workout item element
     */
    createWorkoutItemWithRepeat(workout) {
        const exercise = Storage.getExerciseById(workout.exerciseId);
        
        const item = document.createElement('div');
        item.className = 'workout-item fade-in workout-item-quick';

        const header = document.createElement('div');
        header.className = 'workout-item-header';

        const titleContainer = document.createElement('div');
        
        const title = document.createElement('h4');
        title.textContent = exercise ? exercise.name : 'Unknown Exercise';

        const dateSpan = document.createElement('span');
        dateSpan.className = 'workout-date';
        dateSpan.textContent = workout.date;

        titleContainer.appendChild(title);
        header.appendChild(titleContainer);
        header.appendChild(dateSpan);
        item.appendChild(header);

        const details = document.createElement('div');
        details.className = 'workout-details';

        // Add reps
        const repsDetail = this.createWorkoutDetail('Reps', workout.reps);
        details.appendChild(repsDetail);

        // Add weight if present
        if (workout.weight) {
            const weightDetail = this.createWorkoutDetail('Weight', `${workout.weight} kg`);
            details.appendChild(weightDetail);

            const volumeDetail = this.createWorkoutDetail('Volume', `${(workout.weight * workout.reps).toFixed(0)} kg`);
            details.appendChild(volumeDetail);
        }

        item.appendChild(details);

        // Add Repeat button
        const repeatBtn = document.createElement('button');
        repeatBtn.className = 'btn btn-secondary btn-small workout-repeat-btn';
        repeatBtn.textContent = '🔁 Repeat';
        repeatBtn.setAttribute('aria-label', `Repeat workout: ${exercise ? exercise.name : 'Unknown'}`);
        repeatBtn.addEventListener('click', () => this.repeatWorkout(workout));
        
        const btnContainer = document.createElement('div');
        btnContainer.style.marginTop = 'var(--spacing-md)';
        btnContainer.appendChild(repeatBtn);
        item.appendChild(btnContainer);

        return item;
    },

    /**
     * Repeat a workout by pre-filling the form
     * @param {object} workout - Workout object to repeat
     */
    repeatWorkout(workout) {
        // Scroll to form
        document.getElementById('workoutFormElement').scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Pre-fill form
        document.getElementById('workoutExercise').value = workout.exerciseId;
        document.getElementById('workoutReps').value = workout.reps;
        
        // Update weight field visibility and value
        this.updateWeightField();
        if (workout.weight) {
            document.getElementById('workoutWeight').value = workout.weight;
        }
        
        // Set today's date by default
        this.setDefaultDate();

        // Focus on reps field for quick adjustment
        document.getElementById('workoutReps').focus();

        const exercise = Storage.getExerciseById(workout.exerciseId);
        showToast(`Ready to log: ${exercise ? exercise.name : 'workout'}`, 'info');
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
            const weightDetail = this.createWorkoutDetail('Weight', `${workout.weight} kg`);
            details.appendChild(weightDetail);

            const volumeDetail = this.createWorkoutDetail('Volume', `${(workout.weight * workout.reps).toFixed(0)} kg`);
            details.appendChild(volumeDetail);
        }

        item.appendChild(details);

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
