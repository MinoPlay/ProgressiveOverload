// Charts Module
// Handles statistics visualization with Chart.js

import { Storage } from './storage.js';
import { CONFIG } from './config.js';
import { calculateLinearRegression } from './chart-helpers.js';

// Register Chart.js plugins globally when available
// Plugins are loaded via CDN and auto-register with Chart.js 4.x
// The zoom and annotation plugins will be available as Chart.Zoom and Chart.Annotation

export const Charts = {
    selectedExerciseIds: JSON.parse(localStorage.getItem('selectedExerciseIds') || '[]'),
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
    },

    /**
     * Render combined chart with all exercises and overview table
     */
    async renderCombinedChart() {
        const statsContent = document.getElementById('statsContent');
        const noStatsMessage = document.getElementById('noStatsMessage');
        if (!statsContent) return;

        // Hide content during loading
        statsContent.style.display = 'none';
        if (noStatsMessage) noStatsMessage.style.display = 'none';

        // Remove all children
        statsContent.innerHTML = '';
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
        
        // Show content after loading
        statsContent.style.display = 'block';
    },

    /**
     * Load and render tabs for each exercise
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
                document.getElementById('statsContent').innerHTML = '<p class="empty-state">No workout data found in the selected time range.</p>';
                return;
            }
            
            // Populate exercise checkboxes
            this.populateExerciseCheckboxes(dataWithWorkouts);

            // Render unified chart
            this.renderUnifiedChart();
            
            // Render table view under chart
            this.renderTableView();

        } catch (error) {
            console.error('Error loading chart data:', error);
            // Hide loading indicator on error
            const loadingIndicator = document.getElementById('loadingIndicator');
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            document.getElementById('statsContent').innerHTML = '<p class="empty-state">Error loading statistics. Please try again.</p>';
        }
    },

    /**
     * Populate exercise selection checkboxes
     * @param {Array} exercisesData - Array of {exercise, workouts} objects
     */
    populateExerciseCheckboxes(exercisesData) {
        const container = document.getElementById('exerciseCheckboxes');
        if (!container) return;

        container.innerHTML = '';
        
        // Sort exercises alphabetically by name
        const sortedExercises = [...exercisesData].sort((a, b) => 
            a.exercise.name.localeCompare(b.exercise.name)
        );
        
        sortedExercises.forEach(({ exercise }) => {
            const label = document.createElement('label');
            label.className = 'comparison-checkbox-label';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = exercise.id;
            checkbox.checked = this.selectedExerciseIds.includes(exercise.id);
            checkbox.className = 'exercise-checkbox';
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.selectedExerciseIds.push(exercise.id);
                } else {
                    this.selectedExerciseIds = this.selectedExerciseIds.filter(id => id !== exercise.id);
                }
                localStorage.setItem('selectedExerciseIds', JSON.stringify(this.selectedExerciseIds));
                
                // Update both chart and table
                this.renderUnifiedChart();
                this.renderTableView();
                
                // Update toggle button text
                this.updateToggleButtonText();
            });
            
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(' ' + exercise.name));
            container.appendChild(label);
        });
        
        // Set up toggle all button
        this.setupToggleAllButton();
        this.updateToggleButtonText();
    },

    /**
     * Set up the toggle all button event listener
     */
    setupToggleAllButton() {
        const toggleBtn = document.getElementById('toggleAllExercises');
        if (!toggleBtn) return;
        
        // Remove existing listener if any
        const newBtn = toggleBtn.cloneNode(true);
        toggleBtn.parentNode.replaceChild(newBtn, toggleBtn);
        
        newBtn.addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('.exercise-checkbox');
            const allChecked = Array.from(checkboxes).every(cb => cb.checked);
            
            checkboxes.forEach(checkbox => {
                checkbox.checked = !allChecked;
            });
            
            // Update selected IDs
            if (allChecked) {
                this.selectedExerciseIds = [];
            } else {
                this.selectedExerciseIds = Array.from(checkboxes).map(cb => cb.value);
            }
            
            localStorage.setItem('selectedExerciseIds', JSON.stringify(this.selectedExerciseIds));
            
            // Update both chart and table
            this.renderUnifiedChart();
            this.renderTableView();
            this.updateToggleButtonText();
        });
    },

    /**
     * Update toggle button text based on current selection
     */
    updateToggleButtonText() {
        const toggleBtn = document.getElementById('toggleAllExercises');
        const checkboxes = document.querySelectorAll('.exercise-checkbox');
        if (!toggleBtn || checkboxes.length === 0) return;
        
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        toggleBtn.textContent = allChecked ? 'Deselect All' : 'Select All';
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
     * Render unified chart: Bars for actual data + Dotted lines for trends
     */
    renderUnifiedChart() {
        const statsContent = document.getElementById('statsContent');
        if (!statsContent) return;

        // Clear existing content
        Array.from(statsContent.querySelectorAll('.exercise-tab-pane')).forEach(el => el.remove());
        
        if (this.selectedExerciseIds.length === 0) {
            statsContent.innerHTML = '<p class="empty-state">Select exercises from the checkboxes above to view.</p>';
            return;
        }

        // Filter to selected exercises
        const selectedData = this.allExercisesData.filter(d => 
            this.selectedExerciseIds.includes(d.exercise.id)
        );

        if (selectedData.length === 0) {
            statsContent.innerHTML = '<p class="empty-state">No data available for selected exercises.</p>';
            return;
        }

        // Create chart container
        const container = document.createElement('div');
        container.className = 'exercise-tab-pane';
        container.style.display = 'block';
        container.innerHTML = `
            <div class="chart-container">
                <canvas id="unifiedChart"></canvas>
            </div>
        `;
        statsContent.appendChild(container);

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
            
            const barColor = barColors[idx % barColors.length];
            const trendColor = trendColors[idx % trendColors.length];
            
            // Add bar chart for actual data
            datasets.push({
                label: data.exercise.name,
                data: alignedData,
                type: 'bar',
                backgroundColor: barColor.replace(')', ', 0.6)').replace('rgb', 'rgba'),
                borderColor: barColor,
                borderWidth: 1,
                order: 2 // Bars render behind lines
            });
            
            // Add trend line (dotted)
            const validPoints = alignedData
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
        const ctx = document.getElementById('unifiedChart');
        if (ctx) {
            new Chart(ctx.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: sortedDates,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
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
                            text: 'Workout Progress (Bars: Actual Data | Dotted Lines: Trends)'
                        },
                        tooltip: {
                            callbacks: {
                                title: (tooltipItems) => {
                                    return tooltipItems[0].label;
                                },
                                label: (context) => {
                                    const label = context.dataset.label || '';
                                    const value = context.parsed.y;
                                    if (value === null) return '';
                                    return `${label}: ${value.toFixed(1)}`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Value'
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
        }
    },

    /**
     * Group workouts by date and calculate volume or total reps
     * @param {array} workouts - Array of workout objects
     * @param {boolean} isWeighted - Whether exercise requires weight
     * @returns {{labels: array, values: array}}
     */
    groupByDate(workouts, isWeighted = true) {
        const dates = new Map();

        workouts.forEach(workout => {
            const dateLabel = workout.date;

            if (!dates.has(dateLabel)) {
                dates.set(dateLabel, 0);
            }

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
            values: sortedDates.map(entry => entry[1])
        };
    },

    /**
     * Render table view with statistics for selected exercises
     */
    renderTableView() {
        const statsTableContent = document.getElementById('statsTableContent');
        if (!statsTableContent) return;

        if (this.selectedExerciseIds.length === 0) {
            statsTableContent.innerHTML = '<p class="empty-state">Select exercises from the checkboxes above to view statistics.</p>';
            return;
        }

        // Filter to selected exercises
        const selectedData = this.allExercisesData.filter(d => 
            this.selectedExerciseIds.includes(d.exercise.id)
        );

        if (selectedData.length === 0) {
            statsTableContent.innerHTML = '<p class="empty-state">No data available for selected exercises.</p>';
            return;
        }

        // Store table data for sorting
        this.tableData = selectedData.map(({ exercise, workouts }) => {
            const stats = this.calculateExerciseStats(workouts, exercise.requiresWeight);
            return {
                exercise,
                stats
            };
        });

        // Render table with current sort
        this.renderSortedTable();
    },

    /**
     * Render table with sorting applied
     */
    renderSortedTable() {
        const statsTableContent = document.getElementById('statsTableContent');
        if (!statsTableContent || !this.tableData) return;

        const hasWeightedExercises = this.tableData.some(d => d.exercise.requiresWeight);

        // Build concise summary table
        let tableHTML = '<div class="stats-table-container">';
        
        tableHTML += `
            <table class="stats-summary-table">
                <thead>
                    <tr>
                        <th class="sortable" data-sort="name">Exercise <span class="sort-indicator"></span></th>
                        <th class="sortable" data-sort="workouts">Workouts <span class="sort-indicator"></span></th>
                        <th class="sortable" data-sort="totalReps">Total Reps <span class="sort-indicator"></span></th>
                        ${hasWeightedExercises ? '<th class="sortable" data-sort="totalVolume">Total Volume <span class="sort-indicator"></span></th>' : ''}
                        <th class="sortable" data-sort="avgReps">Avg Reps <span class="sort-indicator"></span></th>
                        ${hasWeightedExercises ? '<th class="sortable" data-sort="avgWeight">Avg Weight <span class="sort-indicator"></span></th>' : ''}
                        ${hasWeightedExercises ? '<th class="sortable" data-sort="avgVolume">Avg Volume <span class="sort-indicator"></span></th>' : ''}
                        <th class="sortable" data-sort="pr">PR <span class="sort-indicator"></span></th>
                    </tr>
                </thead>
                <tbody>
        `;

        this.tableData.forEach(({ exercise, stats }) => {
            const prValue = exercise.requiresWeight && stats.maxWeight > 0
                ? `${stats.maxWeight.toFixed(1)} kg`
                : `${stats.maxReps} reps`;
            
            tableHTML += `
                <tr>
                    <td class="exercise-name-cell"><strong>${exercise.name}</strong></td>
                    <td>${stats.totalWorkouts}</td>
                    <td>${stats.totalReps}</td>
                    ${hasWeightedExercises ? `<td>${exercise.requiresWeight ? stats.totalVolume.toFixed(0) : '-'}</td>` : ''}
                    <td>${stats.avgReps.toFixed(1)}</td>
                    ${hasWeightedExercises ? `<td>${exercise.requiresWeight && stats.avgWeight > 0 ? stats.avgWeight.toFixed(1) + ' kg' : '-'}</td>` : ''}
                    ${hasWeightedExercises ? `<td>${exercise.requiresWeight && stats.avgVolume > 0 ? stats.avgVolume.toFixed(0) : '-'}</td>` : ''}
                    <td><strong>${prValue}</strong></td>
                </tr>
            `;
        });

        tableHTML += `
                </tbody>
            </table>
        `;

        tableHTML += '</div>';
        statsTableContent.innerHTML = tableHTML;

        // Add click handlers for sorting
        const headers = statsTableContent.querySelectorAll('.sortable');
        headers.forEach(header => {
            header.addEventListener('click', () => {
                const sortKey = header.dataset.sort;
                this.sortTable(sortKey);
            });
        });
    },

    /**
     * Sort table by column
     * @param {string} sortKey - Key to sort by
     */
    sortTable(sortKey) {
        if (!this.tableData) return;

        // Toggle sort direction if same column
        if (this.currentSortKey === sortKey) {
            this.sortAscending = !this.sortAscending;
        } else {
            this.currentSortKey = sortKey;
            this.sortAscending = true;
        }

        // Sort the data
        this.tableData.sort((a, b) => {
            let valA, valB;

            switch (sortKey) {
                case 'name':
                    valA = a.exercise.name.toLowerCase();
                    valB = b.exercise.name.toLowerCase();
                    break;
                case 'workouts':
                    valA = a.stats.totalWorkouts;
                    valB = b.stats.totalWorkouts;
                    break;
                case 'totalReps':
                    valA = a.stats.totalReps;
                    valB = b.stats.totalReps;
                    break;
                case 'totalVolume':
                    valA = a.stats.totalVolume;
                    valB = b.stats.totalVolume;
                    break;
                case 'avgReps':
                    valA = a.stats.avgReps;
                    valB = b.stats.avgReps;
                    break;
                case 'avgWeight':
                    valA = a.stats.avgWeight;
                    valB = b.stats.avgWeight;
                    break;
                case 'avgVolume':
                    valA = a.stats.avgVolume;
                    valB = b.stats.avgVolume;
                    break;
                case 'pr':
                    // For PR, use maxWeight for weighted, maxReps for bodyweight
                    valA = a.exercise.requiresWeight ? a.stats.maxWeight : a.stats.maxReps;
                    valB = b.exercise.requiresWeight ? b.stats.maxWeight : b.stats.maxReps;
                    break;
                default:
                    return 0;
            }

            // Handle string comparisons
            if (typeof valA === 'string') {
                return this.sortAscending 
                    ? valA.localeCompare(valB)
                    : valB.localeCompare(valA);
            }

            // Handle numeric comparisons
            return this.sortAscending ? valA - valB : valB - valA;
        });

        // Re-render table
        this.renderSortedTable();

        // Update sort indicator
        this.updateSortIndicators();
    },

    /**
     * Update sort indicators in table headers
     */
    updateSortIndicators() {
        const statsTableContent = document.getElementById('statsTableContent');
        if (!statsTableContent) return;

        // Clear all indicators
        statsTableContent.querySelectorAll('.sort-indicator').forEach(indicator => {
            indicator.textContent = '';
        });

        // Set current indicator
        const currentHeader = statsTableContent.querySelector(`[data-sort="${this.currentSortKey}"]`);
        if (currentHeader) {
            const indicator = currentHeader.querySelector('.sort-indicator');
            if (indicator) {
                indicator.textContent = this.sortAscending ? ' ↑' : ' ↓';
            }
        }
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
        const totalVolume = requiresWeight 
            ? workouts.reduce((sum, w) => sum + (w.reps * (w.weight || 0)), 0)
            : 0;
        const avgReps = totalReps / totalWorkouts;
        
        const weightsUsed = workouts.filter(w => w.weight > 0).map(w => w.weight);
        const avgWeight = weightsUsed.length > 0 
            ? weightsUsed.reduce((sum, w) => sum + w, 0) / weightsUsed.length 
            : 0;
        const maxWeight = weightsUsed.length > 0 
            ? Math.max(...weightsUsed) 
            : 0;
        
        // For bodyweight exercises, PR is max reps
        const maxReps = Math.max(...workouts.map(w => w.reps));
        
        const volumesPerWorkout = workouts
            .filter(w => requiresWeight && w.weight > 0)
            .map(w => w.reps * w.weight);
        const avgVolume = volumesPerWorkout.length > 0
            ? volumesPerWorkout.reduce((sum, v) => sum + v, 0) / volumesPerWorkout.length
            : 0;

        return {
            totalWorkouts,
            totalReps,
            totalVolume,
            avgReps,
            avgWeight,
            avgVolume,
            maxWeight,
            maxReps
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
