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
            // Use 'change' for both selects and inputs to avoid double-firing on selects
            rowList.addEventListener('change', (e) => this.handleEditorFieldChange(e));
            rowList.addEventListener('input', (e) => {
                // Only handle input events for text/number inputs, not selects
                if (e.target.tagName !== 'SELECT') {
                    this.handleEditorFieldChange(e);
                }
            });
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

    getEditorRowTitle(row, index) {
        if (row.type === 'superset') {
            const names = (row.exercises || []).map(item => {
                const ex = item.exerciseId ? Storage.getExerciseById(item.exerciseId) : null;
                return ex ? ex.name : 'Select Exercise';
            });
            return `Superset: ${names.join(' / ')}`;
        }
        const ex = row.exerciseId ? Storage.getExerciseById(row.exerciseId) : null;
        const exName = ex ? ex.name : `Exercise ${index + 1}`;
        const sets = row.sets || [];
        if (sets.length === 0) return exName;
        const setsSummary = sets
            .filter(s => s.reps || s.weight)
            .map(s => {
                if (s.reps && s.weight) return `${s.reps}×${s.weight}`;
                if (s.reps) return `${s.reps} reps`;
                return `×${s.weight}`;
            })
            .join(', ');
        return setsSummary ? `${exName} · ${setsSummary}` : exName;
    },

    buildSingleRow(row, index) {
        const wrapper = document.createElement('div');
        wrapper.className = 'planned-row collapsed';

        const header = document.createElement('div');
        header.className = 'planned-row-header';

        const title = document.createElement('span');
        title.className = 'planned-row-title';
        title.textContent = this.getEditorRowTitle(row, index);

        const actions = document.createElement('div');
        actions.className = 'planner-row-actions';

        const hasNextRow = Boolean(this.editorSession.rows[index + 1]);

        const linkBtn = document.createElement('button');
        linkBtn.type = 'button';
        linkBtn.className = 'btn-icon btn-secondary btn-small planner-row-btn planner-link-btn';
        linkBtn.dataset.action = 'toggle-link-next';
        linkBtn.dataset.rowId = row.id;
        linkBtn.innerHTML = '<i data-lucide="link-2"></i>';
        linkBtn.disabled = !hasNextRow;
        linkBtn.title = hasNextRow ? 'Link with the exercise below as superset' : 'No row below to link';

        const collapseBtn = document.createElement('button');
        collapseBtn.type = 'button';
        collapseBtn.className = 'btn-icon btn-secondary btn-small planner-row-btn planner-collapse-btn';
        collapseBtn.dataset.action = 'toggle-collapse';
        collapseBtn.dataset.rowId = row.id;
        collapseBtn.innerHTML = '<i data-lucide="chevron-down"></i>';
        collapseBtn.title = 'Toggle collapse';

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-icon btn-secondary btn-small planner-row-btn';
        removeBtn.dataset.action = 'remove-row';
        removeBtn.dataset.rowId = row.id;
        removeBtn.innerHTML = '<i data-lucide="trash-2"></i>';
        removeBtn.title = 'Remove row';

        actions.appendChild(linkBtn);
        actions.appendChild(collapseBtn);
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
        wrapper.className = 'superset-block collapsed';

        const header = document.createElement('div');
        header.className = 'superset-header';

        const title = document.createElement('span');
        title.className = 'superset-title';
        title.textContent = this.getEditorRowTitle(row, index);

        const actions = document.createElement('div');
        actions.className = 'planner-row-actions';

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
        collapseBtn.dataset.action = 'toggle-collapse';
        collapseBtn.dataset.rowId = row.id;
        collapseBtn.innerHTML = '<i data-lucide="chevron-down"></i>';
        collapseBtn.title = 'Toggle collapse';

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-icon btn-secondary btn-small planner-row-btn';
        removeBtn.dataset.action = 'remove-row';
        removeBtn.dataset.rowId = row.id;
        removeBtn.innerHTML = '<i data-lucide="trash-2"></i>';
        removeBtn.title = 'Remove superset';

        actions.appendChild(linkBtn);
        actions.appendChild(collapseBtn);
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

            // Add copy button for all sets except the first one (copy FROM previous set TO current)
            if (idx > 0) {
                const copyBtn = document.createElement('button');
                copyBtn.type = 'button';
                copyBtn.className = 'template-set-copy-btn';
                copyBtn.dataset.action = 'copy-from-previous';
                copyBtn.dataset.rowId = rowId;
                copyBtn.dataset.setId = setEntry.id;
                copyBtn.dataset.setIndex = String(idx);
                if (itemId) copyBtn.dataset.itemId = itemId;
                copyBtn.innerHTML = '<i data-lucide="arrow-down"></i>';
                copyBtn.title = `Copy from Set ${idx}`;
                header.appendChild(copyBtn);
            }

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

        const { action, rowId, itemId, setId, delta, setIndex } = button.dataset;

        if (action === 'toggle-collapse') {
            const wrapper = button.closest('.planned-row, .superset-block');
            if (wrapper) {
                wrapper.classList.toggle('collapsed');
            }
            return;
        }

        if (action === 'toggle-link-next') {
            this.syncEditorFromDom();
            const index = this.editorSession.rows.findIndex(r => r.id === rowId);
            if (index === -1) return;
            const row = this.editorSession.rows[index];

            if (row.type === 'superset') {
                // Unlink: split superset into two single rows
                const [first, second] = row.exercises || [];
                const firstId = `tpl-row-${Date.now()}-a`;
                const secondId = `tpl-row-${Date.now()}-b`;
                const firstRow = {
                    id: firstId,
                    type: 'single',
                    exerciseId: first?.exerciseId || '',
                    sets: (first?.sets || this.createDefaultSets(firstId)).map((s, i) => ({
                        id: `${firstId}-set-${i + 1}`,
                        reps: s.reps,
                        weight: s.weight
                    }))
                };
                const secondRow = {
                    id: secondId,
                    type: 'single',
                    exerciseId: second?.exerciseId || '',
                    sets: (second?.sets || this.createDefaultSets(secondId)).map((s, i) => ({
                        id: `${secondId}-set-${i + 1}`,
                        reps: s.reps,
                        weight: s.weight
                    }))
                };
                this.editorSession.rows.splice(index, 1, firstRow, secondRow);
            } else {
                // Link: merge this single row and the next into a superset
                const next = this.editorSession.rows[index + 1];
                if (!next || next.type !== 'single') {
                    showToast('Link works with this exercise and the one below it', 'info');
                    return;
                }
                const blockId = `tpl-ss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                const exAId = `${blockId}-a`;
                const exBId = `${blockId}-b`;
                const supersetBlock = {
                    id: blockId,
                    type: 'superset',
                    label: 'Superset',
                    exercises: [
                        {
                            id: exAId,
                            exerciseId: row.exerciseId || '',
                            sets: (row.sets || this.createDefaultSets(exAId)).map((s, i) => ({
                                id: `${exAId}-set-${i + 1}`,
                                reps: s.reps,
                                weight: s.weight
                            }))
                        },
                        {
                            id: exBId,
                            exerciseId: next.exerciseId || '',
                            sets: (next.sets || this.createDefaultSets(exBId)).map((s, i) => ({
                                id: `${exBId}-set-${i + 1}`,
                                reps: s.reps,
                                weight: s.weight
                            }))
                        }
                    ]
                };
                this.editorSession.rows.splice(index, 2, supersetBlock);
            }

            this.renderEditorRows();
            return;
        }

        if (action === 'remove-row') {
            this.editorSession.rows = this.editorSession.rows.filter(r => r.id !== rowId);
            this.renderEditorRows();
            return;
        }

        if (action === 'copy-from-previous') {
            // Sync all DOM values to editorSession first to preserve any uncommitted changes
            this.syncEditorFromDom();

            const row = this.editorSession.rows.find(r => r.id === rowId);
            if (!row) return;

            const target = row.type === 'superset'
                ? (row.exercises || []).find(e => e.id === itemId)
                : row;
            if (!target || !target.sets) return;

            const idx = parseInt(setIndex || '0', 10);
            if (idx === 0) return; // Can't copy to first set

            // Copy reps and weight from previous set to current set
            const previousSet = target.sets[idx - 1];
            const currentSet = target.sets[idx];
            if (previousSet && currentSet) {
                currentSet.reps = previousSet.reps;
                currentSet.weight = previousSet.weight;
                // Re-render to update the UI
                this.renderEditorRows();
            }
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
        console.log('[Templates.saveTemplate] editorSession.id:', this.editorSession.id);
        console.log('[Templates.saveTemplate] payload rows count:', payload.rows?.length);
        console.log('[Templates.saveTemplate] payload:', JSON.parse(JSON.stringify(payload)));

        try {
            if (this.editorSession.id) {
                console.log('[Templates.saveTemplate] Calling Storage.updateSessionTemplate...');
                await Storage.updateSessionTemplate(this.editorSession.id, payload);
                console.log('[Templates.saveTemplate] updateSessionTemplate resolved OK');
                showToast('Template updated', 'success');
            } else {
                console.log('[Templates.saveTemplate] Calling Storage.addSessionTemplate...');
                const result = await Storage.addSessionTemplate(payload);
                this.editorSession.id = result.id;
                console.log('[Templates.saveTemplate] addSessionTemplate resolved, new id:', result.id);
                showToast('Template saved', 'success');
            }

            // Reload the editor session from storage to reflect saved state
            const saved = Storage.getSessionTemplateById(this.editorSession.id);
            if (saved) {
                this.editorSession = {
                    id: saved.id,
                    name: saved.name,
                    rows: JSON.parse(JSON.stringify(saved.rows))
                };
            }

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
                    // Only update if a real exercise is selected.
                    // A blank value means the <option> wasn't found (e.g. exercise ID
                    // mismatch) — don't clobber the valid exerciseId already in editorSession.
                    if (field.value) row.exerciseId = field.value;
                } else {
                    const set = (row.sets || []).find(s => s.id === setId);
                    if (set) set[fieldName] = field.value;
                }
            } else {
                const item = (row.exercises || []).find(e => e.id === itemId);
                if (!item) return;
                if (fieldName === 'exerciseId') {
                    if (field.value) item.exerciseId = field.value;
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
