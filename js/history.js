// History Module
// Displays daily workout history with sequence ordering and drag-and-drop reordering

import { Storage } from './storage.js';
import { showToast, showLoading } from './app.js';
import { formatDate, parseDate, getWeekStart, getWeekNumber } from './utils.js';

export const History = {
    draggedWorkout: null,
    draggedDate: null,
    openModalDate: null,
    _modalListenersAttached: false,
    _supersetGroups: [],
    _supersetLinks: new Set(),
    _supersetConnectors: [],

    /**
     * Initialize history module
     */
    init() {
        this.renderHistory();

        if (!this._modalListenersAttached) {
            this._modalListenersAttached = true;
            const overlay = document.getElementById('historyDayOverlay');
            if (overlay) {
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) this.closeDayModal();
                });
            }
            const closeBtn = document.getElementById('historyDayCloseBtn');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.closeDayModal());
            }
        }

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

                const weekGroup = this.createWeekGroup(weekStartStr, weekData, currentStats, previousStats);
                container.appendChild(weekGroup);
            }

            // Initialize icons
            if (window.lucide) {
                window.lucide.createIcons();
            }

            // Refresh modal if open
            if (this.openModalDate) {
                const dateObj = new Date(this.openModalDate + 'T00:00:00');
                const freshWorkouts = await Storage.getWorkoutsInRange(dateObj, dateObj);
                const forDate = freshWorkouts.filter(w => w.date === this.openModalDate);
                forDate.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
                if (forDate.length === 0) {
                    this.closeDayModal();
                } else {
                    this.populateDayModal(this.openModalDate, forDate);
                }
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
    createWeekGroup(weekStartStr, weekData, currentStats, previousStats) {
        const group = document.createElement('div');
        group.className = 'history-week-group';

        const content = document.createElement('div');
        content.className = 'history-week-content';

        // 1. Summary Section (always visible)
        const summarySection = this.createSummarySection(currentStats, previousStats);
        content.appendChild(summarySection);

        // 2. Day Grid
        const dayGrid = this.createDayGrid(weekStartStr, weekData);
        content.appendChild(dayGrid);

        group.appendChild(content);
        return group;
    },

    /**
     * Create a 7-day Mon–Sun grid for a week
     */
    createDayGrid(weekStartStr, weekData) {
        const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const grid = document.createElement('div');
        grid.className = 'history-day-grid';

        for (let i = 0; i < 7; i++) {
            const dayDate = parseDate(weekStartStr);
            dayDate.setDate(dayDate.getDate() + i);
            const dateStr = formatDate(dayDate);
            const workouts = weekData.dates.get(dateStr) || [];
            grid.appendChild(this.createDayCell(dateStr, workouts, DAY_NAMES[i]));
        }

        return grid;
    },

    /**
     * Create a single day tile for the week grid
     */
    createDayCell(dateStr, workouts, dayName) {
        const hasWorkouts = workouts.length > 0;
        const cell = document.createElement('div');
        cell.className = 'history-day-cell' + (hasWorkouts ? '' : ' history-day-cell--empty');

        const d = new Date(dateStr + 'T00:00:00');
        const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

        const nameEl = document.createElement('span');
        nameEl.className = 'history-day-cell__name';
        nameEl.textContent = dayName;

        const dayEl = document.createElement('span');
        dayEl.className = 'history-day-cell__date';
        dayEl.textContent = d.getDate();

        const monthEl = document.createElement('span');
        monthEl.className = 'history-day-cell__month';
        monthEl.textContent = MONTHS[d.getMonth()];

        const yearEl = document.createElement('span');
        yearEl.className = 'history-day-cell__year';
        yearEl.textContent = d.getFullYear();

        cell.appendChild(nameEl);
        cell.appendChild(dayEl);
        cell.appendChild(monthEl);
        cell.appendChild(yearEl);

        if (hasWorkouts) {
            const exerciseCount = new Set(workouts.map(w => w.exerciseId)).size;
            const countEl = document.createElement('span');
            countEl.className = 'history-day-cell__count';
            countEl.textContent = `${exerciseCount} ex`;
            cell.appendChild(countEl);

            cell.addEventListener('click', () => {
                const sorted = [...workouts].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
                this.openDayModal(dateStr, sorted);
            });
        }

        return cell;
    },

    /**
     * Open the day detail modal for a given date
     */
    openDayModal(date, workouts) {
        this.openModalDate = date;

        const title = document.getElementById('historyDayModalTitle');
        if (title) {
            const d = new Date(date + 'T00:00:00');
            title.textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        }

        this.populateDayModal(date, workouts);

        const overlay = document.getElementById('historyDayOverlay');
        if (overlay) overlay.classList.add('open');

        if (window.lucide) window.lucide.createIcons();
    },

    /**
     * Populate the day modal body with exercise groups
     */
    populateDayModal(date, workouts) {
        const body = document.getElementById('historyDayModalBody');
        if (!body) return;
        body.innerHTML = '';

        const exerciseGroups = new Map();
        for (const workout of workouts) {
            if (!exerciseGroups.has(workout.exerciseId)) {
                exerciseGroups.set(workout.exerciseId, []);
            }
            exerciseGroups.get(workout.exerciseId).push(workout);
        }

        const sortedGroups = Array.from(exerciseGroups.entries())
            .map(([exerciseId, exerciseWorkouts]) => ({
                exerciseId,
                workouts: exerciseWorkouts,
                minSequence: Math.min(...exerciseWorkouts.map(w => w.sequence || 0))
            }))
            .sort((a, b) => a.minSequence - b.minSequence);

        this.buildSupersetLinks(sortedGroups);

        sortedGroups.forEach((group, index) => {
            if (index > 0) body.appendChild(this.createSupersetConnector(index - 1));
            const item = this.createGroupedExerciseItem(date, group.exerciseId, group.workouts, index + 1);
            body.appendChild(item);
        });

        this.refreshSupersetConnectors();

        const templateBtn = document.getElementById('historyDayModalTemplateBtn');
        if (templateBtn) {
            templateBtn.onclick = () => this.openTemplateModal(date, sortedGroups.map(g => g.exerciseId));
        }

        const overrideBtn = document.getElementById('historyDayModalOverrideBtn');
        if (overrideBtn) {
            overrideBtn.onclick = () => this.saveSupersetLinks(date, workouts);
        }

        if (window.lucide) window.lucide.createIcons();
    },

    /**
     * Build the pending superset links from the workouts already saved for a day.
     * Only consecutive exercises can form a superset, so a link is detected when two
     * neighbouring groups share the same supersetGroupId.
     * @param {array} sortedGroups - Exercise groups in display order
     */
    buildSupersetLinks(sortedGroups) {
        this._supersetGroups = sortedGroups;
        this._supersetLinks = new Set();
        this._supersetConnectors = [];

        const groupIdOf = (group) => group.workouts.find(w => w.supersetGroupId)?.supersetGroupId || null;

        for (let i = 0; i < sortedGroups.length - 1; i++) {
            const currentId = groupIdOf(sortedGroups[i]);
            if (currentId && currentId === groupIdOf(sortedGroups[i + 1]) && !this._supersetLinks.has(i - 1)) {
                this._supersetLinks.add(i);
            }
        }
    },

    /**
     * Create the toggle that links the exercise at `index` with the next one
     * @param {number} index - Index of the upper exercise in the pair
     * @returns {HTMLElement}
     */
    createSupersetConnector(index) {
        const connector = document.createElement('button');
        connector.type = 'button';
        connector.className = 'history-superset-connector';
        connector.dataset.index = String(index);
        connector.innerHTML = '<i data-lucide="link"></i><span>Superset</span>';
        connector.onclick = () => this.toggleSupersetLink(index);

        this._supersetConnectors[index] = connector;
        return connector;
    },

    /**
     * Toggle the link between two consecutive exercises. An exercise can belong to
     * one pair only, so linking is blocked while a neighbouring pair exists.
     * @param {number} index - Index of the upper exercise in the pair
     */
    toggleSupersetLink(index) {
        if (this._supersetLinks.has(index)) {
            this._supersetLinks.delete(index);
        } else {
            if (this._supersetLinks.has(index - 1) || this._supersetLinks.has(index + 1)) return;
            this._supersetLinks.add(index);
        }

        this.refreshSupersetConnectors();
    },

    /**
     * Sync connector state: active when linked, disabled when a neighbouring pair
     * already claims one of the two exercises.
     */
    refreshSupersetConnectors() {
        this._supersetConnectors.forEach((connector, index) => {
            if (!connector) return;
            const linked = this._supersetLinks.has(index);
            const blocked = !linked && (this._supersetLinks.has(index - 1) || this._supersetLinks.has(index + 1));

            connector.classList.toggle('linked', linked);
            connector.disabled = blocked;
            connector.title = linked ? 'Remove superset link' : 'Link as superset';
        });

        this._supersetGroups.forEach((group, index) => {
            const item = document.querySelector(`.history-exercise-group[data-exercise-id="${group.exerciseId}"]`);
            if (!item) return;
            item.classList.toggle('superset-linked', this._supersetLinks.has(index) || this._supersetLinks.has(index - 1));
        });
    },

    /**
     * Persist the pending superset links for a day, overriding the stored entries.
     * @param {string} date - Date string (YYYY-MM-DD)
     * @param {array} workouts - Workouts shown in the day modal
     */
    async saveSupersetLinks(date, workouts) {
        const groupIdOf = (group) => group.workouts.find(w => w.supersetGroupId)?.supersetGroupId || null;

        const assignments = {};
        this._supersetGroups.forEach(group => { assignments[group.exerciseId] = null; });

        this._supersetLinks.forEach(index => {
            const first = this._supersetGroups[index];
            const second = this._supersetGroups[index + 1];
            if (!first || !second) return;

            const existingId = groupIdOf(first);
            const groupId = existingId && existingId === groupIdOf(second)
                ? existingId
                : `ss-${date}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

            assignments[first.exerciseId] = groupId;
            assignments[second.exerciseId] = groupId;
        });

        try {
            showLoading(true);
            await Storage.updateWorkoutSupersets(date, assignments);

            workouts.forEach(workout => {
                if (!Object.prototype.hasOwnProperty.call(assignments, workout.exerciseId)) return;
                const groupId = assignments[workout.exerciseId];
                if (groupId) {
                    workout.supersetGroupId = groupId;
                } else {
                    delete workout.supersetGroupId;
                }
            });

            this.populateDayModal(date, workouts);
            showToast('Superset links saved', 'success');
            window.dispatchEvent(new CustomEvent('workoutsUpdated'));
        } catch (error) {
            showToast(`Failed to save superset links: ${error.message}`, 'error');
        } finally {
            showLoading(false);
        }
    },

    /**
     * Close the day detail modal
     */
    closeDayModal() {
        this.openModalDate = null;
        const overlay = document.getElementById('historyDayOverlay');
        if (overlay) overlay.classList.remove('open');
    },

    /**
     * Create summary section for a week
     */
    createSummarySection(currentStats, previousStats) {
        const section = document.createElement('div');
        section.className = 'history-summary-section collapsed';

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
        header.onclick = (e) => {
            if (e.target.closest('button')) return;
            group.classList.toggle('collapsed');
        };

        const titleContainer = document.createElement('div');
        titleContainer.className = 'history-title-row';

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

        // Sort exercise groups by minimum sequence to maintain order
        const sortedExerciseGroups = Array.from(exerciseGroups.entries())
            .map(([exerciseId, exerciseWorkouts]) => ({
                exerciseId,
                workouts: exerciseWorkouts,
                minSequence: Math.min(...exerciseWorkouts.map(w => w.sequence || 0))
            }))
            .sort((a, b) => a.minSequence - b.minSequence);

        const templateBtn = document.createElement('button');
        templateBtn.type = 'button';
        templateBtn.className = 'btn-icon btn-secondary btn-small';
        templateBtn.innerHTML = '<i data-lucide="bookmark-plus"></i>';
        templateBtn.title = 'Save as template';
        templateBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openTemplateModal(date, sortedExerciseGroups.map(g => g.exerciseId));
        });

        const headerRight = document.createElement('div');
        headerRight.className = 'history-date-header-right';
        headerRight.appendChild(exerciseCount);
        headerRight.appendChild(templateBtn);

        header.appendChild(titleContainer);
        header.appendChild(headerRight);
        group.appendChild(header);

        // Workouts list
        const list = document.createElement('div');
        list.className = 'history-workouts-list';
        list.dataset.date = date;

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
        titleContainer.className = 'history-title-row history-title-row--compact';

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
            actions.className = 'set-actions set-actions--push';

            const editBtn = document.createElement('button');
            editBtn.className = 'btn-icon btn-small btn-secondary';
            editBtn.innerHTML = '<i data-lucide="edit-2" style="width: 14px; height: 14px;"></i>';
            editBtn.title = 'Edit Set';
            editBtn.onclick = (e) => {
                e.stopPropagation();
                this.handleEditWorkout(workout);
            };

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-icon btn-small btn-secondary btn-danger-text';
            deleteBtn.innerHTML = '<i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>';
            deleteBtn.title = 'Delete Set';
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
    },

    /**
     * Open a modal to name and save a template from a day's exercises
     * @param {string} date
     * @param {string[]} exerciseIds
     */
    openTemplateModal(date, exerciseIds) {
        const d = new Date(date + 'T00:00:00');
        const defaultName = d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        const backdrop = document.createElement('div');
        backdrop.className = 'modal';

        const content = document.createElement('div');
        content.className = 'modal-content';
        content.style.maxWidth = '360px';

        const modalHeader = document.createElement('div');
        modalHeader.className = 'modal-header';
        const title = document.createElement('h2');
        title.textContent = 'Save as Template';
        modalHeader.appendChild(title);

        const body = document.createElement('div');
        body.className = 'modal-body';

        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        const label = document.createElement('label');
        label.textContent = 'Template Name';
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'e.g., Push Day A';
        input.maxLength = 100;
        input.autocomplete = 'off';
        input.id = 'template-name-input';
        input.name = 'template-name';
        input.value = defaultName;
        formGroup.appendChild(label);
        formGroup.appendChild(input);

        const formActions = document.createElement('div');
        formActions.className = 'form-actions';

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'btn btn-primary';
        saveBtn.innerHTML = '<i data-lucide="save"></i> Save';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.innerHTML = '<i data-lucide="x"></i> Cancel';

        formActions.appendChild(saveBtn);
        formActions.appendChild(cancelBtn);
        body.appendChild(formGroup);
        body.appendChild(formActions);
        content.appendChild(modalHeader);
        content.appendChild(body);
        backdrop.appendChild(content);
        document.body.appendChild(backdrop);

        if (window.lucide) window.lucide.createIcons();
        input.focus();
        input.select();

        const close = () => document.body.removeChild(backdrop);

        cancelBtn.addEventListener('click', close);
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

        const confirm = async () => {
            await this.createTemplateFromDate(date, exerciseIds, input.value);
            close();
        };

        saveBtn.addEventListener('click', confirm);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirm();
            if (e.key === 'Escape') close();
        });
    },

    /**
     * Create a template from a day's exercise list (exercises only, no reps/weights)
     * @param {string} date - Date string (YYYY-MM-DD)
     * @param {string[]} exerciseIds - Ordered exercise IDs from the day
     * @param {string} name - Template name
     */
    async createTemplateFromDate(date, exerciseIds, name) {
        const trimmedName = (name || '').trim();
        if (!trimmedName) {
            showToast('Template name cannot be empty', 'error');
            return;
        }

        const rows = exerciseIds.map(exerciseId => {
            const rowId = `tpl-row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            return {
                id: rowId,
                type: 'single',
                exerciseId,
                sets: Array.from({ length: 3 }, (_, i) => ({
                    id: `${rowId}-set-${i + 1}`,
                    reps: '',
                    weight: ''
                }))
            };
        });

        try {
            showLoading(true);
            await Storage.addSessionTemplate({ name: trimmedName, rows });
            showToast(`Template "${trimmedName}" created`, 'success');
        } catch (error) {
            showToast(`Failed to create template: ${error.message}`, 'error');
        } finally {
            showLoading(false);
        }
    }
};
