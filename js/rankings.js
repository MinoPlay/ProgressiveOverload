// Rankings Module
// Ranks exercises or supersets by how many distinct days they were performed

import { Storage } from './storage.js';
import { Exercises } from './exercises.js';

const PERIOD_OPTIONS = [
    { value: '1m', label: '1M', months: 1 },
    { value: '3m', label: '3M', months: 3 },
    { value: '6m', label: '6M', months: 6 },
    { value: '1y', label: '1Y', months: 12 },
    { value: 'all', label: 'All', months: null }
];

export const Rankings = {
    mode: localStorage.getItem('rankingsMode') || 'exercises', // 'exercises' | 'supersets'
    activeMuscleFilter: localStorage.getItem('rankingsMuscleFilter') || '',
    activePeriod: localStorage.getItem('rankingsPeriod') || 'all',
    _workouts: null,
    _volumeChart: null,

    /**
     * Initialize the rankings UI
     */
    init() {
        this.bindEvents();
        this.setMode(this.mode, true);
        this.renderFilters();
        this.load();

        window.addEventListener('workoutsUpdated', () => {
            this._workouts = null;
            this.load();
        });

        window.addEventListener('exercisesUpdated', () => this.render());
    },

    /**
     * Bind the Exercises/Supersets mode toggle and the volume progression modal
     */
    bindEvents() {
        const exercisesBtn = document.getElementById('rankingsModeExercises');
        const supersetsBtn = document.getElementById('rankingsModeSupersets');

        if (exercisesBtn) exercisesBtn.addEventListener('click', () => this.setMode('exercises'));
        if (supersetsBtn) supersetsBtn.addEventListener('click', () => this.setMode('supersets'));

        const overlay = document.getElementById('rankingsVolumeModal');
        const closeBtn = document.getElementById('rankingsVolumeModalCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', () => this.closeVolumeModal());
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) this.closeVolumeModal();
            });
        }
    },

    /**
     * Switch between exercise and superset rankings
     * @param {string} mode - 'exercises' or 'supersets'
     * @param {boolean} silent - Skip re-rendering the filters and list
     */
    setMode(mode, silent = false) {
        this.mode = mode === 'supersets' ? 'supersets' : 'exercises';
        localStorage.setItem('rankingsMode', this.mode);

        const isExercises = this.mode === 'exercises';
        const exercisesBtn = document.getElementById('rankingsModeExercises');
        const supersetsBtn = document.getElementById('rankingsModeSupersets');

        if (exercisesBtn) {
            exercisesBtn.classList.toggle('active', isExercises);
            exercisesBtn.setAttribute('aria-selected', isExercises ? 'true' : 'false');
        }
        if (supersetsBtn) {
            supersetsBtn.classList.toggle('active', !isExercises);
            supersetsBtn.setAttribute('aria-selected', !isExercises ? 'true' : 'false');
        }

        if (!silent) {
            this.renderFilters();
            this.render();
        }
    },

    /**
     * Render the muscle and time period filter rows.
     * The muscle row is disabled in superset mode — a superset spans muscle groups.
     */
    renderFilters() {
        Exercises.renderIconChipButtons(
            'rankingsFilterMuscle',
            Exercises.getMuscleOptions(),
            Exercises.getMuscleFilterIcon,
            this.activeMuscleFilter,
            (value) => {
                this.activeMuscleFilter = this.activeMuscleFilter === value ? '' : value;
                localStorage.setItem('rankingsMuscleFilter', this.activeMuscleFilter);
                this.renderFilters();
                this.render();
            }
        );

        const muscleRow = document.getElementById('rankingsFilterMuscle');
        if (muscleRow) {
            const disabled = this.mode === 'supersets';
            muscleRow.classList.toggle('disabled', disabled);
            muscleRow.setAttribute('aria-disabled', disabled ? 'true' : 'false');
            muscleRow.querySelectorAll('button').forEach((button) => { button.disabled = disabled; });
        }

        const container = document.getElementById('rankingsFilterPeriod');
        if (!container) return;

        container.innerHTML = '';
        PERIOD_OPTIONS.forEach((option) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `toggle-chip-btn${this.activePeriod === option.value ? ' active' : ''}`;
            button.textContent = option.label;
            button.setAttribute('aria-pressed', this.activePeriod === option.value ? 'true' : 'false');
            button.addEventListener('click', () => {
                // Deselecting a period falls back to all time
                this.activePeriod = this.activePeriod === option.value ? 'all' : option.value;
                localStorage.setItem('rankingsPeriod', this.activePeriod);
                this.renderFilters();
                this.render();
            });
            container.appendChild(button);
        });
    },

    /**
     * Load all-time workout data (cached until workouts change), then render
     */
    async load() {
        const container = document.getElementById('rankingsList');
        if (!container) return;

        if (!this._workouts) {
            container.innerHTML = '';
            const loading = document.createElement('p');
            loading.className = 'empty-state';
            loading.textContent = 'Loading rankings...';
            container.appendChild(loading);

            try {
                let workouts = await Storage.loadStatsSummaryWorkouts();
                if (!workouts) {
                    const endDate = new Date();
                    const startDate = new Date();
                    startDate.setFullYear(startDate.getFullYear() - 10);
                    workouts = await Storage.getWorkoutsInRange(startDate, endDate);
                    // Bootstrap stats-summary.json so future opens are a single API call
                    Storage.generateAndSaveStatsSummary();
                }
                this._workouts = workouts || [];
            } catch (error) {
                console.error('Error loading rankings data:', error);
                container.innerHTML = '';
                const message = document.createElement('p');
                message.className = 'empty-state';
                message.textContent = 'Error loading rankings. Please try again.';
                container.appendChild(message);
                return;
            }
        }

        this.render();
    },

    /**
     * Get the inclusive start date (YYYY-MM-DD) for the active period, or '' for all time
     * @returns {string} Start date string or empty string
     */
    getStartDateStr() {
        const option = PERIOD_OPTIONS.find(o => o.value === this.activePeriod);
        if (!option || !option.months) return '';

        const start = new Date();
        start.setMonth(start.getMonth() - option.months);
        const month = String(start.getMonth() + 1).padStart(2, '0');
        const day = String(start.getDate()).padStart(2, '0');
        return `${start.getFullYear()}-${month}-${day}`;
    },

    /**
     * Count distinct workout days per exercise, honouring the active filters
     * @returns {Array<{name: string, muscle: string, count: number}>} Rows sorted by count descending
     */
    getRankedExercises() {
        const startStr = this.getStartDateStr();
        const exerciseById = new Map(Storage.getExercises().map(e => [e.id, e]));
        const daysByExercise = new Map();

        (this._workouts || []).forEach((workout) => {
            if (startStr && workout.date < startStr) return;

            const exercise = exerciseById.get(workout.exerciseId);
            if (!exercise) return;
            if (this.activeMuscleFilter && exercise.muscle !== this.activeMuscleFilter) return;

            if (!daysByExercise.has(workout.exerciseId)) {
                daysByExercise.set(workout.exerciseId, new Set());
            }
            daysByExercise.get(workout.exerciseId).add(workout.date);
        });

        return Array.from(daysByExercise, ([id, days]) => ({
            id,
            name: exerciseById.get(id).name,
            muscle: exerciseById.get(id).muscle,
            count: days.size
        })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    },

    /**
     * Count distinct workout days per superset combination. A superset is identified by
     * its set of exercises, so the same pairing ranks as one entry regardless of the
     * order it was performed in. The muscle filter does not apply here.
     * @returns {Array<{name: string, muscle: null, count: number}>} Rows sorted by count descending
     */
    getRankedSupersets() {
        const startStr = this.getStartDateStr();
        const exerciseById = new Map(Storage.getExercises().map(e => [e.id, e]));
        const sessionGroups = new Map();

        (this._workouts || []).forEach((workout) => {
            if (!workout.supersetGroupId) return;
            if (startStr && workout.date < startStr) return;
            if (!exerciseById.has(workout.exerciseId)) return;

            const key = `${workout.date}|${workout.supersetGroupId}`;
            if (!sessionGroups.has(key)) sessionGroups.set(key, new Set());
            sessionGroups.get(key).add(workout.exerciseId);
        });

        const daysByCombo = new Map();
        const occurrencesByCombo = new Map();
        sessionGroups.forEach((exerciseIds, key) => {
            if (exerciseIds.size < 2) return;

            const name = Array.from(exerciseIds)
                .map(id => exerciseById.get(id).name)
                .sort((a, b) => a.localeCompare(b))
                .join(' + ');

            const separatorIndex = key.indexOf('|');
            const date = key.slice(0, separatorIndex);
            const groupId = key.slice(separatorIndex + 1);

            if (!daysByCombo.has(name)) daysByCombo.set(name, new Set());
            daysByCombo.get(name).add(date);

            if (!occurrencesByCombo.has(name)) occurrencesByCombo.set(name, []);
            occurrencesByCombo.get(name).push({ date, groupId });
        });

        return Array.from(daysByCombo, ([name, days]) => ({
            name,
            muscle: null,
            count: days.size,
            occurrences: occurrencesByCombo.get(name)
        })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    },

    /**
     * Render the ranked list for the active mode
     */
    render() {
        const container = document.getElementById('rankingsList');
        if (!container || !this._workouts) return;

        const rows = this.mode === 'supersets' ? this.getRankedSupersets() : this.getRankedExercises();

        container.innerHTML = '';

        if (rows.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'empty-state';
            empty.textContent = this.mode === 'supersets'
                ? 'No supersets logged for the selected period.'
                : 'No workout data for the selected filters.';
            container.appendChild(empty);
            return;
        }

        // Shared counts share the same (highest) trophy — tiers are based on distinct counts
        const distinctCounts = [...new Set(rows.map(r => r.count))];

        rows.forEach((row) => {
            const tier = distinctCounts.indexOf(row.count);
            container.appendChild(this.createRankingRow(row, tier));
        });

        if (window.lucide) {
            window.lucide.createIcons();
        }
    },

    /**
     * Create a single ranking row element (XSS-safe)
     * @param {{name: string, muscle: string|null, count: number}} row - Ranked entry
     * @param {number} tier - Zero-based tier index (0-2 get trophies)
     * @returns {HTMLElement} Row element
     */
    createRankingRow(row, tier) {
        const element = document.createElement('div');
        element.className = 'ranking-row';

        const rank = document.createElement('span');
        rank.className = 'ranking-rank';

        if (tier < 3) {
            rank.classList.add(['gold', 'silver', 'bronze'][tier]);
            const trophy = document.createElement('i');
            trophy.setAttribute('data-lucide', 'trophy');
            rank.appendChild(trophy);
        } else {
            rank.textContent = String(tier + 1);
        }

        const info = document.createElement('div');
        info.className = 'ranking-info';

        const name = document.createElement('span');
        name.className = 'ranking-name';
        name.textContent = row.name;
        info.appendChild(name);

        if (row.muscle !== null) {
            const muscleBadge = document.createElement('span');
            muscleBadge.className = 'muscle-badge';
            muscleBadge.textContent = row.muscle
                ? row.muscle.charAt(0).toUpperCase() + row.muscle.slice(1)
                : 'Unknown';
            info.appendChild(muscleBadge);
        }

        const count = document.createElement('span');
        count.className = 'ranking-count';
        count.textContent = `${row.count} ${row.count === 1 ? 'day' : 'days'}`;

        element.appendChild(rank);
        element.appendChild(info);
        element.appendChild(count);

        if (row.id || (row.occurrences && row.occurrences.length)) {
            element.classList.add('ranking-row-clickable');
            element.setAttribute('role', 'button');
            element.setAttribute('tabindex', '0');
            element.addEventListener('click', () => this.openVolumeModal(row));
            element.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.openVolumeModal(row);
                }
            });
        }

        return element;
    },

    /**
     * Compute chronologically sorted volume (or total reps for bodyweight exercises)
     * per workout day for a single exercise, across all-time cached data.
     * @param {string} exerciseId - Exercise to aggregate
     * @returns {{labels: string[], values: number[], isWeighted: boolean}} Dates and per-day totals
     */
    getExerciseVolumeSeries(exerciseId) {
        const exercise = Storage.getExercises().find(e => e.id === exerciseId);
        const isWeighted = !!(exercise && exercise.requiresWeight);
        const totalsByDate = new Map();

        (this._workouts || []).forEach((workout) => {
            if (workout.exerciseId !== exerciseId) return;
            const value = isWeighted && workout.weight ? workout.reps * workout.weight : workout.reps;
            totalsByDate.set(workout.date, (totalsByDate.get(workout.date) || 0) + value);
        });

        const labels = Array.from(totalsByDate.keys()).sort((a, b) => a.localeCompare(b));
        return {
            labels,
            values: labels.map(date => totalsByDate.get(date)),
            isWeighted
        };
    },

    /**
     * Compute chronologically sorted combined volume per occurrence day for a superset
     * combo, summing every exercise's volume within that specific superset group.
     * @param {Array<{date: string, groupId: string}>} occurrences - Session occurrences of the combo
     * @returns {{labels: string[], values: number[], isWeighted: boolean}} Dates and per-day totals
     */
    getSupersetVolumeSeries(occurrences) {
        const exerciseById = new Map(Storage.getExercises().map(e => [e.id, e]));
        const occurrenceKeys = new Set((occurrences || []).map(o => `${o.date}|${o.groupId}`));
        const totalsByDate = new Map();

        (this._workouts || []).forEach((workout) => {
            if (!workout.supersetGroupId) return;
            const key = `${workout.date}|${workout.supersetGroupId}`;
            if (!occurrenceKeys.has(key)) return;

            const exercise = exerciseById.get(workout.exerciseId);
            const value = exercise && exercise.requiresWeight && workout.weight
                ? workout.reps * workout.weight
                : workout.reps;
            totalsByDate.set(workout.date, (totalsByDate.get(workout.date) || 0) + value);
        });

        const labels = Array.from(totalsByDate.keys()).sort((a, b) => a.localeCompare(b));
        return {
            labels,
            values: labels.map(date => totalsByDate.get(date)),
            isWeighted: false
        };
    },

    /**
     * Open the volume progression modal for a ranking row (exercise or superset combo)
     * and render its Chart.js bar chart. Bars are colored the same way as the workout
     * page's in-card volume bars: green when up on the previous bar, red when down,
     * yellow when unchanged (the first bar compares against zero, so it is green).
     * @param {{id?: string, name: string, occurrences?: Array}} row - Ranked entry that was clicked
     */
    openVolumeModal(row) {
        const overlay = document.getElementById('rankingsVolumeModal');
        const title = document.getElementById('rankingsVolumeModalTitle');
        const canvas = document.getElementById('rankingsVolumeChart');
        if (!overlay || !title || !canvas) return;

        title.textContent = row.name;
        overlay.style.display = 'flex';

        const { labels, values, isWeighted } = row.id
            ? this.getExerciseVolumeSeries(row.id)
            : this.getSupersetVolumeSeries(row.occurrences);

        if (this._volumeChart) {
            this._volumeChart.destroy();
            this._volumeChart = null;
        }

        if (labels.length === 0 || typeof Chart === 'undefined') return;

        const barColors = values.map((value, i) => {
            const prev = i > 0 ? values[i - 1] : 0;
            if (value > prev) return '#4caf50';
            if (value < prev) return '#f44336';
            return '#f39c12';
        });

        this._volumeChart = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: barColors,
                    borderRadius: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => `${context.parsed.y.toFixed(1)}${isWeighted ? ' kg' : ' reps'}`
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true, display: false },
                    x: { display: false }
                }
            }
        });
    },

    /**
     * Close the volume progression modal and tear down its chart
     */
    closeVolumeModal() {
        const overlay = document.getElementById('rankingsVolumeModal');
        if (overlay) overlay.style.display = 'none';
        if (this._volumeChart) {
            this._volumeChart.destroy();
            this._volumeChart = null;
        }
    }
};
