// Charts Module
// Handles statistics visualization with Chart.js

import { Storage } from './storage.js';
import { CONFIG } from './config.js';
import { calculateLinearRegression, calculateProgressPercentage, estimate1RM, findPersonalRecords, aggregateByWeek } from './chart-helpers.js';

// Register Chart.js plugins globally when available
// Plugins are loaded via CDN and auto-register with Chart.js 4.x
// The zoom and annotation plugins will be available as Chart.Zoom and Chart.Annotation

export const Charts = {
    selectedMuscleGroups: JSON.parse(localStorage.getItem('selectedMuscleGroups') || '[]'),
    selectedMetric: localStorage.getItem('selectedMetric') || 'relative', // 'relative', 'weight', 'reps'
    chartType: localStorage.getItem('chartType') || 'line', // 'line', 'bar'
    showPoints: localStorage.getItem('showPoints') !== 'false', // default true
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

        // Cleanup removed summary feature state
        localStorage.removeItem('summaryCollapsed');

        this.renderCombinedChart();
        // Listen for exercise updates
        window.addEventListener('exercisesUpdated', () => {
            this.renderCombinedChart();
        });

        // Listen for workout updates
        window.addEventListener('workoutsUpdated', () => {
            this.renderCombinedChart();
        });

        // Set up milestone modal
        this.setupMilestoneModal();
    },

    /**
     * Render combined chart with all exercises and overview table
     */
    async renderCombinedChart() {
        const noStatsMessage = document.getElementById('noStatsMessage');
        const categoryTabsContainer = document.getElementById('categoryTabsContainer');

        if (!categoryTabsContainer) return;

        // Hide/show elements during loading
        if (categoryTabsContainer) categoryTabsContainer.style.display = 'none';
        if (noStatsMessage) noStatsMessage.style.display = 'none';

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

            // Group exercises by muscle group
            const groupedByMuscle = this.groupExercisesByMuscle(dataWithWorkouts);

            // Apply default selections (select all muscle groups if none selected)
            if (this.selectedMuscleGroups.length === 0) {
                this.selectedMuscleGroups = Object.keys(groupedByMuscle);
                localStorage.setItem('selectedMuscleGroups', JSON.stringify(this.selectedMuscleGroups));
            }

            // Render Statistics Dashboard (KPIs, Muscle Breakdown, etc.)
            this.renderDashboard(dataWithWorkouts);

            // Render Muscle Group Progress Section (Metric selector, Muscle checkboxes, and Chart)
            this.renderMuscleGroupView(groupedByMuscle);

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

        const toDateString = (date) => date.toISOString().split('T')[0];

        const getTrendMeta = (current, previous) => {
            const delta = current - previous;

            if (delta > 0) {
                return {
                    arrow: '▲',
                    deltaText: `+${delta}`,
                    trendClass: 'trend-up'
                };
            }

            if (delta < 0) {
                return {
                    arrow: '▼',
                    deltaText: `${delta}`,
                    trendClass: 'trend-down'
                };
            }

            return {
                arrow: '▶',
                deltaText: '0',
                trendClass: 'trend-neutral'
            };
        };

        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();

        // Month start
        const monthStart = new Date(year, month, 1);
        const monthStartStr = toDateString(monthStart);
        const prevMonthStart = new Date(year, month - 1, 1);
        const prevMonthStartStr = toDateString(prevMonthStart);
        const prevMonthEnd = new Date(year, month, 0);
        const prevMonthEndStr = toDateString(prevMonthEnd);

        // Week start (Monday) using helper
        const weekStart = this.getCurrentMonday();
        const weekStartStr = toDateString(weekStart);
        const prevWeekStart = new Date(weekStart);
        prevWeekStart.setDate(prevWeekStart.getDate() - 7);
        const prevWeekStartStr = toDateString(prevWeekStart);
        const prevWeekEnd = new Date(weekStart);
        prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);
        const prevWeekEndStr = toDateString(prevWeekEnd);

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

        const workoutsPrevMonth = new Set(
            allWorkouts
                .filter(w => w.date >= prevMonthStartStr && w.date <= prevMonthEndStr)
                .map(w => w.date)
        ).size;

        // Workouts this week (unique dates)
        const workoutsThisWeek = new Set(
            allWorkouts
                .filter(w => w.date >= weekStartStr)
                .map(w => w.date)
        ).size;

        const workoutsPrevWeek = new Set(
            allWorkouts
                .filter(w => w.date >= prevWeekStartStr && w.date <= prevWeekEndStr)
                .map(w => w.date)
        ).size;

        const monthTrend = getTrendMeta(workoutsThisMonth, workoutsPrevMonth);
        const weekTrend = getTrendMeta(workoutsThisWeek, workoutsPrevWeek);

        const buildMuscleSessionSummary = (workouts) => {
            const muscleSessions = {}; // Count unique dates (sessions) per muscle
            const muscleExercises = {}; // Count unique exercises per session
            const muscleExercisesTracking = {}; // Track [exerciseId, date] combinations

            workouts.forEach(w => {
                if (w.muscle) {
                    if (!muscleSessions[w.muscle]) {
                        muscleSessions[w.muscle] = new Set();
                        muscleExercises[w.muscle] = 0;
                        muscleExercisesTracking[w.muscle] = new Set();
                    }
                    // Treat each unique training day as 1 "session" for that muscle group
                    muscleSessions[w.muscle].add(w.date);

                    // Track unique exercise instances (not sets)
                    const exerciseKey = `${w.exerciseId}_${w.date}`;
                    if (!muscleExercisesTracking[w.muscle].has(exerciseKey)) {
                        muscleExercisesTracking[w.muscle].add(exerciseKey);
                        muscleExercises[w.muscle]++;
                    }
                }
            });

            const sortedMuscles = Object.entries(muscleSessions)
                .map(([muscle, sessions]) => ({
                    name: muscle,
                    count: sessions.size,
                    exCount: muscleExercises[muscle]
                }))
                .sort((a, b) => b.count - a.count);

            const summaryByMuscle = {};
            sortedMuscles.forEach(m => {
                summaryByMuscle[m.name] = {
                    count: m.count,
                    exCount: m.exCount
                };
            });

            return {
                sortedMuscles,
                totalSessions: sortedMuscles.reduce((sum, m) => sum + m.count, 0),
                summaryByMuscle
            };
        };

        const monthWorkouts = allWorkouts.filter(w => w.date >= monthStartStr);
        const weekWorkouts = allWorkouts.filter(w => w.date >= weekStartStr);
        const prevMonthWorkouts = allWorkouts.filter(w => w.date >= prevMonthStartStr && w.date <= prevMonthEndStr);
        const prevWeekWorkouts = allWorkouts.filter(w => w.date >= prevWeekStartStr && w.date <= prevWeekEndStr);
        const monthMuscleSummary = buildMuscleSessionSummary(monthWorkouts);
        const weekMuscleSummary = buildMuscleSessionSummary(weekWorkouts);
        const prevMonthMuscleSummary = buildMuscleSessionSummary(prevMonthWorkouts);
        const prevWeekMuscleSummary = buildMuscleSessionSummary(prevWeekWorkouts);

        const headerHTML = `
            <div style="display: grid; grid-template-columns: minmax(0, 1fr) 72px 72px; align-items: center; width: 100%; border-bottom: 2px solid var(--border-light); padding: 2px 0; font-size: 0.65rem; color: var(--text-light); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700;">
                <span>Muscle Group</span>
                <span style="padding: 0 10px; width: 72px; text-align: center; display: flex; justify-content: center; box-sizing: border-box;" title="Sessions (Days)">
                    <i data-lucide="calendar" style="width: 12px; height: 12px;"></i>
                </span>
                <span style="padding: 0 10px; width: 72px; text-align: center; display: flex; justify-content: center; box-sizing: border-box;" title="Exercises Done">
                    <i data-lucide="dumbbell" style="width: 12px; height: 12px;"></i>
                </span>
            </div>`;

        const buildMuscleFocusHTML = (sortedMuscles, prevSummaryByMuscle = {}) => sortedMuscles.length > 0
            ? headerHTML + sortedMuscles.map(m => `
                ${(() => {
                    const prevCount = prevSummaryByMuscle[m.name]?.count ?? 0;
                    const prevExCount = prevSummaryByMuscle[m.name]?.exCount ?? 0;
                    const sessionTrendInfo = getTrendMeta(m.count, prevCount);
                    const exerciseTrendInfo = getTrendMeta(m.exCount, prevExCount);
                    return `
                <div style="display: grid; grid-template-columns: minmax(0, 1fr) 72px 72px; align-items: center; width: 100%; border-bottom: 1px solid var(--border-light); padding: 4px 0;">
                    <span style="text-transform: capitalize; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;">${m.name.replace('-', ' ')}</span>
                    <span style="font-weight: 800; color: var(--text-light); border-left: 1px solid var(--border-light); padding: 0 10px; width: 72px; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; font-variant-numeric: tabular-nums;" title="Sessions (Days)">${m.count}<span class="kpi-entry-trend ${sessionTrendInfo.trendClass}" title="vs previous period (${prevCount})">${sessionTrendInfo.arrow}</span></span>
                    <span style="font-weight: 800; color: var(--primary-color); border-left: 1px solid var(--border-light); padding: 0 10px; width: 72px; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; font-variant-numeric: tabular-nums;" title="Exercises Done">${m.exCount}<span class="kpi-entry-trend ${exerciseTrendInfo.trendClass}" title="vs previous period (${prevExCount})">${exerciseTrendInfo.arrow}</span></span>
                </div>
            `;
                })()}
            `).join('')
            : '<div style="color: var(--text-light); font-style: italic; margin-top: 10px;">No sessions logged yet</div>';

        const monthMuscleFocusHTML = buildMuscleFocusHTML(monthMuscleSummary.sortedMuscles, prevMonthMuscleSummary.summaryByMuscle);
        const weekMuscleFocusHTML = buildMuscleFocusHTML(weekMuscleSummary.sortedMuscles, prevWeekMuscleSummary.summaryByMuscle);

        kpiGrid.innerHTML = `
            <div class="kpi-card kpi-card--compact">
                <div class="kpi-icon-row">
                    <i data-lucide="calendar-check" class="kpi-icon text-primary"></i>
                    <span class="kpi-label" title="Unique workout days this month">Workouts</span>
                    <span style="margin-left: auto; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid var(--border-light); border-radius: 999px; padding: 2px 7px;">Month</span>
                </div>
                <div class="kpi-value">${workoutsThisMonth}</div>
                <span class="kpi-trend ${monthTrend.trendClass}"><span class="kpi-trend-comparison"><span class="kpi-trend-arrow">${monthTrend.arrow}</span><span class="kpi-trend-delta">${monthTrend.deltaText}</span></span>vs prev month (${workoutsPrevMonth})</span>
            </div>
            <div class="kpi-card kpi-card--compact">
                <div class="kpi-icon-row">
                    <i data-lucide="calendar-days" class="kpi-icon text-warning"></i>
                    <span class="kpi-label" title="Total unique training days this calendar week (Mon-Sun)">Workouts</span>
                    <span style="margin-left: auto; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid var(--border-light); border-radius: 999px; padding: 2px 7px;">Week</span>
                </div>
                <div class="kpi-value">${workoutsThisWeek}</div>
                <span class="kpi-trend ${weekTrend.trendClass}"><span class="kpi-trend-comparison"><span class="kpi-trend-arrow">${weekTrend.arrow}</span><span class="kpi-trend-delta">${weekTrend.deltaText}</span></span>vs prev week (${workoutsPrevWeek})</span>
            </div>
            <div class="kpi-card kpi-card--muscle" style="display: flex; flex-direction: column;">
                <div class="kpi-icon-row">
                    <i data-lucide="biceps-flexed" class="kpi-icon text-success"></i>
                    <span class="kpi-label" title="Training frequency and variety per muscle group this calendar month (Sessions | Exercises)">Muscle Training Sessions</span>
                    <span style="margin-left: auto; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid var(--border-light); border-radius: 999px; padding: 2px 7px;">Month</span>
                </div>
                <div class="muscle-focus-list" style="flex: 1; display: flex; flex-direction: column; justify-content: flex-start; margin-top: 5px;">
                    ${monthMuscleFocusHTML}
                </div>
                <span class="kpi-trend trend-neutral" style="margin-top: 10px;">
                    Sessions: ${monthMuscleSummary.totalSessions} total
                </span>
            </div>
            <div class="kpi-card kpi-card--muscle" style="display: flex; flex-direction: column;">
                <div class="kpi-icon-row">
                    <i data-lucide="biceps-flexed" class="kpi-icon text-success"></i>
                    <span class="kpi-label" title="Training frequency and variety per muscle group this week (Sessions | Exercises)">Muscle Training Sessions</span>
                    <span style="margin-left: auto; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid var(--border-light); border-radius: 999px; padding: 2px 7px;">Week</span>
                </div>
                <div class="muscle-focus-list" style="flex: 1; display: flex; flex-direction: column; justify-content: flex-start; margin-top: 5px;">
                    ${weekMuscleFocusHTML}
                </div>
                <span class="kpi-trend trend-neutral" style="margin-top: 10px;">
                    Sessions: ${weekMuscleSummary.totalSessions} total
                </span>
            </div>
        `;

        if (window.lucide) window.lucide.createIcons();
    },



    /**
     * Render the weekly aggregate statistics charts
     * @param {Array} allWorkouts - Flat array of all workouts
     */
    renderWeeklyStats(allWorkouts) {
        const freqCanvas = document.getElementById('weeklyFrequencyChart');
        const muscleCanvas = document.getElementById('weeklyMuscleChart');
        if (!freqCanvas || !muscleCanvas) return;

        const weeklyData = aggregateByWeek(allWorkouts);
        // Only show last 12 weeks for the dashboard
        const displayData = weeklyData.slice(-12);

        const labels = displayData.map(d => {
            const info = this.getWeekNumber(d.weekStart);
            return `W${String(info.week).padStart(2, '0')}`;
        });

        // 1. Render Training Frequency Chart
        this.renderFrequencyChart(freqCanvas, displayData, labels);

        // 2. Render Muscle Group Activity Chart
        this.renderMuscleActivityChart(muscleCanvas, displayData, labels);
    },

    /**
     * Render the training frequency bar chart
     */
    renderFrequencyChart(canvas, displayData, labels) {
        const ctx = canvas.getContext('2d');
        const existingChart = Chart.getChart(canvas);
        if (existingChart) existingChart.destroy();

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Training Days',
                    data: displayData.map(d => d.frequency),
                    backgroundColor: 'rgba(76, 175, 80, 0.4)',
                    borderColor: '#4caf50',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            afterBody: (context) => {
                                const item = displayData[context[0].dataIndex];
                                return [
                                    `Total Volume: ${Math.round(item.totalVolume)}kg`,
                                    `Total Reps: ${item.totalReps}`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 7,
                        ticks: { stepSize: 1 },
                        title: { display: true, text: 'Days/Week' }
                    }
                }
            }
        });
    },

    /**
     * Render the muscle group activity line chart
     */
    renderMuscleActivityChart(canvas, displayData, labels) {
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

        const datasets = Array.from(muscleGroups).sort().map(muscle => ({
            label: muscle.charAt(0).toUpperCase() + muscle.slice(1).replace('-', ' '),
            data: displayData.map(d => (d.muscleGroupCounts && d.muscleGroupCounts[muscle]) || 0),
            borderColor: muscleColors[muscle] || '#667eea',
            backgroundColor: muscleColors[muscle] || '#667eea',
            borderWidth: 2,
            pointRadius: 3,
            tension: 0.3,
            fill: false
        }));

        const ctx = canvas.getContext('2d');
        const existingChart = Chart.getChart(canvas);
        if (existingChart) existingChart.destroy();

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { boxWidth: 10, font: { size: 10 } }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: (context) => `${context.dataset.label}: ${context.parsed.y} exercises`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 },
                        title: { display: true, text: 'Unique Exercises' }
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
        milestonesList.innerHTML = '';

        milestones.forEach((m, index) => {
            const milestoneEl = document.createElement('div');
            milestoneEl.className = 'milestone-item';
            milestoneEl.title = 'Click to see details';
            milestoneEl.innerHTML = `
                <span class="milestone-date">${this.formatDate(m.date).split(',')[0]}</span>
                <span class="milestone-text">${m.text}</span>
                <span class="milestone-badge" style="background: ${m.color || '#fff8e1'}; color: ${m.textColor || '#ff8f00'};">
                    <i data-lucide="${m.icon || 'star'}" class="icon-xs"></i>
                    ${m.type}
                </span>
            `;
            milestoneEl.addEventListener('click', () => this.showMilestoneDetails(m));
            milestonesList.appendChild(milestoneEl);
        });

        if (window.lucide) window.lucide.createIcons();
    },

    /**
     * Show detailed data for a milestone in a modal
     * @param {Object} milestone - Milestone object with details
     */
    showMilestoneDetails(milestone) {
        const modal = document.getElementById('milestoneModal');
        const title = document.getElementById('milestoneModalTitle');
        const body = document.getElementById('milestoneModalBody');

        if (!modal || !body || !milestone.details) return;

        title.textContent = milestone.details.title || 'Milestone Details';

        let html = '';
        if (milestone.details.subtitle) {
            html += `<p style="margin-bottom: 20px; color: var(--text-secondary);">${milestone.details.subtitle}</p>`;
        }

        html += `
            <table class="milestone-detail-table">
                <thead>
                    <tr>
                        ${milestone.details.headers.map(h => `<th>${h}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${milestone.details.rows.map((row, i) => `
                        <tr class="milestone-detail-row ${i === 0 ? 'highlight' : ''}">
                            ${row.map(cell => `<td>${cell}</td>`).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        body.innerHTML = html;
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden'; // Prevent scrolling
    },

    /**
     * Setup milestone modal close listeners
     */
    setupMilestoneModal() {
        const modal = document.getElementById('milestoneModal');
        const closeBtn = document.getElementById('closeMilestoneModal');
        if (!modal || !closeBtn) return;

        const closeModal = () => {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        };

        closeBtn.onclick = closeModal;

        // Close on outside click
        modal.onclick = (e) => {
            if (e.target === modal) closeModal();
        };

        // Close on Escape key
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'flex') {
                closeModal();
            }
        });
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
            let streakDetails = [];
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
                    streakDetails.push({
                        week: week.weekStart,
                        count: week.muscleGroupSessions[muscle],
                        label: 'Sessions'
                    });
                } else if (i === 0) {
                    // It's fine if current week isn't hit yet
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
                    timestamp: new Date(sortedWeeks[0].weekStart).getTime(),
                    details: {
                        title: `${this.capitalize(muscle)} Consistency`,
                        subtitle: `Active streak since ${this.formatDate(streakDetails[streakDetails.length - 1].week).split(',')[0]}`,
                        headers: ['Week Starting', 'Sessions'],
                        rows: streakDetails.map(d => [this.formatDate(d.week).split(',')[0], d.count])
                    }
                });
            }

            // Volume Trend (Consecutive weeks increasing volume)
            let volumeStreak = 1;
            let trendDetails = [];
            if (sortedWeeks.length > 0 && sortedWeeks[0].muscleGroupVolume[muscle] > 0) {
                trendDetails.push({
                    week: sortedWeeks[0].weekStart,
                    volume: sortedWeeks[0].muscleGroupVolume[muscle]
                });
            }

            for (let i = 0; i < sortedWeeks.length - 1; i++) {
                const curVol = sortedWeeks[i].muscleGroupVolume[muscle] || 0;
                const prevVol = sortedWeeks[i + 1].muscleGroupVolume[muscle] || 0;

                // Check for gap
                const curM = new Date(sortedWeeks[i].weekStart);
                const preM = new Date(sortedWeeks[i + 1].weekStart);
                if (Math.round((curM - preM) / (1000 * 60 * 60 * 24)) !== 7) break;

                if (curVol > prevVol && prevVol > 0) {
                    volumeStreak++;
                    trendDetails.push({
                        week: sortedWeeks[i + 1].weekStart,
                        volume: sortedWeeks[i + 1].muscleGroupVolume[muscle]
                    });
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
                    timestamp: new Date(sortedWeeks[0].weekStart).getTime(),
                    details: {
                        title: `${this.capitalize(muscle)} Volume Trend`,
                        subtitle: `${volumeStreak} weeks of progressive overload`,
                        headers: ['Week Starting', 'Total Volume (kg)'],
                        rows: trendDetails.map(d => [this.formatDate(d.week).split(',')[0], `${Math.round(d.volume)}kg`])
                    }
                });
            }
        });

        // 4. Also check for significant Personal Bests in any exercise (always nice to see)
        dataWithWorkouts.forEach(d => {
            const records = findPersonalRecords(d.workouts);
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            records.forEach(r => {
                if (r.date >= thirtyDaysAgo.toISOString().split('T')[0]) {
                    let type = '';
                    let text = '';
                    let details = null;

                    if (r.type.includes('weight')) {
                        text = `<strong>${d.exercise.name}</strong>: New heavy set! ${r.weight}kg`;
                        type = 'POWER';
                        details = {
                            title: `New Personal Record: ${d.exercise.name}`,
                            subtitle: `Achieved on ${this.formatDate(r.date).split(',')[0]}`,
                            headers: ['Metric', 'Value'],
                            rows: [
                                ['Weight', `${r.weight}kg`],
                                ['Reps', r.reps],
                                ['Est. 1RM', `${Math.round(estimate1RM(r.weight, r.reps))}kg`]
                            ]
                        };
                    } else if (r.type.includes('volume')) {
                        text = `<strong>${d.exercise.name}</strong>: New volume PR!`;
                        type = 'BEST';
                        details = {
                            title: `Volume PR: ${d.exercise.name}`,
                            subtitle: `Achieved on ${this.formatDate(r.date).split(',')[0]}`,
                            headers: ['Metric', 'Value'],
                            rows: [
                                ['Daily Volume', `${Math.round(r.volume)}kg`],
                                ['Max Weight (Day)', `${r.maxWeight}kg`]
                            ]
                        };
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
                            timestamp: new Date(r.date).getTime(),
                            details: details
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
     * Group exercises by muscle group
     * @param {Array} exercisesData - Array of {exercise, workouts} objects
     * @returns {Object} Exercises grouped by muscle
     */
    groupExercisesByMuscle(exercisesData) {
        const grouped = {};

        exercisesData.forEach(data => {
            const muscle = data.exercise.muscle || 'other';
            if (!grouped[muscle]) {
                grouped[muscle] = [];
            }
            grouped[muscle].push(data);
        });

        // Sort muscle groups alphabetically
        const sortedGrouped = {};
        Object.keys(grouped).sort().forEach(muscle => {
            sortedGrouped[muscle] = grouped[muscle];
            // Sort exercises within each muscle group alphabetically
            sortedGrouped[muscle].sort((a, b) =>
                a.exercise.name.localeCompare(b.exercise.name)
            );
        });

        return sortedGrouped;
    },


    /**
     * Render the Muscle Group view section
     * @param {Object} groupedByMuscle - Exercises grouped by muscle
     */
    renderMuscleGroupView(groupedByMuscle) {
        const categoryTabsContainer = document.getElementById('categoryTabsContainer');
        const categoryTabs = document.getElementById('categoryTabs');
        const categoryTabContent = document.getElementById('categoryTabContent');

        if (!categoryTabs || !categoryTabContent) return;

        // Hide old tabs and repurpose them for a single "Overview" layout
        categoryTabs.style.display = 'none';
        categoryTabContent.innerHTML = '';

        // Always select all muscle groups
        this.selectedMuscleGroups = Object.keys(groupedByMuscle);

        // Create metric selector
        this.renderMetricSelector();

        // Create main pane
        const pane = document.createElement('div');
        pane.className = 'category-tab-pane active';

        // Create chart container (no muscle selector UI)
        const chartContainer = document.createElement('div');
        chartContainer.className = 'category-chart-container';
        chartContainer.innerHTML = `
            <div class="chart-container" style="height: 450px;">
                <canvas id="muscleGroupChart"></canvas>
            </div>
        `;
        pane.appendChild(chartContainer);

        categoryTabContent.appendChild(pane);

        // Show the container
        categoryTabsContainer.style.display = 'block';

        // Render chart
        this.renderMuscleGroupChart(groupedByMuscle);
    },

    /**
     * Create muscle group checkbox selector
     */
    createMuscleGroupSelector(groupedByMuscle) {
        const container = document.createElement('div');
        container.className = 'category-exercise-selector';

        const header = document.createElement('div');
        header.className = 'category-selector-header';
        header.innerHTML = `
            <h4>
                <span class="chevron" style="display: inline-block; transition: transform 0.3s ease;">▼</span>
                Select Muscle Groups to View
            </h4>
            <div class="selector-actions">
                <button class="btn btn-small btn-secondary toggle-all-btn">Select All</button>
            </div>
        `;

        const checkboxContainer = document.createElement('div');
        checkboxContainer.className = 'category-checkboxes';
        checkboxContainer.style.display = 'grid';
        checkboxContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(140px, 1fr))';

        Object.keys(groupedByMuscle).forEach(muscle => {
            const label = document.createElement('label');
            label.className = 'category-checkbox-label';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = muscle;
            checkbox.checked = this.selectedMuscleGroups.includes(muscle);
            checkbox.className = 'muscle-checkbox';
            checkbox.addEventListener('change', (e) => {
                this.handleMuscleCheckboxChange(muscle, e.target.checked, groupedByMuscle);
            });

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(' ' + this.capitalize(muscle)));
            checkboxContainer.appendChild(label);
        });

        container.appendChild(header);
        container.appendChild(checkboxContainer);

        // Set up toggle all button
        const toggleBtn = header.querySelector('.toggle-all-btn');
        const updateToggleBtnText = () => {
            const allChecked = this.selectedMuscleGroups.length === Object.keys(groupedByMuscle).length;
            toggleBtn.textContent = allChecked ? 'Deselect All' : 'Select All';
        };

        // Initial text
        updateToggleBtnText();

        toggleBtn.addEventListener('click', () => {
            const allChecked = this.selectedMuscleGroups.length === Object.keys(groupedByMuscle).length;
            if (allChecked) {
                this.selectedMuscleGroups = [];
            } else {
                this.selectedMuscleGroups = Object.keys(groupedByMuscle);
            }
            localStorage.setItem('selectedMuscleGroups', JSON.stringify(this.selectedMuscleGroups));

            // Update UI
            container.querySelectorAll('.muscle-checkbox').forEach(cb => cb.checked = !allChecked);
            updateToggleBtnText();
            this.renderMuscleGroupChart(groupedByMuscle);
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
     * Handle muscle checkbox change
     */
    handleMuscleCheckboxChange(muscle, checked, groupedByMuscle) {
        if (checked) {
            if (!this.selectedMuscleGroups.includes(muscle)) {
                this.selectedMuscleGroups.push(muscle);
            }
        } else {
            this.selectedMuscleGroups = this.selectedMuscleGroups.filter(m => m !== muscle);
        }

        localStorage.setItem('selectedMuscleGroups', JSON.stringify(this.selectedMuscleGroups));

        // Update Select All button text if it exists
        const toggleBtn = document.querySelector('.toggle-all-btn');
        if (toggleBtn) {
            const allChecked = this.selectedMuscleGroups.length === Object.keys(groupedByMuscle).length;
            toggleBtn.textContent = allChecked ? 'Deselect All' : 'Select All';
        }

        this.renderMuscleGroupChart(groupedByMuscle);
    },

    /**
     * Render the muscle group progress chart
     */
    renderMuscleGroupChart(groupedByMuscle) {
        const chartContainer = document.querySelector('.category-chart-container .chart-container');
        if (!chartContainer) return;

        if (this.selectedMuscleGroups.length === 0) {
            chartContainer.innerHTML = '<p class="empty-state">Select muscle groups from the list above to view progress.</p>';
            return;
        }

        // Ensure canvas exists (it might have been replaced by the empty-state message)
        let canvas = document.getElementById('muscleGroupChart');
        if (!canvas || chartContainer.querySelector('.empty-state')) {
            chartContainer.innerHTML = '<canvas id="muscleGroupChart"></canvas>';
            canvas = document.getElementById('muscleGroupChart');
        }

        const ctx = canvas.getContext('2d');
        const existingChart = Chart.getChart(canvas);
        if (existingChart) existingChart.destroy();

        // Color palette for muscle groups
        const colors = {
            'chest': '#ff5252',
            'back': '#448aff',
            'shoulders': '#ffab40',
            'legs': '#7c4dff',
            'biceps': '#00bcd4',
            'triceps': '#667eea',
            'arms': '#40c4ff',
            'core': '#69f0ae',
            'neck': '#bdbdbd',
            'other': '#607d8b'
        };

        // Helper: get ISO week number and year from a date string
        const getISOWeekKey = (dateStr) => {
            const d = new Date(dateStr + 'T00:00:00');
            const dayOfWeek = d.getDay() === 0 ? 7 : d.getDay(); // Mon=1 … Sun=7
            const thursday = new Date(d);
            thursday.setDate(d.getDate() + (4 - dayOfWeek));
            const yearStart = new Date(thursday.getFullYear(), 0, 1);
            const week = Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7);
            return { year: thursday.getFullYear(), week, key: `${thursday.getFullYear()}-W${String(week).padStart(2, '0')}` };
        };

        // Collect all dates and group them into ISO weeks
        const allDates = new Set();
        this.selectedMuscleGroups.forEach(muscle => {
            const workouts = (groupedByMuscle[muscle] || []).flatMap(d => d.workouts);
            workouts.forEach(w => allDates.add(w.date));
        });
        const sortedDates = Array.from(allDates).sort();

        // Build sorted list of unique week keys
        const weekKeySet = new Set();
        const weekKeyInfo = {}; // key -> { year, week }
        sortedDates.forEach(date => {
            const info = getISOWeekKey(date);
            weekKeySet.add(info.key);
            weekKeyInfo[info.key] = info;
        });
        const sortedWeekKeys = Array.from(weekKeySet).sort();
        const weekLabels = sortedWeekKeys.map(k => `W${weekKeyInfo[k].week}`);

        const datasets = this.selectedMuscleGroups.map(muscle => {
            const exercisesInMuscle = groupedByMuscle[muscle] || [];

            // Aggregate values per ISO week
            const weekValues = sortedWeekKeys.map(weekKey => {
                // Find all dates belonging to this week for this muscle
                const weekDates = sortedDates.filter(date => getISOWeekKey(date).key === weekKey);
                const weekWorkouts = exercisesInMuscle.flatMap(ex =>
                    ex.workouts.filter(w => weekDates.includes(w.date))
                );
                if (weekWorkouts.length === 0) return null;

                if (this.selectedMetric === 'relative') {
                    let totalProgress = 0;
                    let count = 0;
                    exercisesInMuscle.forEach(({ exercise, workouts }) => {
                        const weekSets = workouts.filter(w => weekDates.includes(w.date));
                        if (weekSets.length > 0) {
                            const dailyRaw = this.groupByDate(workouts, exercise.requiresWeight);
                            const baselineCount = Math.min(3, dailyRaw.values.length);
                            const baseline = dailyRaw.values.slice(0, baselineCount).reduce((sum, v) => sum + v, 0) / baselineCount;
                            if (baseline > 0) {
                                const weekVol = weekSets.reduce((sum, w) =>
                                    sum + (exercise.requiresWeight && w.weight ? w.reps * w.weight : w.reps), 0);
                                totalProgress += (weekVol / baseline) * 100;
                                count++;
                            }
                        }
                    });
                    return count > 0 ? totalProgress / count : null;
                } else if (this.selectedMetric === 'weight') {
                    return weekWorkouts.reduce((sum, w) => sum + (w.weight ? w.reps * w.weight : w.reps), 0);
                } else if (this.selectedMetric === 'reps') {
                    return weekWorkouts.reduce((sum, w) => sum + w.reps, 0);
                }
                return null;
            });

            return {
                label: this.capitalize(muscle),
                data: weekValues,
                borderColor: colors[muscle] || '#667eea',
                backgroundColor: colors[muscle] || '#667eea',
                borderWidth: 3,
                pointRadius: 0,
                pointHoverRadius: 4,
                tension: 0.4,
                spanGaps: true,
                fill: false
            };
        });

        let yAxisLabel = '';
        if (this.selectedMetric === 'relative') yAxisLabel = 'Progress (% of Baseline)';
        else if (this.selectedMetric === 'weight') yAxisLabel = 'Total Volume (kg)';
        else if (this.selectedMetric === 'reps') yAxisLabel = 'Total Reps';

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: weekLabels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            title: (contexts) => {
                                if (!contexts.length) return '';
                                const idx = contexts[0].dataIndex;
                                const wk = weekKeyInfo[sortedWeekKeys[idx]];
                                return `Week ${wk.week}, ${wk.year}`;
                            },
                            label: (context) => {
                                let val = context.parsed.y;
                                if (val === null) return null;
                                let suffix = this.selectedMetric === 'relative' ? '%' : (this.selectedMetric === 'weight' ? ' kg' : ' reps');
                                return `${context.dataset.label}: ${val.toFixed(1)}${suffix}`;
                            }
                        }
                    },
                    title: {
                        display: true,
                        text: `Muscle Group Progress Trend - ${this.capitalize(this.selectedMetric)}`
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        title: { display: true, text: yAxisLabel }
                    },
                    x: {
                        title: { display: true, text: 'Week' }
                    }
                }
            }
        });
    },


    /**
     * Render the metric selector and chart display settings (combined into one row)
     */
    renderMetricSelector() {
        const controls = document.getElementById('chartControls');
        if (!controls) return;

        controls.innerHTML = `
            <div style="display: flex; align-items: center; gap: var(--spacing-md); flex-wrap: wrap; width: 100%;">
                <label style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); white-space: nowrap;">View Metric:</label>
                <div class="metric-btns">
                    <button class="metric-btn ${this.selectedMetric === 'relative' ? 'active' : ''}" data-metric="relative" title="Progress relative to your first workouts">Relative %</button>
                    <button class="metric-btn ${this.selectedMetric === 'weight' ? 'active' : ''}" data-metric="weight" title="Heaviest weight lifted (PR)">Weight (PR)</button>
                    <button class="metric-btn ${this.selectedMetric === 'reps' ? 'active' : ''}" data-metric="reps" title="Total repetitions performed">Reps</button>
                </div>
            </div>
        `;

        // Metric handlers
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

        // Re-render chart
        const groupedByMuscle = this.groupExercisesByMuscle(this.allExercisesData);
        this.renderMuscleGroupChart(groupedByMuscle);
    },

    /**
     * Switch the active chart type
     * @param {string} type - 'line' or 'bar'
     */
    switchChartType(type) {
        this.chartType = type;
        localStorage.setItem('chartType', type);

        // Update UI
        document.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === type);
        });

        const pointsSetting = document.getElementById('pointsSetting');
        if (pointsSetting) {
            pointsSetting.style.display = type === 'line' ? 'flex' : 'none';
        }

        const groupedByMuscle = this.groupExercisesByMuscle(this.allExercisesData);
        this.renderMuscleGroupChart(groupedByMuscle);
    },

    /**
     * Toggle visibility of points on line charts
     * @param {boolean} show - Whether to show points
     */
    togglePoints(show) {
        this.showPoints = show;
        localStorage.setItem('showPoints', show);

        const groupedByMuscle = this.groupExercisesByMuscle(this.allExercisesData);
        this.renderMuscleGroupChart(groupedByMuscle);
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
    },

    /**
     * Get the week number (ISO-8601) for a date
     * @param {string|Date} dateInput - Date string (YYYY-MM-DD) or Date object
     * @returns {Object} { week: number, year: number }
     */
    getWeekNumber(dateInput) {
        let y, m, d;
        if (typeof dateInput === 'string') {
            const parts = dateInput.split('-');
            y = parseInt(parts[0], 10);
            m = parseInt(parts[1], 10) - 1;
            d = parseInt(parts[2], 10);
        } else {
            y = dateInput.getFullYear();
            m = dateInput.getMonth();
            d = dateInput.getDate();
        }

        const date = new Date(Date.UTC(y, m, d));
        // ISO week date helper: Thursday in current week decides the year.
        const dayNum = date.getUTCDay() || 7;
        date.setUTCDate(date.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
        return {
            week: weekNo,
            year: date.getUTCFullYear()
        };
    }
};
