// Workouts Module
// Handles workout logging UI and interactions

import { Storage } from './storage.js';
import { showToast } from './app.js';

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
        dateInput.value = Storage.formatDate(today);
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

        if (!exerciseId || !reps || !date) {
            showToast('Please fill in all required fields', 'error');
            return;
        }

        // Validate date format
        if (!this.isValidDate(date)) {
            showToast('Invalid date format. Use MM-DD-YYYY', 'error');
            return;
        }

        try {
            const workout = {
                exerciseId,
                reps,
                weight: weight || null,
                date,
                notes
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
     * Validate date format (MM-DD-YYYY)
     * @param {string} dateStr - Date string
     * @returns {boolean} True if valid
     */
    isValidDate(dateStr) {
        const regex = /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])-\d{4}$/;
        if (!regex.test(dateStr)) {
            return false;
        }

        const [month, day, year] = dateStr.split('-').map(n => parseInt(n));
        const date = new Date(year, month - 1, day);
        
        return date.getFullYear() === year &&
               date.getMonth() === month - 1 &&
               date.getDate() === day;
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

        container.innerHTML = workouts.map(workout => {
            const exercise = Storage.getExerciseById(workout.exerciseId);
            
            return `
                <div class="workout-item fade-in">
                    <div class="workout-item-header">
                        <h4>${this.escapeHtml(exercise ? exercise.name : 'Unknown Exercise')}</h4>
                        <span class="workout-date">${workout.date}</span>
                    </div>
                    <div class="workout-details">
                        <div class="workout-detail">
                            <span class="workout-detail-label">Reps</span>
                            <span class="workout-detail-value">${workout.reps}</span>
                        </div>
                        ${workout.weight ? `
                            <div class="workout-detail">
                                <span class="workout-detail-label">Weight</span>
                                <span class="workout-detail-value">${workout.weight} lbs</span>
                            </div>
                        ` : ''}
                        ${workout.weight && workout.reps ? `
                            <div class="workout-detail">
                                <span class="workout-detail-label">Volume</span>
                                <span class="workout-detail-value">${(workout.weight * workout.reps).toFixed(0)} lbs</span>
                            </div>
                        ` : ''}
                    </div>
                    ${workout.notes ? `
                        <div class="workout-notes">
                            ${this.escapeHtml(workout.notes)}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    },

    /**
     * Escape HTML to prevent XSS
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};
