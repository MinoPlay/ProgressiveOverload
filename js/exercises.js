// Exercises Module
// Handles exercise UI and interactions

import { Storage } from './storage.js';
import { showToast } from './app.js';
import { CONFIG } from './config.js';
import { validateExerciseName, validateEquipmentType, formatEquipmentType } from './utils.js';

export const Exercises = {
    /**
     * Initialize exercise management UI
     */
    init() {
        this.bindEvents();
        this.render();
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        const addBtn = document.getElementById('addExerciseBtn');
        const cancelBtn = document.getElementById('cancelExerciseBtn');
        const form = document.getElementById('exerciseFormElement');

        addBtn.addEventListener('click', () => this.showForm());
        cancelBtn.addEventListener('click', () => this.hideForm());
        form.addEventListener('submit', (e) => this.handleSubmit(e));
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
        const equipmentSelect = document.getElementById('equipmentType');

        if (exercise) {
            // Edit mode
            title.textContent = 'Edit Exercise';
            idInput.value = exercise.id;
            nameInput.value = exercise.name;
            equipmentSelect.value = exercise.equipmentType;
        } else {
            // Add mode
            title.textContent = 'Add New Exercise';
            idInput.value = '';
            nameInput.value = '';
            equipmentSelect.value = '';
        }

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

        try {
            if (id) {
                // Update existing
                await Storage.updateExercise(id, { name, equipmentType });
                showToast('Exercise updated successfully', 'success');
            } else {
                // Add new
                await Storage.addExercise({ name, equipmentType });
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
        const exercises = Storage.getExercises();

        // Clear container
        container.innerHTML = '';

        // Group exercises by equipment type
        const groupedExercises = this.groupByEquipmentType(exercises);

        // Create collapsible section for each equipment type
        Object.keys(groupedExercises).sort().forEach(equipmentType => {
            const section = this.createCollapsibleSection(equipmentType, groupedExercises[equipmentType]);
            container.appendChild(section);
        });

        // Initialize icons
        if (window.lucide) {
            window.lucide.createIcons();
        }
    },

    /**
     * Group exercises by equipment type
     * @param {Array} exercises - Array of exercise objects
     * @returns {Object} Exercises grouped by equipment type
     */
    groupByEquipmentType(exercises) {
        return exercises.reduce((groups, exercise) => {
            const type = exercise.equipmentType || 'other';
            if (!groups[type]) {
                groups[type] = [];
            }
            groups[type].push(exercise);
            return groups;
        }, {});
    },

    /**
     * Create collapsible section for equipment type
     * @param {string} equipmentType - Equipment type
     * @param {Array} exercises - Exercises of this type
     * @returns {HTMLElement} Section element
     */
    createCollapsibleSection(equipmentType, exercises) {
        const section = document.createElement('div');
        section.className = 'equipment-group';

        // Create header
        const header = document.createElement('div');
        header.className = 'equipment-group-header collapsed';
        header.onclick = () => this.toggleSection(header);

        const titleWrapper = document.createElement('div');
        titleWrapper.className = 'equipment-group-title';

        const title = document.createElement('h3');
        title.textContent = formatEquipmentType(equipmentType);

        const count = document.createElement('span');
        count.className = 'exercise-count';
        count.textContent = `(${exercises.length})`;

        titleWrapper.appendChild(title);
        titleWrapper.appendChild(count);

        const chevron = document.createElement('span');
        chevron.className = 'equipment-chevron';
        chevron.innerHTML = '▼';

        header.appendChild(titleWrapper);
        header.appendChild(chevron);

        // Create content container
        const content = document.createElement('div');
        content.className = 'equipment-group-content';
        content.style.display = 'none'; // Collapsed by default

        exercises.forEach(exercise => {
            const card = this.createExerciseCard(exercise);
            content.appendChild(card);
        });

        section.appendChild(header);
        section.appendChild(content);

        return section;
    },

    /**
     * Toggle collapsible section
     * @param {HTMLElement} header - Header element
     */
    toggleSection(header) {
        const content = header.nextElementSibling;
        const chevron = header.querySelector('.equipment-chevron');

        if (header.classList.contains('collapsed')) {
            // Expand
            header.classList.remove('collapsed');
            content.style.display = 'grid';
            chevron.innerHTML = '▲';
        } else {
            // Collapse
            header.classList.add('collapsed');
            content.style.display = 'none';
            chevron.innerHTML = '▼';
        }
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
        badge.className = `equipment-badge ${exercise.equipmentType}`;
        badge.textContent = formatEquipmentType(exercise.equipmentType);

        info.appendChild(title);
        info.appendChild(badge);

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
