// History Module
// Displays daily workout history with sequence ordering and drag-and-drop reordering

import { Storage } from './storage.js';
import { showToast, showLoading } from './app.js';
import { formatDate } from './utils.js';

export const History = {
    draggedWorkout: null,
    draggedDate: null,

    /**
     * Initialize history module
     */
    init() {
        this.renderDailyHistory();

        // Listen for workout updates
        window.addEventListener('workoutsUpdated', () => {
            this.renderDailyHistory();
        });
    },

    /**
     * Render daily workout history grouped by date
     */
    async renderDailyHistory() {
        const container = document.getElementById('historyContent');
        
        try {
            showLoading(true);

            // Load all workouts from the last 90 days
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 90);

            const allWorkouts = await Storage.getWorkoutsInRange(startDate, endDate);

            if (allWorkouts.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <p>No workout history yet. Start logging workouts!</p>
                    </div>
                `;
                showLoading(false);
                return;
            }

            // Group workouts by date
            const workoutsByDate = new Map();
            for (const workout of allWorkouts) {
                if (!workoutsByDate.has(workout.date)) {
                    workoutsByDate.set(workout.date, []);
                }
                workoutsByDate.get(workout.date).push(workout);
            }

            // Sort dates descending (newest first)
            const sortedDates = Array.from(workoutsByDate.keys()).sort((a, b) => b.localeCompare(a));

            // Clear container
            container.innerHTML = '';

            // Render each date group
            for (const date of sortedDates) {
                const workouts = workoutsByDate.get(date);
                // Sort workouts by sequence
                workouts.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

                const dateGroup = this.createDateGroup(date, workouts);
                container.appendChild(dateGroup);
            }

            showLoading(false);
        } catch (error) {
            console.error('Error rendering history:', error);
            showToast(`Failed to load history: ${error.message}`, 'error');
            showLoading(false);
        }
    },

    /**
     * Create date group element with workouts
     * @param {string} date - Date string (YYYY-MM-DD)
     * @param {array} workouts - Array of workout objects
     * @returns {HTMLElement} Date group element
     */
    createDateGroup(date, workouts) {
        const group = document.createElement('div');
        group.className = 'history-date-group';

        // Date header
        const header = document.createElement('div');
        header.className = 'history-date-header';
        
        const dateTitle = document.createElement('h3');
        dateTitle.textContent = this.formatDateHeader(date);
        
        // Group workouts by exercise
        const exerciseGroups = new Map();
        for (const workout of workouts) {
            if (!exerciseGroups.has(workout.exerciseId)) {
                exerciseGroups.set(workout.exerciseId, []);
            }
            exerciseGroups.get(workout.exerciseId).push(workout);
        }
        
        const exerciseCount = document.createElement('span');
        exerciseCount.className = 'workout-count';
        exerciseCount.textContent = `${exerciseGroups.size} exercise${exerciseGroups.size !== 1 ? 's' : ''}`;
        
        header.appendChild(dateTitle);
        header.appendChild(exerciseCount);
        group.appendChild(header);

        // Workouts list
        const list = document.createElement('div');
        list.className = 'history-workouts-list';
        list.dataset.date = date;

        // Sort exercise groups by minimum sequence to maintain order
        const sortedExerciseGroups = Array.from(exerciseGroups.entries())
            .map(([exerciseId, exerciseWorkouts]) => ({
                exerciseId,
                workouts: exerciseWorkouts,
                minSequence: Math.min(...exerciseWorkouts.map(w => w.sequence || 0))
            }))
            .sort((a, b) => a.minSequence - b.minSequence);

        // Create grouped items with display order
        sortedExerciseGroups.forEach((group, index) => {
            const item = this.createGroupedExerciseItem(date, group.exerciseId, group.workouts, index + 1);
            list.appendChild(item);
        });

        group.appendChild(list);

        return group;
    },

    /**
     * Create grouped exercise item showing all sets
     * @param {string} date - Date string (YYYY-MM-DD)
     * @param {string} exerciseId - Exercise ID
     * @param {array} workouts - Array of workout objects for this exercise
     * @param {number} displayOrder - Display order number (1, 2, 3, etc.)
     * @returns {HTMLElement} Grouped exercise item element
     */
    createGroupedExerciseItem(date, exerciseId, workouts, displayOrder) {
        const exercise = Storage.getExerciseById(exerciseId);
        
        const item = document.createElement('div');
        item.className = 'history-exercise-group';
        item.dataset.date = date;
        item.dataset.exerciseId = exerciseId;
        item.draggable = true;

        // Add drag event listeners
        item.addEventListener('dragstart', (e) => this.handleExerciseGroupDragStart(e, exerciseId, date));
        item.addEventListener('dragover', (e) => this.handleExerciseGroupDragOver(e));
        item.addEventListener('drop', (e) => this.handleExerciseGroupDrop(e, exerciseId, date));
        item.addEventListener('dragend', () => this.handleExerciseGroupDragEnd());

        // Exercise header
        const header = document.createElement('div');
        header.className = 'exercise-group-header';

        const title = document.createElement('h4');
        title.textContent = exercise ? exercise.name : 'Unknown Exercise';
        header.appendChild(title);

        // Sequence badge showing display order
        if (displayOrder) {
            const badge = document.createElement('span');
            badge.className = 'sequence-badge';
            badge.textContent = `#${displayOrder}`;
            item.appendChild(badge);
        }

        const setCount = document.createElement('span');
        setCount.className = 'set-count';
        setCount.textContent = `${workouts.length} set${workouts.length !== 1 ? 's' : ''}`;
        header.appendChild(setCount);

        item.appendChild(header);

        // Sets list
        const setsList = document.createElement('div');
        setsList.className = 'sets-list';

        workouts.forEach((workout, index) => {
            const setItem = document.createElement('div');
            setItem.className = 'set-item';

            const setNumber = document.createElement('span');
            setNumber.className = 'set-number';
            setNumber.textContent = `Set ${index + 1}:`;
            setItem.appendChild(setNumber);

            const setDetails = document.createElement('span');
            setDetails.className = 'set-details';
            
            let detailsText = `${workout.reps} reps`;
            if (workout.weight) {
                detailsText += ` @ ${workout.weight} kg`;
            }
            setDetails.textContent = detailsText;
            setItem.appendChild(setDetails);

            setsList.appendChild(setItem);
        });

        item.appendChild(setsList);

        return item;
    },

    /**
     * Create history workout item with drag-and-drop and sequence badge
     * @param {object} workout - Workout object
     * @returns {HTMLElement} Workout item element
     * @deprecated Use createGroupedExerciseItem instead
     */
    createHistoryWorkoutItem(workout) {
        const exercise = Storage.getExerciseById(workout.exerciseId);
        
        const item = document.createElement('div');
        item.className = 'history-workout-item';
        item.draggable = true;
        item.dataset.workoutId = workout.id;
        item.dataset.date = workout.date;

        // Add drag event listeners
        item.addEventListener('dragstart', (e) => this.handleDragStart(e, workout));
        item.addEventListener('dragover', (e) => this.handleDragOver(e));
        item.addEventListener('drop', (e) => this.handleDrop(e, workout));
        item.addEventListener('dragend', () => this.handleDragEnd());

        // Sequence badge
        if (workout.sequence) {
            const badge = document.createElement('span');
            badge.className = 'sequence-badge';
            badge.textContent = `#${workout.sequence}`;
            item.appendChild(badge);
        }

        // Workout content
        const content = document.createElement('div');
        content.className = 'workout-content';

        const title = document.createElement('h4');
        title.textContent = exercise ? exercise.name : 'Unknown Exercise';
        content.appendChild(title);

        const details = document.createElement('div');
        details.className = 'workout-details';

        // Reps
        const repsSpan = document.createElement('span');
        repsSpan.className = 'workout-stat';
        repsSpan.textContent = `${workout.reps} reps`;
        details.appendChild(repsSpan);

        // Weight (if present)
        if (workout.weight) {
            const weightSpan = document.createElement('span');
            weightSpan.className = 'workout-stat';
            weightSpan.textContent = `${workout.weight} kg`;
            details.appendChild(weightSpan);
        }

        content.appendChild(details);
        item.appendChild(content);

        return item;
    },

    /**
     * Format date header with relative information
     * @param {string} dateStr - Date string (YYYY-MM-DD)
     * @returns {string} Formatted date string
     */
    formatDateHeader(dateStr) {
        const date = new Date(dateStr + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.getTime() === today.getTime()) {
            return 'Today';
        } else if (date.getTime() === yesterday.getTime()) {
            return 'Yesterday';
        } else {
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            return date.toLocaleDateString('en-US', options);
        }
    },

    /**
     * Handle drag start event
     * @param {DragEvent} e - Drag event
     * @param {object} workout - Workout being dragged
     */
    handleDragStart(e, workout) {
        this.draggedWorkout = workout;
        this.draggedDate = workout.date;
        e.currentTarget.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    },

    /**
     * Handle drag over event
     * @param {DragEvent} e - Drag event
     */
    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
        const item = e.currentTarget;
        if (item.dataset.date === this.draggedDate) {
            item.classList.add('drag-over');
        }
    },

    /**
     * Handle drop event
     * @param {DragEvent} e - Drag event
     * @param {object} targetWorkout - Workout being dropped on
     */
    async handleDrop(e, targetWorkout) {
        e.preventDefault();
        e.stopPropagation();

        const item = e.currentTarget;
        item.classList.remove('drag-over');

        // Only allow reordering within same date
        if (!this.draggedWorkout || targetWorkout.date !== this.draggedDate) {
            showToast('Can only reorder workouts within the same day', 'error');
            return;
        }

        if (this.draggedWorkout.id === targetWorkout.id) {
            return;
        }

        try {
            showLoading(true);

            // Get all workouts for this date
            const list = item.parentElement;
            const workoutItems = Array.from(list.querySelectorAll('.history-workout-item'));
            
            // Get current order of workout IDs
            const currentOrder = workoutItems.map(el => el.dataset.workoutId);
            
            // Remove dragged workout from its current position
            const draggedIndex = currentOrder.indexOf(this.draggedWorkout.id);
            currentOrder.splice(draggedIndex, 1);
            
            // Insert at new position
            const targetIndex = currentOrder.indexOf(targetWorkout.id);
            currentOrder.splice(targetIndex, 0, this.draggedWorkout.id);

            // Update sequences in storage
            await Storage.updateWorkoutSequences(targetWorkout.date, currentOrder);

            // Re-render the history
            await this.renderDailyHistory();

            showToast('Workout order updated', 'success');
            showLoading(false);
        } catch (error) {
            console.error('Error reordering workouts:', error);
            showToast(`Failed to reorder: ${error.message}`, 'error');
            showLoading(false);
        }
    },

    /**
     * Handle drag end event
     */
    handleDragEnd() {
        // Remove dragging classes
        document.querySelectorAll('.history-workout-item').forEach(item => {
            item.classList.remove('dragging', 'drag-over');
        });
        
        this.draggedWorkout = null;
        this.draggedDate = null;
    },

    /**
     * Handle drag start for exercise group
     * @param {DragEvent} e - Drag event
     * @param {string} exerciseId - Exercise ID
     * @param {string} date - Date string
     */
    handleExerciseGroupDragStart(e, exerciseId, date) {
        this.draggedExerciseId = exerciseId;
        this.draggedDate = date;
        e.currentTarget.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    },

    /**
     * Handle drag over for exercise group
     * @param {DragEvent} e - Drag event
     */
    handleExerciseGroupDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
        const item = e.currentTarget;
        if (item.dataset.date === this.draggedDate && item.dataset.exerciseId !== this.draggedExerciseId) {
            item.classList.add('drag-over');
        }
    },

    /**
     * Handle drop for exercise group
     * @param {DragEvent} e - Drag event
     * @param {string} targetExerciseId - Target exercise ID
     * @param {string} date - Date string
     */
    async handleExerciseGroupDrop(e, targetExerciseId, date) {
        e.preventDefault();
        e.stopPropagation();

        const item = e.currentTarget;
        item.classList.remove('drag-over');

        // Only allow reordering within same date
        if (!this.draggedExerciseId || date !== this.draggedDate) {
            showToast('Can only reorder exercises within the same day', 'error');
            return;
        }

        if (this.draggedExerciseId === targetExerciseId) {
            return;
        }

        try {
            showLoading(true);

            // Get all workouts for this date
            const dateObj = new Date(date + 'T00:00:00');
            const allWorkouts = await Storage.getWorkoutsInRange(dateObj, dateObj);
            const workoutsForDate = allWorkouts.filter(w => w.date === date);
            
            // Group by exercise
            const exerciseGroups = new Map();
            for (const workout of workoutsForDate) {
                if (!exerciseGroups.has(workout.exerciseId)) {
                    exerciseGroups.set(workout.exerciseId, []);
                }
                exerciseGroups.get(workout.exerciseId).push(workout);
            }

            // Get current order of exercises based on DOM
            const list = item.parentElement;
            const exerciseItems = Array.from(list.querySelectorAll('.history-exercise-group'));
            const currentOrder = exerciseItems.map(el => el.dataset.exerciseId);

            // Remove dragged exercise from its current position
            const draggedIndex = currentOrder.indexOf(this.draggedExerciseId);
            currentOrder.splice(draggedIndex, 1);
            
            // Insert at new position
            const targetIndex = currentOrder.indexOf(targetExerciseId);
            currentOrder.splice(targetIndex, 0, this.draggedExerciseId);

            // Build new workout order with updated sequences
            const newWorkoutOrder = [];
            let sequenceCounter = 1;
            
            for (const exerciseId of currentOrder) {
                const workouts = exerciseGroups.get(exerciseId);
                if (!workouts) {
                    console.warn(`No workouts found for exercise ${exerciseId} on ${date}`);
                    continue;
                }
                
                // Sort workouts within exercise by their current sequence
                workouts.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
                
                for (const workout of workouts) {
                    newWorkoutOrder.push({
                        id: workout.id,
                        sequence: sequenceCounter++
                    });
                }
            }

            // Update sequences in storage
            await Storage.updateWorkoutSequences(date, newWorkoutOrder.map(w => w.id));

            // Re-render the history
            await this.renderDailyHistory();

            showToast('Exercise order updated', 'success');
            showLoading(false);
        } catch (error) {
            console.error('Error reordering exercises:', error);
            showToast(`Failed to reorder: ${error.message}`, 'error');
            showLoading(false);
        }
    },

    /**
     * Handle drag end for exercise group
     */
    handleExerciseGroupDragEnd() {
        // Remove dragging classes
        document.querySelectorAll('.history-exercise-group').forEach(item => {
            item.classList.remove('dragging', 'drag-over');
        });
        
        this.draggedExerciseId = null;
        this.draggedDate = null;
    }
};
