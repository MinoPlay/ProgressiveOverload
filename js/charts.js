// Charts Module
// Handles statistics visualization with Chart.js

import { Storage } from './storage.js';
import { CONFIG } from './config.js';
import { calculateLinearRegression, calculateProgressPercentage } from './chart-helpers.js';

// Register Chart.js plugins globally when available
// Plugins are loaded via CDN and auto-register with Chart.js 4.x
// The zoom and annotation plugins will be available as Chart.Zoom and Chart.Annotation

export const Charts = {
    selectedExerciseIds: JSON.parse(localStorage.getItem('selectedExerciseIds') || '[]'),
    categorySelections: JSON.parse(localStorage.getItem('categorySelections') || '{}'), // Per-category selections
    currentCategory: localStorage.getItem('currentCategory') || null,
    allExercisesData: [], // Store all exercise data

    /**
     * Initialize charts UI
     */
    init() {
        this.renderCombinedChart();
        // Listen for exercise updates
        window.addEventListener('exercisesUpdated', () => {
            this.renderCombinedChart();
        });

        // Listen for workout updates
        window.addEventListener('workoutsUpdated', () => {
            this.renderCombinedChart();
        });

        // Set up collapsible summary
        this.setupCollapsibleSummary();
    },

    /**
     * Render combined chart with all exercises and overview table
     */
    async renderCombinedChart() {
        const statsTableContent = document.getElementById('statsTableContent');
        const noStatsMessage = document.getElementById('noStatsMessage');
        const categoryTabsContainer = document.getElementById('categoryTabsContainer');

        if (!statsTableContent || !categoryTabsContainer) return;

        // Hide/show elements during loading
        if (categoryTabsContainer) categoryTabsContainer.style.display = 'none';
        if (noStatsMessage) noStatsMessage.style.display = 'none';
        statsTableContent.innerHTML = '';

        const exercises = Storage.getExercises();

        if (!exercises.length) {
            if (noStatsMessage) {
                noStatsMessage.style.display = 'block';
                noStatsMessage.innerHTML = '<p>No exercises found. Add exercises to view statistics.</p>';
            }
            return;
        }

        // Load and render tabs
        await this.loadAndRenderTabs();
    },

    /**
     * Load and render tabs for each category
     */
    async loadAndRenderTabs() {
        const { startDate, endDate } = this.getDateRange();
        const exercises = Storage.getExercises();
        const loadingIndicator = document.getElementById('loadingIndicator');

        try {
            // Show loading indicator
            if (loadingIndicator) loadingIndicator.style.display = 'flex';

            // Collect data for all exercises (in parallel for speed)
            const exerciseData = await Promise.all(
                exercises.map(async (exercise) => {
                    const workouts = await Storage.getWorkoutsForExercise(exercise.id, startDate, endDate);
                    return {
                        exercise,
                        workouts
                    };
                })
            );

            // Hide loading indicator
            if (loadingIndicator) loadingIndicator.style.display = 'none';

            // Filter out exercises with no data
            const dataWithWorkouts = exerciseData.filter(d => d.workouts.length > 0);

            // Store all exercise data
            this.allExercisesData = dataWithWorkouts;

            if (dataWithWorkouts.length === 0) {
                const noStatsMessage = document.getElementById('noStatsMessage');
                if (noStatsMessage) {
                    noStatsMessage.style.display = 'block';
                    noStatsMessage.innerHTML = '<p class="empty-state">No workout data found in the selected time range.</p>';
                }
                return;
            }

            // Group exercises by equipment type
            const groupedExercises = this.groupExercisesByCategory(dataWithWorkouts);

            // Apply default selections from latest workout
            this.applyLatestWorkoutDefaults(dataWithWorkouts);

            // Render Exercise Summary Table (grouped by category)
            this.renderSummaryTable(groupedExercises);

            // Render Category Tabs and Content
            this.renderCategoryTabs(groupedExercises);

        } catch (error) {
            console.error('Error loading chart data:', error);
            // Hide loading indicator on error
            const loadingIndicator = document.getElementById('loadingIndicator');
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            const noStatsMessage = document.getElementById('noStatsMessage');
            if (noStatsMessage) {
                noStatsMessage.style.display = 'block';
                noStatsMessage.innerHTML = '<p class="empty-state">Error loading statistics. Please try again.</p>';
            }
        }
    },

    /**
     * Group exercises by equipment type (category)
     * @param {Array} exercisesData - Array of {exercise, workouts} objects
     * @returns {Object} Exercises grouped by equipment type
     */
    groupExercisesByCategory(exercisesData) {
        const grouped = {};

        exercisesData.forEach(data => {
            const category = data.exercise.equipmentType || 'other';
            if (!grouped[category]) {
                grouped[category] = [];
            }
            grouped[category].push(data);
        });

        // Sort exercises within each category alphabetically
        Object.keys(grouped).forEach(category => {
            grouped[category].sort((a, b) =>
                a.exercise.name.localeCompare(b.exercise.name)
            );
        });

        return grouped;
    },

    /**
     * Apply default selections from the latest workout if it's a new workout date
     * or if no selections are set for a category.
     * @param {Array} dataWithWorkouts - Exercises with their workout data
     */
    applyLatestWorkoutDefaults(dataWithWorkouts) {
        if (!dataWithWorkouts || dataWithWorkouts.length === 0) return;

        // Find the latest workout date across all exercises
        let latestDate = '';
        dataWithWorkouts.forEach(d => {
            d.workouts.forEach(w => {
                if (w.date > latestDate) latestDate = w.date;
            });
        });

        if (!latestDate) return;

        const lastProcessed = localStorage.getItem('lastProcessedLatestWorkoutDate');
        const isNewDate = lastProcessed !== latestDate;

        // Get all exercise IDs from the latest workout
        const latestExerciseIds = dataWithWorkouts
            .filter(d => d.workouts.some(w => w.date === latestDate))
            .map(d => d.exercise.id);

        // Group them by category
        const latestByCategory = {};
        dataWithWorkouts.forEach(d => {
            if (latestExerciseIds.includes(d.exercise.id)) {
                const category = d.exercise.equipmentType || 'other';
                if (!latestByCategory[category]) {
                    latestByCategory[category] = [];
                }
                latestByCategory[category].push(d.exercise.id);
            }
        });

        let changed = false;

        // Identify all unique categories present in the data
        const categories = [...new Set(dataWithWorkouts.map(d => d.exercise.equipmentType || 'other'))];

        categories.forEach(category => {
            // Update if it's a new date AND this category was in the latest workout
            // OR if this category has no selection yet (even if it wasn't in the latest workout)
            if ((isNewDate && latestByCategory[category]) || this.categorySelections[category] === undefined) {
                // If it was in the latest workout, select those exercises
                if (latestByCategory[category]) {
                    this.categorySelections[category] = latestByCategory[category];
                    changed = true;
                }
                // If it's a brand new category (no selection yet) but not in latest workout, 
                // just initialize to empty (safety)
                else if (this.categorySelections[category] === undefined) {
                    this.categorySelections[category] = [];
                    changed = true;
                }
            }
        });

        if (changed || isNewDate) {
            localStorage.setItem('categorySelections', JSON.stringify(this.categorySelections));
            localStorage.setItem('lastProcessedLatestWorkoutDate', latestDate);
        }
    },

    /**
     * Render summary table grouped by category
     * @param {Object} groupedExercises - Exercises grouped by category
     */
    renderSummaryTable(groupedExercises) {
        const statsTableContent = document.getElementById('statsTableContent');
        if (!statsTableContent) return;

        const categories = Object.keys(groupedExercises).sort();
        const hasWeightedExercises = this.allExercisesData.some(d => d.exercise.requiresWeight);

        let tableHTML = '<div class="stats-table-container">';
        tableHTML += `
            <table class="stats-summary-table">
                <thead>
                    <tr>
                        <th class="sortable" data-sort="name">Exercise <span class="sort-indicator"></span></th>
                        <th class="sortable" data-sort="category">Category <span class="sort-indicator"></span></th>
                        <th class="sortable" data-sort="workouts">Workouts <span class="sort-indicator"></span></th>
                        <th class="sortable" data-sort="avgReps">Avg Reps <span class="sort-indicator"></span></th>
                        ${hasWeightedExercises ? '<th class="sortable" data-sort="avgWeight">Avg Weight <span class="sort-indicator"></span></th>' : ''}
                        <th class="sortable" data-sort="pr">PR <span class="sort-indicator"></span></th>
                    </tr>
                </thead>
                <tbody>
        `;

        categories.forEach(category => {
            // Add category header row
            tableHTML += `
                <tr class="category-header-row" style="background: #f0f0f0; font-weight: bold;">
                    <td colspan="${hasWeightedExercises ? 6 : 5}" style="padding: var(--spacing-md);">
                        ${this.formatEquipmentType(category)}
                    </td>
                </tr>
            `;

            // Add exercise rows for this category
            groupedExercises[category].forEach(({ exercise, workouts }) => {
                const stats = this.calculateExerciseStats(workouts, exercise.requiresWeight);
                const prValue = exercise.requiresWeight && stats.prReps && stats.prWeight
                    ? `${stats.prReps}x${stats.prWeight.toFixed(1)}`
                    : `${stats.maxReps} reps`;

                tableHTML += `
                    <tr>
                        <td class="exercise-name-cell"><strong>${exercise.name}</strong></td>
                        <td>${this.formatEquipmentType(category)}</td>
                        <td>${stats.totalWorkouts}</td>
                        <td>${stats.avgReps.toFixed(1)}</td>
                        ${hasWeightedExercises ? `<td>${exercise.requiresWeight && stats.avgWeight > 0 ? stats.avgWeight.toFixed(1) + ' kg' : '-'}</td>` : ''}
                        <td><strong>${prValue}</strong></td>
                    </tr>
                `;
            });
        });

        tableHTML += `
                </tbody>
            </table>
        `;
        tableHTML += '</div>';
        statsTableContent.innerHTML = tableHTML;
    },

    /**
     * Render category tabs and their content
     * @param {Object} groupedExercises - Exercises grouped by category
     */
    renderCategoryTabs(groupedExercises) {
        const categoryTabsContainer = document.getElementById('categoryTabsContainer');
        const categoryTabs = document.getElementById('categoryTabs');
        const categoryTabContent = document.getElementById('categoryTabContent');

        if (!categoryTabs || !categoryTabContent) return;

        // Clear existing content
        categoryTabs.innerHTML = '';
        categoryTabContent.innerHTML = '';

        const categories = Object.keys(groupedExercises).sort();

        // Set default category if not set
        if (!this.currentCategory || !categories.includes(this.currentCategory)) {
            this.currentCategory = categories[0];
        }

        // Create tab buttons
        categories.forEach(category => {
            const tabBtn = document.createElement('button');
            tabBtn.className = 'category-tab-btn';
            if (category === this.currentCategory) {
                tabBtn.classList.add('active');
            }
            tabBtn.textContent = this.formatEquipmentType(category);
            tabBtn.dataset.category = category;
            tabBtn.addEventListener('click', () => this.switchCategory(category, groupedExercises[category]));
            categoryTabs.appendChild(tabBtn);
        });

        // Create tab content panes
        categories.forEach(category => {
            const pane = document.createElement('div');
            pane.className = 'category-tab-pane';
            pane.id = `category-pane-${category}`;
            if (category === this.currentCategory) {
                pane.classList.add('active');
            }

            // Create exercise selector for this category
            const selector = this.createCategoryExerciseSelector(category, groupedExercises[category]);
            pane.appendChild(selector);

            // Create chart container for this category
            const chartContainer = document.createElement('div');
            chartContainer.className = 'category-chart-container';
            chartContainer.innerHTML = `
                <div class="chart-container">
                    <canvas id="chart-${category}"></canvas>
                </div>
            `;
            pane.appendChild(chartContainer);

            categoryTabContent.appendChild(pane);
        });

        // Show the container
        categoryTabsContainer.style.display = 'block';

        // Render chart for current category
        this.renderCategoryChart(this.currentCategory, groupedExercises[this.currentCategory]);
    },

    /**
     * Create exercise selector for a category
     * @param {string} category - Category name
     * @param {Array} exercisesData - Exercises in this category
     * @returns {HTMLElement} Selector element
     */
    createCategoryExerciseSelector(category, exercisesData) {
        const container = document.createElement('div');
        container.className = 'category-exercise-selector';

        // Get saved selections for this category
        if (!this.categorySelections[category]) {
            this.categorySelections[category] = [];
        }

        const header = document.createElement('div');
        header.className = 'category-selector-header';
        header.innerHTML = `
            <h4>
                <span class="chevron" style="display: inline-block; transition: transform 0.3s ease;">▼</span>
                Select Exercises to View
            </h4>
            <button class="btn btn-small btn-secondary toggle-all-btn" data-category="${category}">Select All</button>
        `;

        const checkboxContainer = document.createElement('div');
        checkboxContainer.className = 'category-checkboxes';

        exercisesData.forEach(({ exercise }) => {
            const label = document.createElement('label');
            label.className = 'category-checkbox-label';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = exercise.id;
            checkbox.checked = this.categorySelections[category].includes(exercise.id);
            checkbox.className = 'exercise-checkbox';
            checkbox.dataset.category = category;
            checkbox.addEventListener('change', (e) => {
                this.handleCategoryCheckboxChange(category, exercise.id, e.target.checked, exercisesData);
            });

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(' ' + exercise.name));
            checkboxContainer.appendChild(label);
        });

        container.appendChild(header);
        container.appendChild(checkboxContainer);

        // Set up toggle all button
        const toggleBtn = header.querySelector('.toggle-all-btn');
        toggleBtn.addEventListener('click', () => {
            this.toggleAllCategoryExercises(category, exercisesData);
        });

        // Set up collapsible functionality
        const headerTitle = header.querySelector('h4');
        headerTitle.style.cursor = 'pointer';
        headerTitle.addEventListener('click', () => {
            const chevron = headerTitle.querySelector('.chevron');
            const isHidden = checkboxContainer.style.display === 'none';
            checkboxContainer.style.display = isHidden ? 'grid' : 'none';
            chevron.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
        });

        return container;
    },

    /**
     * Handle checkbox change in category
     * @param {string} category - Category name
     * @param {string} exerciseId - Exercise ID
     * @param {boolean} checked - Checked state
     * @param {Array} exercisesData - Exercises in this category
     */
    handleCategoryCheckboxChange(category, exerciseId, checked, exercisesData) {
        if (!this.categorySelections[category]) {
            this.categorySelections[category] = [];
        }

        if (checked) {
            if (!this.categorySelections[category].includes(exerciseId)) {
                this.categorySelections[category].push(exerciseId);
            }
        } else {
            this.categorySelections[category] = this.categorySelections[category].filter(id => id !== exerciseId);
        }

        // Save to localStorage
        localStorage.setItem('categorySelections', JSON.stringify(this.categorySelections));

        // Re-render chart for this category
        this.renderCategoryChart(category, exercisesData);
    },

    /**
     * Toggle all exercises in a category
     * @param {string} category - Category name
     * @param {Array} exercisesData - Exercises in this category
     */
    toggleAllCategoryExercises(category, exercisesData) {
        const pane = document.getElementById(`category-pane-${category}`);
        if (!pane) return;

        const checkboxes = pane.querySelectorAll('.exercise-checkbox');
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);

        checkboxes.forEach(checkbox => {
            checkbox.checked = !allChecked;
        });

        // Update selections
        if (allChecked) {
            this.categorySelections[category] = [];
        } else {
            this.categorySelections[category] = exercisesData.map(d => d.exercise.id);
        }

        // Save to localStorage
        localStorage.setItem('categorySelections', JSON.stringify(this.categorySelections));

        // Re-render chart
        this.renderCategoryChart(category, exercisesData);
    },

    /**
     * Render chart for a specific category
     * @param {string} category - Category name
     * @param {Array} exercisesData - Exercises in this category
     */
    renderCategoryChart(category, exercisesData) {
        const canvas = document.getElementById(`chart-${category}`);
        if (!canvas) return;

        // Get selected exercises for this category
        const selectedIds = this.categorySelections[category] || [];

        if (selectedIds.length === 0) {
            const container = canvas.parentElement;
            container.innerHTML = '<p class="empty-state">Select exercises from the checkboxes above to view.</p>';
            return;
        }

        // Filter to selected exercises
        const selectedData = exercisesData.filter(d => selectedIds.includes(d.exercise.id));

        if (selectedData.length === 0) {
            const container = canvas.parentElement;
            container.innerHTML = '<p class="empty-state">No data available for selected exercises.</p>';
            return;
        }

        // Recreate canvas if it was removed
        const container = canvas.parentElement;
        container.innerHTML = `<canvas id="chart-${category}"></canvas>`;
        const newCanvas = document.getElementById(`chart-${category}`);

        // Color palettes
        const barColors = ['#667eea', '#4caf50', '#ff9800', '#e91e63', '#00bcd4'];
        const trendColors = ['#2196f3', '#ff5722', '#9c27b0', '#00bcd4', '#4caf50'];
        const datasets = [];

        // Get all unique dates across all exercises
        const allDates = new Set();
        selectedData.forEach(data => {
            const dailyData = this.groupByDate(data.workouts, data.exercise.requiresWeight);
            dailyData.labels.forEach(label => allDates.add(label));
        });
        const sortedDates = Array.from(allDates).sort();

        selectedData.forEach((data, idx) => {
            const dailyData = this.groupByDate(data.workouts, data.exercise.requiresWeight);
            const alignedData = sortedDates.map(date => {
                const dataIdx = dailyData.labels.indexOf(date);
                return dataIdx !== -1 ? dailyData.values[dataIdx] : null;
            });

            // Calculate progress percentage for non-null values
            const nonNullValues = alignedData.filter(v => v !== null);
            const progressPercentages = this.calculateProgressPercentage(nonNullValues);

            // Map back to aligned data structure
            let progressIdx = 0;
            const alignedProgress = alignedData.map(val => {
                if (val === null) return null;
                return progressPercentages[progressIdx++];
            });

            const barColor = barColors[idx % barColors.length];
            const trendColor = trendColors[idx % trendColors.length];

            // Align original sets to the dates
            const alignedSets = sortedDates.map(date => {
                return dailyData.setsMap[date] || null;
            });

            // Add bar chart for progress percentage
            datasets.push({
                label: data.exercise.name,
                data: alignedProgress,
                originalSets: alignedSets, // Store for tooltip
                exercise: data.exercise,   // Store for tooltip
                type: 'bar',
                backgroundColor: barColor.replace(')', ', 0.6)').replace('rgb', 'rgba'),
                borderColor: barColor,
                borderWidth: 1,
                order: 2 // Bars render behind lines
            });

            // Add trend line (dotted)
            const validPoints = alignedProgress
                .map((val, idx) => ({ x: idx, y: val }))
                .filter(p => p.y !== null);

            if (validPoints.length >= 2) {
                const regression = calculateLinearRegression(validPoints);
                const trendLine = sortedDates.map((_, idx) => regression.predict(idx));

                datasets.push({
                    label: `${data.exercise.name} Trend`,
                    data: trendLine,
                    type: 'line',
                    borderColor: trendColor,
                    borderWidth: 2,
                    borderDash: [8, 4], // Dotted line
                    pointRadius: 0,
                    fill: false,
                    tension: 0,
                    order: 1 // Lines render in front
                });
            }
        });

        // Create mixed chart (bars + lines)
        const ctx = newCanvas.getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sortedDates,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    zoom: {
                        pan: {
                            enabled: true,
                            mode: 'x'
                        },
                        zoom: {
                            wheel: {
                                enabled: true
                            },
                            pinch: {
                                enabled: true
                            },
                            mode: 'x'
                        }
                    },
                    title: {
                        display: true,
                        text: `${this.formatEquipmentType(category)} - Workout Progress Tracking (% Improvement vs Baseline)`
                    },
                    tooltip: {
                        callbacks: {
                            title: (tooltipItems) => {
                                return tooltipItems[0].label;
                            },
                            label: (context) => {
                                const label = context.dataset.label || '';
                                const value = context.parsed.y;
                                if (value === null || context.dataset.type === 'line') return `${label}: ${value?.toFixed(1)}%`;

                                // Show percentage and change from baseline
                                const changeFromBaseline = value - 100;
                                const changeText = changeFromBaseline >= 0
                                    ? `+${changeFromBaseline.toFixed(1)}%`
                                    : `${changeFromBaseline.toFixed(1)}%`;

                                return `${label}: ${value.toFixed(1)}% (${changeText})`;
                            },
                            afterLabel: (context) => {
                                const sets = context.dataset.originalSets?.[context.dataIndex];
                                if (!sets || sets.length === 0) return '';

                                const setStrings = sets.map(s => {
                                    return s.weight ? `${s.reps}x${s.weight}` : `${s.reps} reps`;
                                });

                                return 'Sets: ' + setStrings.join(', ');
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        title: {
                            display: true,
                            text: 'Progress (% of Baseline)'
                        },
                        ticks: {
                            callback: function (value) {
                                return value.toFixed(0) + '%';
                            }
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Date'
                        }
                    }
                }
            }
        });
    },

    /**
     * Switch to a different category tab
     * @param {string} category - Category name
     * @param {Array} categoryData - Optional data for the category
     */
    switchCategory(category, categoryData = null) {
        this.currentCategory = category;
        localStorage.setItem('currentCategory', category);

        // Update tab buttons
        document.querySelectorAll('.category-tab-btn').forEach(btn => {
            if (btn.dataset.category === category) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update tab panes
        document.querySelectorAll('.category-tab-pane').forEach(pane => {
            if (pane.id === `category-pane-${category}`) {
                pane.classList.add('active');
            } else {
                pane.classList.remove('active');
            }
        });

        // Ensure chart is rendered for the new category
        const data = categoryData || this.allExercisesData.filter(d => (d.exercise.equipmentType || 'other') === category);
        this.renderCategoryChart(category, data);
    },

    /**
     * Get date range for loading all workout data
     * @returns {{startDate: Date, endDate: Date}}
     */
    getDateRange() {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 10); // 10 years back for all data
        return { startDate, endDate };
    },

    /**
     * Set up collapsible summary table
     */
    setupCollapsibleSummary() {
        const toggle = document.getElementById('summaryToggle');
        const summaryContent = document.getElementById('statsTableContent');

        if (!toggle || !summaryContent) return;

        // Restore saved state or default to expanded
        const savedState = localStorage.getItem('summaryCollapsed');
        const isCollapsed = savedState === 'true';

        // Apply saved state
        summaryContent.style.display = isCollapsed ? 'none' : 'block';
        const chevron = toggle.querySelector('.chevron');
        if (chevron) {
            chevron.style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
        }

        toggle.addEventListener('click', () => {
            const chevron = toggle.querySelector('.chevron');
            const isHidden = summaryContent.style.display === 'none';

            summaryContent.style.display = isHidden ? 'block' : 'none';
            chevron.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';

            // Save state to localStorage
            localStorage.setItem('summaryCollapsed', !isHidden);
        });
    },

    /**
     * Calculate progress percentage relative to baseline
     * @param {Array<number>} values - Chronologically ordered values
     * @returns {Array<number>} Progress percentages
     */
    calculateProgressPercentage(values) {
        return calculateProgressPercentage(values);
    },

    /**
     * Group workouts by date and calculate volume or total reps
     * @param {array} workouts - Array of workout objects
     * @param {boolean} isWeighted - Whether exercise requires weight
     * @returns {{labels: array, values: array, setsMap: object}}
     */
    groupByDate(workouts, isWeighted = true) {
        const dates = new Map();
        const setsMap = {};

        workouts.forEach(workout => {
            const dateLabel = workout.date;

            if (!dates.has(dateLabel)) {
                dates.set(dateLabel, 0);
                setsMap[dateLabel] = [];
            }

            setsMap[dateLabel].push(workout);

            // Calculate volume (reps × weight) for weighted exercises, or total reps for bodyweight
            const value = isWeighted && workout.weight
                ? workout.reps * workout.weight
                : workout.reps;
            dates.set(dateLabel, dates.get(dateLabel) + value);
        });

        // Sort by date
        const sortedDates = Array.from(dates.entries()).sort((a, b) => a[0].localeCompare(b[0]));

        return {
            labels: sortedDates.map(entry => entry[0]),
            values: sortedDates.map(entry => entry[1]),
            setsMap: setsMap
        };
    },

    /**
     * Calculate statistics for an exercise
     * @param {Array} workouts - Array of workout objects
     * @param {boolean} requiresWeight - Whether exercise requires weight
     * @returns {Object} Statistics object
     */
    calculateExerciseStats(workouts, requiresWeight) {
        const totalWorkouts = workouts.length;
        const totalReps = workouts.reduce((sum, w) => sum + w.reps, 0);
        const avgReps = totalReps / totalWorkouts;

        const weightsUsed = workouts.filter(w => w.weight > 0).map(w => w.weight);
        const avgWeight = weightsUsed.length > 0
            ? weightsUsed.reduce((sum, w) => sum + w, 0) / weightsUsed.length
            : 0;

        // For bodyweight exercises, PR is max reps
        const maxReps = Math.max(...workouts.map(w => w.reps));

        // For weighted exercises, find PR workout (highest volume = reps × weight)
        let prReps = null;
        let prWeight = null;
        if (requiresWeight && weightsUsed.length > 0) {
            let maxVolume = 0;
            workouts.forEach(w => {
                if (w.weight > 0) {
                    const volume = w.reps * w.weight;
                    if (volume > maxVolume) {
                        maxVolume = volume;
                        prReps = w.reps;
                        prWeight = w.weight;
                    }
                }
            });
        }

        return {
            totalWorkouts,
            totalReps,
            avgReps,
            avgWeight,
            maxReps,
            prReps,
            prWeight
        };
    },

    /**
     * Format equipment type for display
     * @param {string} equipmentType - Equipment type key
     * @returns {string} Formatted equipment type
     */
    formatEquipmentType(equipmentType) {
        if (!equipmentType) return 'Unknown';
        const types = CONFIG.equipmentTypes;
        if (!types || !types[equipmentType]) return equipmentType;
        return types[equipmentType].label || equipmentType;
    },

    /**
     * Format date for display
     * @param {string} dateString - ISO date string
     * @returns {string} Formatted date
     */
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }
};
