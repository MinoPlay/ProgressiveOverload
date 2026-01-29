// Charts Module
// Handles statistics visualization with Chart.js

import { Storage } from './storage.js';
import { CONFIG } from './config.js';
import { estimateOneRepMax, getWeekStart, parseDate, formatDate } from './utils.js';

export const Charts = {
    volumeChart: null,
    currentView: CONFIG.charts.defaultView,
    chartType: localStorage.getItem('chartType') || 'line',

    /**
     * Initialize charts UI
     */
    init() {
        this.bindEvents();
        this.setInitialChartTypeButton();
        this.renderCombinedChart();
        // Listen for exercise updates
        window.addEventListener('exercisesUpdated', () => {
            this.renderCombinedChart();
        });
    },

    /**
     * Set initial chart type button state
     */
    setInitialChartTypeButton() {
        const chartTypeBtns = document.querySelectorAll('.chart-type-btn');
        chartTypeBtns.forEach(btn => {
            if (btn.dataset.chartType === this.chartType) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        const viewBtns = document.querySelectorAll('.view-btn');
        viewBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Update active state
                viewBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                // Update current view
                this.currentView = btn.dataset.view;
                // Re-render combined chart
                this.renderCombinedChart();
            });
        });

        const chartTypeBtns = document.querySelectorAll('.chart-type-btn');
        chartTypeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Update active state
                chartTypeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                // Update chart type
                this.chartType = btn.dataset.chartType;
                // Save to localStorage
                localStorage.setItem('chartType', this.chartType);
                // Re-render combined chart
                this.renderCombinedChart();
            });
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

            if (dataWithWorkouts.length === 0) {
                document.getElementById('statsContent').innerHTML = '<p class="empty-state">No workout data found in the selected time range.</p>';
                return;
            }

            // Create tab navigation
            const statsContent = document.getElementById('statsContent');
            const tabNav = document.createElement('div');
            tabNav.className = 'exercise-tabs-nav';
            
            dataWithWorkouts.forEach((data, idx) => {
                const tabBtn = document.createElement('button');
                tabBtn.className = 'exercise-tab-btn' + (idx === 0 ? ' active' : '');
                tabBtn.textContent = data.exercise.name;
                tabBtn.dataset.tabIndex = idx;
                tabBtn.addEventListener('click', () => {
                    // Switch active tab
                    Array.from(tabNav.children).forEach(b => b.classList.remove('active'));
                    tabBtn.classList.add('active');
                    // Show only the selected tab content
                    Array.from(statsContent.querySelectorAll('.exercise-tab-pane')).forEach((el, i) => {
                        el.style.display = (i === idx) ? 'block' : 'none';
                    });
                });
                tabNav.appendChild(tabBtn);
            });
            statsContent.appendChild(tabNav);

            // Create tab content for each exercise
            dataWithWorkouts.forEach(({ exercise, workouts }, idx) => {
                const tabPane = document.createElement('div');
                tabPane.className = 'exercise-tab-pane';
                tabPane.style.display = idx === 0 ? 'block' : 'none';
                tabPane.innerHTML = `
                    <div class="chart-container">
                        <canvas id="volumeChart-${exercise.id}"></canvas>
                    </div>
                    <div id="stats-${exercise.id}"></div>
                `;
                statsContent.appendChild(tabPane);

                // Render chart and stats for this exercise
                this.renderProgressChart(exercise, workouts, `volumeChart-${exercise.id}`);
                this.renderExerciseStats(exercise, workouts, `stats-${exercise.id}`);
            });

        } catch (error) {
            console.error('Error loading chart data:', error);
            // Hide loading indicator on error
            const loadingIndicator = document.getElementById('loadingIndicator');
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            document.getElementById('statsContent').innerHTML = '<p class="empty-state">Error loading statistics. Please try again.</p>';
        }
    },

    /**
     * Get date range based on current view
     * @returns {{startDate: Date, endDate: Date}}
     */
    getDateRange() {
        const endDate = new Date();
        const startDate = new Date();

        switch (this.currentView) {
            case '10sessions':
                // Load last 12 months to ensure we get enough sessions
                startDate.setFullYear(startDate.getFullYear() - 1);
                break;
            case '30days':
                startDate.setDate(startDate.getDate() - 30);
                break;
            case '90days':
                startDate.setDate(startDate.getDate() - 90);
                break;
            case 'alltime':
                startDate.setFullYear(startDate.getFullYear() - 10); // 10 years back
                break;
        }

        return { startDate, endDate };
    },

    /**
     * Render progress chart for a single exercise
     * @param {object} exercise - Exercise object
     * @param {array} workouts - Array of workout objects
     * @param {string} canvasId - Canvas element ID
     */
    renderProgressChart(exercise, workouts, canvasId) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        // Group workouts by week
        const weeklyData = this.groupByWeek(workouts, exercise.requiresWeight);

        // Determine label and y-axis based on exercise type
        const isWeighted = exercise.requiresWeight;
        const dataLabel = isWeighted ? 'Weekly Volume (kg)' : 'Total Reps';
        const yAxisLabel = isWeighted ? 'Volume (kg)' : 'Reps';

        // Create chart
        new Chart(ctx.getContext('2d'), {
            type: this.chartType,
            data: {
                labels: weeklyData.labels,
                datasets: [{
                    label: dataLabel,
                    data: weeklyData.values,
                    borderColor: CONFIG.charts.colors.primary,
                    backgroundColor: CONFIG.charts.colors.primary,
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: CONFIG.charts.colors.primary,
                    fill: false,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: yAxisLabel
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Week'
                        }
                    }
                }
            }
        });
    },

    /**
     * Render statistics for a single exercise
     * @param {object} exercise - Exercise object
     * @param {array} workouts - Array of workout objects
     * @param {string} containerId - Container element ID
     */
    renderExerciseStats(exercise, workouts, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const totalSessions = workouts.length;
        let totalVolume = 0;
        let oneRepMax = '-';
        let bestSet = '-';

        if (exercise.requiresWeight) {
            // Calculate total volume
            workouts.forEach(w => {
                if (w.weight) {
                    totalVolume += w.reps * w.weight;
                }
            });

            // Calculate 1RM estimate
            const bestWorkout = workouts.reduce((best, current) => {
                const currentEstimate = estimateOneRepMax(current.weight, current.reps);
                const bestEstimate = best ? estimateOneRepMax(best.weight, best.reps) : 0;
                return currentEstimate > bestEstimate ? current : best;
            }, null);
            
            if (bestWorkout) {
                oneRepMax = estimateOneRepMax(bestWorkout.weight, bestWorkout.reps).toFixed(1);
            }

            // Find best set
            const best = workouts.reduce((best, current) => {
                return (!best || current.weight > best.weight) ? current : best;
            }, null);
            
            if (best) {
                bestSet = `${best.weight} kg × ${best.reps}`;
            }
        } else {
            // For bodyweight exercises
            const best = workouts.reduce((best, current) => {
                return (!best || current.reps > best.reps) ? current : best;
            }, null);
            
            if (best) {
                bestSet = `${best.reps} reps`;
            }
        }

        // Generate stats HTML
        const statsHTML = `
            <div class="stats-cards">
                <div class="stat-card">
                    <div class="stat-label">Total Sessions</div>
                    <div class="stat-value">${totalSessions}</div>
                </div>
                ${exercise.requiresWeight ? `
                <div class="stat-card">
                    <div class="stat-label">Est. 1RM</div>
                    <div class="stat-value">${oneRepMax} kg</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Total Volume</div>
                    <div class="stat-value">${totalVolume > 0 ? `${totalVolume.toLocaleString()} kg` : '-'}</div>
                </div>
                ` : ''}
                <div class="stat-card">
                    <div class="stat-label">Best Set</div>
                    <div class="stat-value">${bestSet}</div>
                </div>
            </div>
        `;

        container.innerHTML = statsHTML;
    },

    /**
     * Group workouts by week and calculate volume or total reps
     * @param {array} workouts - Array of workout objects
     * @param {boolean} isWeighted - Whether exercise requires weight
     * @returns {{labels: array, values: array}}
     */
    groupByWeek(workouts, isWeighted = true) {
        const weeks = new Map();

        workouts.forEach(workout => {
            const date = parseDate(workout.date);
            const weekStart = getWeekStart(date);
            const weekLabel = formatDate(weekStart);

            if (!weeks.has(weekLabel)) {
                weeks.set(weekLabel, 0);
            }

            // Calculate volume (reps × weight) for weighted exercises, or total reps for bodyweight
            const value = isWeighted && workout.weight 
                ? workout.reps * workout.weight 
                : workout.reps;
            weeks.set(weekLabel, weeks.get(weekLabel) + value);
        });

        return {
            labels: Array.from(weeks.keys()),
            values: Array.from(weeks.values())
        };
    }
};

// Remove deprecated methods - now imported from utils.js
// getWeekStart is imported
// estimateOneRepMax is imported
