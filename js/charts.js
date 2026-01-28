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
        this.renderCombinedChart();
        // Listen for exercise updates
        window.addEventListener('exercisesUpdated', () => {
            this.renderCombinedChart();
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
    },

    /**
     * Render combined chart with all exercises and overview table
     */
    async renderCombinedChart() {
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

        // Create chart container
        const chartContainer = document.createElement('div');
        chartContainer.className = 'chart-container';
        chartContainer.innerHTML = '<canvas id="combinedVolumeChart"></canvas>';
        statsContent.appendChild(chartContainer);

        // Create overview table container
        const tableContainer = document.createElement('div');
        tableContainer.className = 'overview-table-container';
        tableContainer.innerHTML = '<h3>Exercise Overview</h3><div id="overviewTable"></div>';
        statsContent.appendChild(tableContainer);

        // Load and render combined data
        await this.loadAndRenderCombinedData();
    },

    /**
     * Load and render combined chart and table
     */
    async loadAndRenderCombinedData() {
        const { startDate, endDate } = this.getDateRange();
        const exercises = Storage.getExercises();
        
        try {
            // Collect data for all exercises
            const exerciseData = await Promise.all(
                exercises.map(async (exercise) => {
                    const workouts = await Storage.getWorkoutsForExercise(exercise.id, startDate, endDate);
                    return {
                        exercise,
                        workouts
                    };
                })
            );

            // Filter out exercises with no data
            const dataWithWorkouts = exerciseData.filter(d => d.workouts.length > 0);

            if (dataWithWorkouts.length === 0) {
                document.getElementById('statsContent').innerHTML = '<p class="empty-state">No workout data found in the selected time range.</p>';
                return;
            }

            // Render combined chart
            this.renderCombinedVolumeChart(dataWithWorkouts);

            // Render overview table
            this.renderOverviewTable(dataWithWorkouts);

        } catch (error) {
            console.error('Error loading combined chart data:', error);
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
     * Render combined volume chart with all exercises
     * @param {array} exerciseData - Array of {exercise, workouts} objects
     */
    renderCombinedVolumeChart(exerciseData) {
        const ctx = document.getElementById('combinedVolumeChart');
        if (!ctx) return;

        // Destroy existing chart if present
        if (this.volumeChart) {
            this.volumeChart.destroy();
        }

        // Collect all unique weeks across all exercises
        const allWeeks = new Set();
        exerciseData.forEach(({ workouts }) => {
            workouts.forEach(workout => {
                const date = parseDate(workout.date);
                const weekStart = getWeekStart(date);
                const weekLabel = formatDate(weekStart);
                allWeeks.add(weekLabel);
            });
        });

        // Sort weeks chronologically
        const sortedWeeks = Array.from(allWeeks).sort((a, b) => 
            parseDate(a).getTime() - parseDate(b).getTime()
        );

        // Generate color palette for exercises
        const colors = [
            { border: 'rgb(102, 126, 234)', bg: 'rgba(102, 126, 234, 0.1)' },
            { border: 'rgb(237, 100, 166)', bg: 'rgba(237, 100, 166, 0.1)' },
            { border: 'rgb(255, 159, 64)', bg: 'rgba(255, 159, 64, 0.1)' },
            { border: 'rgb(75, 192, 192)', bg: 'rgba(75, 192, 192, 0.1)' },
            { border: 'rgb(153, 102, 255)', bg: 'rgba(153, 102, 255, 0.1)' },
            { border: 'rgb(255, 99, 132)', bg: 'rgba(255, 99, 132, 0.1)' },
            { border: 'rgb(54, 162, 235)', bg: 'rgba(54, 162, 235, 0.1)' },
            { border: 'rgb(255, 205, 86)', bg: 'rgba(255, 205, 86, 0.1)' }
        ];

        // Create datasets for each exercise
        const datasets = exerciseData.map(({ exercise, workouts }, idx) => {
            const weeklyData = this.groupByWeek(workouts);
            const color = colors[idx % colors.length];

            // Map weekly data to sorted weeks (fill missing weeks with null)
            const data = sortedWeeks.map(week => {
                const weekIndex = weeklyData.labels.indexOf(week);
                return weekIndex >= 0 ? weeklyData.volumes[weekIndex] : null;
            });

            return {
                label: exercise.name,
                data: data,
                borderColor: color.border,
                backgroundColor: color.bg,
                borderWidth: 2,
                pointRadius: 4,
                pointBackgroundColor: color.border,
                fill: true,
                tension: 0.2,
                spanGaps: true // Connect lines even with null values
            };
        });

        // Create chart
        this.volumeChart = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: {
                labels: sortedWeeks,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Weekly Volume (kg)'
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
     * Render overview table with statistics for all exercises
     * @param {array} exerciseData - Array of {exercise, workouts} objects
     */
    renderOverviewTable(exerciseData) {
        const tableContainer = document.getElementById('overviewTable');
        if (!tableContainer) return;

        // Calculate statistics for each exercise
        const stats = exerciseData.map(({ exercise, workouts }) => {
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

            return {
                name: exercise.name,
                totalSessions,
                totalVolume,
                oneRepMax,
                bestSet,
                requiresWeight: exercise.requiresWeight
            };
        });

        // Sort by total sessions (descending)
        stats.sort((a, b) => b.totalSessions - a.totalSessions);

        // Generate table HTML
        const tableHTML = `
            <table class="overview-table">
                <thead>
                    <tr>
                        <th>Exercise</th>
                        <th>Sessions</th>
                        <th>Total Volume</th>
                        <th>Est. 1RM</th>
                        <th>Best Set</th>
                    </tr>
                </thead>
                <tbody>
                    ${stats.map(stat => `
                        <tr>
                            <td class="exercise-name">${stat.name}</td>
                            <td>${stat.totalSessions}</td>
                            <td>${stat.requiresWeight && stat.totalVolume > 0 ? `${stat.totalVolume.toLocaleString()} kg` : '-'}</td>
                            <td>${stat.requiresWeight ? `${stat.oneRepMax} kg` : '-'}</td>
                            <td>${stat.bestSet}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        tableContainer.innerHTML = tableHTML;
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
    }
};

// Remove deprecated methods - now imported from utils.js
// getWeekStart is imported
// estimateOneRepMax is imported
