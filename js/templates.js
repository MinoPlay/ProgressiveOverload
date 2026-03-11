// Templates Module
// Manages pre-planned session templates (create, edit, delete, list)

import { Storage } from './storage.js';
import { showToast } from './app.js';

const DEFAULT_SET_COUNT = 3;

export const Templates = {
    /** Currently open editor state: { id?, name, rows } */
    editorSession: null,

    init() {
        this.bindEvents();
        this.renderTemplateList();

        // Refresh when exercises change (exercise names in rows may need updating)
        window.addEventListener('exercisesUpdated', () => this.renderTemplateList());
    },

    bindEvents() {
        const addBtn = document.getElementById('addTemplateBtn');
        const cancelBtn = document.getElementById('cancelTemplateBtn');
        const saveBtn = document.getElementById('saveTemplateBtn');
        const addExerciseBtn = document.getElementById('templateAddExerciseBtn');
        const addSupersetBtn = document.getElementById('templateAddSupersetBtn');
        const rowList = document.getElementById('templateRowList');

        if (addBtn) addBtn.addEventListener('click', () => this.openTemplateEditor());
        if (cancelBtn) cancelBtn.addEventListener('click', () => this.closeTemplateEditor());
        if (saveBtn) saveBtn.addEventListener('click', () => this.saveTemplate());
        if (addExerciseBtn) addExerciseBtn.addEventListener('click', () => this.addEditorExercise());
        if (addSupersetBtn) addSupersetBtn.addEventListener('click', () => this.addEditorSuperset());

        if (rowList) {
            rowList.addEventListener('change', (e) => this.handleEditorFieldChange(e));
            rowList.addEventListener('input', (e) => this.handleEditorFieldChange(e));
            rowList.addEventListener('click', (e) => this.handleEditorAction(e));
        }
    },

    // ─── List ──────────────────────────────────────────────────────────────────

    renderTemplateList() {
        const container = document.getElementById('templateList');
        if (!container) return;

        const templates = Storage.getSessionTemplates();
        container.innerHTML = '';

        if (templates.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'template-empty';
            empty.textContent = 'No templates yet. Create one to quickly populate Plan Session.';
            container.appendChild(empty);
            return;
        }

        templates.forEach(template => {
            const card = document.createElement('div');
            card.className = 'template-card';

            const info = document.createElement('div');
            info.className = 'template-card-info';

            const name = document.createElement('span');
            name.className = 'template-card-name';
            name.textContent = template.name;

            const meta = document.createElement('span');
            meta.className = 'template-card-meta';
            const exerciseCount = this.countTemplateExercises(template.rows);
            meta.textContent = `${exerciseCount} exercise${exerciseCount !== 1 ? 's' : ''} · ${template.rows.length} row${template.rows.length !== 1 ? 's' : ''}`;

            info.appendChild(name);
            info.appendChild(meta);

            const actions = document.createElement('div');
            actions.className = 'template-card-actions';

            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'btn btn-secondary btn-small';
            editBtn.innerHTML = '<i data-lucide="pencil"></i>';
            editBtn.title = 'Edit template';
            editBtn.addEventListener('click', () => this.openTemplateEditor(template.id));

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'btn btn-secondary btn-small';
            deleteBtn.innerHTML = '<i data-lucide="trash-2"></i>';
            deleteBtn.title = 'Delete template';
            deleteBtn.addEventListener('click', () => this.deleteTemplate(template.id));

            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);

            card.appendChild(info);
            card.appendChild(actions);
            container.appendChild(card);
        });

        if (window.lucide) window.lucide.createIcons();
    },

    countTemplateExercises(rows) {
        if (!Array.isArray(rows)) return 0;
        return rows.reduce((sum, row) => {
            if (row.type === 'superset') return sum + (row.exercises?.length || 0);
            return sum + 1;
        }, 0);
    },

    // ─── Editor open / close ───────────────────────────────────────────────────

    openTemplateEditor(templateId = null) {
        const form = document.getElementById('templateForm');
        const title = document.getElementById('templateFormTitle');
        const nameInput = document.getElementById('templateName');

        if (templateId) {
            const template = Storage.getSessionTemplateById(templateId);
            if (!template) return;
            this.editorSession = {
                id: template.id,
                name: template.name,
                rows: JSON.parse(JSON.stringify(template.rows)) // deep clone
            };
            if (title) title.textContent = 'Edit Template';
        } else {
            this.editorSession = { name: '', rows: [] };
            if (title) title.textContent = 'New Template';
        }

        if (nameInput) nameInput.value = this.editorSession.name;
        if (form) form.style.display = 'block';

        this.renderEditorRows();
        nameInput?.focus();
    },

    closeTemplateEditor() {
        const form = document.getElementById('templateForm');
        if (form) form.style.display = 'none';
        this.editorSession = null;
    },

    // ─── Editor rows ───────────────────────────────────────────────────────────

    addEditorExercise() {
        if (!this.editorSession) return;
        const rowId = `tpl-row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this.editorSession.rows.push({
            id: rowId,
            type: 'single',
            exerciseId: '',
            sets: this.createDefaultSets(rowId)
        });
        this.renderEditorRows();
    },

    addEditorSuperset() {
        if (!this.editorSession) return;
        const blockId = `tpl-ss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this.editorSession.rows.push({
            id: blockId,
            type: 'superset',
            label: 'Superset',
            exercises: [
                { id: `${blockId}-a`, exerciseId: '', sets: this.createDefaultSets(`${blockId}-a`) },
                { id: `${blockId}-b`, exerciseId: '', sets: this.createDefaultSets(`${blockId}-b`) }
            ]
        });
        this.renderEditorRows();
    },

    createDefaultSets(baseId) {
        return Array.from({ length: DEFAULT_SET_COUNT }, (_, i) => ({
            id: `${baseId}-set-${i + 1}`,
            reps: '',
            weight: ''
        }));
    },

    renderEditorRows() {
        const container = document.getElementById('templateRowList');
        if (!container || !this.editorSession) return;

        container.innerHTML = '';

        if (this.editorSession.rows.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'planned-empty';
            empty.textContent = 'No rows yet. Add exercises or a superset block.';
            container.appendChild(empty);
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        this.editorSession.rows.forEach((row, index) => {
            if (row.type === 'single') {
                container.appendChild(this.buildSingleRow(row, index));
            } else {
                container.appendChild(this.buildSupersetRow(row, index));
            }
        });

        if (window.lucide) window.lucide.createIcons();
    },

    buildSingleRow(row, index) {
        const wrapper = document.createElement('div');
        wrapper.className = 'planned-row';

        const header = document.createElement('div');
        header.className = 'planned-row-header';

        const title = document.createElement('span');
        title.className = 'planned-row-title';
        title.textContent = `Exercise ${index + 1}`;

        const actions = document.createElement('div');
        actions.className = 'planner-row-actions';

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-icon btn-secondary btn-small planner-row-btn';
        removeBtn.dataset.action = 'remove-row';
        removeBtn.dataset.rowId = row.id;
        removeBtn.innerHTML = '<i data-lucide="trash-2"></i>';
        removeBtn.title = 'Remove row';

        actions.appendChild(removeBtn);
        header.appendChild(title);
        header.appendChild(actions);

        const body = document.createElement('div');
        body.className = 'planner-row-body';

        const topRow = document.createElement('div');
        topRow.className = 'planned-entry-top';
        topRow.appendChild(this.buildExerciseSelect(row.id, null, row.exerciseId));

        body.appendChild(topRow);
        body.appendChild(this.buildSetsGrid(row.id, null, row.sets));

        wrapper.appendChild(header);
        wrapper.appendChild(body);
        return wrapper;
    },

    buildSupersetRow(row, index) {
        const wrapper = document.createElement('div');
        wrapper.className = 'superset-block';

        const header = document.createElement('div');
        header.className = 'superset-header';

        const title = document.createElement('span');
        title.className = 'superset-title';
        title.textContent = `${row.label || 'Superset'} ${index + 1}`;

        const actions = document.createElement('div');
        actions.className = 'planner-row-actions';

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-icon btn-secondary btn-small planner-row-btn';
        removeBtn.dataset.action = 'remove-row';
        removeBtn.dataset.rowId = row.id;
        removeBtn.innerHTML = '<i data-lucide="trash-2"></i>';
        removeBtn.title = 'Remove superset';

        actions.appendChild(removeBtn);
        header.appendChild(title);
        header.appendChild(actions);

        const exercisesContainer = document.createElement('div');
        exercisesContainer.className = 'superset-exercises';

        (row.exercises || []).forEach((item, idx) => {
            const rowContainer = document.createElement('div');
            rowContainer.className = 'superset-exercise-row';

            const label = document.createElement('span');
            label.className = 'superset-label';
            label.textContent = String.fromCharCode(65 + (idx % 26));

            const content = document.createElement('div');
            content.className = 'superset-exercise-content';

            const topRow = document.createElement('div');
            topRow.className = 'planned-entry-top';
            topRow.appendChild(this.buildExerciseSelect(row.id, item.id, item.exerciseId));

            content.appendChild(topRow);
            content.appendChild(this.buildSetsGrid(row.id, item.id, item.sets));

            rowContainer.appendChild(label);
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

    buildExerciseSelect(rowId, itemId, selectedValue) {
        const select = document.createElement('select');
        select.dataset.field = 'exerciseId';
        select.dataset.rowId = rowId;
        if (itemId) select.dataset.itemId = itemId;

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select Exercise...';
        select.appendChild(defaultOption);

        const exercises = Storage.getExercises().slice().sort((a, b) => a.name.localeCompare(b.name));
        exercises.forEach(ex => {
            const opt = document.createElement('option');
            opt.value = ex.id;
            opt.textContent = ex.name;
            select.appendChild(opt);
        });

        select.value = selectedValue || '';
        return select;
    },

    buildSetsGrid(rowId, itemId, sets = []) {
        const container = document.createElement('div');
        container.className = 'planner-sets-grid template-sets-grid';

        const normalizedSets = Array.isArray(sets) && sets.length > 0
            ? sets
            : this.createDefaultSets(itemId || rowId);

        const row = this.editorSession?.rows?.find(r => r.id === rowId);
        const target = row?.type === 'superset'
            ? (row.exercises || []).find(e => e.id === itemId)
            : row;
        const exerciseId = target?.exerciseId || '';
        const exercise = exerciseId ? Storage.getExerciseById(exerciseId) : null;
        const requiresWeight = Boolean(exercise?.requiresWeight);

        normalizedSets.forEach((setEntry, idx) => {
            // In the template editor all sets are always visible (no collapsing)
            const card = document.createElement('div');
            card.className = 'planner-set-card template-set-card';

            const header = document.createElement('div');
            header.className = 'planner-set-header';

            const titleSpan = document.createElement('span');
            titleSpan.className = 'planner-set-title';
            titleSpan.textContent = `Set ${idx + 1}`;
            header.appendChild(titleSpan);

            const fields = document.createElement('div');
            fields.className = 'planner-set-fields';
            fields.classList.toggle('requires-weight', requiresWeight);

            const repsInput = document.createElement('input');
            repsInput.type = 'number';
            repsInput.placeholder = 'Reps';
            repsInput.value = setEntry.reps || '';
            repsInput.min = '1';
            repsInput.max = '999';
            repsInput.dataset.field = 'reps';
            repsInput.dataset.rowId = rowId;
            repsInput.dataset.setId = setEntry.id;
            if (itemId) repsInput.dataset.itemId = itemId;

            const repsControl = document.createElement('div');
            repsControl.className = 'planner-reps-control';

            const repsDown = document.createElement('button');
            repsDown.type = 'button';
            repsDown.className = 'planner-reps-btn';
            repsDown.textContent = '−';
            repsDown.dataset.action = 'step-reps';
            repsDown.dataset.rowId = rowId;
            repsDown.dataset.setId = setEntry.id;
            repsDown.dataset.delta = '-1';
            if (itemId) repsDown.dataset.itemId = itemId;

            const repsUp = document.createElement('button');
            repsUp.type = 'button';
            repsUp.className = 'planner-reps-btn';
            repsUp.textContent = '+';
            repsUp.dataset.action = 'step-reps';
            repsUp.dataset.rowId = rowId;
            repsUp.dataset.setId = setEntry.id;
            repsUp.dataset.delta = '1';
            if (itemId) repsUp.dataset.itemId = itemId;

            const weightInput = document.createElement('input');
            weightInput.type = 'number';
            weightInput.placeholder = 'Weight';
            weightInput.value = setEntry.weight || '';
            weightInput.min = '0';
            weightInput.step = 'any';
            weightInput.dataset.field = 'weight';
            weightInput.dataset.rowId = rowId;
            weightInput.dataset.setId = setEntry.id;
            if (itemId) weightInput.dataset.itemId = itemId;

            repsControl.appendChild(repsDown);
            repsControl.appendChild(repsInput);
            repsControl.appendChild(repsUp);
            fields.appendChild(repsControl);
            if (requiresWeight) {
                fields.appendChild(weightInput);
            }

            card.appendChild(header);
            card.appendChild(fields);
            container.appendChild(card);
        });

        return container;
    },

    // ─── Editor field / action handlers ────────────────────────────────────────

    handleEditorFieldChange(event) {
        const field = event.target;
        if (!field?.dataset?.field || !this.editorSession) return;

        const { field: fieldName, rowId, itemId, setId } = field.dataset;
        const row = this.editorSession.rows.find(r => r.id === rowId);
        if (!row) return;

        if (row.type === 'single') {
            if (fieldName === 'exerciseId') {
                // Sync all DOM values to editorSession before re-rendering
                this.syncEditorFromDom();
                // Now update the exercise selection
                row.exerciseId = field.value;
                const exercise = field.value ? Storage.getExerciseById(field.value) : null;
                const requiresWeight = Boolean(exercise?.requiresWeight);
                if (!requiresWeight) {
                    (row.sets || []).forEach(setEntry => {
                        setEntry.weight = '';
                    });
                }
                this.renderEditorRows();
                return;
            } else {
                const set = (row.sets || []).find(s => s.id === setId);
                if (set) set[fieldName] = field.value;
            }
        } else {
            const item = (row.exercises || []).find(e => e.id === itemId);
            if (!item) return;
            if (fieldName === 'exerciseId') {
                // Sync all DOM values to editorSession before re-rendering
                this.syncEditorFromDom();
                // Now update the exercise selection
                item.exerciseId = field.value;
                const exercise = field.value ? Storage.getExerciseById(field.value) : null;
                const requiresWeight = Boolean(exercise?.requiresWeight);
                if (!requiresWeight) {
                    (item.sets || []).forEach(setEntry => {
                        setEntry.weight = '';
                    });
                }
                this.renderEditorRows();
                return;
            } else {
                const set = (item.sets || []).find(s => s.id === setId);
                if (set) set[fieldName] = field.value;
            }
        }
    },

    handleEditorAction(event) {
        const button = event.target.closest('button[data-action]');
        if (!button || !this.editorSession) return;

        const { action, rowId, itemId, setId, delta } = button.dataset;

        if (action === 'remove-row') {
            this.editorSession.rows = this.editorSession.rows.filter(r => r.id !== rowId);
            this.renderEditorRows();
            return;
        }

        if (action === 'step-reps') {
            const row = this.editorSession.rows.find(r => r.id === rowId);
            if (!row || !setId) return;

            const target = row.type === 'superset'
                ? (row.exercises || []).find(e => e.id === itemId)
                : row;
            if (!target) return;

            const setEntry = (target.sets || []).find(s => s.id === setId);
            if (!setEntry) return;

            const step = parseInt(delta || '0', 10);
            const current = parseInt(setEntry.reps || '0', 10) || 0;
            const next = Math.max(1, current + step);
            setEntry.reps = String(next);

            const control = button.closest('.planner-reps-control');
            const input = control?.querySelector('input[data-field="reps"]');
            if (input) {
                input.value = String(next);
            }
        }
    },

    // ─── Save / Delete ─────────────────────────────────────────────────────────

    async saveTemplate() {
        if (!this.editorSession) return;

        const nameInput = document.getElementById('templateName');
        const name = nameInput ? nameInput.value.trim() : this.editorSession.name;

        if (!name) {
            showToast('Template name is required', 'error');
            nameInput?.focus();
            return;
        }

        // Sync current field values into editorSession from the DOM
        // (inputs fire 'change' on blur, but user may click Save without leaving focus)
        this.syncEditorFromDom();

        const payload = { name, rows: this.editorSession.rows };

        try {
            if (this.editorSession.id) {
                await Storage.updateSessionTemplate(this.editorSession.id, payload);
                showToast('Template updated', 'success');
            } else {
                await Storage.addSessionTemplate(payload);
                showToast('Template saved', 'success');
            }

            this.closeTemplateEditor();
            this.renderTemplateList();
            window.dispatchEvent(new CustomEvent('templatesUpdated'));
        } catch (error) {
            showToast(error.message, 'error');
        }
    },

    syncEditorFromDom() {
        const rowList = document.getElementById('templateRowList');
        if (!rowList || !this.editorSession) return;

        rowList.querySelectorAll('select[data-field], input[data-field]').forEach(field => {
            const { field: fieldName, rowId, itemId, setId } = field.dataset;
            const row = this.editorSession.rows.find(r => r.id === rowId);
            if (!row) return;

            if (row.type === 'single') {
                if (fieldName === 'exerciseId') {
                    row.exerciseId = field.value;
                } else {
                    const set = (row.sets || []).find(s => s.id === setId);
                    if (set) set[fieldName] = field.value;
                }
            } else {
                const item = (row.exercises || []).find(e => e.id === itemId);
                if (!item) return;
                if (fieldName === 'exerciseId') {
                    item.exerciseId = field.value;
                } else {
                    const set = (item.sets || []).find(s => s.id === setId);
                    if (set) set[fieldName] = field.value;
                }
            }
        });
    },

    async deleteTemplate(id) {
        const template = Storage.getSessionTemplateById(id);
        if (!template) return;

        if (!confirm(`Delete template "${template.name}"? This cannot be undone.`)) return;

        try {
            await Storage.deleteSessionTemplate(id);
            showToast('Template deleted', 'success');
            this.renderTemplateList();
            window.dispatchEvent(new CustomEvent('templatesUpdated'));
        } catch (error) {
            showToast(error.message, 'error');
        }
    }
};
