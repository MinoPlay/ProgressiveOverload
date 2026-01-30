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
        
        exercisesData.forEach(({ exercise }) => {
            const label = document.createElement('label');
            label.className = 'comparison-checkbox-label';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = exercise.id;
            checkbox.checked = this.selectedExerciseIds.includes(exercise.id);
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.selectedExerciseIds.push(exercise.id);
                } else {
                    this.selectedExerciseIds = this.selectedExerciseIds.filter(id => id !== exercise.id);
                }
                localStorage.setItem('selectedExerciseIds', JSON.stringify(this.selectedExerciseIds));
                this.renderUnifiedChart();
            });
            
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(' ' + exercise.name));
            container.appendChild(label);
        });
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
    }
};
