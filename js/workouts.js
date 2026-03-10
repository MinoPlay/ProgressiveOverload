// Workouts Module
// Handles workout logging UI and interactions

import { Storage } from './storage.js';
import { showToast } from './app.js';
import { CONFIG } from './config.js';
import { isValidDate, validateNumber, formatDate } from './utils.js';

const PLANNER_DRAFT_KEY = 'plannedSessionDraft';
const DEFAULT_PLANNER_SET_COUNT = 3;
const WORKOUT_VIEW_KEY = 'workoutActiveView';

export const Workouts = {
    activeWorkoutView: 'plan',
    plannedSession: null,
    plannerLastSessionCache: {},  // exerciseId -> { html, hasData }
    plannerPickerContext: null,

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
        this.initializeWorkoutViewTabs();
        this.updateDateTooltip();
        this.renderLastWorkoutSummary();

        // Populate template dropdown
        this.populatePlannerTemplateDropdown();

        // Listen for exercise updates
        window.addEventListener('exercisesUpdated', () => {
            this.populateMuscleDropdown();
            const muscleSelect = document.getElementById('workoutMuscle');
            this.populateExerciseDropdown(muscleSelect ? muscleSelect.value : '');
            this.populatePlannerExerciseDropdown();
            this.renderPlannedSession();
        });

        // Refresh template dropdown when templates change
        window.addEventListener('templatesUpdated', () => {
            this.populatePlannerTemplateDropdown();
        });

        // Listen for shared session state changes
        window.addEventListener('storage', (event) => {
            if (event.key === 'sharedSessionState' && event.newValue) {
                try {
                    const parsed = JSON.parse(event.newValue);
                    if (parsed && Array.isArray(parsed.rows)) {
                        this.plannedSession = {
                            id: parsed.id || `session-${Date.now()}`,
                            date: parsed.date || formatDate(new Date()),
                            rows: parsed.rows.map((row, index) => this.normalizePlannedRow(row, index)),
                            loadedTemplateId: typeof parsed.loadedTemplateId === 'string' ? parsed.loadedTemplateId : '',
                            loadedTemplateName: typeof parsed.loadedTemplateName === 'string' ? parsed.loadedTemplateName : ''
                        };
                        this.renderPlannedSession();
                    }
                } catch {}
            }
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
        const plannerAddExerciseBtn = document.getElementById('plannerAddExerciseBtn');
        const plannerSubmitBtn = document.getElementById('plannerSubmitBtn');
        const plannerClearBtn = document.getElementById('plannerClearBtn');
        const plannerSaveAsTemplateBtn = document.getElementById('plannerSaveAsTemplateBtn');
        const plannedSessionList = document.getElementById('plannedSessionList');
        const lastWorkoutInfo = document.getElementById('lastWorkoutInfo');
        const workoutRepsDown = document.getElementById('workoutRepsDown');
        const workoutRepsUp = document.getElementById('workoutRepsUp');
        const plannerPickerConfirmBtn = document.getElementById('plannerExercisePickerConfirmBtn');
        const plannerPickerCancelBtn = document.getElementById('plannerExercisePickerCancelBtn');
        const plannerPickerModal = document.getElementById('plannerExercisePickerModal');

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
                this.updateDateDisplay();
                this.syncPlannerDate();
            });
        }

        if (plannerAddExerciseBtn) {
            plannerAddExerciseBtn.addEventListener('click', () => {
                this.openPlannerExercisePicker({ mode: 'add' });
            });
        }

        if (plannerSubmitBtn) {
            plannerSubmitBtn.addEventListener('click', () => this.handlePlannedSubmit());
        }

        if (plannerClearBtn) {
            plannerClearBtn.addEventListener('click', () => this.clearPlannedSession(true));
        }

        if (plannerSaveAsTemplateBtn) {
            plannerSaveAsTemplateBtn.addEventListener('click', () => this.handleSaveAsTemplate());
        }

        const saveAsTemplateConfirmBtn = document.getElementById('saveAsTemplateConfirmBtn');
        const saveAsTemplateCancelBtn = document.getElementById('saveAsTemplateCancelBtn');
        const saveAsTemplateNameInput = document.getElementById('saveAsTemplateNameInput');

        if (saveAsTemplateConfirmBtn) {
            saveAsTemplateConfirmBtn.addEventListener('click', () => this.confirmSaveAsTemplate());
        }
        if (saveAsTemplateCancelBtn) {
            saveAsTemplateCancelBtn.addEventListener('click', () => this.closeSaveAsTemplateModal());
        }
        if (saveAsTemplateNameInput) {
            saveAsTemplateNameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.confirmSaveAsTemplate();
                if (e.key === 'Escape') this.closeSaveAsTemplateModal();
            });
        }

        const saveAsTemplateModal = document.getElementById('saveAsTemplateModal');
        if (saveAsTemplateModal) {
            saveAsTemplateModal.addEventListener('click', (e) => {
                if (e.target === saveAsTemplateModal) this.closeSaveAsTemplateModal();
            });
        }

        const plannerTemplateSelect = document.getElementById('plannerTemplateSelect');
        if (plannerTemplateSelect) {
            plannerTemplateSelect.addEventListener('change', () => {
                const templateId = plannerTemplateSelect.value;
                if (templateId) {
                    this.loadTemplateIntoPlanner(templateId);
                }
            });
        }

        if (plannedSessionList) {
            plannedSessionList.addEventListener('change', (event) => this.handlePlannerFieldChange(event));
            // Re-evaluate submit button on every keystroke (input fires before blur/change)
            plannedSessionList.addEventListener('input', (event) => this.handlePlannerFieldInput(event));
            plannedSessionList.addEventListener('click', (event) => this.handlePlannerAction(event));
        }

        if (plannerPickerConfirmBtn) {
            plannerPickerConfirmBtn.addEventListener('click', () => this.confirmPlannerExercisePicker());
        }

        if (plannerPickerCancelBtn) {
            plannerPickerCancelBtn.addEventListener('click', () => this.closePlannerExercisePicker());
        }

        if (plannerPickerModal) {
            plannerPickerModal.addEventListener('click', (event) => {
                if (event.target === plannerPickerModal) {
                    this.closePlannerExercisePicker();
                }
            });
        }

        if (lastWorkoutInfo) {
            lastWorkoutInfo.addEventListener('click', (event) => this.handleLastWorkoutSetClick(event));
        }

        if (workoutRepsDown) {
            workoutRepsDown.addEventListener('click', () => this.stepQuickLogReps(-1));
        }

        if (workoutRepsUp) {
            workoutRepsUp.addEventListener('click', () => this.stepQuickLogReps(1));
        }
    },

    stepQuickLogReps(delta) {
        const repsInput = document.getElementById('workoutReps');
        if (!repsInput) return;
        const current = parseInt(repsInput.value || repsInput.placeholder || '0', 10) || 0;
        repsInput.value = String(Math.max(1, current + delta));
    },

    handleLastWorkoutSetClick(event) {
        const setBadge = event.target.closest('.set-badge-item[data-action="prefill-log-set"]');
        if (!setBadge) return;

        const repsInput = document.getElementById('workoutReps');
        const weightInput = document.getElementById('workoutWeight');

        if (repsInput) {
            repsInput.value = setBadge.dataset.reps || '';
        }

        if (weightInput) {
            weightInput.value = setBadge.dataset.weight ?? '';
        }
    },

    getPlannerTarget(rowId, itemId = null) {
        const row = this.plannedSession?.rows?.find(entry => entry.id === rowId);
        if (!row) return null;

        if (row.type === 'superset') {
            if (!itemId) return null;
            return row.exercises.find(entry => entry.id === itemId) || null;
        }

        return row;
    },

    ensurePlannerActiveSet(target, sets) {
        if (!target || !Array.isArray(sets) || sets.length === 0) return null;
        if (target.activeSetId === null) return null;
        const hasValidActiveSet = sets.some(setEntry => setEntry.id === target.activeSetId);
        if (!hasValidActiveSet) {
            target.activeSetId = sets[0].id;
        }
        return target.activeSetId;
    },

    setPlannerActiveSet(rowId, itemId, setId) {
        const target = this.getPlannerTarget(rowId, itemId);
        if (!target || !Array.isArray(target.sets)) return;
        if (!target.sets.some(setEntry => setEntry.id === setId)) return;
        if (target.activeSetId === setId) {
            target.activeSetId = null;
        } else {
            target.activeSetId = setId;
        }
        this.persistPlannerDraft();
        this.renderPlannedSession();
    },

    initializeWorkoutViewTabs() {
        const tabButtons = document.querySelectorAll('.workout-view-tab[data-view]');
        const hasLogTab = Boolean(document.getElementById('workoutLogTabBtn'));
        const savedView = localStorage.getItem(WORKOUT_VIEW_KEY);
        const defaultView = (savedView === 'plan' || (savedView === 'log' && hasLogTab)) ? savedView : 'plan';

        this.setWorkoutView(defaultView);

        tabButtons.forEach(button => {
            button.addEventListener('click', () => this.setWorkoutView(button.dataset.view));
        });
    },

    setWorkoutView(view) {
        const logView = document.getElementById('workoutLogView');
        const planView = document.getElementById('workoutPlanView');
        const logTab = document.getElementById('workoutLogTabBtn');
        const planTab = document.getElementById('workoutPlanTabBtn');
        const hasLog = Boolean(logView && logTab);

        const normalizedView = view === 'log' && hasLog ? 'log' : 'plan';
        this.activeWorkoutView = normalizedView;

        if (logView) logView.classList.toggle('active', normalizedView === 'log');
        if (planView) planView.classList.toggle('active', normalizedView === 'plan');

        if (logTab) {
            logTab.classList.toggle('active', normalizedView === 'log');
            logTab.setAttribute('aria-selected', String(normalizedView === 'log'));
        }

        if (planTab) {
            planTab.classList.toggle('active', normalizedView === 'plan');
            planTab.setAttribute('aria-selected', String(normalizedView === 'plan'));
        }

        localStorage.setItem(WORKOUT_VIEW_KEY, normalizedView);
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
            rows: [],
            loadedTemplateId: '',
            loadedTemplateName: ''
        };

        this.restorePlannerDraft();
        this.renderPlannedSession();
    },

    syncPlannerDate() {
        if (!this.plannedSession) return;
        const dateInput = document.getElementById('workoutDate');
        if (!dateInput?.value) return;

        this.plannedSession.date = dateInput.value;
        this.persistPlannerDraft();
    },

    addPlannedExercise() {
        this.openPlannerExercisePicker({ mode: 'add' });
    },

    getPlannerSelectedExerciseIds(exclude = null) {
        const selected = new Set();
        const isExcluded = (rowId, itemId = null) => {
            if (!exclude) return false;
            if (exclude.rowId !== rowId) return false;
            return (exclude.itemId || null) === (itemId || null);
        };

        (this.plannedSession?.rows || []).forEach((row) => {
            if (row.type === 'single') {
                if (row.exerciseId && !isExcluded(row.id, null)) {
                    selected.add(row.exerciseId);
                }
                return;
            }
            (row.exercises || []).forEach((entry) => {
                if (entry.exerciseId && !isExcluded(row.id, entry.id)) {
                    selected.add(entry.exerciseId);
                }
            });
        });

        return selected;
    },

    openPlannerExercisePicker(context) {
        const modal = document.getElementById('plannerExercisePickerModal');
        const select = document.getElementById('plannerExercisePickerSelect');
        if (!modal || !select) return;

        const exclude = context?.mode === 'replace'
            ? { rowId: context.rowId, itemId: context.itemId || null }
            : null;
        const usedExerciseIds = this.getPlannerSelectedExerciseIds(exclude);
        const options = Storage.getExercises()
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .filter((exercise) => !usedExerciseIds.has(exercise.id));

        if (!options.length) {
            showToast('All exercises are already in the plan', 'info');
            return;
        }

        select.innerHTML = options
            .map((exercise) => `<option value="${exercise.id}">${exercise.name}</option>`)
            .join('');

        this.plannerPickerContext = context;
        modal.style.display = 'flex';
        select.focus();
    },

    closePlannerExercisePicker() {
        const modal = document.getElementById('plannerExercisePickerModal');
        const select = document.getElementById('plannerExercisePickerSelect');
        if (modal) modal.style.display = 'none';
        if (select) select.innerHTML = '';
        this.plannerPickerContext = null;
    },

    confirmPlannerExercisePicker() {
        const select = document.getElementById('plannerExercisePickerSelect');
        const selectedExerciseId = select?.value;
        if (!selectedExerciseId || !this.plannerPickerContext) {
            return;
        }

        this.resetLoadedTemplate();
        const context = this.plannerPickerContext;

        if (context.mode === 'add') {
            const rowId = `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            this.collapseAllPlannedRowsExcept(rowId);
            this.plannedSession.rows.push({
                id: rowId,
                type: 'single',
                exerciseId: selectedExerciseId,
                sets: this.createDefaultPlannerSets(rowId),
                copyCursor: 1,
                activeSetId: `${rowId}-set-1`,
                expanded: true
            });
        } else if (context.mode === 'replace') {
            const target = this.getPlannerTarget(context.rowId, context.itemId || null);
            if (target) {
                target.exerciseId = selectedExerciseId;
                (target.sets || []).forEach((setEntry) => {
                    setEntry.completed = false;
                });
            }
        }

        this.persistPlannerDraft();
        this.renderPlannedSession();
        this.closePlannerExercisePicker();
    },

    addSupersetBlock() {
        this.resetLoadedTemplate();
        const blockId = `ss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const firstExerciseId = `${blockId}-a`;
        const secondExerciseId = `${blockId}-b`;

        this.collapseAllPlannedRowsExcept(blockId);

        this.plannedSession.rows.push({
            id: blockId,
            type: 'superset',
            label: 'Superset',
            expanded: true,
            exercises: [
                {
                    id: firstExerciseId,
                    exerciseId: '',
                    sets: this.createDefaultPlannerSets(firstExerciseId),
                    copyCursor: 1,
                    activeSetId: `${firstExerciseId}-set-1`,
                    expanded: true
                },
                {
                    id: secondExerciseId,
                    exerciseId: '',
                    sets: this.createDefaultPlannerSets(secondExerciseId),
                    copyCursor: 1,
                    activeSetId: `${secondExerciseId}-set-1`,
                    expanded: true
                }
            ]
        });

        this.persistPlannerDraft();
        this.renderPlannedSession();
    },

    handlePlannerAction(event) {
        const historyBadge = event.target.closest('.planner-last-session .set-badge-item[data-action="prefill-set-1"]');
        if (historyBadge) {
            this.resetLoadedTemplate();
            this.prefillPlannerActiveSetFromHistory(historyBadge);
            return;
        }

        const button = event.target.closest('button[data-action]');
        if (!button) return;

        const { action, rowId, itemId } = button.dataset;

        if (action === 'remove-row') {
            this.resetLoadedTemplate();
            this.plannedSession.rows = this.plannedSession.rows.filter(row => row.id !== rowId);
            this.ensureOnePlannerRowExpanded();
        }

        if (action === 'toggle-row') {
            this.togglePlannerRow(rowId);
        }

        if (action === 'toggle-subset') {
            this.toggleSupersetSubset(rowId, itemId || null);
        }

        if (action === 'replace-exercise') {
            this.openPlannerExercisePicker({ mode: 'replace', rowId, itemId: itemId || null });
            return;
        }

        if (action === 'toggle-link-next') {
            this.resetLoadedTemplate();
            this.togglePlannerLinkWithNext(rowId);
            this.persistPlannerDraft();
            this.renderPlannedSession();
            return;
        }

        if (action === 'clear-row-fields') {
            this.resetLoadedTemplate();
            this.clearPlannerRowFields(rowId, itemId || null);
        }

        if (action === 'copy-next-set') {
            this.resetLoadedTemplate();
            this.copyPlannerSetForward(rowId, itemId || null);
        }

        if (action === 'toggle-set') {
            const { setId } = button.dataset;
            this.setPlannerActiveSet(rowId, itemId || null, setId);
            return;
        }

        if (action === 'toggle-set-complete') {
            const { setId } = button.dataset;
            this.togglePlannerSetComplete(rowId, itemId || null, setId);
            return;
        }

        if (action === 'step-reps') {
            this.adjustPlannerReps(button);
            return;
        }

        this.persistPlannerDraft();
        this.renderPlannedSession();
    },

    adjustPlannerReps(button) {
        const { rowId, itemId, setId, delta } = button.dataset;
        if (!rowId || !setId) return;

        const target = this.getPlannerTarget(rowId, itemId || null);
        if (!target || !Array.isArray(target.sets)) return;

        const setEntry = target.sets.find(entry => entry.id === setId);
        if (!setEntry) return;

        const step = parseInt(delta || '0', 10);
        const current = parseInt(setEntry.reps || '0', 10) || 0;
        const next = Math.max(1, current + step);

        this.resetLoadedTemplate();
        setEntry.reps = String(next);
        setEntry.completed = false;
        target.activeSetId = setId;

        const control = button.closest('.planner-reps-control');
        const input = control?.querySelector('input[data-field="reps"]');
        if (input) {
            input.value = String(next);
        }

        this.persistPlannerDraft();
        this.updatePlannerSubmitBtn();
        this.refreshPlannerSetIndicators(rowId, itemId || null);
    },

    togglePlannerSetComplete(rowId, itemId = null, setId) {
        const target = this.getPlannerTarget(rowId, itemId);
        if (!target || !Array.isArray(target.sets)) return;

        const setEntry = target.sets.find(entry => entry.id === setId);
        if (!setEntry) return;

        if (setEntry.completed) {
            setEntry.completed = false;
        } else {
            if (!this.canPlannerSetBeCompleted(setEntry, target.exerciseId || '')) {
                showToast('Fill reps/weight before marking set complete', 'error');
                return;
            }
            setEntry.completed = true;
        }

        target.activeSetId = setId;
        this.persistPlannerDraft();
        this.updatePlannerSubmitBtn();

        const currentItemId = itemId || null;
        if (setEntry.completed) {
            const nextSetId = this.getFirstIncompletePlannerSetId(target.sets);
            if (nextSetId) {
                target.activeSetId = nextSetId;
                this.persistPlannerDraft();
                this.renderPlannedSession();
                return;
            }

            if (this.advancePlannerAfterCompletedTarget(rowId, currentItemId)) {
                this.persistPlannerDraft();
                this.renderPlannedSession();
                return;
            }
        }

        this.refreshPlannerSetIndicators(rowId, currentItemId);
    },

    getFirstIncompletePlannerSetId(sets = []) {
        if (!Array.isArray(sets)) return null;
        const nextIncomplete = sets.find((setEntry) => !Boolean(setEntry?.completed));
        return nextIncomplete?.id || null;
    },

    isPlannerTargetFullyComplete(target) {
        if (!target || !Array.isArray(target.sets)) return false;
        const exerciseId = target.exerciseId || '';
        return target.sets.length > 0 && target.sets.every((setEntry) => this.isPlannerSetComplete(setEntry, exerciseId));
    },

    advancePlannerAfterCompletedTarget(rowId, itemId = null) {
        if (!this.plannedSession || !Array.isArray(this.plannedSession.rows)) return false;

        const rowIndex = this.plannedSession.rows.findIndex((entry) => entry.id === rowId);
        if (rowIndex < 0) return false;

        const row = this.plannedSession.rows[rowIndex];
        if (!row) return false;

        if (row.type === 'superset' && Array.isArray(row.exercises)) {
            const nextIncompleteExercise = row.exercises.find((entry) => !this.isPlannerTargetFullyComplete(entry));
            if (nextIncompleteExercise) {
                row.expanded = true;
                row.exercises.forEach((entry) => {
                    entry.expanded = entry.id === nextIncompleteExercise.id;
                });
                const nextSetId = this.getFirstIncompletePlannerSetId(nextIncompleteExercise.sets)
                    || nextIncompleteExercise.sets?.[0]?.id
                    || null;
                nextIncompleteExercise.activeSetId = nextSetId;
                return true;
            }
        }

        const nextRow = this.plannedSession.rows[rowIndex + 1];
        if (!nextRow) return false;

        this.collapseAllPlannerRowsExcept(nextRow.id);
        nextRow.expanded = true;

        if (nextRow.type === 'superset' && Array.isArray(nextRow.exercises)) {
            const nextExercise = nextRow.exercises.find((entry) => !this.isPlannerTargetFullyComplete(entry))
                || nextRow.exercises[0];
            if (!nextExercise) return true;

            nextRow.exercises.forEach((entry) => {
                entry.expanded = entry.id === nextExercise.id;
            });
            nextExercise.activeSetId = this.getFirstIncompletePlannerSetId(nextExercise.sets)
                || nextExercise.sets?.[0]?.id
                || null;
            return true;
        }

        nextRow.activeSetId = this.getFirstIncompletePlannerSetId(nextRow.sets)
            || nextRow.sets?.[0]?.id
            || null;
        return true;
    },

    toggleSupersetSubset(rowId, itemId = null) {
        if (!itemId) return;
        const row = this.plannedSession?.rows?.find(entry => entry.id === rowId);
        if (!row || row.type !== 'superset' || !Array.isArray(row.exercises)) return;

        const subset = row.exercises.find(entry => entry.id === itemId);
        if (!subset) return;

        subset.expanded = subset.expanded === false;
    },

    togglePlannerLinkWithNext(rowId) {
        if (!this.plannedSession || !Array.isArray(this.plannedSession.rows)) return;
        const index = this.plannedSession.rows.findIndex((row) => row.id === rowId);
        if (index < 0) return;

        const row = this.plannedSession.rows[index];

        if (row.type === 'superset') {
            const first = row.exercises?.[0];
            const second = row.exercises?.[1];
            if (!first || !second) return;

            const firstId = `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const secondId = `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

            const firstRow = {
                id: firstId,
                type: 'single',
                exerciseId: first.exerciseId || '',
                sets: this.remapSets(first.sets, firstId),
                copyCursor: 1,
                activeSetId: `${firstId}-set-1`,
                expanded: true
            };

            const secondRow = {
                id: secondId,
                type: 'single',
                exerciseId: second.exerciseId || '',
                sets: this.remapSets(second.sets, secondId),
                copyCursor: 1,
                activeSetId: `${secondId}-set-1`,
                expanded: true
            };

            this.plannedSession.rows.splice(index, 1, firstRow, secondRow);
            return;
        }

        const next = this.plannedSession.rows[index + 1];
        if (!next || next.type !== 'single') {
            showToast('Link works with this exercise and the one below it', 'info');
            return;
        }

        const blockId = `ss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const firstExerciseId = `${blockId}-a`;
        const secondExerciseId = `${blockId}-b`;

        const supersetBlock = {
            id: blockId,
            type: 'superset',
            label: 'Superset',
            expanded: true,
            exercises: [
                {
                    id: firstExerciseId,
                    exerciseId: row.exerciseId || '',
                    sets: this.remapSets(row.sets, firstExerciseId),
                    copyCursor: 1,
                    activeSetId: `${firstExerciseId}-set-1`,
                    expanded: true
                },
                {
                    id: secondExerciseId,
                    exerciseId: next.exerciseId || '',
                    sets: this.remapSets(next.sets, secondExerciseId),
                    copyCursor: 1,
                    activeSetId: `${secondExerciseId}-set-1`,
                    expanded: true
                }
            ]
        };

        this.plannedSession.rows.splice(index, 2, supersetBlock);
    },

    prefillPlannerActiveSetFromHistory(setBadge) {
        const sessionContainer = setBadge.closest('.planner-last-session');
        const rowId = sessionContainer?.dataset?.rowId;
        if (!rowId) return;

        const itemId = sessionContainer.dataset.itemId || null;
        const target = this.getPlannerTarget(rowId, itemId);
        if (!target || !Array.isArray(target.sets) || target.sets.length === 0) return;

        const activeSet = target.activeSetId
            ? target.sets.find(entry => entry.id === target.activeSetId)
            : null;
        const destinationSet = activeSet || target.sets[0];
        if (!destinationSet) return;

        destinationSet.reps = setBadge.dataset.reps || '';
        destinationSet.weight = setBadge.dataset.weight ?? '';
        destinationSet.completed = false;
        target.activeSetId = destinationSet.id;

        this.persistPlannerDraft();
        this.renderPlannedSession();
    },

    collapseAllPlannedRowsExcept(rowId) {
        if (!this.plannedSession || !Array.isArray(this.plannedSession.rows)) return;
        this.plannedSession.rows.forEach(row => {
            row.expanded = row.id === rowId;
        });
    },

    togglePlannerRow(rowId) {
        const row = this.plannedSession.rows.find(entry => entry.id === rowId);
        if (!row) return;
        row.expanded = !row.expanded;
    },

    ensureOnePlannerRowExpanded() {
        if (!this.plannedSession || !Array.isArray(this.plannedSession.rows) || this.plannedSession.rows.length === 0) return;
        const hasExpanded = this.plannedSession.rows.some(row => row.expanded !== false);
        if (!hasExpanded) {
            this.plannedSession.rows[0].expanded = true;
        }
    },

    clearPlannerRowFields(rowId, itemId = null) {
        const row = this.plannedSession.rows.find(entry => entry.id === rowId);
        if (!row) return;

        if (row.type === 'superset' && !itemId) {
            row.exercises.forEach(exerciseEntry => {
                exerciseEntry.exerciseId = '';
                exerciseEntry.copyCursor = 1;
                if (!Array.isArray(exerciseEntry.sets)) {
                    exerciseEntry.sets = this.createDefaultPlannerSets(exerciseEntry.id);
                    exerciseEntry.activeSetId = exerciseEntry.sets[0]?.id || null;
                    return;
                }
                exerciseEntry.sets.forEach(setEntry => {
                    setEntry.reps = '';
                    setEntry.weight = '';
                    setEntry.completed = false;
                });
                exerciseEntry.activeSetId = exerciseEntry.sets[0]?.id || null;
            });
            return;
        }

        const target = row.type === 'superset'
            ? row.exercises.find(entry => entry.id === itemId)
            : row;

        if (!target) return;

        target.exerciseId = '';
        target.copyCursor = 1;

        if (!Array.isArray(target.sets)) {
            target.sets = this.createDefaultPlannerSets(target.id || rowId);
            target.activeSetId = target.sets[0]?.id || null;
            return;
        }

        target.sets.forEach(setEntry => {
            setEntry.reps = '';
            setEntry.weight = '';
            setEntry.completed = false;
        });
        target.activeSetId = target.sets[0]?.id || null;
    },

    copyPlannerSetForward(rowId, itemId = null) {
        const row = this.plannedSession.rows.find(entry => entry.id === rowId);
        if (!row) return;

        const target = row.type === 'superset'
            ? row.exercises.find(entry => entry.id === itemId)
            : row;

        if (!target || !Array.isArray(target.sets) || target.sets.length < 2) return;

        let sourceIndex = -1;

        if (target.activeSetId) {
            sourceIndex = target.sets.findIndex(entry => entry.id === target.activeSetId);
        }

        let nextIndex;
        if (sourceIndex >= 0 && sourceIndex < target.sets.length - 1) {
            nextIndex = sourceIndex + 1;
        } else {
            nextIndex = Number.isInteger(target.copyCursor) ? target.copyCursor : 1;
            if (nextIndex >= target.sets.length) {
                nextIndex = 1;
            }
            sourceIndex = nextIndex - 1;
        }

        const sourceSet = target.sets[sourceIndex];
        const destinationSet = target.sets[nextIndex];

        if (!sourceSet || !destinationSet) return;

        destinationSet.reps = sourceSet.reps;
        destinationSet.weight = sourceSet.weight;
        destinationSet.completed = false;
        target.copyCursor = nextIndex + 1 >= target.sets.length ? 1 : nextIndex + 1;
        target.activeSetId = destinationSet.id;
    },

    handlePlannerFieldChange(event) {
        const field = event.target;
        if (!field?.dataset?.field) return;

        this.resetLoadedTemplate();
        const fieldName = field.dataset.field;

        const row = this.plannedSession.rows.find(entry => entry.id === field.dataset.rowId);
        if (!row) return;

        if (row.type === 'single') {
            if (fieldName === 'exerciseId') {
                row.exerciseId = field.value;
                this.updatePlannerLastSessionInfo(`planner-last-${row.id}`, field.value, row.id, null);
            } else {
                const setEntry = (row.sets || []).find(entry => entry.id === field.dataset.setId);
                if (!setEntry) return;
                setEntry[fieldName] = field.value;
                if (fieldName === 'reps' || fieldName === 'weight') {
                    setEntry.completed = false;
                }
                row.activeSetId = field.dataset.setId;
            }
        } else {
            const item = row.exercises.find(entry => entry.id === field.dataset.itemId);
            if (!item) return;

            if (fieldName === 'exerciseId') {
                item.exerciseId = field.value;
                this.updatePlannerLastSessionInfo(`planner-last-${row.id}-${item.id}`, field.value, row.id, item.id);
            } else {
                const setEntry = (item.sets || []).find(entry => entry.id === field.dataset.setId);
                if (!setEntry) return;
                setEntry[fieldName] = field.value;
                if (fieldName === 'reps' || fieldName === 'weight') {
                    setEntry.completed = false;
                }
                item.activeSetId = field.dataset.setId;
            }
        }

        this.persistPlannerDraft();
        if (fieldName === 'exerciseId') {
            this.renderPlannedSession();
            return;
        }
        this.updatePlannerSubmitBtn();
        this.refreshPlannerSetIndicators(field.dataset.rowId, field.dataset.itemId || null);
    },

    /**
     * Sync number/text input values into the model on every keystroke so
     * isPlannerSessionComplete always sees the current value, then re-check the button.
     * Does NOT persist to localStorage (that happens on the 'change' event).
     */
    handlePlannerFieldInput(event) {
        const field = event.target;
        if (!field?.dataset?.field) return;
        const fieldName = field.dataset.field;
        if (fieldName === 'exerciseId') return; // selects handled by 'change'

        this.resetLoadedTemplate();

        const row = this.plannedSession?.rows?.find(entry => entry.id === field.dataset.rowId);
        if (!row) return;

        if (row.type === 'single') {
            const setEntry = (row.sets || []).find(entry => entry.id === field.dataset.setId);
            if (setEntry) {
                setEntry[fieldName] = field.value;
                if (fieldName === 'reps' || fieldName === 'weight') {
                    setEntry.completed = false;
                }
                row.activeSetId = field.dataset.setId;
            }
        } else {
            const item = row.exercises?.find(entry => entry.id === field.dataset.itemId);
            if (item) {
                const setEntry = (item.sets || []).find(entry => entry.id === field.dataset.setId);
                if (setEntry) {
                    setEntry[fieldName] = field.value;
                    if (fieldName === 'reps' || fieldName === 'weight') {
                        setEntry.completed = false;
                    }
                    item.activeSetId = field.dataset.setId;
                }
            }
        }

        this.updatePlannerSubmitBtn();
        this.refreshPlannerSetIndicators(field.dataset.rowId, field.dataset.itemId || null);
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
            this.updatePlannerSubmitBtn();
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

        this.updatePlannerSubmitBtn();
    },

    getPlannerExerciseName(exerciseId) {
        if (!exerciseId) return 'Select Exercise';
        const exercise = Storage.getExerciseById(exerciseId);
        return exercise?.name || 'Unknown Exercise';
    },

    getPlannerExerciseIcon(exercise) {
        if (!exercise) {
            return 'plus-circle';
        }

        const equipmentIcons = {
            barbell: 'dumbbell',
            dumbbell: 'dumbbell',
            kettlebell: 'dumbbell',
            machines: 'settings',
            bodyweight: 'user',
            'bodyweight+': 'user'
        };

        return equipmentIcons[exercise.equipmentType] || 'dumbbell';
    },

    getPlannerRowTitle(row, index) {
        const position = index + 1;
        if (row.type === 'superset') {
            const names = (row.exercises || []).map(entry => this.getPlannerExerciseName(entry.exerciseId));
            return `${position}: ${names.join(' / ')}`;
        }

        return `${position}: ${this.getPlannerExerciseName(row.exerciseId)}`;
    },

    createSinglePlannedRow(row, index) {
        const wrapper = document.createElement('div');
        wrapper.className = 'planned-row';
        wrapper.classList.toggle('collapsed', row.expanded === false);

        const header = document.createElement('div');
        header.className = 'planned-row-header';
        header.addEventListener('click', (event) => {
            if (event.target.closest('button')) return;
            this.togglePlannerRow(row.id);
            this.persistPlannerDraft();
            this.renderPlannedSession();
        });

        const title = document.createElement('span');
        title.className = 'planned-row-title';
    title.textContent = this.getPlannerRowTitle(row, index);

        const headerActions = document.createElement('div');
        headerActions.className = 'planner-row-actions';

        const linkBtn = document.createElement('button');
        linkBtn.type = 'button';
        linkBtn.className = 'btn-icon btn-secondary btn-small planner-row-btn planner-link-btn';
        linkBtn.dataset.action = 'toggle-link-next';
        linkBtn.dataset.rowId = row.id;
        linkBtn.innerHTML = '<i data-lucide="link-2"></i>';
        const hasNextRow = Boolean(this.plannedSession.rows[index + 1]);
        linkBtn.disabled = !hasNextRow;
        linkBtn.title = hasNextRow ? 'Link this exercise with the one below' : 'No row below to link';

        const collapseBtn = document.createElement('button');
        collapseBtn.type = 'button';
        collapseBtn.className = 'btn-icon btn-secondary btn-small planner-row-btn planner-collapse-btn';
        collapseBtn.dataset.action = 'toggle-row';
        collapseBtn.dataset.rowId = row.id;
        collapseBtn.innerHTML = '<i data-lucide="chevron-down"></i>';
        collapseBtn.title = row.expanded === false ? 'Expand row' : 'Collapse row';

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-icon btn-secondary btn-small planner-row-btn';
        removeBtn.dataset.action = 'remove-row';
        removeBtn.dataset.rowId = row.id;
        removeBtn.innerHTML = '<i data-lucide="trash-2"></i>';
        removeBtn.title = 'Remove row';

        headerActions.appendChild(linkBtn);
        headerActions.appendChild(collapseBtn);
        headerActions.appendChild(removeBtn);

        header.appendChild(title);
        header.appendChild(headerActions);

        const topRow = document.createElement('div');
        topRow.className = 'planned-entry-top';
        topRow.appendChild(this.createExercisePickerButton(row.id, null, row.exerciseId));

        const body = document.createElement('div');
        body.className = 'planner-row-body';
        body.appendChild(topRow);
        body.appendChild(this.createPlannerSetsGrid(row.id, null, row.sets));

        wrapper.appendChild(header);
        wrapper.appendChild(body);
        return wrapper;
    },

    createSupersetRow(row, index) {
        const wrapper = document.createElement('div');
        wrapper.className = 'superset-block';
        wrapper.classList.toggle('collapsed', row.expanded === false);

        const header = document.createElement('div');
        header.className = 'superset-header';
        header.addEventListener('click', (event) => {
            if (event.target.closest('button')) return;
            this.togglePlannerRow(row.id);
            this.persistPlannerDraft();
            this.renderPlannedSession();
        });

        const title = document.createElement('span');
        title.className = 'superset-title';
    title.textContent = this.getPlannerRowTitle(row, index);

        const headerActions = document.createElement('div');
        headerActions.className = 'planner-row-actions';

        const linkBtn = document.createElement('button');
        linkBtn.type = 'button';
        linkBtn.className = 'btn-icon btn-secondary btn-small planner-row-btn planner-link-btn active';
        linkBtn.dataset.action = 'toggle-link-next';
        linkBtn.dataset.rowId = row.id;
        linkBtn.innerHTML = '<i data-lucide="link-2"></i>';
        linkBtn.title = 'Unlink superset into two single exercises';

        const collapseBtn = document.createElement('button');
        collapseBtn.type = 'button';
        collapseBtn.className = 'btn-icon btn-secondary btn-small planner-row-btn planner-collapse-btn';
        collapseBtn.dataset.action = 'toggle-row';
        collapseBtn.dataset.rowId = row.id;
        collapseBtn.innerHTML = '<i data-lucide="chevron-down"></i>';
        collapseBtn.title = row.expanded === false ? 'Expand superset' : 'Collapse superset';

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-icon btn-secondary btn-small planner-row-btn';
        removeBtn.dataset.action = 'remove-row';
        removeBtn.dataset.rowId = row.id;
        removeBtn.innerHTML = '<i data-lucide="trash-2"></i>';
        removeBtn.title = 'Remove superset block';

        headerActions.appendChild(linkBtn);
        headerActions.appendChild(collapseBtn);
        headerActions.appendChild(removeBtn);
        header.appendChild(title);
        header.appendChild(headerActions);

        const exercisesContainer = document.createElement('div');
        exercisesContainer.className = 'superset-exercises';

        row.exercises.forEach((exerciseEntry, exerciseIndex) => {
            const rowContainer = document.createElement('div');
            rowContainer.className = 'superset-exercise-row';
            rowContainer.classList.toggle('collapsed', exerciseEntry.expanded === false);
            const subsetNumber = exerciseIndex + 1;

            const label = document.createElement('button');
            label.type = 'button';
            label.className = 'superset-label';
            label.dataset.action = 'toggle-subset';
            label.dataset.rowId = row.id;
            label.dataset.itemId = exerciseEntry.id;
            label.setAttribute('aria-expanded', String(exerciseEntry.expanded !== false));
            label.title = exerciseEntry.expanded === false
                ? `Expand subset ${subsetNumber}`
                : `Collapse subset ${subsetNumber}`;
            label.setAttribute('aria-label', label.title);

            const numberIcon = document.createElement('span');
            numberIcon.className = 'superset-label-icon';
            numberIcon.textContent = String(subsetNumber);
            label.appendChild(numberIcon);

            const chevron = document.createElement('i');
            chevron.dataset.lucide = 'chevron-down';
            chevron.className = 'superset-label-chevron';
            label.appendChild(chevron);

            const content = document.createElement('div');
            content.className = 'superset-exercise-content';

            const collapsedSummary = document.createElement('div');
            collapsedSummary.className = 'superset-collapsed-summary';
            const summaryExercise = exerciseEntry.exerciseId
                ? Storage.getExerciseById(exerciseEntry.exerciseId)
                : null;
            const exerciseIcon = this.getPlannerExerciseIcon(summaryExercise);
            const exerciseName = this.getPlannerExerciseName(exerciseEntry.exerciseId);

            const collapsedIcon = document.createElement('i');
            collapsedIcon.className = 'planner-exercise-picker-icon';
            collapsedIcon.dataset.lucide = exerciseIcon;
            collapsedIcon.setAttribute('aria-hidden', 'true');

            const collapsedLabel = document.createElement('span');
            collapsedLabel.className = 'superset-collapsed-text';
            collapsedLabel.textContent = exerciseName;

            collapsedSummary.appendChild(collapsedIcon);
            collapsedSummary.appendChild(collapsedLabel);

            const topRow = document.createElement('div');
            topRow.className = 'planned-entry-top';
            topRow.appendChild(this.createExercisePickerButton(row.id, exerciseEntry.id, exerciseEntry.exerciseId));

            rowContainer.appendChild(label);
            rowContainer.appendChild(collapsedSummary);
            content.appendChild(topRow);
            content.appendChild(this.createPlannerSetsGrid(row.id, exerciseEntry.id, exerciseEntry.sets));
            rowContainer.appendChild(content);
            exercisesContainer.appendChild(rowContainer);
        });

        const body = document.createElement('div');
        body.className = 'planner-row-body';
        body.appendChild(exercisesContainer);

        wrapper.appendChild(header);
        wrapper.appendChild(body);
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

    createExercisePickerButton(rowId, itemId, selectedValue) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'planner-exercise-picker-btn';
        button.dataset.action = 'replace-exercise';
        button.dataset.rowId = rowId;
        if (itemId) {
            button.dataset.itemId = itemId;
        }

        const exercise = selectedValue ? Storage.getExerciseById(selectedValue) : null;
        const label = exercise?.name || 'Select Exercise...';
        const labelClass = exercise ? '' : 'placeholder';
        const icon = this.getPlannerExerciseIcon(exercise);
        button.innerHTML = `<span class="planner-exercise-picker-main"><i class="planner-exercise-picker-icon" data-lucide="${icon}" aria-hidden="true"></i><span class="${labelClass}">${label}</span></span><i data-lucide="chevron-down"></i>`;
        button.title = 'Select or replace exercise';

        return button;
    },

    createPlannerSetsGrid(rowId, itemId, sets = []) {
        const container = document.createElement('div');
        container.className = 'planner-sets-grid workout-sets-grid';
        container.dataset.rowId = rowId;
        if (itemId) {
            container.dataset.itemId = itemId;
        }

        const normalizedSets = Array.isArray(sets) ? sets : this.createDefaultPlannerSets(itemId || rowId);
        const target = this.getPlannerTarget(rowId, itemId || null);
        const activeSetId = this.ensurePlannerActiveSet(target, normalizedSets);
        const exerciseId = target?.exerciseId || '';
        const exercise = exerciseId ? Storage.getExerciseById(exerciseId) : null;
        const requiresWeight = Boolean(exercise?.requiresWeight);
        const totalSetCount = normalizedSets.length;
        let completeSetCount = 0;

        normalizedSets.forEach((setEntry, index) => {
            const card = document.createElement('div');
            card.className = 'planner-set-card workout-set-card';
            card.dataset.setId = setEntry.id;
            card.classList.toggle('is-active', activeSetId !== null && setEntry.id === activeSetId);

            const isComplete = this.isPlannerSetComplete(setEntry, exerciseId);
            if (isComplete) {
                completeSetCount += 1;
            }
            card.classList.toggle('is-complete', isComplete);
            card.classList.toggle('is-incomplete', !isComplete);

            const setLabel = document.createElement('div');
            setLabel.className = 'planner-set-title workout-set-title';
            setLabel.textContent = `Set ${index + 1}`;

            const repsRow = document.createElement('div');
            repsRow.className = 'workout-set-row';

            const repsLabel = document.createElement('span');
            repsLabel.className = 'workout-set-row-label';
            repsLabel.textContent = '';

            const repsInput = this.createPlannerInput('number', 'reps', rowId, itemId, setEntry.id, setEntry.reps, 'Reps', 1, 999);

            const repsValue = document.createElement('div');
            repsValue.className = 'workout-set-row-value';
            repsValue.appendChild(repsInput);
            repsRow.appendChild(repsLabel);
            repsRow.appendChild(repsValue);

            const completeBtn = document.createElement('button');
            completeBtn.type = 'button';
            completeBtn.className = `planner-set-status ${isComplete ? 'complete' : 'incomplete'}`;
            completeBtn.dataset.action = 'toggle-set-complete';
            completeBtn.dataset.rowId = rowId;
            completeBtn.dataset.setId = setEntry.id;
            if (itemId) {
                completeBtn.dataset.itemId = itemId;
            }
            completeBtn.setAttribute('aria-label', isComplete ? 'Set complete' : 'Set incomplete');
            completeBtn.title = isComplete ? 'Set complete' : 'Set incomplete';
            completeBtn.innerHTML = this.getPlannerSetStatusIcon(isComplete);

            const weightRow = document.createElement('div');
            weightRow.className = 'workout-set-row';

            const weightLabel = document.createElement('span');
            weightLabel.className = 'workout-set-row-label';
            weightLabel.textContent = '';

            const weightCell = document.createElement('div');
            weightCell.className = 'workout-set-row-value';
            if (requiresWeight) {
                weightCell.appendChild(this.createPlannerInput('number', 'weight', rowId, itemId, setEntry.id, setEntry.weight, 'Weight', 0, null, 'any'));
            } else {
                weightCell.classList.add('is-empty');
            }

            weightRow.appendChild(weightLabel);
            weightRow.appendChild(weightCell);

            const checkRow = document.createElement('div');
            checkRow.className = 'workout-set-row';
            checkRow.classList.add('is-check-row');

            const checkLabel = document.createElement('span');
            checkLabel.className = 'workout-set-row-label';
            checkLabel.textContent = '';

            const checkCell = document.createElement('div');
            checkCell.className = 'workout-set-row-value';
            checkCell.appendChild(completeBtn);

            checkRow.appendChild(checkLabel);
            checkRow.appendChild(checkCell);

            card.appendChild(setLabel);
            card.appendChild(repsRow);
            card.appendChild(weightRow);
            card.appendChild(checkRow);
            container.appendChild(card);
        });

        const actionRow = document.createElement('div');
        actionRow.className = 'planner-set-actions';

        const progress = document.createElement('span');
        progress.className = 'planner-sets-progress';
        const allSetsDone = totalSetCount > 0 && completeSetCount === totalSetCount;
        progress.classList.toggle('all-done', allSetsDone);
        progress.textContent = `${completeSetCount}/${totalSetCount} sets complete`;
        actionRow.appendChild(progress);

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'btn-icon btn-secondary btn-small planner-row-btn';
        copyBtn.dataset.action = 'copy-next-set';
        copyBtn.dataset.rowId = rowId;
        if (itemId) {
            copyBtn.dataset.itemId = itemId;
        }
        copyBtn.innerHTML = '<i data-lucide="copy"></i>';
        copyBtn.title = 'Copy previous set to next set';
        copyBtn.setAttribute('aria-label', 'Copy previous set to next set');

        const activeSetIndex = normalizedSets.findIndex(s => s.id === activeSetId);
        const isLastSet = activeSetIndex !== -1 && activeSetIndex === normalizedSets.length - 1;

        if (!isLastSet) {
            actionRow.appendChild(copyBtn);
        }
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

    isPlannerFieldFilled(value) {
        return value !== '' && value !== null && value !== undefined;
    },

    canPlannerSetBeCompleted(setEntry, exerciseId) {
        const hasReps = this.isPlannerSetHasReps(setEntry);
        if (!hasReps) return false;

        const exercise = exerciseId ? Storage.getExerciseById(exerciseId) : null;
        const requiresWeight = Boolean(exercise?.requiresWeight);
        if (!requiresWeight) {
            return true;
        }

        return this.isPlannerFieldFilled(setEntry?.weight);
    },

    isPlannerSetComplete(setEntry, exerciseId) {
        return Boolean(setEntry?.completed) && this.canPlannerSetBeCompleted(setEntry, exerciseId);
    },

    getPlannerSetStatusIcon(isComplete) {
        const iconName = isComplete ? 'check' : 'circle';
        return `<i data-lucide="${iconName}" aria-hidden="true"></i>`;
    },

    refreshPlannerSetIndicators(rowId, itemId = null) {
        const target = this.getPlannerTarget(rowId, itemId);
        if (!target || !Array.isArray(target.sets)) return;

        const selector = itemId
            ? `.planner-sets-grid[data-row-id="${rowId}"][data-item-id="${itemId}"]`
            : `.planner-sets-grid[data-row-id="${rowId}"]:not([data-item-id])`;
        const container = document.querySelector(selector);
        if (!container) return;

        const exerciseId = target.exerciseId || '';
        let completeSetCount = 0;

        target.sets.forEach(setEntry => {
            const card = container.querySelector(`.planner-set-card[data-set-id="${setEntry.id}"]`);
            if (!card) return;
            card.classList.toggle('is-active', Boolean(target.activeSetId) && target.activeSetId === setEntry.id);

            const isComplete = this.isPlannerSetComplete(setEntry, exerciseId);
            if (isComplete) {
                completeSetCount += 1;
            }

            card.classList.toggle('is-complete', isComplete);
            card.classList.toggle('is-incomplete', !isComplete);

            const statusBadge = card.querySelector('button[data-action="toggle-set-complete"]');
            if (statusBadge) {
                statusBadge.classList.toggle('complete', isComplete);
                statusBadge.classList.toggle('incomplete', !isComplete);
                statusBadge.setAttribute('aria-label', isComplete ? 'Set complete' : 'Set incomplete');
                statusBadge.title = isComplete ? 'Set complete' : 'Set incomplete';
                statusBadge.innerHTML = this.getPlannerSetStatusIcon(isComplete);
            }
        });

        const totalSetCount = target.sets.length;
        const allSetsDone = totalSetCount > 0 && completeSetCount === totalSetCount;
        const progress = container.querySelector('.planner-sets-progress');
        if (progress) {
            progress.classList.toggle('all-done', allSetsDone);
            progress.textContent = `${completeSetCount}/${totalSetCount} sets complete`;
        }

        if (window.lucide) {
            window.lucide.createIcons({ attrs: { class: 'lucide' } });
        }
    },

    persistPlannerDraft() {
        if (!this.plannedSession) return;
        localStorage.setItem(PLANNER_DRAFT_KEY, JSON.stringify(this.plannedSession));
        // Also update shared session state
        localStorage.setItem('sharedSessionState', JSON.stringify(this.plannedSession));
    },

    restorePlannerDraft() {
        // Prefer sharedSessionState if available
        let rawDraft = localStorage.getItem('sharedSessionState');
        if (!rawDraft) {
            rawDraft = localStorage.getItem(PLANNER_DRAFT_KEY);
        }
        if (!rawDraft) return;

        try {
            const parsed = JSON.parse(rawDraft);
            if (!parsed || !Array.isArray(parsed.rows)) return;

            const dateInput = document.getElementById('workoutDate');
            const today = formatDate(new Date());
            const currentDate = isValidDate(parsed.date)
                ? parsed.date
                : (dateInput?.value || today);

            // Translate exercise name to id if needed
            function getExerciseId(nameOrId) {
                if (typeof Storage !== 'undefined' && Storage.getExercises) {
                    const ex = Storage.getExercises().find(e => e.name === nameOrId || e.id === nameOrId);
                    if (ex) return ex.id;
                }
                return nameOrId;
            }

            function normalizeRow(row, index) {
                if (row.type === 'single') {
                    return {
                        ...row,
                        exerciseId: getExerciseId(row.exerciseId || row.name),
                        sets: Array.isArray(row.sets) ? row.sets.map(set => ({ ...set })) : []
                    };
                } else if (row.type === 'superset') {
                    return {
                        ...row,
                        exercises: Array.isArray(row.exercises) ? row.exercises.map(item => ({
                            ...item,
                            exerciseId: getExerciseId(item.exerciseId || item.name),
                            sets: Array.isArray(item.sets) ? item.sets.map(set => ({ ...set })) : []
                        })) : []
                    };
                }
                return row;
            }

            this.plannedSession = {
                id: parsed.id || `session-${Date.now()}`,
                date: currentDate,
                rows: parsed.rows.map(normalizeRow),
                loadedTemplateId: typeof parsed.loadedTemplateId === 'string' ? parsed.loadedTemplateId : '',
                loadedTemplateName: typeof parsed.loadedTemplateName === 'string' ? parsed.loadedTemplateName : ''
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
            weight: '',
            completed: false
        }));
    },

    normalizePlannerSets(rawSets, baseId, legacyReps = '', legacyWeight = '') {
        const normalized = Array.isArray(rawSets)
            ? rawSets.map((setEntry, index) => ({
                id: setEntry?.id || `${baseId}-set-${index + 1}`,
                reps: setEntry?.reps ?? '',
                weight: setEntry?.weight ?? '',
                completed: setEntry?.completed === true
            }))
            : [];

        if (normalized.length === 0 && (legacyReps !== '' || legacyWeight !== '')) {
            normalized.push({
                id: `${baseId}-set-1`,
                reps: legacyReps ?? '',
                weight: legacyWeight ?? '',
                completed: false
            });
        }

        while (normalized.length < DEFAULT_PLANNER_SET_COUNT) {
            const nextIndex = normalized.length + 1;
            normalized.push({
                id: `${baseId}-set-${nextIndex}`,
                reps: '',
                weight: '',
                completed: false
            });
        }

        return normalized.slice(0, DEFAULT_PLANNER_SET_COUNT);
    },

    normalizePlannedRow(row, index) {
        const rowId = row?.id || `row-${Date.now()}-${index}`;

        if (row?.type === 'superset') {
            const candidates = Array.isArray(row.exercises) ? row.exercises.slice(0, 2) : [];
            while (candidates.length < 2) {
                const suffix = candidates.length === 0 ? 'a' : 'b';
                candidates.push({ id: `${rowId}-${suffix}`, exerciseId: '' });
            }

            const exercises = candidates.map((exerciseEntry, exerciseIndex) => {
                const entryId = exerciseEntry?.id || `${rowId}-${exerciseIndex + 1}`;
                return {
                    id: entryId,
                    exerciseId: exerciseEntry?.exerciseId || '',
                    sets: this.normalizePlannerSets(exerciseEntry?.sets, entryId, exerciseEntry?.reps, exerciseEntry?.weight),
                    copyCursor: Number.isInteger(exerciseEntry?.copyCursor) ? exerciseEntry.copyCursor : 1,
                    activeSetId: exerciseEntry?.activeSetId !== undefined ? exerciseEntry.activeSetId : `${entryId}-set-1`,
                    expanded: exerciseEntry?.expanded !== false
                };
            });

            return {
                id: rowId,
                type: 'superset',
                label: row?.label || 'Superset',
                expanded: row?.expanded !== false,
                exercises
            };
        }

        return {
            id: rowId,
            type: 'single',
            exerciseId: row?.exerciseId || '',
            sets: this.normalizePlannerSets(row?.sets, rowId, row?.reps, row?.weight),
            copyCursor: Number.isInteger(row?.copyCursor) ? row.copyCursor : 1,
            activeSetId: row?.activeSetId !== undefined ? row.activeSetId : `${rowId}-set-1`,
            expanded: row?.expanded !== false
        };
    },

    isPlannerSetEmpty(setEntry) {
        const repsValue = setEntry?.reps;
        const weightValue = setEntry?.weight;
        const repsEmpty = repsValue === '' || repsValue === null || repsValue === undefined;
        const weightEmpty = weightValue === '' || weightValue === null || weightValue === undefined;
        return repsEmpty && weightEmpty;
    },

    /**
     * Returns true when every exercise/superset entry has an exercise selected
     * and at least one set with reps filled in.
     */
    isPlannerSetHasReps(setEntry) {
        const v = setEntry?.reps;
        return v !== '' && v !== null && v !== undefined;
    },

    isPlannerSessionComplete() {
        if (!this.plannedSession || !this.plannedSession.rows.length) return false;

        for (const row of this.plannedSession.rows) {
            if (row.type === 'single') {
                if (!row.exerciseId) return false;
                if (!Array.isArray(row.sets) || row.sets.length === 0) return false;
                if (!row.sets.every(s => this.isPlannerSetComplete(s, row.exerciseId))) return false;
            } else {
                for (const item of row.exercises) {
                    if (!item.exerciseId) return false;
                    if (!Array.isArray(item.sets) || item.sets.length === 0) return false;
                    if (!item.sets.every(s => this.isPlannerSetComplete(s, item.exerciseId))) return false;
                }
            }
        }
        return true;
    },

    updatePlannerSubmitBtn() {
        const btn = document.getElementById('plannerSubmitBtn');
        if (!btn) return;
        const ready = this.isPlannerSessionComplete();
        btn.disabled = !ready;
        btn.title = ready ? 'Submit planned session' : 'Mark all sets complete for every entry before submitting';
    },

    clearPlannedSession(showMessage = false) {
        this.resetLoadedTemplate();
        const dateInput = document.getElementById('workoutDate');
        this.plannedSession = {
            id: `session-${Date.now()}`,
            date: dateInput?.value || formatDate(new Date()),
            rows: [],
            loadedTemplateId: '',
            loadedTemplateName: ''
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
                    if (!this.isPlannerSetComplete(setEntry, row.exerciseId)) {
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
                        if (!this.isPlannerSetComplete(setEntry, supersetItem.exerciseId)) {
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
            showToast('Mark all sets complete before submitting', 'error');
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

    // ─── Session Templates ───────────────────────────────────────────────────

    /**
     * Save the current planner rows as a new session template.
     * Asks for a name via prompt, then persists via Storage.
     */
    handleSaveAsTemplate() {
        if (!this.plannedSession || this.plannedSession.rows.length === 0) {
            showToast('Add at least one exercise before saving as a template', 'error');
            return;
        }

        const modal = document.getElementById('saveAsTemplateModal');
        const input = document.getElementById('saveAsTemplateNameInput');
        if (!modal || !input) return;

        input.value = '';
        modal.style.display = 'flex';
        if (window.lucide) window.lucide.createIcons();
        input.focus();
    },

    closeSaveAsTemplateModal() {
        const modal = document.getElementById('saveAsTemplateModal');
        const input = document.getElementById('saveAsTemplateNameInput');
        if (modal) modal.style.display = 'none';
        if (input) input.value = '';
    },

    async confirmSaveAsTemplate() {
        const input = document.getElementById('saveAsTemplateNameInput');
        const name = input ? input.value.trim() : '';

        if (!name) {
            showToast('Template name cannot be empty', 'error');
            input?.focus();
            return;
        }

        // Strip runtime-only planner fields (activeSetId, copyCursor, expanded)
        // but keep exerciseId, sets (with reps/weight)
        const rows = this.plannedSession.rows.map(row => {
            if (row.type === 'single') {
                return {
                    type: 'single',
                    exerciseId: row.exerciseId || '',
                    sets: (row.sets || []).map(s => ({
                        reps: s.reps ?? '',
                        weight: s.weight ?? ''
                    }))
                };
            } else {
                return {
                    type: 'superset',
                    label: row.label || 'Superset',
                    exercises: (row.exercises || []).map(item => ({
                        exerciseId: item.exerciseId || '',
                        sets: (item.sets || []).map(s => ({
                            reps: s.reps ?? '',
                            weight: s.weight ?? ''
                        }))
                    }))
                };
            }
        });

        try {
            await Storage.addSessionTemplate({ name, rows });
            showToast(`Template "${name}" saved`, 'success');
            this.closeSaveAsTemplateModal();
            window.dispatchEvent(new CustomEvent('templatesUpdated'));
        } catch (error) {
            showToast(error.message, 'error');
        }
    },

    populatePlannerTemplateDropdown() {
        const select = document.getElementById('plannerTemplateSelect');
        if (!select) return;

        const currentValue = select.value;
        const templates = Storage.getSessionTemplates();
        select.innerHTML = '<option value="">Load template…</option>';

        templates.forEach(template => {
            const opt = document.createElement('option');
            opt.value = template.id;
            opt.textContent = template.name;
            select.appendChild(opt);
        });

        // Restore current selection, else restore from persisted planner draft
        const persistedTemplateId = this.plannedSession?.loadedTemplateId || '';
        const selectedTemplateId = currentValue || persistedTemplateId;
        if (selectedTemplateId && select.querySelector(`option[value="${selectedTemplateId}"]`)) {
            select.value = selectedTemplateId;
        }
    },

    resetLoadedTemplate() {
        if (this.plannedSession) {
            this.plannedSession.loadedTemplateId = '';
            this.plannedSession.loadedTemplateName = '';
        }

        const select = document.getElementById('plannerTemplateSelect');
        if (select && select.value !== '') {
            select.value = '';
        }
    },

    /**
     * Load a session template into the planner, replacing current rows.
     * All row/set IDs are regenerated to avoid conflicts with saved drafts.
     * @param {string} templateId
     */
    async loadTemplateIntoPlanner(templateId) {
        const template = Storage.getSessionTemplateById(templateId);
        if (!template) {
            showToast('Template not found', 'error');
            return;
        }

        const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        const newRows = [];

        for (const row of (template.rows || [])) {
            if (row.type === 'single') {
                const rowId = `row-${stamp()}`;
                const exerciseId = row.exerciseId || '';
                const sets = await this.resolveTemplateLoadSets(exerciseId, row.sets, rowId);
                newRows.push({
                    id: rowId,
                    type: 'single',
                    exerciseId,
                    sets,
                    copyCursor: 1,
                    activeSetId: null,
                    expanded: true
                });
                continue;
            }

            const blockId = `ss-${stamp()}`;
            const exercises = [];
            for (const [idx, item] of (row.exercises || []).entries()) {
                const itemId = `${blockId}-${String.fromCharCode(97 + idx)}`;
                const exerciseId = item.exerciseId || '';
                const sets = await this.resolveTemplateLoadSets(exerciseId, item.sets, itemId);
                exercises.push({
                    id: itemId,
                    exerciseId,
                    sets,
                    copyCursor: 1,
                    activeSetId: null
                });
            }

            newRows.push({
                id: blockId,
                type: 'superset',
                label: row.label || 'Superset',
                expanded: true,
                exercises
            });
        }

        this.plannedSession.rows = newRows;
        this.plannedSession.loadedTemplateId = template.id;
        this.plannedSession.loadedTemplateName = template.name || '';

        const select = document.getElementById('plannerTemplateSelect');
        if (select && select.querySelector(`option[value="${template.id}"]`)) {
            select.value = template.id;
        }

        this.persistPlannerDraft();
        this.renderPlannedSession();
        showToast(`Template "${template.name}" loaded`, 'success');
    },

    /**
     * Remap template sets to fresh IDs under a new base
     */
    remapSets(templateSets, baseId) {
        const source = Array.isArray(templateSets) && templateSets.length > 0
            ? templateSets
            : Array.from({ length: DEFAULT_PLANNER_SET_COUNT }, () => ({ reps: '', weight: '', completed: false }));

        return source.slice(0, DEFAULT_PLANNER_SET_COUNT).map((s, i) => ({
            id: `${baseId}-set-${i + 1}`,
            reps: s.reps ?? '',
            weight: s.weight ?? '',
            completed: false
        }));
    },

    async resolveTemplateLoadSets(exerciseId, templateSets, baseId) {
        const fallbackSets = this.remapSets(templateSets, baseId);
        if (!exerciseId) {
            return fallbackSets;
        }

        try {
            const sessions = await Storage.getLastWorkoutSessionsForExercise(exerciseId, 1);
            const latest = sessions?.[0];
            const latestSets = Array.isArray(latest?.sets) ? latest.sets : [];
            if (!latestSets.length) {
                return fallbackSets;
            }

            const exercise = Storage.getExerciseById(exerciseId);
            const requiresWeight = Boolean(exercise?.requiresWeight);

            const fromHistory = latestSets
                .slice(0, DEFAULT_PLANNER_SET_COUNT)
                .map((setEntry, index) => ({
                    id: `${baseId}-set-${index + 1}`,
                    reps: setEntry?.reps ?? '',
                    weight: requiresWeight ? (setEntry?.weight ?? '') : '',
                    completed: false
                }));

            while (fromHistory.length < DEFAULT_PLANNER_SET_COUNT) {
                fromHistory.push({
                    id: `${baseId}-set-${fromHistory.length + 1}`,
                    reps: '',
                    weight: '',
                    completed: false
                });
            }

            return fromHistory;
        } catch (error) {
            return fallbackSets;
        }
    },

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

            const sessionsContainer = document.createElement('div');
            sessionsContainer.className = 'sessions-horizontal';

            lastSessions.forEach((session) => {
                const sessionBox = document.createElement('div');
                sessionBox.className = 'session-box';

                const setsContainer = document.createElement('div');
                setsContainer.className = 'sets-list';

                session.sets.forEach((set) => {
                    const setBadge = document.createElement('span');
                    setBadge.className = 'set-badge-item clickable';
                    setBadge.dataset.action = 'prefill-log-set';
                    setBadge.dataset.reps = set.reps ?? '';
                    setBadge.dataset.weight = set.weight !== null && set.weight !== undefined && set.weight !== ''
                        ? String(set.weight)
                        : '';
                    setBadge.title = 'Click to prefill reps/weight';

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

        if (currentVolume > 0 && maxVolume > 0) {
            const hint = document.createElement('div');
            hint.className = 'suggestion-hint';
            const percentage = Math.min(100, (currentVolume / maxVolume) * 100).toFixed(0);
            hint.innerHTML = `<i data-lucide="zap" class="icon-xs"></i> <strong>Volume:</strong> ${currentVolume.toFixed(0)} / ${maxVolume.toFixed(0)} kg <span class="percentage-pill" style="background: var(--primary-light); color: var(--primary-color); padding: 2px 6px; border-radius: 10px; font-size: 0.75rem; margin-left: 4px;">${percentage}%</span>`;
            container.appendChild(hint);
        }

        if (window.lucide) window.lucide.createIcons();

        const list = document.createElement('div');
        list.className = 'suggestion-chips-container';

        suggestions.forEach(s => {
            const chip = document.createElement('div');
            chip.className = 'suggestion-chip';

            if (s.isMessage) {
                chip.innerHTML = `<span>${s.label}</span>`;
                chip.classList.add('suggestion-chip--static');
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
        this.updateDateDisplay();
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
     * Update the visible date display span
     */
    updateDateDisplay() {
        const dateInput = document.getElementById('workoutDate');
        const display = document.getElementById('workoutDateDisplay');
        if (!dateInput || !display) return;
        const value = dateInput.value;
        if (!value) {
            display.textContent = '\u2014';
            return;
        }
        const today = formatDate(new Date());
        if (value === today) {
            display.textContent = 'Today';
        } else {
            const dateObj = new Date(value + 'T00:00:00');
            display.textContent = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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

            // Invalidate planner last-session cache for this exercise so plan view shows fresh data
            delete this.plannerLastSessionCache[exerciseId];

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
     * Render cached planner last session data into a container element
     */
    _applyPlannerLastSessionCache(container, cached) {
        if (!cached || !cached.hasData) {
            container.innerHTML = '';
            container.style.display = 'none';
        } else {
            container.innerHTML = cached.html;
            container.style.display = 'flex';
        }
    },

    /**
     * Update the last session info display for a planner exercise.
     * Renders from cache immediately (no flicker), then refreshes cache in background.
     * @param {string} containerId - ID of the container element
     * @param {string} exerciseId - Selected exercise ID
     */
    async updatePlannerLastSessionInfo(containerId, exerciseId, rowId = null, itemId = null) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (rowId) {
            container.dataset.rowId = rowId;
        } else {
            delete container.dataset.rowId;
        }

        if (itemId) {
            container.dataset.itemId = itemId;
        } else {
            delete container.dataset.itemId;
        }

        if (!exerciseId) {
            container.innerHTML = '';
            container.style.display = 'none';
            return;
        }

        // Render from cache instantly so there is no blank flash on re-renders
        if (this.plannerLastSessionCache[exerciseId] !== undefined) {
            this._applyPlannerLastSessionCache(container, this.plannerLastSessionCache[exerciseId]);
        }

        try {
            const sessions = await Storage.getLastWorkoutSessionsForExercise(exerciseId, 1);
            if (!sessions || sessions.length === 0) {
                this.plannerLastSessionCache[exerciseId] = { hasData: false, html: '' };
            } else {
                const session = sessions[0];
                const dateObj = new Date(session.date + 'T00:00:00');
                const dateFormatted = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                const chips = session.sets.map(s => {
                    let text = `${s.reps}`;
                    if (s.weight !== null && s.weight !== undefined && s.weight !== '') text += `\u00d7${s.weight}`;
                    return `<span class="set-badge-item clickable" data-action="prefill-set-1" data-reps="${s.reps ?? ''}" data-weight="${s.weight ?? ''}" title="Click to prefill active set">${text}</span>`;
                }).join('');
                this.plannerLastSessionCache[exerciseId] = {
                    hasData: true,
                    html: `<span class="planner-last-label">${dateFormatted}:</span><div class="planner-last-sets">${chips}</div>`
                };
            }
            // Apply fresh data — re-read container in case DOM was rebuilt during await
            const freshContainer = document.getElementById(containerId);
            if (freshContainer) {
                this._applyPlannerLastSessionCache(freshContainer, this.plannerLastSessionCache[exerciseId]);
            }
        } catch (error) {
            this.plannerLastSessionCache[exerciseId] = { hasData: false, html: '' };
            const freshContainer = document.getElementById(containerId);
            if (freshContainer) {
                freshContainer.innerHTML = '';
                freshContainer.style.display = 'none';
            }
        }
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
                container.classList.add('hidden');
                container.style.display = 'none';
                return;
            }

            container.classList.remove('hidden');
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
            container.classList.add('hidden');
            container.style.display = 'none';
        }
    }


};


// Remove deprecated methods
// isValidDate is now imported from utils.js
// escapeHtml is now imported from utils.js
