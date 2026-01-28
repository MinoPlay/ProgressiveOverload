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
     * Render exercise list
     */
    render() {
        const container = document.getElementById('exerciseList');
        const exercises = Storage.getExercises();

        // Clear container and rebuild with safe DOM methods
        container.innerHTML = '';
        
        exercises.forEach(exercise => {
            const card = this.createExerciseCard(exercise);
            container.appendChild(card);
        });
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
        editBtn.textContent = 'Edit';
        editBtn.onclick = () => this.showForm(exercise);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-small btn-danger';
        deleteBtn.textContent = 'Delete';
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
