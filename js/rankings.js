// Rankings Module
// Ranks exercises by how many distinct days they were performed, with muscle and time filters

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
    activeMuscleFilter: localStorage.getItem('rankingsMuscleFilter') || '',
    activePeriod: localStorage.getItem('rankingsPeriod') || 'all',
    _workouts: null,

    /**
     * Initialize the rankings UI
     */
    init() {
        this.renderFilters();
        this.load();

        window.addEventListener('workoutsUpdated', () => {
            this._workouts = null;
            this.load();
        });

        window.addEventListener('exercisesUpdated', () => this.render());
    },

    /**
     * Render the muscle and time period filter rows
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
     * @returns {Array<{exercise: object, count: number}>} Rows sorted by count descending
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
            exercise: exerciseById.get(id),
            count: days.size
        })).sort((a, b) => b.count - a.count || a.exercise.name.localeCompare(b.exercise.name));
    },

    /**
     * Render the ranked exercise list
     */
    render() {
        const container = document.getElementById('rankingsList');
        if (!container || !this._workouts) return;

        const rows = this.getRankedExercises();

        container.innerHTML = '';

        if (rows.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'empty-state';
            empty.textContent = 'No workout data for the selected filters.';
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
     * @param {{exercise: object, count: number}} row - Ranked exercise entry
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
        name.textContent = row.exercise.name;

        const muscleBadge = document.createElement('span');
        muscleBadge.className = 'muscle-badge';
        muscleBadge.textContent = row.exercise.muscle
            ? row.exercise.muscle.charAt(0).toUpperCase() + row.exercise.muscle.slice(1)
            : 'Unknown';

        info.appendChild(name);
        info.appendChild(muscleBadge);

        const count = document.createElement('span');
        count.className = 'ranking-count';
        count.textContent = `${row.count} ${row.count === 1 ? 'day' : 'days'}`;

        element.appendChild(rank);
        element.appendChild(info);
        element.appendChild(count);

        return element;
    }
};
