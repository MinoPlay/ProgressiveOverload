// Exercises Module
// Handles exercise UI and interactions

import { Storage } from './storage.js';
import { showToast } from './app.js';

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

        if (!name || !equipmentType) {
            showToast('Please fill in all fields', 'error');
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

        if (exercises.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No exercises yet. Click "Add New Exercise" to get started!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = exercises.map(exercise => `
            <div class="exercise-card fade-in">
                <div class="exercise-card-header">
                    <div>
                        <h3>${this.escapeHtml(exercise.name)}</h3>
                        <span class="equipment-badge ${exercise.equipmentType}">
                            ${this.formatEquipmentType(exercise.equipmentType)}
                        </span>
                    </div>
                    <div class="exercise-card-actions">
                        <button class="btn btn-small btn-secondary" onclick="Exercises.showForm(${this.escapeForAttribute(exercise)})">
                            Edit
                        </button>
                        <button class="btn btn-small btn-danger" onclick="Exercises.handleDelete('${exercise.id}')">
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    },

    /**
     * Format equipment type for display
     * @param {string} type - Equipment type
     * @returns {string} Formatted type
     */
    formatEquipmentType(type) {
        const labels = {
            'barbell': 'Barbell',
            'dumbbell': 'Dumbbell',
            'kettlebell': 'Kettlebell',
            'machines': 'Machines',
            'bodyweight': 'Bodyweight',
            'bodyweight+': 'Bodyweight+'
        };
        return labels[type] || type;
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
    },

    /**
     * Escape object for HTML attribute
     * @param {object} obj - Object to escape
     * @returns {string} Escaped JSON string
     */
    escapeForAttribute(obj) {
        return JSON.stringify(obj).replace(/"/g, '&quot;');
    }
};

// Make available globally for onclick handlers
window.Exercises = Exercises;
