// Workouts Module
// Handles workout logging UI and interactions

import { Storage } from './storage.js';
import { showToast } from './app.js';
import { CONFIG } from './config.js';
import { isValidDate, validateNumber, formatDate } from './utils.js';

const PLANNER_DRAFT_KEY = 'plannedSessionDraft';
const DEFAULT_PLANNER_SET_COUNT = 3;

export const Workouts = {
    plannerExpanded: true,
    plannedSession: null,

    /**
     * Initialize workout logging UI
     */
    init() {
        this.bindEvents();
        this.populateMuscleDropdown();
        this.populateExerciseDropdown();
        this.populatePlannerExerciseDropdown();
        this.setDefaultDate();
        this.initializePlanner();
        this.updateDateTooltip();
        this.renderLastWorkoutSummary();

        // Listen for exercise updates
        window.addEventListener('exercisesUpdated', () => {
            this.populateMuscleDropdown();
            const muscleSelect = document.getElementById('workoutMuscle');
            this.populateExerciseDropdown(muscleSelect ? muscleSelect.value : '');
            this.populatePlannerExerciseDropdown();
            this.renderPlannedSession();
        });


    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        const form = document.getElementById('workoutFormElement');
        const muscleSelect = document.getElementById('workoutMuscle');
        const exerciseSelect = document.getElementById('workoutExercise');
        const clearBtn = document.getElementById('clearWorkoutBtn');
        const dateInput = document.getElementById('workoutDate');
        const plannerToggleBtn = document.getElementById('plannerToggleBtn');
        const plannerAddExerciseBtn = document.getElementById('plannerAddExerciseBtn');
        const plannerAddSupersetBtn = document.getElementById('plannerAddSupersetBtn');
        const plannerSubmitBtn = document.getElementById('plannerSubmitBtn');
        const plannerClearBtn = document.getElementById('plannerClearBtn');
        const plannedSessionList = document.getElementById('plannedSessionList');

        form.addEventListener('submit', (e) => this.handleSubmit(e));

        // Filter exercises based on muscle selection
        muscleSelect.addEventListener('change', () => {
            this.populateExerciseDropdown(muscleSelect.value);
            // Trigger exercise selection logic
            this.updateWeightField();
        });

        // Show/hide weight field and clear reps/weight based on exercise selection
        exerciseSelect.addEventListener('change', () => {
            const repsInput = document.getElementById('workoutReps');
            const weightInput = document.getElementById('workoutWeight');

            if (repsInput) repsInput.value = '';
            if (weightInput) weightInput.value = '';

            this.updateWeightField();
        });

        // Clear form button
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearForm());
        }

        // Update tooltip when date changes
        if (dateInput) {
            dateInput.addEventListener('change', () => {
                this.updateDateTooltip();
                this.syncPlannerDate();
            });
        }

        if (plannerToggleBtn) {
            plannerToggleBtn.addEventListener('click', () => this.togglePlanner());
        }

        if (plannerAddExerciseBtn) {
            plannerAddExerciseBtn.addEventListener('click', () => this.addPlannedExercise());
        }

        if (plannerAddSupersetBtn) {
            plannerAddSupersetBtn.addEventListener('click', () => this.addSupersetBlock());
        }

        if (plannerSubmitBtn) {
            plannerSubmitBtn.addEventListener('click', () => this.handlePlannedSubmit());
        }

        if (plannerClearBtn) {
            plannerClearBtn.addEventListener('click', () => this.clearPlannedSession(true));
        }

        if (plannedSessionList) {
            plannedSessionList.addEventListener('change', (event) => this.handlePlannerFieldChange(event));
            plannedSessionList.addEventListener('click', (event) => this.handlePlannerAction(event));
        }
    },

    /**
     * Populate muscle dropdown
     */
    populateMuscleDropdown() {
        const select = document.getElementById('workoutMuscle');
        if (!select) return;

        const exercises = Storage.getExercises();
        const muscles = [...new Set(exercises.map(ex => ex.muscle).filter(Boolean))];

        // Keep first option
        const currentValue = select.value;
        select.innerHTML = '<option value="">All Muscles</option>';

        // Sort muscles alphabetically
        muscles.sort((a, b) => a.localeCompare(b));

        muscles.forEach(muscle => {
            const option = document.createElement('option');
            option.value = muscle;
            option.textContent = muscle.charAt(0).toUpperCase() + muscle.slice(1);
            select.appendChild(option);
        });

        // Restore value if it still exists
        if (muscles.includes(currentValue)) {
            select.value = currentValue;
        }
    },

    /**
     * Populate exercise dropdown
     * @param {string} muscleFilter - Optional muscle to filter by
     */
    populateExerciseDropdown(muscleFilter = '') {
        const select = document.getElementById('workoutExercise');
        let exercises = Storage.getExercises();

        // Apply filter if provided
        if (muscleFilter) {
            exercises = exercises.filter(ex => ex.muscle === muscleFilter);
        }

        // Keep first option (placeholder)
        select.innerHTML = '<option value="">Select Exercise...</option>';

        // Sort exercises alphabetically by name
        exercises.sort((a, b) => a.name.localeCompare(b.name));

        exercises.forEach(exercise => {
            const option = document.createElement('option');
            option.value = exercise.id;
            option.textContent = exercise.name;
            option.dataset.requiresWeight = exercise.requiresWeight;
            select.appendChild(option);
        });

        this.populatePlannerExerciseDropdown();
    },

    /**
     * Populate planner exercise dropdown
     * @param {array} preparedExercises - Optional pre-filtered exercises
     */
    populatePlannerExerciseDropdown(preparedExercises = null) {
        const select = document.getElementById('plannerExerciseSelect');
        if (!select) return;

        let exercises = preparedExercises || Storage.getExercises();
        exercises = [...exercises].sort((a, b) => a.name.localeCompare(b.name));

        const currentValue = select.value;
        select.innerHTML = '<option value="">Select Exercise...</option>';

        exercises.forEach(exercise => {
            const option = document.createElement('option');
            option.value = exercise.id;
            option.textContent = exercise.name;
            select.appendChild(option);
        });

        if (currentValue && exercises.some(ex => ex.id === currentValue)) {
            select.value = currentValue;
        }
    },

    initializePlanner() {
        const dateInput = document.getElementById('workoutDate');
        const currentDate = dateInput ? dateInput.value : formatDate(new Date());

        this.plannedSession = {
            id: `session-${Date.now()}`,
            date: currentDate,
            rows: []
        };

        this.restorePlannerDraft();
        this.renderPlannedSession();
    },

    togglePlanner() {
        this.plannerExpanded = !this.plannerExpanded;

        const content = document.getElementById('plannerContent');
        const toggleBtn = document.getElementById('plannerToggleBtn');
        if (!content || !toggleBtn) return;

        content.classList.toggle('collapsed', !this.plannerExpanded);
        toggleBtn.textContent = this.plannerExpanded ? 'Hide' : 'Show';
        toggleBtn.setAttribute('aria-expanded', String(this.plannerExpanded));
    },

    syncPlannerDate() {
        if (!this.plannedSession) return;
        const dateInput = document.getElementById('workoutDate');
        if (!dateInput?.value) return;

        this.plannedSession.date = dateInput.value;
        this.persistPlannerDraft();
    },

    addPlannedExercise() {
        const select = document.getElementById('plannerExerciseSelect');
        if (!select) return;

        const rowId = `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        this.plannedSession.rows.push({
            id: rowId,
            type: 'single',
            exerciseId: select.value || '',
            sets: this.createDefaultPlannerSets(rowId)
        });

        this.persistPlannerDraft();
        this.renderPlannedSession();
    },

    addSupersetBlock() {
        const blockId = `ss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const firstExerciseId = `${blockId}-a`;
        const secondExerciseId = `${blockId}-b`;

        this.plannedSession.rows.push({
            id: blockId,
            type: 'superset',
            label: 'Superset',
            exercises: [
                {
                    id: firstExerciseId,
                    exerciseId: '',
                    sets: this.createDefaultPlannerSets(firstExerciseId)
                },
                {
                    id: secondExerciseId,
                    exerciseId: '',
                    sets: this.createDefaultPlannerSets(secondExerciseId)
                }
            ]
        });

        this.persistPlannerDraft();
        this.renderPlannedSession();
    },

    handlePlannerAction(event) {
        const button = event.target.closest('button[data-action]');
        if (!button) return;

        const { action, rowId, itemId } = button.dataset;

        if (action === 'remove-row') {
            this.plannedSession.rows = this.plannedSession.rows.filter(row => row.id !== rowId);
        }

        if (action === 'add-superset-exercise') {
            const row = this.plannedSession.rows.find(entry => entry.id === rowId && entry.type === 'superset');
            if (row) {
                const entryId = `${rowId}-${Math.random().toString(36).slice(2, 8)}`;
                row.exercises.push({
                    id: entryId,
                    exerciseId: '',
                    sets: this.createDefaultPlannerSets(entryId)
                });
            }
        }

        if (action === 'remove-superset-exercise') {
            const row = this.plannedSession.rows.find(entry => entry.id === rowId && entry.type === 'superset');
            if (row) {
                row.exercises = row.exercises.filter(item => item.id !== itemId);
                if (row.exercises.length === 0) {
                    this.plannedSession.rows = this.plannedSession.rows.filter(entry => entry.id !== rowId);
                }
            }
        }

        if (action === 'copy-first-set') {
            this.copyFirstSetToRemaining(rowId, itemId || null);
        }

        this.persistPlannerDraft();
        this.renderPlannedSession();
    },

    copyFirstSetToRemaining(rowId, itemId = null) {
        const row = this.plannedSession.rows.find(entry => entry.id === rowId);
        if (!row) return;

        const target = row.type === 'superset'
            ? row.exercises.find(entry => entry.id === itemId)
            : row;

        if (!target || !Array.isArray(target.sets) || target.sets.length < 2) return;

        const firstSet = target.sets[0];
        for (let index = 1; index < target.sets.length; index += 1) {
            target.sets[index].reps = firstSet.reps;
            target.sets[index].weight = firstSet.weight;
        }
    },

    handlePlannerFieldChange(event) {
        const field = event.target;
        if (!field?.dataset?.field) return;

        const fieldName = field.dataset.field;

        const row = this.plannedSession.rows.find(entry => entry.id === field.dataset.rowId);
        if (!row) return;

        if (row.type === 'single') {
            if (fieldName === 'exerciseId') {
                row.exerciseId = field.value;
            } else {
                const setEntry = (row.sets || []).find(entry => entry.id === field.dataset.setId);
                if (!setEntry) return;
                setEntry[fieldName] = field.value;
            }
        } else {
            const item = row.exercises.find(entry => entry.id === field.dataset.itemId);
            if (!item) return;

            if (fieldName === 'exerciseId') {
                item.exerciseId = field.value;
            } else {
                const setEntry = (item.sets || []).find(entry => entry.id === field.dataset.setId);
                if (!setEntry) return;
                setEntry[fieldName] = field.value;
            }
        }

        this.persistPlannerDraft();
    },

    renderPlannedSession() {
        const container = document.getElementById('plannedSessionList');
        if (!container || !this.plannedSession) return;

        container.innerHTML = '';

        if (!this.plannedSession.rows.length) {
            const empty = document.createElement('div');
            empty.className = 'planned-empty';
            empty.textContent = 'No planned entries yet. Add exercises or a superset block.';
            container.appendChild(empty);
            return;
        }

        this.plannedSession.rows.forEach((row, index) => {
            if (row.type === 'single') {
                container.appendChild(this.createSinglePlannedRow(row, index));
            } else {
                container.appendChild(this.createSupersetRow(row, index));
            }
        });

        if (window.lucide) {
            window.lucide.createIcons();
        }
    },

    createSinglePlannedRow(row, index) {
        const wrapper = document.createElement('div');
        wrapper.className = 'planned-row';

        const header = document.createElement('div');
        header.className = 'planned-row-header';

        const title = document.createElement('span');
        title.className = 'planned-row-title';
        title.textContent = `Exercise ${index + 1}`;

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-icon btn-secondary btn-small';
        removeBtn.dataset.action = 'remove-row';
        removeBtn.dataset.rowId = row.id;
        removeBtn.innerHTML = '<i data-lucide="trash-2"></i>';
        removeBtn.title = 'Remove row';

        header.appendChild(title);

        const topRow = document.createElement('div');
        topRow.className = 'planned-entry-top';
        topRow.appendChild(this.createExerciseSelect(row.id, null, row.exerciseId));
        topRow.appendChild(removeBtn);

        wrapper.appendChild(header);
        wrapper.appendChild(topRow);
        wrapper.appendChild(this.createPlannerSetsGrid(row.id, null, row.sets));
        return wrapper;
    },

    createSupersetRow(row, index) {
        const wrapper = document.createElement('div');
        wrapper.className = 'superset-block';

        const header = document.createElement('div');
        header.className = 'superset-header';

        const title = document.createElement('span');
        title.className = 'superset-title';
        title.textContent = `${row.label} ${index + 1}`;

        const headerActions = document.createElement('div');
        headerActions.className = 'set-actions';

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'btn-icon btn-secondary btn-small';
        addBtn.dataset.action = 'add-superset-exercise';
        addBtn.dataset.rowId = row.id;
        addBtn.innerHTML = '<i data-lucide="plus"></i>';
        addBtn.title = 'Add exercise to superset';

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-icon btn-secondary btn-small';
        removeBtn.dataset.action = 'remove-row';
        removeBtn.dataset.rowId = row.id;
        removeBtn.innerHTML = '<i data-lucide="trash-2"></i>';
        removeBtn.title = 'Remove superset block';

        headerActions.appendChild(addBtn);
        headerActions.appendChild(removeBtn);
        header.appendChild(title);
        header.appendChild(headerActions);

        const exercisesContainer = document.createElement('div');
        exercisesContainer.className = 'superset-exercises';

        row.exercises.forEach((exerciseEntry, exerciseIndex) => {
            const rowContainer = document.createElement('div');
            rowContainer.className = 'superset-exercise-row';

            const label = document.createElement('span');
            label.className = 'superset-label';
            label.textContent = String.fromCharCode(65 + (exerciseIndex % 26));

            const content = document.createElement('div');
            content.className = 'superset-exercise-content';

            const topRow = document.createElement('div');
            topRow.className = 'planned-entry-top';
            topRow.appendChild(this.createExerciseSelect(row.id, exerciseEntry.id, exerciseEntry.exerciseId));

            const removeSubBtn = document.createElement('button');
            removeSubBtn.type = 'button';
            removeSubBtn.className = 'btn-icon btn-secondary btn-small';
            removeSubBtn.dataset.action = 'remove-superset-exercise';
            removeSubBtn.dataset.rowId = row.id;
            removeSubBtn.dataset.itemId = exerciseEntry.id;
            removeSubBtn.innerHTML = '<i data-lucide="x"></i>';
            removeSubBtn.title = 'Remove exercise';
            topRow.appendChild(removeSubBtn);

            rowContainer.appendChild(label);
            content.appendChild(topRow);
            content.appendChild(this.createPlannerSetsGrid(row.id, exerciseEntry.id, exerciseEntry.sets));
            rowContainer.appendChild(content);
            exercisesContainer.appendChild(rowContainer);
        });

        wrapper.appendChild(header);
        wrapper.appendChild(exercisesContainer);
        return wrapper;
    },

    createExerciseSelect(rowId, itemId, selectedValue) {
        const select = document.createElement('select');
        select.dataset.field = 'exerciseId';
        select.dataset.rowId = rowId;
        if (itemId) {
            select.dataset.itemId = itemId;
        }

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select Exercise...';
        select.appendChild(defaultOption);

        const exercises = Storage.getExercises().slice().sort((a, b) => a.name.localeCompare(b.name));
        exercises.forEach(exercise => {
            const option = document.createElement('option');
            option.value = exercise.id;
            option.textContent = exercise.name;
            select.appendChild(option);
        });

        select.value = selectedValue || '';
        return select;
    },

    createPlannerSetsGrid(rowId, itemId, sets = []) {
        const container = document.createElement('div');
        container.className = 'planner-sets-grid';

        const normalizedSets = Array.isArray(sets) ? sets : this.createDefaultPlannerSets(itemId || rowId);

        normalizedSets.forEach((setEntry, index) => {
            const card = document.createElement('div');
            card.className = 'planner-set-card';

            const title = document.createElement('span');
            title.className = 'planner-set-title';
            title.textContent = `Set ${index + 1}`;

            const fields = document.createElement('div');
            fields.className = 'planner-set-fields';
            fields.appendChild(this.createPlannerInput('number', 'reps', rowId, itemId, setEntry.id, setEntry.reps, 'Reps', 1, 999));
            fields.appendChild(this.createPlannerInput('number', 'weight', rowId, itemId, setEntry.id, setEntry.weight, 'Weight', 0, null, 'any'));

            card.appendChild(title);
            card.appendChild(fields);
            container.appendChild(card);
        });

        const actionRow = document.createElement('div');
        actionRow.className = 'planner-set-actions';

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'btn btn-secondary btn-small';
        copyBtn.dataset.action = 'copy-first-set';
        copyBtn.dataset.rowId = rowId;
        if (itemId) {
            copyBtn.dataset.itemId = itemId;
        }
        copyBtn.textContent = 'Copy Set 1 → Set 2/3';

        actionRow.appendChild(copyBtn);
        container.appendChild(actionRow);

        return container;
    },

    createPlannerInput(type, fieldName, rowId, itemId, setId, value, placeholder, min = null, max = null, step = null) {
        const input = document.createElement('input');
        input.type = type;
        input.placeholder = placeholder;
        input.value = value || '';
        input.dataset.field = fieldName;
        input.dataset.rowId = rowId;

        if (itemId) {
            input.dataset.itemId = itemId;
        }
        if (setId) {
            input.dataset.setId = setId;
        }
        if (min !== null) {
            input.min = String(min);
        }
        if (max !== null) {
            input.max = String(max);
        }
        if (step !== null) {
            input.step = String(step);
        }

        return input;
    },

    persistPlannerDraft() {
        if (!this.plannedSession) return;
        localStorage.setItem(PLANNER_DRAFT_KEY, JSON.stringify(this.plannedSession));
    },

    restorePlannerDraft() {
        const rawDraft = localStorage.getItem(PLANNER_DRAFT_KEY);
        if (!rawDraft) return;

        try {
            const parsed = JSON.parse(rawDraft);
            if (!parsed || !Array.isArray(parsed.rows)) return;

            const dateInput = document.getElementById('workoutDate');
            if (dateInput && parsed.date) {
                dateInput.value = parsed.date;
            }

            this.plannedSession = {
                id: parsed.id || `session-${Date.now()}`,
                date: parsed.date || (dateInput ? dateInput.value : formatDate(new Date())),
                rows: parsed.rows.map((row, index) => this.normalizePlannedRow(row, index))
            };
        } catch (error) {
            console.warn('Could not restore planner draft:', error);
            localStorage.removeItem(PLANNER_DRAFT_KEY);
        }
    },

    createDefaultPlannerSets(baseId) {
        return Array.from({ length: DEFAULT_PLANNER_SET_COUNT }, (_, index) => ({
            id: `${baseId}-set-${index + 1}`,
            reps: '',
            weight: ''
        }));
    },

    normalizePlannerSets(rawSets, baseId, legacyReps = '', legacyWeight = '') {
        const normalized = Array.isArray(rawSets)
            ? rawSets.map((setEntry, index) => ({
                id: setEntry?.id || `${baseId}-set-${index + 1}`,
                reps: setEntry?.reps ?? '',
                weight: setEntry?.weight ?? ''
            }))
            : [];

        if (normalized.length === 0 && (legacyReps !== '' || legacyWeight !== '')) {
            normalized.push({
                id: `${baseId}-set-1`,
                reps: legacyReps ?? '',
                weight: legacyWeight ?? ''
            });
        }

        while (normalized.length < DEFAULT_PLANNER_SET_COUNT) {
            const nextIndex = normalized.length + 1;
            normalized.push({
                id: `${baseId}-set-${nextIndex}`,
                reps: '',
                weight: ''
            });
        }

        return normalized.slice(0, DEFAULT_PLANNER_SET_COUNT);
    },

    normalizePlannedRow(row, index) {
        const rowId = row?.id || `row-${Date.now()}-${index}`;

        if (row?.type === 'superset') {
            const rawExercises = Array.isArray(row.exercises) && row.exercises.length
                ? row.exercises
                : [
                    { id: `${rowId}-a`, exerciseId: '' },
                    { id: `${rowId}-b`, exerciseId: '' }
                ];

            const exercises = rawExercises.map((exerciseEntry, exerciseIndex) => {
                const entryId = exerciseEntry?.id || `${rowId}-${exerciseIndex + 1}`;
                return {
                    id: entryId,
                    exerciseId: exerciseEntry?.exerciseId || '',
                    sets: this.normalizePlannerSets(exerciseEntry?.sets, entryId, exerciseEntry?.reps, exerciseEntry?.weight)
                };
            });

            return {
                id: rowId,
                type: 'superset',
                label: row?.label || 'Superset',
                exercises
            };
        }

        return {
            id: rowId,
            type: 'single',
            exerciseId: row?.exerciseId || '',
            sets: this.normalizePlannerSets(row?.sets, rowId, row?.reps, row?.weight)
        };
    },

    isPlannerSetEmpty(setEntry) {
        const repsValue = setEntry?.reps;
        const weightValue = setEntry?.weight;
        const repsEmpty = repsValue === '' || repsValue === null || repsValue === undefined;
        const weightEmpty = weightValue === '' || weightValue === null || weightValue === undefined;
        return repsEmpty && weightEmpty;
    },

    clearPlannedSession(showMessage = false) {
        const dateInput = document.getElementById('workoutDate');
        this.plannedSession = {
            id: `session-${Date.now()}`,
            date: dateInput?.value || formatDate(new Date()),
            rows: []
        };

        localStorage.removeItem(PLANNER_DRAFT_KEY);
        this.renderPlannedSession();

        if (showMessage) {
            showToast('Planned session cleared', 'info');
        }
    },

    async handlePlannedSubmit() {
        if (!this.plannedSession || this.plannedSession.rows.length === 0) {
            showToast('Add at least one planned entry before submitting', 'error');
            return;
        }

        const dateInput = document.getElementById('workoutDate');
        const date = dateInput?.value;

        if (!date || !isValidDate(date)) {
            showToast('Please select a valid workout date', 'error');
            return;
        }

        const batch = [];

        for (const row of this.plannedSession.rows) {
            if (row.type === 'single') {
                for (let setIndex = 0; setIndex < row.sets.length; setIndex += 1) {
                    const setEntry = row.sets[setIndex];
                    if (this.isPlannerSetEmpty(setEntry)) {
                        continue;
                    }

                    const normalized = this.validatePlannedEntry(row.exerciseId, setEntry, date, null, `Set ${setIndex + 1}`);
                    if (!normalized.valid) {
                        showToast(normalized.error, 'error');
                        return;
                    }
                    batch.push(normalized.value);
                }
            } else {
                for (const supersetItem of row.exercises) {
                    for (let setIndex = 0; setIndex < supersetItem.sets.length; setIndex += 1) {
                        const setEntry = supersetItem.sets[setIndex];
                        if (this.isPlannerSetEmpty(setEntry)) {
                            continue;
                        }

                        const normalized = this.validatePlannedEntry(
                            supersetItem.exerciseId,
                            setEntry,
                            date,
                            row.id,
                            `Set ${setIndex + 1}`
                        );
                        if (!normalized.valid) {
                            showToast(normalized.error, 'error');
                            return;
                        }
                        batch.push(normalized.value);
                    }
                }
            }
        }

        if (batch.length === 0) {
            showToast('Enter reps/weight for at least one set before submitting', 'error');
            return;
        }

        try {
            await Storage.addWorkoutsBatch(batch);
            showToast(`Planned session submitted: ${batch.length} set${batch.length > 1 ? 's' : ''}`, 'success');
            this.clearPlannedSession(false);
            this.updateWeightField();
            this.renderLastWorkoutSummary();
            this.dispatchWorkoutsUpdated();
        } catch (error) {
            showToast(error.message, 'error');
        }
    },

    validatePlannedEntry(exerciseId, setEntry, date, supersetGroupId = null, setLabel = '') {
        if (!exerciseId) {
            return { valid: false, error: 'Every planned row needs an exercise' };
        }

        const exercise = Storage.getExerciseById(exerciseId);
        if (!exercise) {
            return { valid: false, error: 'One planned row references an unknown exercise' };
        }

        const repsValidation = validateNumber(
            setEntry.reps,
            CONFIG.limits.minReps,
            CONFIG.limits.maxReps,
            'Reps'
        );
        if (!repsValidation.valid) {
            return { valid: false, error: `${exercise.name}${setLabel ? ` (${setLabel})` : ''}: ${repsValidation.error}` };
        }

        let normalizedWeight = null;
        if (exercise.requiresWeight) {
            const weightValidation = validateNumber(
                setEntry.weight,
                CONFIG.limits.minWeight,
                CONFIG.limits.maxWeight,
                'Weight'
            );
            if (!weightValidation.valid) {
                return { valid: false, error: `${exercise.name}${setLabel ? ` (${setLabel})` : ''}: ${weightValidation.error}` };
            }
            normalizedWeight = weightValidation.value;
        }

        return {
            valid: true,
            value: {
                exerciseId,
                reps: repsValidation.value,
                weight: normalizedWeight,
                date,
                sessionId: this.plannedSession.id,
                plannedSetId: setEntry.id,
                supersetGroupId,
                source: 'planner'
            }
        };
    },

    dispatchWorkoutsUpdated() {
        window.dispatchEvent(new CustomEvent('workoutsUpdated'));
    },

    /**
     * Update weight field visibility and show last workout info based on selected exercise
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

            // Show last workout info
            this.updateLastWorkoutInfo(select.value);
        } else {
            // Hide last workout info if no exercise selected
            const infoContainer = document.getElementById('lastWorkoutInfo');
            if (infoContainer) infoContainer.style.display = 'none';
        }
    },

    /**
     * Show compact last workout info for the selected exercise
     * @param {string} exerciseId - Selected exercise ID
     */
    async updateLastWorkoutInfo(exerciseId) {
        const infoContainer = document.getElementById('lastWorkoutInfo');
        if (!infoContainer) return;

        // Reset and show loading state if it takes a moment
        infoContainer.innerHTML = '<span class="label">Loading last sessions...</span>';
        infoContainer.style.display = 'inline-flex';

        try {
            // Get last 3 sessions
            const lastSessions = await Storage.getLastWorkoutSessionsForExercise(exerciseId, 3);

            if (!lastSessions || lastSessions.length === 0) {
                infoContainer.innerHTML = '<span class="label"><i data-lucide="clock" class="icon-xs"></i> No history found.</span>';
                infoContainer.style.display = 'flex';
                if (window.lucide) window.lucide.createIcons();
                return;
            }

            infoContainer.innerHTML = '';
            infoContainer.style.display = 'flex';

            const header = document.createElement('div');
            header.className = 'label';
            header.innerHTML = `<i data-lucide="clock" class="icon-xs"></i> ${lastSessions.length > 1 ? `Last ${lastSessions.length} Sessions:` : 'Previous Session:'}`;
            infoContainer.appendChild(header);

            // Identify current vs previous session
            const todayStr = formatDate(new Date());
            const currentSession = lastSessions[0]?.date === todayStr ? lastSessions[0] : null;
            const previousSession = lastSessions[0]?.date === todayStr ? lastSessions[1] : lastSessions[0];

            // Add Volume Suggestion for the most recent session
            const { suggestions, maxVolume, currentVolume } = this.calculateVolumeSuggestions(currentSession, previousSession);
            if (suggestions && (suggestions.length > 0 || currentVolume > 0)) {
                const suggestionBox = this.renderVolumeSuggestions(suggestions, maxVolume, currentVolume);
                infoContainer.appendChild(suggestionBox);
            }

            const sessionsContainer = document.createElement('div');
            sessionsContainer.className = 'sessions-horizontal';

            lastSessions.forEach((session) => {
                const sessionBox = document.createElement('div');
                sessionBox.className = 'session-box';

                const setsContainer = document.createElement('div');
                setsContainer.className = 'sets-list';

                session.sets.forEach((set) => {
                    const setBadge = document.createElement('span');
                    setBadge.className = 'set-badge-item';

                    let text = `${set.reps}`;
                    if (set.weight !== null && set.weight !== undefined) {
                        text += `x${set.weight}`;
                    }

                    setBadge.textContent = text;
                    setsContainer.appendChild(setBadge);
                });

                sessionBox.appendChild(setsContainer);
                sessionsContainer.appendChild(sessionBox);
            });

            infoContainer.appendChild(sessionsContainer);
        } catch (error) {
            console.error('Error updating last workout info:', error);
            infoContainer.style.display = 'none';
        }
    },

    /**
     * Calculate volume suggestions based on previous performance and current session progress
     * @param {object} currentSession - Today's session data (if any)
     * @param {object} previousSession - Most recent session before today
     * @returns {object} Object containing suggestions array and volume statistics
     */
    calculateVolumeSuggestions(currentSession, previousSession) {
        if (!previousSession || !previousSession.sets.length) return { suggestions: [], maxVolume: 0, currentVolume: 0 };

        // Helper to calculate total volume for a session
        const getSessionVolume = (session) => {
            if (!session) return 0;
            return session.sets.reduce((sum, set) => {
                const w = parseFloat(set.weight);
                const r = parseInt(set.reps, 10);
                // For bodyweight, treat weight as 0 or 1 depending on how we handle it
                const weight = (!isNaN(w) && w !== null) ? w : 0;
                return sum + (weight * r);
            }, 0);
        };

        const totalVolumePrev = getSessionVolume(previousSession);
        const totalVolumeCurr = currentSession ? getSessionVolume(currentSession) : 0;

        // Find best set of previous session for individual set suggestions
        let maxSetVolumePrev = 0;
        let bestSetPrev = null;
        previousSession.sets.forEach(set => {
            const w = parseFloat(set.weight);
            const r = parseInt(set.reps, 10);
            const vol = (!isNaN(w) && w !== null) ? (w * r) : r;
            if (vol >= maxSetVolumePrev) {
                maxSetVolumePrev = vol;
                bestSetPrev = { weight: (!isNaN(w) && w !== null) ? w : null, reps: r };
            }
        });

        const suggestions = [];

        if (totalVolumeCurr > 0) {
            // User has already logged at least one set today
            const targetVolume = totalVolumePrev;
            const remainingVolume = targetVolume - totalVolumeCurr;

            if (remainingVolume <= 0) {
                // Goal already met!
                suggestions.push({
                    label: 'Volume Goal Met! 🎉',
                    reps: 'PR',
                    weight: 'Set',
                    isMessage: true
                });
            } else {
                // Suggest how to reach the goal
                const lastSet = currentSession.sets[currentSession.sets.length - 1];
                const lastWeightUsed = parseFloat(lastSet.weight);
                const prevSetsCount = previousSession.sets.length;
                const currSetsCount = currentSession.sets.length;
                // Assume user wants to do at least as many sets as last time
                const remainingSets = Math.max(1, prevSetsCount - currSetsCount);
                const neededVolPerSet = Math.ceil(remainingVolume / remainingSets);

                const isWeighted = !isNaN(lastWeightUsed) && lastWeightUsed !== null;

                if (isWeighted && lastWeightUsed > 0) {
                    // Suggestion 1: Use current weight
                    const neededReps = Math.ceil(neededVolPerSet / lastWeightUsed);
                    if (neededReps > 0 && neededReps < 100) {
                        suggestions.push({
                            weight: lastWeightUsed,
                            reps: Math.max(1, neededReps),
                            label: `Stay at ${lastWeightUsed}kg (${remainingSets} set${remainingSets > 1 ? 's' : ''} left)`
                        });
                    }

                    // Suggestion 2: Small weight increase
                    const nextWeight = lastWeightUsed + 2.5;
                    const neededRepsNext = Math.ceil(neededVolPerSet / nextWeight);
                    if (neededRepsNext > 0 && neededRepsNext < 100) {
                        suggestions.push({
                            weight: nextWeight,
                            reps: Math.max(1, neededRepsNext),
                            label: `+2.5kg (${remainingSets} set${remainingSets > 1 ? 's' : ''} left)`
                        });
                    }
                } else {
                    // Bodyweight - suggest reps to match volume (which is just reps if weight is 0)
                    const neededReps = Math.ceil(remainingVolume / remainingSets);
                    if (neededReps > 0) {
                        suggestions.push({
                            weight: null,
                            reps: neededReps,
                            label: `Target Reps (${remainingSets} set${remainingSets > 1 ? 's' : ''} left)`
                        });
                    }
                }
            }
        } else if (bestSetPrev) {
            // First time selecting exercise today - suggest beating previous best set
            suggestions.push({
                weight: bestSetPrev.weight,
                reps: bestSetPrev.reps + 1,
                label: 'Beat Best Set'
            });

            if (bestSetPrev.weight !== null) {
                const increments = [1, 2.5];
                increments.forEach(inc => {
                    const suggestedWeight = bestSetPrev.weight + inc;
                    const suggestedReps = Math.ceil(maxSetVolumePrev / suggestedWeight);
                    if (suggestedReps > 0 && suggestedReps < 100) {
                        suggestions.push({
                            weight: suggestedWeight,
                            reps: suggestedReps,
                            label: `+${inc}kg`
                        });
                    }
                });
            }
        }

        // Deduplicate
        const uniqueSuggestions = [];
        const seen = new Set();
        suggestions.forEach(s => {
            const key = s.isMessage ? s.label : `${s.reps}x${s.weight}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueSuggestions.push(s);
            }
        });

        return {
            suggestions: uniqueSuggestions.slice(0, 3),
            maxVolume: totalVolumePrev,
            currentVolume: totalVolumeCurr
        };
    },

    /**
     * Render volume suggestions as a UI element
     * @param {array} suggestions - Array of suggestion objects
     * @param {number} maxVolume - Previous max volume
     * @param {number} currentVolume - Today's volume so far
     * @returns {HTMLElement} Suggestion container
     */
    renderVolumeSuggestions(suggestions, maxVolume, currentVolume = 0) {
        const container = document.createElement('div');
        container.className = 'volume-suggestions';

        const hint = document.createElement('div');
        hint.className = 'suggestion-hint';

        if (currentVolume > 0 && maxVolume > 0) {
            const percentage = Math.min(100, (currentVolume / maxVolume) * 100).toFixed(0);
            hint.innerHTML = `<i data-lucide="zap" class="icon-xs"></i> <strong>Volume:</strong> ${currentVolume.toFixed(0)} / ${maxVolume.toFixed(0)} kg <span class="percentage-pill" style="background: var(--primary-light); color: var(--primary-color); padding: 2px 6px; border-radius: 10px; font-size: 0.75rem; margin-left: 4px;">${percentage}%</span>`;
        } else {
            hint.innerHTML = '<i data-lucide="zap" class="icon-xs"></i> <strong>Progress Tip:</strong> To beat previous session, try:';
        }

        container.appendChild(hint);
        if (window.lucide) window.lucide.createIcons();

        const list = document.createElement('div');
        list.className = 'suggestion-chips-container';
        list.style.display = 'flex';
        list.style.flexWrap = 'wrap';
        list.style.gap = '4px';
        list.style.marginTop = '4px';

        suggestions.forEach(s => {
            const chip = document.createElement('div');
            chip.className = 'suggestion-chip';

            if (s.isMessage) {
                chip.innerHTML = `<span>${s.label}</span>`;
                chip.style.backgroundColor = 'var(--success-light)';
                chip.style.borderColor = 'var(--success-color)';
                chip.style.color = 'var(--success-color)';
                chip.style.cursor = 'default';
            } else {
                const weightText = (s.weight !== null && s.weight !== undefined) ? `x${s.weight}` : '';
                chip.title = (s.weight !== null && s.weight !== undefined) ? `Predicted Set Volume: ${(s.reps * s.weight).toFixed(1)}kg` : `Target: ${s.reps} reps`;
                chip.innerHTML = `<strong>${s.reps}${weightText}</strong> <span class="label-tag">${s.label}</span>`;

                chip.addEventListener('click', (e) => {
                    e.preventDefault();
                    const repsInput = document.getElementById('workoutReps');
                    const weightInput = document.getElementById('workoutWeight');

                    if (repsInput) repsInput.value = s.reps;
                    if (weightInput && s.weight !== null) weightInput.value = s.weight;

                    showToast(`Target set: ${s.reps}${weightText}`, 'info');

                    // Trigger change event for any other listeners
                    repsInput.dispatchEvent(new Event('change', { bubbles: true }));
                    if (weightInput) weightInput.dispatchEvent(new Event('change', { bubbles: true }));
                });
            }

            list.appendChild(chip);
        });

        container.appendChild(list);
        return container;
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
     * Update the date input container tooltip
     */
    updateDateTooltip() {
        const dateInput = document.getElementById('workoutDate');
        if (dateInput) {
            const container = dateInput.closest('.date-input-container');
            if (container) {
                container.title = `Workout Date: ${dateInput.value}`;
            }
        }
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

            // Don't reset form - keep fields for quick re-logging


            // Refresh UI and show last workout info
            this.updateWeightField();
            this.renderLastWorkoutSummary();
            this.dispatchWorkoutsUpdated();
        } catch (error) {
            showToast(error.message, 'error');
        }
    },

    /**
     * Clear form fields except date
     */
    clearForm() {
        const muscleSelect = document.getElementById('workoutMuscle');
        if (muscleSelect) muscleSelect.value = '';

        this.populateExerciseDropdown();

        document.getElementById('workoutExercise').value = '';
        document.getElementById('workoutReps').value = '';
        document.getElementById('workoutWeight').value = '';
        // Keep date field as-is
        this.updateWeightField();
        showToast('Form cleared', 'info');
    },

    /**
     * Render a concise summary of the last workout session at the bottom
     */
    async renderLastWorkoutSummary() {
        const container = document.getElementById('lastWorkoutSummary');
        if (!container) return;

        try {
            const lastSession = await Storage.getLastWorkoutSession();

            if (!lastSession || !lastSession.exercises || lastSession.exercises.length === 0) {
                container.style.display = 'none';
                return;
            }

            container.style.display = 'block';

            const dateObj = new Date(lastSession.date);
            const dateFormatted = dateObj.toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
            });

            let html = `
                <div class="summary-header">
                    <span class="summary-title"><i data-lucide="history" class="icon-xs"></i> Last Workout: ${dateFormatted}</span>
                </div>
                <div class="summary-content">
                    <table class="summary-table" role="table" aria-label="Last workout exercises">
                        <thead>
                            <tr>
                                <th scope="col">Exercise</th>
                                <th scope="col">Sets</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            lastSession.exercises.forEach(ex => {
                const setChips = ex.sets.map((s, index) => {
                    const reps = s.reps ?? '-';
                    const hasWeight = s.weight !== null && s.weight !== undefined && s.weight !== '';
                    const label = hasWeight ? `${reps} × ${s.weight}` : `${reps}`;
                    return `<span class="summary-set-chip">${label}</span>`;
                }).join('');

                html += `
                    <tr class="summary-item">
                        <td class="summary-exercise">${ex.name}</td>
                        <td class="summary-sets">
                            <div class="summary-set-chips">${setChips || '<span class="summary-set-empty">-</span>'}</div>
                        </td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            `;
            container.innerHTML = html;

            if (window.lucide) {
                window.lucide.createIcons();
            }
        } catch (error) {
            console.error('Error rendering last workout summary:', error);
            container.style.display = 'none';
        }
    }


};


// Remove deprecated methods
// isValidDate is now imported from utils.js
// escapeHtml is now imported from utils.js
