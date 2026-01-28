// Charts Module
// Handles statistics visualization with Chart.js

import { Storage } from './storage.js';
import { CONFIG } from './config.js';
import { estimateOneRepMax, getWeekStart, parseDate, formatDate } from './utils.js';

export const Charts = {
    volumeChart: null,
    currentView: CONFIG.charts.defaultView,

    /**
     * Initialize charts UI
     */
    init() {
        this.bindEvents();
        this.renderExerciseTabs();
        // Listen for exercise updates
        window.addEventListener('exercisesUpdated', () => {
            this.renderExerciseTabs();
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
                // Re-render all exercise tabs
                this.renderExerciseTabs();
            });
        });
    },

    // No longer needed: populateExerciseDropdown
    // Instead, render sub-tabs for each exercise
    renderExerciseTabs() {
        const statsContent = document.getElementById('statsContent');
        if (!statsContent) return;
        // Remove all children
        statsContent.innerHTML = '';
        const exercises = Storage.getExercises();
        if (!exercises.length) return;

        // Create tab navigation
        const tabNav = document.createElement('div');
        tabNav.className = 'exercise-tabs-nav';
        exercises.forEach((exercise, idx) => {
            const tabBtn = document.createElement('button');
            tabBtn.className = 'exercise-tab-btn' + (idx === 0 ? ' active' : '');
            tabBtn.textContent = exercise.name;
            tabBtn.dataset.exerciseId = exercise.id;
            tabBtn.addEventListener('click', (e) => {
                // Switch active tab
                Array.from(tabNav.children).forEach(b => b.classList.remove('active'));
                tabBtn.classList.add('active');
                // Show only the selected tab content
                Array.from(statsContent.querySelectorAll('.exercise-tab-content')).forEach((el, i) => {
                    el.style.display = (i === idx) ? 'block' : 'none';
                });
            });
            tabNav.appendChild(tabBtn);
        });
        statsContent.appendChild(tabNav);

        // Create tab content for each exercise
        exercises.forEach((exercise, idx) => {
            const tabPane = document.createElement('div');
            tabPane.className = 'exercise-tab-content';
            tabPane.style.display = idx === 0 ? 'block' : 'none';
            tabPane.innerHTML = `<div class="chart-container"><canvas id="volumeChart-${exercise.id}"></canvas></div><div class="stats-summary" id="statsSummary-${exercise.id}"></div>`;
            statsContent.appendChild(tabPane);
            // Render volume chart for this exercise
            this.loadAndRenderVolumeChartForExercise(exercise.id, `volumeChart-${exercise.id}`, `statsSummary-${exercise.id}`);
        });
    },

    async loadAndRenderVolumeChartForExercise(exerciseId, chartCanvasId, statsSummaryId) {
        const { startDate, endDate } = this.getDateRange();
        try {
            const workouts = await Storage.getWorkoutsForExercise(exerciseId, startDate, endDate);
            // Only show if there is data
            if (!workouts.length) {
                document.getElementById(statsSummaryId).innerHTML = '<p>No data for this exercise in selected range.</p>';
                return;
            }
            this.renderVolumeChart(workouts, chartCanvasId);
            this.updateStatsSummary(workouts, statsSummaryId, exerciseId);
        } catch (error) {
            document.getElementById(statsSummaryId).innerHTML = '<p>Error loading data.</p>';
        }
    },

    /**
     * Load data and render all charts
     */
    async loadAndRenderCharts() {
        const { startDate, endDate } = this.getDateRange();
        
        try {
            // Show loading
            document.getElementById('statsContent').style.display = 'none';
            document.getElementById('noStatsMessage').style.display = 'none';
            document.getElementById('loadingIndicator').style.display = 'flex';

            // Fetch workouts for selected exercise
            const workouts = await Storage.getWorkoutsForExercise(
                this.currentExerciseId,
                startDate,
                endDate
            );

            // Hide loading
            document.getElementById('loadingIndicator').style.display = 'none';

            if (workouts.length === 0) {
                document.getElementById('noStatsMessage').innerHTML = `
                    <p>No workout data found for this exercise in the selected time range.</p>
                `;
                document.getElementById('noStatsMessage').style.display = 'block';
                return;
            }

            // Apply session limit if view is 10sessions
            const displayWorkouts = this.currentView === CONFIG.charts.defaultView 
                ? workouts.slice(-CONFIG.charts.maxSessionsView) 
                : workouts;

            document.getElementById('statsContent').style.display = 'block';

            // Render charts
            // this.renderProgressChart(displayWorkouts); // removed
            this.renderVolumeChart(displayWorkouts);
            this.updateStatsSummary(displayWorkouts);

        } catch (error) {
            console.error('Error loading chart data:', error);
            document.getElementById('loadingIndicator').style.display = 'none';
            document.getElementById('noStatsMessage').innerHTML = `
                <p>Error loading statistics. Please try again.</p>
            `;
            document.getElementById('noStatsMessage').style.display = 'block';
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
     * Render weight progression chart
     * @param {array} workouts - Array of workout objects
     */
    // renderProgressChart removed (weight progression chart is deprecated)

    /**
     * Render volume chart (weekly totals)
     * @param {array} workouts - Array of workout objects
     */
    renderVolumeChart(workouts, chartCanvasId) {
        const ctx = document.getElementById(chartCanvasId).getContext('2d');
        // Group workouts by week
        const weeklyData = this.groupByWeek(workouts);
        // Chart configuration
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: weeklyData.labels,
                datasets: [{
                    label: 'Total Volume (kg)',
                    data: weeklyData.volumes,
                    borderColor: CONFIG.charts.colors.primary,
                    backgroundColor: CONFIG.charts.colors.primaryLight,
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: CONFIG.charts.colors.primary,
                    fill: true,
                    tension: 0.2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: true
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Volume (kg)'
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
     * Group workouts by week and calculate volume
     * @param {array} workouts - Array of workout objects
     * @returns {{labels: array, volumes: array}}
     */
    groupByWeek(workouts) {
        const weeks = new Map();

        workouts.forEach(workout => {
            const date = parseDate(workout.date);
            const weekStart = getWeekStart(date);
            const weekLabel = formatDate(weekStart);

            if (!weeks.has(weekLabel)) {
                weeks.set(weekLabel, 0);
            }

            // Calculate volume (reps × weight)
            const volume = workout.weight ? workout.reps * workout.weight : 0;
            weeks.set(weekLabel, weeks.get(weekLabel) + volume);
        });

        return {
            labels: Array.from(weeks.keys()),
            volumes: Array.from(weeks.values())
        };
    },

    /**
     * Update stats summary cards
     * @param {array} workouts - Array of workout objects
     */
    updateStatsSummary(workouts) {
        const exercise = Storage.getExerciseById(this.currentExerciseId);

        // Calculate 1RM estimate from best recent set
        let oneRepMax = '-';
        if (exercise.requiresWeight) {
            const bestWorkout = workouts.reduce((best, current) => {
                const currentEstimate = estimateOneRepMax(current.weight, current.reps);
                const bestEstimate = best ? estimateOneRepMax(best.weight, best.reps) : 0;
                return currentEstimate > bestEstimate ? current : best;
            }, null);

            if (bestWorkout) {
                oneRepMax = `${estimateOneRepMax(bestWorkout.weight, bestWorkout.reps).toFixed(1)} kg`;
            }
        }

        // Total sessions
        const totalSessions = workouts.length;

        // Total volume
        let totalVolume = 0;
        workouts.forEach(w => {
            if (w.weight) {
                totalVolume += w.reps * w.weight;
            }
        });

        // Best set
        let bestSet = '-';
        if (exercise.requiresWeight) {
            const best = workouts.reduce((best, current) => {
                return (!best || current.weight > best.weight) ? current : best;
            }, null);
            if (best) {
                bestSet = `${best.weight} kg × ${best.reps}`;
            }
        } else {
            const best = workouts.reduce((best, current) => {
                return (!best || current.reps > best.reps) ? current : best;
            }, null);
            if (best) {
                bestSet = `${best.reps} reps`;
            }
        }

        // Update DOM
        document.getElementById('oneRepMax').textContent = oneRepMax;
        document.getElementById('totalSessions').textContent = totalSessions;
        document.getElementById('totalVolume').textContent = totalVolume > 0 
            ? `${totalVolume.toLocaleString()} kg` 
            : '-';
        document.getElementById('bestSet').textContent = bestSet;
    }
};

// Remove deprecated methods - now imported from utils.js
// getWeekStart is imported
// estimateOneRepMax is imported
