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
        const noStatsMessage = document.getElementById('noStatsMessage');
        if (!statsContent) return;
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
        if (noStatsMessage) noStatsMessage.style.display = 'none';

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
     * @param {string} statsSummaryId - ID of the stats summary container
     * @param {string} exerciseId - ID of the exercise
     */
    updateStatsSummary(workouts, statsSummaryId, exerciseId) {
        const exercise = Storage.getExerciseById(exerciseId);

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

        // Update DOM - create stats summary HTML
        const summaryHTML = `
            <div class="stats-cards">
                <div class="stat-card">
                    <div class="stat-label">Total Sessions</div>
                    <div class="stat-value">${totalSessions}</div>
                </div>
                ${exercise.requiresWeight ? `
                <div class="stat-card">
                    <div class="stat-label">Est. 1RM</div>
                    <div class="stat-value">${oneRepMax}</div>
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
        document.getElementById(statsSummaryId).innerHTML = summaryHTML;
    }
};

// Remove deprecated methods - now imported from utils.js
// getWeekStart is imported
// estimateOneRepMax is imported
