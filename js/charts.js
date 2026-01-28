// Charts Module
// Handles statistics visualization with Chart.js

import { Storage } from './storage.js';
import { CONFIG } from './config.js';
import { estimateOneRepMax, getWeekStart, parseDate, formatDate } from './utils.js';

export const Charts = {
    progressChart: null,
    volumeChart: null,
    currentView: CONFIG.charts.defaultView,
    currentExerciseId: null,

    /**
     * Initialize charts UI
     */
    init() {
        this.bindEvents();
        this.populateExerciseDropdown();

        // Listen for exercise updates
        window.addEventListener('exercisesUpdated', () => {
            this.populateExerciseDropdown();
        });
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        const exerciseSelect = document.getElementById('statsExercise');
        const viewBtns = document.querySelectorAll('.view-btn');

        exerciseSelect.addEventListener('change', () => {
            this.currentExerciseId = exerciseSelect.value;
            if (this.currentExerciseId) {
                this.loadAndRenderCharts();
            }
        });

        viewBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Update active state
                viewBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Update current view
                this.currentView = btn.dataset.view;

                // Re-render charts if exercise is selected
                if (this.currentExerciseId) {
                    this.loadAndRenderCharts();
                }
            });
        });
    },

    /**
     * Populate exercise dropdown
     */
    populateExerciseDropdown() {
        const select = document.getElementById('statsExercise');
        const exercises = Storage.getExercises();

        select.innerHTML = '<option value="">-- Select Exercise --</option>';

        exercises.forEach(exercise => {
            const option = document.createElement('option');
            option.value = exercise.id;
            option.textContent = exercise.name;
            select.appendChild(option);
        });
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
            this.renderProgressChart(displayWorkouts);
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
    renderProgressChart(workouts) {
        const ctx = document.getElementById('progressChart').getContext('2d');
        const exercise = Storage.getExerciseById(this.currentExerciseId);

        // Destroy existing chart
        if (this.progressChart) {
            this.progressChart.destroy();
        }

        // Prepare data
        const labels = workouts.map(w => w.date);
        const weights = workouts.map(w => w.weight || 0);

        // Chart configuration
        this.progressChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: exercise.requiresWeight ? 'Weight (lbs)' : 'Reps',
                    data: exercise.requiresWeight ? weights : workouts.map(w => w.reps),
                    borderColor: CONFIG.charts.colors.primary,
                    backgroundColor: CONFIG.charts.colors.primaryLight,
                    tension: 0.1,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: true
                    },
                    tooltip: {
                        callbacks: {
                            afterLabel: (context) => {
                                const workout = workouts[context.dataIndex];
                                return `Reps: ${workout.reps}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: exercise.requiresWeight ? 'Weight (lbs)' : 'Reps'
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
     * Render volume chart (weekly totals)
     * @param {array} workouts - Array of workout objects
     */
    renderVolumeChart(workouts) {
        const ctx = document.getElementById('volumeChart').getContext('2d');

        // Destroy existing chart
        if (this.volumeChart) {
            this.volumeChart.destroy();
        }

        // Group workouts by week
        const weeklyData = this.groupByWeek(workouts);

        // Chart configuration
        this.volumeChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: weeklyData.labels,
                datasets: [{
                    label: 'Total Volume (lbs)',
                    data: weeklyData.volumes,
                    backgroundColor: CONFIG.charts.colors.secondary,
                    borderColor: CONFIG.charts.colors.primary,
                    borderWidth: 1
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
                            text: 'Volume (lbs)'
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
                oneRepMax = `${estimateOneRepMax(bestWorkout.weight, bestWorkout.reps).toFixed(1)} lbs`;
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
                bestSet = `${best.weight} lbs × ${best.reps}`;
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
            ? `${totalVolume.toLocaleString()} lbs` 
            : '-';
        document.getElementById('bestSet').textContent = bestSet;
    }
};

// Remove deprecated methods - now imported from utils.js
// getWeekStart is imported
// estimateOneRepMax is imported
