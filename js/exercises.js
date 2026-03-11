// Exercises Module
// Handles exercise UI and interactions

import { Storage } from './storage.js';
import { showToast } from './app.js';
import { CONFIG } from './config.js';
import { validateExerciseName, validateEquipmentType, formatEquipmentType } from './utils.js';

const MUSCLE_OPTIONS = ['chest', 'back', 'shoulders', 'legs', 'biceps', 'triceps', 'core', 'neck'];

export const Exercises = {
    manageView: 'exercises',
    selectedEquipmentType: '',
    selectedMuscle: '',
    activeEquipmentFilter: '',
    activeMuscleFilter: '',

    /**
     * Initialize exercise management UI
     */
    init() {
        this.bindEvents();
        this.initToggleGroups();
        this.setManageView(localStorage.getItem('activeManageTab') || 'exercises');
        this.render();
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        const addBtn = document.getElementById('addExerciseBtn');
        const cancelBtn = document.getElementById('cancelExerciseBtn');
        const form = document.getElementById('exerciseFormElement');
        const exercisesTab = document.getElementById('manageTabExercises');
        const templatesTab = document.getElementById('manageTabTemplates');

        if (addBtn) addBtn.addEventListener('click', () => this.showForm());
        if (cancelBtn) cancelBtn.addEventListener('click', () => this.hideForm());
        if (form) form.addEventListener('submit', (e) => this.handleSubmit(e));
        if (exercisesTab) exercisesTab.addEventListener('click', () => this.setManageView('exercises'));
        if (templatesTab) templatesTab.addEventListener('click', () => this.setManageView('templates'));
    },

    initToggleGroups() {
        this.renderFormToggleGroups();
        this.renderFilterToggleGroups();
    },

    renderFormToggleGroups() {
        this.renderToggleButtons(
            'equipmentTypeToggle',
            this.getEquipmentOptions(),
            this.selectedEquipmentType,
            (value) => {
                this.selectedEquipmentType = value;
                const input = document.getElementById('equipmentType');
                if (input) input.value = value;
                this.renderFormToggleGroups();
            }
        );

        this.renderToggleButtons(
            'muscleToggle',
            this.getMuscleOptions(),
            this.selectedMuscle,
            (value) => {
                this.selectedMuscle = value;
                const input = document.getElementById('muscle');
                if (input) input.value = value;
                this.renderFormToggleGroups();
            }
        );
    },

    renderFilterToggleGroups() {
        this.renderToggleButtons(
            'exerciseFilterEquipment',
            [{ value: '', label: 'All' }, ...this.getEquipmentOptions()],
            this.activeEquipmentFilter,
            (value) => {
                this.activeEquipmentFilter = value;
                this.renderFilterToggleGroups();
                this.render();
            }
        );

        this.renderToggleButtons(
            'exerciseFilterMuscle',
            [{ value: '', label: 'All' }, ...this.getMuscleOptions()],
            this.activeMuscleFilter,
            (value) => {
                this.activeMuscleFilter = value;
                this.renderFilterToggleGroups();
                this.render();
            }
        );
    },

    renderToggleButtons(containerId, options, selectedValue, onSelect) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = '';
        options.forEach((option) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `toggle-chip-btn${selectedValue === option.value ? ' active' : ''}`;
            button.textContent = option.label;
            button.setAttribute('aria-pressed', selectedValue === option.value ? 'true' : 'false');
            button.addEventListener('click', () => onSelect(option.value));
            container.appendChild(button);
        });
    },

    getEquipmentOptions() {
        return Object.keys(CONFIG.equipmentTypes).map((type) => ({
            value: type,
            label: formatEquipmentType(type)
        }));
    },

    getMuscleOptions() {
        return MUSCLE_OPTIONS.map((muscle) => ({
            value: muscle,
            label: muscle.charAt(0).toUpperCase() + muscle.slice(1)
        }));
    },

    setManageView(view) {
        this.manageView = view === 'templates' ? 'templates' : 'exercises';
        localStorage.setItem('activeManageTab', this.manageView);

        const exercisesTab = document.getElementById('manageTabExercises');
        const templatesTab = document.getElementById('manageTabTemplates');
        const exercisesPane = document.getElementById('manageExercisesPane');
        const templatesPane = document.getElementById('manageTemplatesPane');

        const isExercises = this.manageView === 'exercises';

        if (exercisesTab) {
            exercisesTab.classList.toggle('active', isExercises);
            exercisesTab.setAttribute('aria-selected', isExercises ? 'true' : 'false');
        }
        if (templatesTab) {
            templatesTab.classList.toggle('active', !isExercises);
            templatesTab.setAttribute('aria-selected', !isExercises ? 'true' : 'false');
        }
        if (exercisesPane) exercisesPane.classList.toggle('active', isExercises);
        if (templatesPane) templatesPane.classList.toggle('active', !isExercises);
    },

    /**
     * Show add/edit form
     * @param {object|null} exercise - Exercise to edit, or null for new
     */
    showForm(exercise = null) {
        const form = document.getElementById('exerciseForm');
        const title = document.getElementById('exerciseFormTitle');
        const idInput = document.getElementById('exerciseId');
        const nameInput = document.getElementById('exerciseName');
        const equipmentInput = document.getElementById('equipmentType');
        const muscleInput = document.getElementById('muscle');

        if (exercise) {
            // Edit mode
            title.textContent = 'Edit Exercise';
            idInput.value = exercise.id;
            nameInput.value = exercise.name;
            this.selectedEquipmentType = exercise.equipmentType || '';
            this.selectedMuscle = exercise.muscle || '';
        } else {
            // Add mode
            title.textContent = 'Add New Exercise';
            idInput.value = '';
            nameInput.value = '';
            this.selectedEquipmentType = '';
            this.selectedMuscle = '';
        }

        if (equipmentInput) equipmentInput.value = this.selectedEquipmentType;
        if (muscleInput) muscleInput.value = this.selectedMuscle;

        this.renderFormToggleGroups();

        form.style.display = 'block';
        nameInput.focus();
    },

    /**
     * Hide form
     */
    hideForm() {
        const form = document.getElementById('exerciseForm');
        form.style.display = 'none';
        document.getElementById('exerciseFormElement').reset();
        this.selectedEquipmentType = '';
        this.selectedMuscle = '';
        const equipmentInput = document.getElementById('equipmentType');
        const muscleInput = document.getElementById('muscle');
        if (equipmentInput) equipmentInput.value = '';
        if (muscleInput) muscleInput.value = '';
        this.renderFormToggleGroups();
    },

    /**
     * Handle form submission
     * @param {Event} e - Submit event
     */
    async handleSubmit(e) {
        e.preventDefault();

        const id = document.getElementById('exerciseId').value;
        const name = document.getElementById('exerciseName').value.trim();
        const equipmentType = document.getElementById('equipmentType').value;
        const muscle = document.getElementById('muscle').value;

        // Validate inputs
        const nameValidation = validateExerciseName(name, CONFIG.limits.maxExerciseNameLength);
        if (!nameValidation.valid) {
            showToast(nameValidation.error, 'error');
            return;
        }

        const validTypes = Object.keys(CONFIG.equipmentTypes);
        const typeValidation = validateEquipmentType(equipmentType, validTypes);
        if (!typeValidation.valid) {
            showToast(typeValidation.error, 'error');
            return;
        }

        if (!muscle) {
            showToast('Please select a target muscle', 'error');
            return;
        }

        try {
            if (id) {
                // Update existing
                await Storage.updateExercise(id, { name, equipmentType, muscle });
                showToast('Exercise updated successfully', 'success');
            } else {
                // Add new
                await Storage.addExercise({ name, equipmentType, muscle });
                showToast('Exercise added successfully', 'success');
            }

            this.hideForm();
            this.render();

            // Update exercise dropdowns in other sections
            window.dispatchEvent(new CustomEvent('exercisesUpdated'));
        } catch (error) {
            showToast(error.message, 'error');
        }
    },

    /**
     * Handle exercise deletion
     * @param {string} id - Exercise ID
     */
    async handleDelete(id) {
        const exercise = Storage.getExerciseById(id);

        if (!confirm(`Are you sure you want to delete "${exercise.name}"? This action cannot be undone.`)) {
            return;
        }

        try {
            await Storage.deleteExercise(id);
            showToast('Exercise deleted successfully', 'success');
            this.render();

            // Update exercise dropdowns in other sections
            window.dispatchEvent(new CustomEvent('exercisesUpdated'));
        } catch (error) {
            showToast(error.message, 'error');
        }
    },

    /**
     * Render exercise list grouped by equipment type
     */
    render() {
        const container = document.getElementById('exerciseList');
        if (!container) return;

        let exercises = Storage.getExercises().slice();

        if (this.activeEquipmentFilter) {
            exercises = exercises.filter((exercise) => exercise.equipmentType === this.activeEquipmentFilter);
        }

        if (this.activeMuscleFilter) {
            exercises = exercises.filter((exercise) => exercise.muscle === this.activeMuscleFilter);
        }

        exercises.sort((a, b) => a.name.localeCompare(b.name));

        // Clear container
        container.innerHTML = '';

        if (exercises.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'template-empty';
            empty.textContent = 'No exercises match the selected filters.';
            container.appendChild(empty);
        } else {
            exercises.forEach((exercise) => {
                const card = this.createExerciseCard(exercise);
                container.appendChild(card);
            });
        }

        // Initialize icons
        if (window.lucide) {
            window.lucide.createIcons();
        }
    },

    getEquipmentBadgeClass(equipmentType) {
        if (equipmentType === 'bodyweight+') return 'bodyweight-plus';
        return equipmentType || 'other';
    },

    /**
     * Create exercise card element (XSS-safe)
     * @param {object} exercise - Exercise object
     * @returns {HTMLElement} Card element
     */
    createExerciseCard(exercise) {
        const card = document.createElement('div');
        card.className = 'exercise-card fade-in';

        const header = document.createElement('div');
        header.className = 'exercise-card-header';

        const info = document.createElement('div');

        const title = document.createElement('h3');
        title.textContent = exercise.name; // Safe from XSS

        const badge = document.createElement('span');
        badge.className = `equipment-badge ${this.getEquipmentBadgeClass(exercise.equipmentType)}`;
        badge.textContent = formatEquipmentType(exercise.equipmentType);

        const muscleBadge = document.createElement('span');
        muscleBadge.className = 'muscle-badge';
        muscleBadge.textContent = exercise.muscle ? exercise.muscle.charAt(0).toUpperCase() + exercise.muscle.slice(1) : 'Unknown';

        info.appendChild(title);
        info.appendChild(badge);
        info.appendChild(muscleBadge);

        const actions = document.createElement('div');
        actions.className = 'exercise-card-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-small btn-secondary';
        editBtn.innerHTML = '<i data-lucide="edit-2"></i> Edit';
        editBtn.onclick = () => this.showForm(exercise);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-small btn-danger';
        deleteBtn.innerHTML = '<i data-lucide="trash-2"></i> Delete';
        deleteBtn.onclick = () => this.handleDelete(exercise.id);

        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);

        header.appendChild(info);
        header.appendChild(actions);
        card.appendChild(header);

        return card;
    }
};

// Make method available globally for inline handlers (legacy support)
window.Exercises = Exercises;
