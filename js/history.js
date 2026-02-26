// History Module
// Displays daily workout history with sequence ordering and drag-and-drop reordering

import { Storage } from './storage.js';
import { showToast, showLoading } from './app.js';
import { formatDate, parseDate, getWeekStart, getWeekNumber } from './utils.js';

export const History = {
    draggedWorkout: null,
    draggedDate: null,

    /**
     * Initialize history module
     */
    init() {
        this.renderHistory();

        // Listen for workout updates
        window.addEventListener('workoutsUpdated', () => {
            this.renderHistory();
        });
    },

    /**
     * Render unified history grouped by week
     */
    async renderHistory() {
        const container = document.getElementById('historyContent');
        if (!container) return;

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

            // Group workouts by week
            const workoutsByWeek = new Map(); // Key: Week start date string (Monday)
            const currentWeekStart = formatDate(getWeekStart(new Date()));

            for (const workout of allWorkouts) {
                const date = parseDate(workout.date);
                if (!date) continue;

                const weekStart = getWeekStart(date);
                const weekStartStr = formatDate(weekStart);

                if (!workoutsByWeek.has(weekStartStr)) {
                    workoutsByWeek.set(weekStartStr, {
                        workouts: [],
                        dates: new Map()
                    });
                }
                const weekData = workoutsByWeek.get(weekStartStr);
                weekData.workouts.push(workout);

                if (!weekData.dates.has(workout.date)) {
                    weekData.dates.set(workout.date, []);
                }
                weekData.dates.get(workout.date).push(workout);
            }

            // Pre-calculate muscle stats for ALL weeks
            const weekMuscleStats = new Map();
            for (const [weekStartStr, weekData] of workoutsByWeek.entries()) {
                const muscleStats = new Map();
                for (const workout of weekData.workouts) {
                    const exercise = Storage.getExerciseById(workout.exerciseId);
                    if (!exercise) continue;
                    const muscle = exercise.muscle || 'other';
                    if (!muscleStats.has(muscle)) {
                        muscleStats.set(muscle, new Set());
                    }
                    muscleStats.get(muscle).add(`${workout.date}_${workout.exerciseId}`);
                }

                const stats = new Map();
                for (const [muscle, instances] of muscleStats.entries()) {
                    stats.set(muscle, instances.size);
                }
                weekMuscleStats.set(weekStartStr, stats);
            }

            // Sort weeks descending (newest first)
            const sortedWeekStarts = Array.from(workoutsByWeek.keys()).sort((a, b) => b.localeCompare(a));

            // Clear container
            container.innerHTML = '';

            // Create week groups
            for (let i = 0; i < sortedWeekStarts.length; i++) {
                const weekStartStr = sortedWeekStarts[i];
                const weekData = workoutsByWeek.get(weekStartStr);
                const currentStats = weekMuscleStats.get(weekStartStr);
                const previousWeekStartStr = sortedWeekStarts[i + 1];
                const previousStats = previousWeekStartStr ? weekMuscleStats.get(previousWeekStartStr) : null;
                const isCurrentWeek = weekStartStr === currentWeekStart;

                const weekGroup = this.createWeekGroup(weekStartStr, weekData, currentStats, previousStats, isCurrentWeek);
                container.appendChild(weekGroup);
            }

            // Initialize icons
            if (window.lucide) {
                window.lucide.createIcons();
            }

            showLoading(false);
        } catch (error) {
            console.error('Error rendering history:', error);
            showToast(`Failed to load history: ${error.message}`, 'error');
            showLoading(false);
        }
    },

    /**
     * Create a weekly group element
     */
    createWeekGroup(weekStartStr, weekData, currentStats, previousStats, isCurrentWeek) {
        const weekStart = parseDate(weekStartStr);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);

        const fromStr = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const toStr = weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const weekNum = getWeekNumber(weekStart);
        const weekLabel = `Week ${String(weekNum).padStart(2, '0')} (${fromStr} – ${toStr}, ${weekEnd.getFullYear()})`;

        const group = document.createElement('div');
        group.className = 'history-week-group';
        if (!isCurrentWeek) {
            group.classList.add('collapsed');
        }

        const header = document.createElement('div');
        header.className = 'history-week-header';
        header.onclick = () => group.classList.toggle('collapsed');

        const title = document.createElement('h3');
        title.innerHTML = `<i data-lucide="calendar" class="icon-xs"></i> ${weekLabel}`;

        if (isCurrentWeek) {
            const badge = document.createElement('span');
            badge.className = 'current-week-badge';
            badge.textContent = 'Current';
            title.appendChild(badge);
        }

        const chevron = document.createElement('span');
        chevron.className = 'chevron';
        chevron.textContent = '▼';

        header.appendChild(title);
        header.appendChild(chevron);
        group.appendChild(header);

        const content = document.createElement('div');
        content.className = 'history-week-content';

        // 1. Summary Section
        const summarySection = this.createSummarySection(currentStats, previousStats, isCurrentWeek);
        content.appendChild(summarySection);

        // 2. Daily History Section
        const dailySection = document.createElement('div');
        dailySection.className = 'history-daily-section collapsed';

        const dailyHeader = document.createElement('div');
        dailyHeader.className = 'history-section-sub-header';
        dailyHeader.onclick = (e) => {
            e.stopPropagation();
            dailySection.classList.toggle('collapsed');
        };
        dailyHeader.innerHTML = `<span><i data-lucide="history" class="icon-xs"></i> Daily History</span><span class="chevron">▼</span>`;
        dailySection.appendChild(dailyHeader);

        const dailyList = document.createElement('div');
        dailyList.className = 'history-daily-list';

        const sortedDates = Array.from(weekData.dates.keys()).sort((a, b) => b.localeCompare(a));
        for (const date of sortedDates) {
            const workouts = weekData.dates.get(date);
            workouts.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
            const dateGroup = this.createDateGroup(date, workouts);
            dailyList.appendChild(dateGroup);
        }
        dailySection.appendChild(dailyList);
        content.appendChild(dailySection);

        group.appendChild(content);
        return group;
    },

    /**
     * Create summary section for a week
     */
    createSummarySection(currentStats, previousStats, isCurrentWeek) {
        const section = document.createElement('div');
        section.className = 'history-summary-section';
        if (!isCurrentWeek) {
            section.classList.add('collapsed');
        }

        const header = document.createElement('div');
        header.className = 'history-section-sub-header';
        header.onclick = (e) => {
            e.stopPropagation();
            section.classList.toggle('collapsed');
        };
        header.innerHTML = `<span><i data-lucide="bar-chart-2" class="icon-xs"></i> Weekly Summary</span><span class="chevron">▼</span>`;
        section.appendChild(header);

        const tableContainer = document.createElement('div');
        tableContainer.className = 'history-summary-table-container';

        if (!currentStats || currentStats.size === 0) {
            tableContainer.innerHTML = '<p class="empty-summary">No exercises logged.</p>';
        } else {
            const table = document.createElement('table');
            table.className = 'weekly-stats-table';
            table.innerHTML = `
                <thead>
                    <tr>
                        <th>Muscle Group</th>
                        <th style="text-align: right;">Total Ex.</th>
                    </tr>
                </thead>
                <tbody></tbody>
            `;
            const tbody = table.querySelector('tbody');

            const sortedMuscles = Array.from(currentStats.entries())
                .sort((a, b) => b[1] - a[1]);

            for (const [muscle, count] of sortedMuscles) {
                const trendInfo = this.getWeeklyTrendInfo(count, previousStats?.get(muscle));
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="muscle-name">${muscle}</td>
                    <td class="exercise-count-val">${count}<span class="weekly-trend-indicator ${trendInfo.className}" title="${trendInfo.tooltip}"><span class="weekly-trend-arrow">${trendInfo.arrow}</span>${trendInfo.delta ? `<span class="weekly-trend-delta">${trendInfo.delta}</span>` : ''}</span></td>
                `;
                tbody.appendChild(tr);
            }
            tableContainer.appendChild(table);
        }

        section.appendChild(tableContainer);
        return section;
    },

    getWeeklyTrendInfo(currentCount, previousCount) {
        if (previousCount == null) {
            return {
                arrow: '—',
                delta: '',
                className: 'trend-none',
                tooltip: 'No previous week data'
            };
        }

        const delta = currentCount - previousCount;

        if (currentCount > previousCount) {
            return {
                arrow: '▲',
                delta: `+${delta}`,
                className: 'trend-up',
                tooltip: `More than previous week (${previousCount})`
            };
        }

        if (currentCount < previousCount) {
            return {
                arrow: '▼',
                delta: `${delta}`,
                className: 'trend-down',
                tooltip: `Less than previous week (${previousCount})`
            };
        }

        return {
            arrow: '▶',
            delta: '0',
            className: 'trend-flat',
            tooltip: `Same as previous week (${previousCount})`
        };
    },

    /**
     * Create date group element with workouts
     * @param {string} date - Date string (YYYY-MM-DD)
     * @param {array} workouts - Array of workout objects
     * @returns {HTMLElement} Date group element
     */
    createDateGroup(date, workouts) {
        const group = document.createElement('div');
        group.className = 'history-date-group collapsed';

        // Date header
        const header = document.createElement('div');
        header.className = 'history-date-header';
        header.onclick = () => group.classList.toggle('collapsed');

        const titleContainer = document.createElement('div');
        titleContainer.style.display = 'flex';
        titleContainer.style.alignItems = 'center';
        titleContainer.style.gap = 'var(--spacing-sm)';

        const chevron = document.createElement('span');
        chevron.className = 'chevron';
        chevron.textContent = '▼';

        const dateTitle = document.createElement('h3');
        dateTitle.textContent = this.formatDateHeader(date);

        titleContainer.appendChild(chevron);
        titleContainer.appendChild(dateTitle);

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

        header.appendChild(titleContainer);
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
        item.className = 'history-exercise-group collapsed';
        item.dataset.date = date;
        item.dataset.exerciseId = exerciseId;
        item.draggable = true;

        // Add drag event listeners
        item.addEventListener('dragstart', (e) => this.handleExerciseGroupDragStart(e, exerciseId, date));
        item.addEventListener('dragover', (e) => this.handleExerciseGroupDragOver(e));
        item.addEventListener('drop', (e) => this.handleExerciseGroupDrop(e, exerciseId, date));
        item.addEventListener('dragend', () => this.handleExerciseGroupDragEnd());

        // Exercise header with inline sets
        const header = document.createElement('div');
        header.className = 'exercise-group-header';
        header.onclick = (e) => {
            // Don't toggle if clicking on buttons
            if (e.target.closest('button')) return;
            item.classList.toggle('collapsed');
        };

        const titleContainer = document.createElement('div');
        titleContainer.style.display = 'flex';
        titleContainer.style.alignItems = 'center';
        titleContainer.style.gap = 'var(--spacing-xs)';

        const chevron = document.createElement('span');
        chevron.className = 'chevron';
        chevron.textContent = '▼';
        titleContainer.appendChild(chevron);

        const title = document.createElement('h4');
        title.textContent = exercise ? exercise.name : 'Unknown Exercise';
        titleContainer.appendChild(title);

        header.appendChild(titleContainer);

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
            setItem.dataset.workoutId = workout.id;

            const setNum = document.createElement('span');
            setNum.className = 'set-number';
            setNum.textContent = `Set ${index + 1}`;
            setItem.appendChild(setNum);

            const setDetails = document.createElement('span');
            setDetails.className = 'set-details';
            setDetails.textContent = workout.weight
                ? `${workout.reps}x${workout.weight}`
                : `${workout.reps} reps`;
            setItem.appendChild(setDetails);

            // Actions container
            const actions = document.createElement('div');
            actions.className = 'set-actions';
            actions.style.marginLeft = 'auto';
            actions.style.display = 'flex';
            actions.style.gap = 'var(--spacing-xs)';

            const editBtn = document.createElement('button');
            editBtn.className = 'btn-icon btn-small btn-secondary';
            editBtn.innerHTML = '<i data-lucide="edit-2" style="width: 14px; height: 14px;"></i>';
            editBtn.title = 'Edit Set';
            editBtn.onclick = (e) => {
                e.stopPropagation();
                this.handleEditWorkout(workout);
            };

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-icon btn-small btn-secondary';
            deleteBtn.innerHTML = '<i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>';
            deleteBtn.title = 'Delete Set';
            deleteBtn.style.color = 'var(--error-color)';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                this.handleDeleteWorkout(workout);
            };

            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);
            setItem.appendChild(actions);

            setsList.appendChild(setItem);
        });

        item.appendChild(setsList);

        return item;
    },

    /**
     * Handle editing a workout entry
     * @param {object} workout - Workout object to edit
     */
    async handleEditWorkout(workout) {
        const newReps = prompt('Enter new reps:', workout.reps);
        if (newReps === null) return;

        const reps = parseInt(newReps, 10);
        if (isNaN(reps) || reps <= 0) {
            showToast('Please enter a valid number of reps', 'error');
            return;
        }

        let weight = workout.weight;
        const exercise = Storage.getExerciseById(workout.exerciseId);

        if (exercise && exercise.requiresWeight) {
            const newWeight = prompt('Enter new weight (kg):', workout.weight || '');
            if (newWeight === null) return;
            weight = newWeight === '' ? null : parseFloat(newWeight);
            if (newWeight !== '' && (isNaN(weight) || weight < 0)) {
                showToast('Please enter a valid weight', 'error');
                return;
            }
        }

        try {
            showLoading(true);
            await Storage.updateWorkout(workout.id, workout.date, { reps, weight });

            // Dispatch event to update other components
            window.dispatchEvent(new CustomEvent('workoutsUpdated'));

            await this.renderHistory();
            showToast('Workout updated successfully', 'success');
        } catch (error) {
            console.error('Error updating workout:', error);
            showToast(`Failed to update: ${error.message}`, 'error');
        } finally {
            showLoading(false);
        }
    },

    /**
     * Handle deleting a workout entry
     * @param {object} workout - Workout object to delete
     */
    async handleDeleteWorkout(workout) {
        if (!confirm('Are you sure you want to delete this set?')) {
            return;
        }

        try {
            showLoading(true);
            await Storage.deleteWorkout(workout.id, workout.date);

            // Dispatch event to update other components (like Statistics)
            window.dispatchEvent(new CustomEvent('workoutsUpdated'));

            await this.renderHistory();
            showToast('Workout deleted successfully', 'success');
        } catch (error) {
            console.error('Error deleting workout:', error);
            showToast(`Failed to delete: ${error.message}`, 'error');
        } finally {
            showLoading(false);
        }
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
            const options = { weekday: 'short', month: 'short', day: 'numeric' };
            const currentYear = new Date().getFullYear();
            if (date.getFullYear() !== currentYear) {
                options.year = 'numeric';
            }
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
            await this.renderHistory();

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

            // Get all workouts for this date - convert date string to Date object
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
            const workoutIds = newWorkoutOrder.map(w => w.id);
            await Storage.updateWorkoutSequences(date, workoutIds);

            // Re-render the history
            await this.renderHistory();

            showToast('Exercise order updated', 'success');
            showLoading(false);
        } catch (error) {
            console.error('Error reordering exercises:', error);
            showToast(`Failed to reorder: ${error.message}`, 'error');
            showLoading(false);
        } finally {
            // Clear drag state
            this.draggedExerciseId = null;
            this.draggedDate = null;
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
    }
};
