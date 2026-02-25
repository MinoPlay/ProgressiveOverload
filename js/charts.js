// Charts Module
// Handles statistics visualization with Chart.js

import { Storage } from './storage.js';
import { CONFIG } from './config.js';
import { calculateLinearRegression, calculateProgressPercentage, estimate1RM, findPersonalRecords, aggregateByWeek } from './chart-helpers.js';

// Register Chart.js plugins globally when available
// Plugins are loaded via CDN and auto-register with Chart.js 4.x
// The zoom and annotation plugins will be available as Chart.Zoom and Chart.Annotation

export const Charts = {
    selectedExerciseIds: JSON.parse(localStorage.getItem('selectedExerciseIds') || '[]'),
    categorySelections: JSON.parse(localStorage.getItem('categorySelections') || '{}'), // Per-category selections
    currentCategory: localStorage.getItem('currentCategory') || null,
    selectedMetric: localStorage.getItem('selectedMetric') || 'relative', // 'relative', 'volume', '1rm', 'weight'
    heatmapSort: localStorage.getItem('heatmapSort') || 'frequency', // 'frequency' or 'alphabetical'
    allExercisesData: [], // Store all exercise data

    /**
     * Initialize charts UI
     */
    init() {
        // Migrate 'volume' to 'weight'
        if (this.selectedMetric === 'volume') {
            this.selectedMetric = 'weight';
            localStorage.setItem('selectedMetric', 'weight');
        }

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
        this.setupCollapsibleHeatmap();
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

            // Render Statistics Dashboard (KPIs and Heatmap)
            this.renderDashboard(dataWithWorkouts);

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
     * Render the main statistics dashboard
     * @param {Array} dataWithWorkouts - Flattened array of exercises with their workouts
     */
    renderDashboard(dataWithWorkouts) {
        const allWorkouts = dataWithWorkouts.flatMap(d =>
            d.workouts.map(w => ({
                ...w,
                exerciseName: d.exercise.name,
                muscle: d.exercise.muscle
            }))
        );
        this.renderKPICards(dataWithWorkouts);
        this.renderMuscleBreakdown(dataWithWorkouts);
        this.renderHeatmap(dataWithWorkouts); // Passed dataWithWorkouts for the frequency matrix
        this.renderMilestones(dataWithWorkouts);
        this.renderWeeklyStats(allWorkouts);
    },

    /**
     * Render the muscle group breakdown section
     * @param {Array} dataWithWorkouts - Array of {exercise, workouts}
     */
    renderMuscleBreakdown(dataWithWorkouts) {
        const muscleGrid = document.getElementById('muscleGrid');
        if (!muscleGrid) return;

        // Date ranges
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();

        const currentMonthStart = new Date(year, month, 1).toISOString().split('T')[0];
        const prevMonthStart = new Date(year, month - 1, 1).toISOString().split('T')[0];
        const prevMonthEnd = new Date(year, month, 0).toISOString().split('T')[0];

        // Group data by muscle
        const muscleGroups = {};
        dataWithWorkouts.forEach(d => {
            const muscle = d.exercise.muscle || 'other';
            if (!muscleGroups[muscle]) {
                muscleGroups[muscle] = {
                    exercises: [],
                    muscleName: muscle,
                    currentMonthSessions: new Set(),
                    currentMonthExCount: 0,
                    prevMonthExCount: 0
                };
            }
            muscleGroups[muscle].exercises.push(d);

            d.workouts.forEach(w => {
                if (w.date >= currentMonthStart) {
                    muscleGroups[muscle].currentMonthSessions.add(w.date);
                    muscleGroups[muscle].currentMonthExCount++;
                } else if (w.date >= prevMonthStart && w.date <= prevMonthEnd) {
                    muscleGroups[muscle].prevMonthExCount++;
                }
            });
        });

        const muscleIcons = {
            'chest': 'dumbbell',
            'back': 'align-center',
            'shoulders': 'arrow-up-circle',
            'legs': 'footprints',
            'biceps': 'biceps-flexed',
            'triceps': 'biceps-flexed',
            'arms': 'biceps-flexed',
            'core': 'target',
            'neck': 'circle',
            'full-body': 'user',
            'other': 'help-circle'
        };

        const sortedMuscles = Object.keys(muscleGroups).sort();

        if (sortedMuscles.length === 0) {
            muscleGrid.innerHTML = '<p class="empty-state">No muscle group data available.</p>';
            return;
        }

        muscleGrid.innerHTML = sortedMuscles.map(muscle => {
            const group = muscleGroups[muscle];
            const sessions = group.currentMonthSessions.size;
            const exCount = group.currentMonthExCount;
            const prevExCount = group.prevMonthExCount;

            // Calculate change
            let changeText = '0%';
            let changeClass = 'neutral';
            if (prevExCount > 0) {
                const change = ((exCount - prevExCount) / prevExCount) * 100;
                changeText = `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
                changeClass = change > 0 ? 'positive' : (change < 0 ? 'negative' : 'neutral');
            } else if (exCount > 0) {
                changeText = '+100%';
                changeClass = 'positive';
            }

            const icon = muscleIcons[muscle] || 'activity';

            return `
                <div class="muscle-card">
                    <div class="muscle-card-header">
                        <i data-lucide="${icon}"></i>
                        <h5>${this.capitalize(muscle)}</h5>
                    </div>
                    <div class="muscle-card-stats">
                        <div class="muscle-card-stat">
                            <span class="label">Sessions (Month)</span>
                            <span class="value">${sessions}</span>
                        </div>
                        <div class="muscle-card-stat">
                            <span class="label">Total Exercises</span>
                            <span class="value">${exCount}</span>
                        </div>
                        <div class="muscle-card-stat">
                            <span class="label">MoM Change</span>
                            <span class="value ${changeClass}">${changeText}</span>
                        </div>
                    </div>
                    <div class="muscle-card-footer">
                        vs Prev Month: <strong>${prevExCount}</strong> exercises
                    </div>
                </div>
            `;
        }).join('');

        if (window.lucide) window.lucide.createIcons();
    },

    /**
     * Render KPI cards (Performance, PRs, Frequency)
     * @param {Array} allWorkouts - Flat array of all workouts
     */
    renderKPICards(dataWithWorkouts) {
        const kpiGrid = document.getElementById('kpiGrid');
        if (!kpiGrid) return;

        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();

        // Month start
        const monthStart = new Date(year, month, 1);
        const monthStartStr = monthStart.getFullYear() + '-' + String(monthStart.getMonth() + 1).padStart(2, '0') + '-01';

        // Week start (Monday) using helper
        const weekStart = this.getCurrentMonday();
        const weekStartStr = weekStart.toISOString().split('T')[0];

        // All workouts
        const allWorkouts = dataWithWorkouts.flatMap(d =>
            d.workouts.map(w => ({
                ...w,
                exerciseId: d.exercise.id,
                muscle: d.exercise.muscle
            }))
        );

        // Workouts this month (unique dates)
        const workoutsThisMonth = new Set(
            allWorkouts
                .filter(w => w.date >= monthStartStr)
                .map(w => w.date)
        ).size;

        // Workouts this week (unique dates)
        const workoutsThisWeek = new Set(
            allWorkouts
                .filter(w => w.date >= weekStartStr)
                .map(w => w.date)
        ).size;

        // Muscle groups trained this week
        const muscleSessions = {}; // Count unique dates (sessions) per muscle
        const muscleExercises = {}; // Count total exercises per muscle
        const weekWorkouts = allWorkouts.filter(w => w.date >= weekStartStr);

        weekWorkouts.forEach(w => {
            if (w.muscle) {
                if (!muscleSessions[w.muscle]) {
                    muscleSessions[w.muscle] = new Set();
                    muscleExercises[w.muscle] = 0;
                }
                // Treat each unique training day as 1 "session" for that muscle group
                muscleSessions[w.muscle].add(w.date);
                // Total exercises count (not unique)
                muscleExercises[w.muscle]++;
            }
        });

        // Convert to array and sort by frequency
        const sortedMuscles = Object.entries(muscleSessions)
            .map(([muscle, sessions]) => ({
                name: muscle,
                count: sessions.size,
                exCount: muscleExercises[muscle]
            }))
            .sort((a, b) => b.count - a.count);

        const muscleFocusHTML = sortedMuscles.length > 0
            ? sortedMuscles.map(m => `
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; border-bottom: 1px solid var(--border-light); padding: 4px 0;">
                    <span style="text-transform: capitalize; font-weight: 500;">${m.name.replace('-', ' ')}</span>
                    <span style="font-weight: 800; color: var(--primary-color);">${m.count} ses | ${m.exCount} ex</span>
                </div>
            `).join('')
            : '<div style="color: var(--text-light); font-style: italic; margin-top: 10px;">No sessions logged yet</div>';

        kpiGrid.innerHTML = `
            <div class="kpi-card">
                <div class="kpi-icon-row">
                    <i data-lucide="calendar-check" class="kpi-icon text-primary"></i>
                    <span class="kpi-label" title="Total unique training days this calendar month">Workouts This Month</span>
                </div>
                <div class="kpi-value">${workoutsThisMonth}</div>
                <span class="kpi-trend trend-neutral">In ${now.toLocaleString('default', { month: 'long' })}</span>
            </div>
            <div class="kpi-card">
                <div class="kpi-icon-row">
                    <i data-lucide="calendar-days" class="kpi-icon text-warning"></i>
                    <span class="kpi-label" title="Total unique training days this calendar week (Mon-Sun)">Workouts This Week</span>
                </div>
                <div class="kpi-value">${workoutsThisWeek}</div>
                <span class="kpi-trend ${workoutsThisWeek >= 3 ? 'trend-up' : 'trend-neutral'}">
                    Current week progress
                </span>
            </div>
            <div class="kpi-card" style="display: flex; flex-direction: column;">
                <div class="kpi-icon-row">
                    <i data-lucide="biceps-flexed" class="kpi-icon text-success"></i>
                    <span class="kpi-label" title="How many unique training days each muscle group has been targeted this week (s) and total exercises performed (e)">Muscle Training Sessions</span>
                </div>
                <div class="muscle-focus-list" style="flex: 1; display: flex; flex-direction: column; justify-content: flex-start; margin-top: 5px;">
                    ${muscleFocusHTML}
                </div>
                <span class="kpi-trend trend-neutral" style="margin-top: 10px;">
                    Sessions: ${sortedMuscles.reduce((sum, m) => sum + m.count, 0)} total
                </span>
            </div>
        `;

        if (window.lucide) window.lucide.createIcons();
    },


    /**
     * Render the GitHub-style training heatmap
     * @param {Array} dataWithWorkouts - Flat array of all workouts
     */
    renderHeatmap(dataWithWorkouts) {
        const matrixContainer = document.getElementById('exerciseMatrix');
        const controlsContainer = document.getElementById('heatmapControls');
        if (!matrixContainer) return;

        // Render controls if they exist
        if (controlsContainer) {
            controlsContainer.innerHTML = `
                <label>Sort By:</label>
                <div class="heatmap-sort-btns">
                    <button class="metric-btn ${this.heatmapSort === 'frequency' ? 'active' : ''}" 
                        data-sort="frequency" title="Sort by most active exercises">Frequency</button>
                    <button class="metric-btn ${this.heatmapSort === 'alphabetical' ? 'active' : ''}" 
                        data-sort="alphabetical" title="Sort alphabetically by name">A-Z</button>
                </div>
            `;

            controlsContainer.querySelectorAll('.metric-btn').forEach(btn => {
                btn.addEventListener('click', () => this.switchHeatmapSort(btn.dataset.sort));
            });
        }

        const weeksToShow = 12;
        const today = new Date();

        // Find current week's Monday
        const startOfCurrentWeek = new Date(today);
        const currentDay = today.getDay();
        const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
        startOfCurrentWeek.setDate(today.getDate() + diffToMonday);

        // Go back 11 full weeks
        const startDate = new Date(startOfCurrentWeek);
        startDate.setDate(startOfCurrentWeek.getDate() - (weeksToShow - 1) * 7);

        // Define week boundaries
        const weekRanges = [];
        for (let i = 0; i < weeksToShow; i++) {
            const wStart = new Date(startDate);
            wStart.setDate(startDate.getDate() + (i * 7));
            const wEnd = new Date(wStart);
            wEnd.setDate(wStart.getDate() + 6);
            weekRanges.push({ start: wStart, end: wEnd });
        }

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        // Start building HTML
        let html = '<div class="matrix-header">';
        html += '<span>Exercise</span>';
        weekRanges.forEach(range => {
            html += `<span>${months[range.start.getMonth()]} ${range.start.getDate()}</span>`;
        });
        html += '</div>';

        // Filter exercises to those done in the last 12 weeks
        const minDateStr = startDate.toISOString().split('T')[0];
        let activeExercises = dataWithWorkouts.filter(d =>
            d.workouts.some(w => w.date >= minDateStr)
        );

        // Calculate total sessions for each exercise for frequency sorting
        activeExercises.forEach(d => {
            const sessionsInPeriod = new Set(
                d.workouts
                    .filter(w => w.date >= minDateStr)
                    .map(w => w.date)
            );
            d.recentFrequency = sessionsInPeriod.size;
        });

        // Sort based on current preference
        if (this.heatmapSort === 'frequency') {
            activeExercises.sort((a, b) => b.recentFrequency - a.recentFrequency || a.exercise.name.localeCompare(b.exercise.name));
        } else {
            activeExercises.sort((a, b) => a.exercise.name.localeCompare(b.exercise.name));
        }

        if (activeExercises.length === 0) {
            matrixContainer.innerHTML = `<p class="empty-state">No exercise data for the last ${weeksToShow} weeks.</p>`;
            return;
        }

        activeExercises.forEach(d => {
            html += `<div class="matrix-row">`;
            html += `<div class="matrix-label" title="${d.exercise.name}">${d.exercise.name}</div>`;

            // For each week, count SESSIONS (distinct days) this exercise was done
            weekRanges.forEach(range => {
                const sStr = range.start.toISOString().split('T')[0];
                const eStr = range.end.toISOString().split('T')[0];

                const sessionDates = new Set(
                    d.workouts
                        .filter(w => w.date >= sStr && w.date <= eStr)
                        .map(w => w.date)
                );

                const count = sessionDates.size;
                let level = 0;
                if (count > 0) level = 1;      // Once a week
                if (count > 1) level = 2;      // Twice a week
                if (count > 2) level = 3;      // 3+ times a week

                const levelClass = level > 0 ? ` level-${level}` : '';
                const title = `${d.exercise.name}\nWeek of ${this.formatDate(sStr).split(',')[0]}\nSessions: ${count}`;
                html += `<div class="matrix-cell${levelClass}" title="${title}"></div>`;
            });

            html += `</div>`;
        });

        matrixContainer.innerHTML = html;
    },

    /**
     * Render the weekly aggregate statistics chart
     * @param {Array} allWorkouts - Flat array of all workouts
     */
    renderWeeklyStats(allWorkouts) {
        const canvas = document.getElementById('weeklyVolumeChart');
        if (!canvas) return;

        const weeklyData = aggregateByWeek(allWorkouts);
        // Only show last 12 weeks for the dashboard
        const displayData = weeklyData.slice(-12);

        // Get unique muscle groups from displayData
        const muscleGroups = new Set();
        displayData.forEach(week => {
            Object.keys(week.muscleGroupCounts || {}).forEach(m => muscleGroups.add(m));
        });

        const muscleColors = {
            'chest': '#ff5252',
            'back': '#448aff',
            'shoulders': '#ffab40',
            'legs': '#7c4dff',
            'biceps': '#40c4ff',
            'triceps': '#40c4ff',
            'arms': '#40c4ff',
            'core': '#69f0ae',
            'neck': '#bdbdbd',
            'full-body': '#ffd740'
        };

        const datasets = [
            {
                label: 'Training Days',
                data: displayData.map(d => d.frequency),
                backgroundColor: 'rgba(76, 175, 80, 0.4)',
                borderColor: '#4caf50',
                borderWidth: 1,
                yAxisID: 'y'
            }
        ];

        // Add a line dataset for each muscle group
        Array.from(muscleGroups).sort().forEach(muscle => {
            datasets.push({
                label: muscle.charAt(0).toUpperCase() + muscle.slice(1).replace('-', ' '),
                data: displayData.map(d => (d.muscleGroupCounts && d.muscleGroupCounts[muscle]) || 0),
                type: 'line',
                borderColor: muscleColors[muscle] || '#667eea',
                backgroundColor: muscleColors[muscle] || '#667eea',
                borderWidth: 2,
                pointRadius: 3,
                yAxisID: 'y1',
                tension: 0.3
            });
        });

        const ctx = canvas.getContext('2d');

        // Destroy existing chart if it exists
        const existingChart = Chart.getChart(canvas);
        if (existingChart) existingChart.destroy();

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: displayData.map(d => `Week of ${this.formatDate(d.weekStart).split(',')[0]}`),
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            boxWidth: 12,
                            padding: 10,
                            font: { size: 10 }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== undefined) {
                                    if (context.dataset.yAxisID === 'y1') {
                                        label += context.parsed.y + ' unique exercises';
                                    } else {
                                        label += context.parsed.y + ' training days';
                                    }
                                }
                                return label;
                            },
                            afterBody: (context) => {
                                const index = context[0].dataIndex;
                                const item = displayData[index];
                                return [
                                    `Total Monthly Workouts: ${item.frequency}`,
                                    `Weekly Volume: ${Math.round(item.totalVolume)}kg`,
                                    `Total Reps: ${item.totalReps}`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: true, text: 'Sessions (Days)' },
                        min: 0,
                        max: 7,
                        ticks: { stepSize: 1 }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: { display: true, text: 'Different Exercises' },
                        beginAtZero: true,
                        grid: { drawOnChartArea: false },
                        ticks: { stepSize: 1 }
                    },
                    x: {
                        ticks: {
                            callback: function (val, index) {
                                const label = this.getLabelForValue(val);
                                return label.replace('Week of ', '');
                            }
                        }
                    }
                }
            }
        });
    },

    /**
     * Capitalize first letter of a string
     * @param {string} s - String to capitalize
     * @returns {string} Capitalized string
     */
    capitalize(s) {
        if (typeof s !== 'string') return '';
        return s.charAt(0).toUpperCase() + s.slice(1).replace('-', ' ');
    },

    /**
     * Get the date of the current week's Monday
     * @returns {Date} Monday at 00:00:00
     */
    getCurrentMonday() {
        const today = new Date();
        const dayOfWeek = today.getDay();
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(today);
        monday.setDate(today.getDate() + diffToMonday);
        monday.setHours(0, 0, 0, 0);
        return monday;
    },

    /**
     * Render the achievements/milestones list
     * @param {Array} dataWithWorkouts - Exercises with their workouts
     */
    renderMilestones(dataWithWorkouts) {
        const milestonesSection = document.getElementById('statsMilestones');
        const milestonesList = document.getElementById('milestonesList');
        if (!milestonesSection || !milestonesList) return;

        const milestones = this.getRecentMilestones(dataWithWorkouts);

        if (milestones.length === 0) {
            milestonesSection.style.display = 'none';
            return;
        }

        milestonesSection.style.display = 'block';
        milestonesList.innerHTML = milestones.map(m => `
            <div class="milestone-item">
                <span class="milestone-date">${this.formatDate(m.date).split(',')[0]}</span>
                <span class="milestone-text">${m.text}</span>
                <span class="milestone-badge" style="background: ${m.color || '#fff8e1'}; color: ${m.textColor || '#ff8f00'};">
                    <i data-lucide="${m.icon || 'star'}" class="icon-xs"></i>
                    ${m.type}
                </span>
            </div>
        `).join('');

        if (window.lucide) window.lucide.createIcons();
    },

    /**
     * Calculate significant milestones from history focused on muscle groups
     * @param {Array} dataWithWorkouts - Exercises with their workouts
     */
    getRecentMilestones(dataWithWorkouts) {
        let milestones = [];
        const currentMonday = this.getCurrentMonday();

        // 1. Group all workouts by muscle group
        const allWorkouts = dataWithWorkouts.flatMap(d =>
            d.workouts.map(w => ({
                ...w,
                exerciseId: d.exercise.id,
                exerciseName: d.exercise.name,
                muscle: d.exercise.muscle || 'other',
                requiresWeight: d.exercise.requiresWeight
            }))
        );

        if (allWorkouts.length === 0) return [];

        // 2. Aggregate data by week across all workouts
        const weeklyStats = aggregateByWeek(allWorkouts);
        if (weeklyStats.length < 2) return [];

        const sortedWeeks = [...weeklyStats].reverse(); // Latest week first

        // 3. Get unique muscle groups seen in the data
        const muscles = [...new Set(allWorkouts.map(w => w.muscle))];

        muscles.forEach(muscle => {
            // Consistency Streak (Consecutive weeks hitting this muscle)
            let consistencyStreak = 0;
            for (let i = 0; i < sortedWeeks.length; i++) {
                const week = sortedWeeks[i];
                const hasMuscle = week.muscleGroupSessions && week.muscleGroupSessions[muscle] > 0;

                // Check for gap
                if (i > 0) {
                    const prevWeekStart = new Date(sortedWeeks[i - 1].weekStart);
                    const curWeekStart = new Date(week.weekStart);
                    const gap = Math.round((prevWeekStart - curWeekStart) / (1000 * 60 * 60 * 24));
                    if (gap !== 7) break; // Not consecutive
                }

                if (hasMuscle) {
                    consistencyStreak++;
                } else if (i === 0) {
                    // It's fine if the CURRENT week hasn't been hit yet if it just started,
                    // but usually streaks are shown for active ones.
                    // We'll only count if the latest week is hit OR the previous week was hit and current is under way.
                } else {
                    break;
                }
            }

            // Recency check: Must have trained this muscle this week or last week to show streak
            const isActive = (sortedWeeks[0].muscleGroupSessions[muscle] > 0) ||
                (sortedWeeks.length > 1 && sortedWeeks[1].muscleGroupSessions[muscle] > 0);

            if (consistencyStreak >= 3 && isActive) {
                milestones.push({
                    date: sortedWeeks[0].muscleGroupSessions[muscle] > 0 ? sortedWeeks[0].weekStart : sortedWeeks[1].weekStart,
                    text: `<strong>${this.capitalize(muscle)}</strong>: ${consistencyStreak} week consistency streak!`,
                    type: 'STREAK',
                    icon: 'flame',
                    color: '#fff1f1',
                    textColor: '#e53935',
                    priority: 10 + consistencyStreak,
                    timestamp: new Date(sortedWeeks[0].weekStart).getTime()
                });
            }

            // Volume Trend (Consecutive weeks increasing volume)
            let volumeStreak = 1;
            for (let i = 0; i < sortedWeeks.length - 1; i++) {
                const curVol = sortedWeeks[i].muscleGroupVolume[muscle] || 0;
                const prevVol = sortedWeeks[i + 1].muscleGroupVolume[muscle] || 0;

                // Check for gap
                const curM = new Date(sortedWeeks[i].weekStart);
                const preM = new Date(sortedWeeks[i + 1].weekStart);
                if (Math.round((curM - preM) / (1000 * 60 * 60 * 24)) !== 7) break;

                if (curVol > prevVol && prevVol > 0) {
                    volumeStreak++;
                } else {
                    break;
                }
            }

            if (volumeStreak >= 2 && sortedWeeks[0].muscleGroupVolume[muscle] > 0) {
                milestones.push({
                    date: sortedWeeks[0].weekStart,
                    text: `<strong>${this.capitalize(muscle)}</strong>: Volume increasing for ${volumeStreak} weeks!`,
                    type: 'TREND',
                    icon: 'trending-up',
                    color: '#e8f5e9',
                    textColor: '#2e7d32',
                    priority: 20 + volumeStreak,
                    timestamp: new Date(sortedWeeks[0].weekStart).getTime()
                });
            }
        });

        // 4. Also check for significant Personal Bests in any exercise (always nice to see)
        dataWithWorkouts.forEach(d => {
            const records = findPersonalRecords(d.workouts);
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            records.forEach(r => {
                if (new Date(r.date) >= thirtyDaysAgo) {
                    let type = '';
                    let text = '';
                    if (r.type.includes('weight')) {
                        text = `<strong>${d.exercise.name}</strong>: New heavy set! ${r.weight}kg`;
                        type = 'POWER';
                    } else if (r.type.includes('volume')) {
                        text = `<strong>${d.exercise.name}</strong>: New volume PR!`;
                        type = 'BEST';
                    }

                    if (text) {
                        milestones.push({
                            date: r.date,
                            text: text,
                            type: type,
                            icon: type === 'POWER' ? 'zap' : 'star',
                            color: '#e3f2fd',
                            textColor: '#1565c0',
                            priority: 5,
                            timestamp: new Date(r.date).getTime()
                        });
                    }
                }
            });
        });

        // Deduplicate and filter: If multiple milestones for same muscle/exercise, take highest priority
        const uniqueMilestones = [];
        const seenTexts = new Set();

        milestones
            .sort((a, b) => b.priority - a.priority || b.timestamp - a.timestamp)
            .forEach(m => {
                // Simplified deduplication based on type and muscle/exercise
                const key = m.text;
                if (!seenTexts.has(key)) {
                    seenTexts.add(key);
                    uniqueMilestones.push(m);
                }
            });

        return uniqueMilestones.slice(0, 5);
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
                        <th>vs Prev</th>
                        <th>Progress</th>
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
                <tr class="category-header-row">
                    <td colspan="${hasWeightedExercises ? 6 : 5}" style="padding: var(--spacing-md);">
                        ${this.formatEquipmentType(category)}
                    </td>
                </tr>
            `;

            // Add exercise rows for this category
            groupedExercises[category].forEach(({ exercise, workouts }) => {
                const stats = this.calculateExerciseStats(workouts, exercise.requiresWeight);
                if (!stats) return;

                const prValue = exercise.requiresWeight && stats.prReps && stats.prWeight
                    ? `${stats.prReps}x${stats.prWeight.toFixed(1)}`
                    : `${stats.maxReps} reps`;

                const trendClass = stats.trend > 0 ? 'trend-up' : (stats.trend < 0 ? 'trend-down' : 'trend-neutral');
                const trendIcon = stats.trend > 0 ? '↑' : (stats.trend < 0 ? '↓' : '→');
                const trendText = stats.trend !== 0 ? `${Math.abs(stats.trend).toFixed(1)}%` : '-';

                tableHTML += `
                    <tr>
                        <td class="exercise-name-cell">
                            <strong>${exercise.name}</strong>
                        </td>
                        <td>
                            <span class="kpi-trend ${trendClass}" style="margin: 0; white-space: nowrap;">
                                ${trendIcon} ${trendText}
                            </span>
                        </td>
                        <td style="min-width: 90px;">
                            ${this.renderSparkline(stats.maxWeights)}
                        </td>
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
        if (window.lucide) window.lucide.createIcons();
    },

    /**
     * Generate a simple SVG sparkline
     * @param {Array} values - Array of numeric values
     * @returns {string} SVG HTML string
     */
    renderSparkline(values) {
        if (!values || values.length < 2) return '<span class="text-light">-</span>';

        const width = 80;
        const height = 24;
        const padding = 2;

        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min || 1;

        const points = values.map((v, i) => {
            const x = (i / (values.length - 1)) * (width - 2 * padding) + padding;
            const y = height - ((v - min) / range) * (height - 2 * padding) - padding;
            return `${x},${y}`;
        }).join(' ');

        return `
            <svg width="${width}" height="${height}" class="sparkline" style="display: block;">
                <polyline points="${points}" fill="none" stroke="var(--primary-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
        `;
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

        // Create metric selector
        this.renderMetricSelector();

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
        const pane = document.getElementById(`category-pane-${category}`);
        if (!pane) return;

        const container = pane.querySelector('.chart-container');
        if (!container) return;

        // Get selected exercises for this category
        const selectedIds = this.categorySelections[category] || [];

        if (selectedIds.length === 0) {
            container.innerHTML = '<p class="empty-state">Select exercises from the checkboxes above to view.</p>';
            return;
        }

        // Filter to selected exercises
        const selectedData = exercisesData.filter(d => selectedIds.includes(d.exercise.id));

        if (selectedData.length === 0) {
            container.innerHTML = '<p class="empty-state">No data available for selected exercises.</p>';
            return;
        }

        // Recreate canvas
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
            let metricValues = [];
            let yAxisLabel = '';
            let titleSuffix = '';

            // Group by date to get the raw data for this exercise
            const dailyRaw = this.groupByDate(data.workouts, data.exercise.requiresWeight);

            if (this.selectedMetric === 'relative') {
                const progressPercentages = this.calculateProgressPercentage(dailyRaw.values);
                metricValues = progressPercentages;
                yAxisLabel = 'Progress (% of Baseline)';
                titleSuffix = '(% Improvement vs Baseline)';
            } else if (this.selectedMetric === 'weight') {
                metricValues = dailyRaw.maxWeights;
                yAxisLabel = data.exercise.requiresWeight ? 'Weight (kg)' : 'Max Reps';
                titleSuffix = '(Personal Record)';
            } else if (this.selectedMetric === 'reps') {
                metricValues = dailyRaw.labels.map(date => {
                    const daySets = dailyRaw.setsMap[date];
                    return daySets.reduce((sum, s) => sum + s.reps, 0);
                });
                yAxisLabel = 'Total Reps';
                titleSuffix = '(Total Repetitions)';
            }

            const alignedValues = sortedDates.map(date => {
                const dataIdx = dailyRaw.labels.indexOf(date);
                return dataIdx !== -1 ? metricValues[dataIdx] : null;
            });

            const barColor = barColors[idx % barColors.length];
            const trendColor = trendColors[idx % trendColors.length];

            // Align original sets to the dates
            const alignedSets = sortedDates.map(date => {
                return dailyRaw.setsMap[date] || null;
            });

            // Add bar chart for progress percentage
            datasets.push({
                label: data.exercise.name,
                data: alignedValues,
                originalSets: alignedSets, // Store for tooltip
                exercise: data.exercise,   // Store for tooltip
                type: 'bar',
                backgroundColor: barColor.replace(')', ', 0.6)').replace('rgb', 'rgba'),
                borderColor: barColor,
                borderWidth: 1,
                order: 2 // Bars render behind lines
            });

            // Add trend line (dotted)
            const validPoints = alignedValues
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

        // Use the suffix of the last exercise for the entire chart title
        const firstData = selectedData[0];
        let mainTitleSuffix = '';
        let yAxisLabel = 'Value';
        if (this.selectedMetric === 'relative') { mainTitleSuffix = '(% Improvement vs Baseline)'; yAxisLabel = 'Progress (% of Baseline)'; }
        else if (this.selectedMetric === 'weight') { mainTitleSuffix = '(Personal Record)'; yAxisLabel = 'Weight (kg)'; }
        else if (this.selectedMetric === 'reps') { mainTitleSuffix = '(Total Repetitions)'; yAxisLabel = 'Total Reps'; }

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
                        text: `${this.formatEquipmentType(category)} - Workout Progress Tracking ${mainTitleSuffix}`
                    },
                    tooltip: {
                        callbacks: {
                            title: (tooltipItems) => {
                                return tooltipItems[0].label;
                            },
                            label: (context) => {
                                const label = context.dataset.label || '';
                                const value = context.parsed.y;
                                if (value === null || context.dataset.type === 'line') {
                                    return `${label}: ${value?.toFixed(1)}${this.selectedMetric === 'relative' ? '%' : ''}`;
                                }

                                if (this.selectedMetric === 'relative') {
                                    const changeFromBaseline = value - 100;
                                    const changeText = changeFromBaseline >= 0
                                        ? `+${changeFromBaseline.toFixed(1)}%`
                                        : `${changeFromBaseline.toFixed(1)}%`;
                                    return `${label}: ${value.toFixed(1)}% (${changeText})`;
                                }

                                return `${label}: ${value.toFixed(1)}${this.selectedMetric === 'weight' ? (context.dataset.exercise?.requiresWeight ? 'kg' : ' reps') : (this.selectedMetric === 'reps' ? ' reps' : '')}`;
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
                            text: yAxisLabel
                        },
                        ticks: {
                            callback: (value) => {
                                if (this.selectedMetric === 'relative') return value.toFixed(0) + '%';
                                if (this.selectedMetric === 'reps') return value.toFixed(0) + ' reps';
                                return value.toFixed(0) + 'kg';
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
     * Render the metric selector buttons
     */
    renderMetricSelector() {
        const controls = document.getElementById('chartControls');
        if (!controls) return;

        controls.innerHTML = `
            <label>View Metric:</label>
            <div class="metric-btns">
                <button class="metric-btn ${this.selectedMetric === 'relative' ? 'active' : ''}" data-metric="relative" title="Progress relative to your first workouts">Relative %</button>
                <button class="metric-btn ${this.selectedMetric === 'weight' ? 'active' : ''}" data-metric="weight" title="Heaviest weight lifted (PR)">Weight (PR)</button>
                <button class="metric-btn ${this.selectedMetric === 'reps' ? 'active' : ''}" data-metric="reps" title="Total repetitions performed">Reps</button>
            </div>
        `;

        controls.querySelectorAll('.metric-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchMetric(e.target.dataset.metric);
            });
        });
    },

    /**
     * Switch the active metric for charts
     * @param {string} metric - Selected metric key
     */
    switchMetric(metric) {
        this.selectedMetric = metric;
        localStorage.setItem('selectedMetric', metric);

        // Update button active states
        document.querySelectorAll('.metric-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.metric === metric);
        });

        // Re-render chart for current category
        const category = this.currentCategory;
        const data = this.allExercisesData.filter(d => (d.exercise.equipmentType || 'other') === category);
        this.renderCategoryChart(category, data);
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
     * Set up collapsible heatmap (Exercise Breakdown)
     */
    setupCollapsibleHeatmap() {
        const toggle = document.getElementById('heatmapToggle');
        const content = document.getElementById('heatmapContent');
        const chevron = document.getElementById('heatmapChevron');

        if (!toggle || !content) return;

        // Restore saved state or default to expanded
        const savedState = localStorage.getItem('heatmapCollapsed');
        const isCollapsed = savedState === 'true';

        // Apply saved state
        content.style.display = isCollapsed ? 'none' : 'block';
        if (chevron) {
            chevron.style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
        }

        toggle.addEventListener('click', () => {
            const isHidden = content.style.display === 'none';
            content.style.display = isHidden ? 'block' : 'none';
            if (chevron) {
                chevron.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
            }
            // Save state to localStorage
            localStorage.setItem('heatmapCollapsed', !isHidden);
        });
    },

    /**
     * Switch heatmap sort preference
     * @param {string} sort - 'frequency' or 'alphabetical'
     */
    switchHeatmapSort(sort) {
        this.heatmapSort = sort;
        localStorage.setItem('heatmapSort', sort);
        this.renderHeatmap(this.allExercisesData);
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
        const maxWeights = new Map();
        const setsMap = {};

        workouts.forEach(workout => {
            const dateLabel = workout.date;

            if (!dates.has(dateLabel)) {
                dates.set(dateLabel, 0);
                maxWeights.set(dateLabel, 0);
                setsMap[dateLabel] = [];
            }

            setsMap[dateLabel].push(workout);

            // Calculate volume (reps × weight) for weighted exercises, or total reps for bodyweight
            const volumeValue = isWeighted && workout.weight
                ? workout.reps * workout.weight
                : workout.reps;
            dates.set(dateLabel, dates.get(dateLabel) + volumeValue);

            // Track max weight (PR) for the day
            const weightValue = (isWeighted && workout.weight) ? workout.weight : workout.reps;
            if (weightValue > maxWeights.get(dateLabel)) {
                maxWeights.set(dateLabel, weightValue);
            }
        });

        // Sort by date
        const sortedDates = Array.from(dates.keys()).sort((a, b) => a.localeCompare(b));

        return {
            labels: sortedDates,
            values: sortedDates.map(date => dates.get(date)),
            maxWeights: sortedDates.map(date => maxWeights.get(date)),
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
        if (totalWorkouts === 0) return null;

        const totalReps = workouts.reduce((sum, w) => sum + w.reps, 0);
        const avgReps = totalReps / totalWorkouts;

        const weightsUsed = workouts.filter(w => w.weight > 0).map(w => w.weight);
        const avgWeight = weightsUsed.length > 0
            ? weightsUsed.reduce((sum, w) => sum + w, 0) / weightsUsed.length
            : 0;

        // For bodyweight exercises, PR is max reps
        const maxReps = Math.max(...workouts.map(w => w.reps));

        // Group by date to get volume per session
        const dailyData = this.groupByDate(workouts, requiresWeight);
        const volumes = dailyData.values;
        const maxWeights = dailyData.maxWeights;

        // Calculate Trend (compare last volume to average of previous)
        let trend = 0;
        if (volumes.length >= 2) {
            const lastVolume = volumes[volumes.length - 1];
            const prevVolume = volumes[volumes.length - 2];
            if (prevVolume > 0) {
                trend = ((lastVolume - prevVolume) / prevVolume) * 100;
            }
        }

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
            prWeight,
            trend,
            volumes,
            maxWeights
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
