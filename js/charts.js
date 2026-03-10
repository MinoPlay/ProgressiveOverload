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
    weekNavOffset: 0, // 0 = current week, -1 = one week back, etc.
    monthNavOffset: 0, // 0 = current month, -1 = one month back, etc.
    _cachedDataWithWorkouts: null, // Cached for week navigation re-render
    _cachedAllWorkouts: null, // Cached flat workouts for radar re-render

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

        // Re-render charts when theme changes so grid/label colors update
        window.addEventListener('themeChanged', () => {
            this.renderCombinedChart();
        });

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
        // Cache for week navigation
        this._cachedDataWithWorkouts = dataWithWorkouts;
        this._cachedAllWorkouts = allWorkouts;

        this.renderKPICards(dataWithWorkouts);
        this.renderWeeklyStats(allWorkouts);

        // Radar charts — filter by navigated week and navigated month
        const { weekStartStr, weekEndStr } = this._getNavWeekBounds();
        const { monthStartStr: radarMonthStart, monthEndStr: radarMonthEnd } = this._getNavMonthBounds();
        this.renderMuscleRadarChart('muscleRadarWeekChart', allWorkouts.filter(w => w.date >= weekStartStr && w.date <= weekEndStr), 'sessions');
        this.renderMuscleRadarChart('muscleRadarWeekExerciseChart', allWorkouts.filter(w => w.date >= weekStartStr && w.date <= weekEndStr), 'exercises');
        this.renderMuscleRadarChart('muscleRadarMonthChart', allWorkouts.filter(w => w.date >= radarMonthStart && w.date <= radarMonthEnd), 'sessions');
        this.renderMuscleRadarChart('muscleRadarMonthExerciseChart', allWorkouts.filter(w => w.date >= radarMonthStart && w.date <= radarMonthEnd), 'exercises');

        // Period tab switching (Weekly / Monthly / Overall)
        const tabsEl = document.getElementById('statsPeriodTabs');
        if (tabsEl && !tabsEl._tabsInit) {
            tabsEl._tabsInit = true;

            const activatePeriod = (period) => {
                tabsEl.querySelectorAll('.stats-period-tab-btn').forEach(b =>
                    b.classList.toggle('active', b.dataset.period === period)
                );
                const weekPanel = document.getElementById('statsPanelWeekly');
                const monthPanel = document.getElementById('statsPanelMonthly');
                const overallPanel = document.getElementById('statsPanelOverall');
                weekPanel.classList.toggle('inactive', period !== 'weekly');
                monthPanel.classList.toggle('inactive', period !== 'monthly');
                if (overallPanel) overallPanel.classList.toggle('inactive', period !== 'overall');

                // Re-render weekly stats charts when Overall panel becomes visible
                // (they render at 0×0 if the panel was hidden on first render)
                if (period === 'overall' && this._cachedAllWorkouts) {
                    requestAnimationFrame(() => this.renderWeeklyStats(this._cachedAllWorkouts));
                }

                window.dispatchEvent(new Event('resize'));
            };

            // Restore last-used tab (default: weekly)
            const savedPeriod = localStorage.getItem('statsPeriodTab') || 'weekly';
            activatePeriod(savedPeriod);

            tabsEl.addEventListener('click', (e) => {
                const btn = e.target.closest('.stats-period-tab-btn');
                if (!btn) return;
                const period = btn.dataset.period;
                localStorage.setItem('statsPeriodTab', period);
                activatePeriod(period);
            });
        }

        this._setupWeekNavigation();
        this._updateWeekNavLabel();
        this._setupMonthNavigation();
        this._updateMonthNavLabel();
    },

    /**
     * Render KPI cards (workout counts and muscle session summaries)
     * @param {Array} dataWithWorkouts - Array of {exercise, workouts}
     */
    renderKPICards(dataWithWorkouts) {
        const kpiGrid = document.getElementById('kpiGrid');
        if (!kpiGrid) return;

        const collapseStateKey = (period) => `sessionsPerMuscleCollapsed:${period}`;
        const isMuscleCardCollapsed = (period) => {
            const saved = localStorage.getItem(collapseStateKey(period));
            if (saved === null) return true;
            return saved === 'true';
        };
        const wireMuscleCardCollapseState = (container) => {
            if (!container) return;
            const detailsEl = container.querySelector('.muscle-card-collapse');
            if (!detailsEl) return;

            const period = detailsEl.dataset.period;
            detailsEl.open = !isMuscleCardCollapsed(period);

            detailsEl.addEventListener('toggle', () => {
                localStorage.setItem(collapseStateKey(period), String(!detailsEl.open));
            });
        };

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

        // Month bounds with nav offset
        const { monthStartStr, monthEndStr } = this._getNavMonthBounds();
        const navMonthDate = new Date(year, month + this.monthNavOffset, 1);
        const prevMonthStart = new Date(navMonthDate.getFullYear(), navMonthDate.getMonth() - 1, 1);
        const prevMonthStartStr = toDateString(prevMonthStart);
        const prevMonthEnd = new Date(navMonthDate.getFullYear(), navMonthDate.getMonth(), 0);
        const prevMonthEndStr = toDateString(prevMonthEnd);

        // Week start (Monday) using helper + nav offset
        const weekStart = this.getCurrentMonday();
        weekStart.setDate(weekStart.getDate() + this.weekNavOffset * 7);
        const weekStartStr = toDateString(weekStart);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const weekEndStr = toDateString(weekEnd);
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

        // Workouts this month (unique dates, bounded to the navigated month)
        const workoutsThisMonth = new Set(
            allWorkouts
                .filter(w => w.date >= monthStartStr && w.date <= monthEndStr)
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

        const monthWorkouts = allWorkouts.filter(w => w.date >= monthStartStr && w.date <= monthEndStr);
        const weekWorkouts = allWorkouts.filter(w => w.date >= weekStartStr && w.date <= weekEndStr);
        const prevMonthWorkouts = allWorkouts.filter(w => w.date >= prevMonthStartStr && w.date <= prevMonthEndStr);
        const prevWeekWorkouts = allWorkouts.filter(w => w.date >= prevWeekStartStr && w.date <= prevWeekEndStr);
        const monthMuscleSummary = buildMuscleSessionSummary(monthWorkouts);
        const weekMuscleSummary = buildMuscleSessionSummary(weekWorkouts);
        const prevMonthMuscleSummary = buildMuscleSessionSummary(prevMonthWorkouts);
        const prevWeekMuscleSummary = buildMuscleSessionSummary(prevWeekWorkouts);

        const headerHTML = `
            <div class="muscle-focus-header">
                <span>Muscle Group</span>
                <span class="muscle-focus-icon-cell" title="Sessions (Days)">
                    <i data-lucide="calendar"></i>
                </span>
                <span class="muscle-focus-icon-cell" title="Exercises Done">
                    <i data-lucide="dumbbell"></i>
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
                <div class="muscle-focus-row">
                    <span class="muscle-focus-name">${m.name.replace('-', ' ')}</span>
                    <span class="muscle-focus-metric muscle-focus-metric--sessions" title="Sessions (Days)">${m.count}<span class="kpi-entry-trend ${sessionTrendInfo.trendClass}" title="vs previous period (${prevCount})"><span class="kpi-entry-trend-arrow">${sessionTrendInfo.arrow}</span><span class="kpi-entry-trend-delta">${sessionTrendInfo.deltaText}</span></span></span>
                    <span class="muscle-focus-metric muscle-focus-metric--exercises" title="Exercises Done">${m.exCount}<span class="kpi-entry-trend ${exerciseTrendInfo.trendClass}" title="vs previous period (${prevExCount})"><span class="kpi-entry-trend-arrow">${exerciseTrendInfo.arrow}</span><span class="kpi-entry-trend-delta">${exerciseTrendInfo.deltaText}</span></span></span>
                </div>
            `;
                })()}
            `).join('')
            : '<div class="muscle-focus-empty">No sessions logged yet</div>';

        const monthMuscleFocusHTML = buildMuscleFocusHTML(monthMuscleSummary.sortedMuscles, prevMonthMuscleSummary.summaryByMuscle);
        const weekMuscleFocusHTML = buildMuscleFocusHTML(weekMuscleSummary.sortedMuscles, prevWeekMuscleSummary.summaryByMuscle);

        // Only the two workout count cards go into the top kpiGrid
        kpiGrid.innerHTML = `
            <div class="kpi-card kpi-card--compact">
                <div class="kpi-icon-row">
                    <i data-lucide="calendar-check" class="kpi-icon text-primary"></i>
                    <span class="kpi-label" title="Unique workout days this month">Monthly</span>
                </div>
                <div class="kpi-value">${workoutsThisMonth}</div>
                <span class="kpi-trend ${monthTrend.trendClass}"><span class="kpi-trend-comparison"><span class="kpi-trend-arrow">${monthTrend.arrow}</span><span class="kpi-trend-delta">${monthTrend.deltaText}</span></span>vs prev month (${workoutsPrevMonth})</span>
            </div>
            <div class="kpi-card kpi-card--compact">
                <div class="kpi-icon-row">
                    <i data-lucide="calendar-days" class="kpi-icon text-warning"></i>
                    <span class="kpi-label" title="Total unique training days this calendar week (Mon-Sun)">Weekly</span>
                </div>
                <div class="kpi-value">${workoutsThisWeek}</div>
                <span class="kpi-trend ${weekTrend.trendClass}"><span class="kpi-trend-comparison"><span class="kpi-trend-arrow">${weekTrend.arrow}</span><span class="kpi-trend-delta">${weekTrend.deltaText}</span></span>vs prev week (${workoutsPrevWeek})</span>
            </div>
        `;

        // Muscle session cards live inside the period tab panels
        const buildMuscleSessionCard = (label, title, muscleFocusHTML, totalSessions) => `
            <div class="kpi-card kpi-card--muscle">
                <details class="muscle-card-collapse" data-period="${label.toLowerCase()}">
                    <summary class="kpi-icon-row muscle-card-toggle">
                        <i data-lucide="biceps-flexed" class="kpi-icon text-success"></i>
                        <span class="kpi-label" title="${title}">Sessions Per Muscle</span>
                        <span class="kpi-period-badge">${label}</span>
                        <i data-lucide="chevron-down" class="muscle-card-chevron" aria-hidden="true"></i>
                    </summary>
                    <div class="muscle-card-content">
                        <div class="muscle-focus-list">
                            ${muscleFocusHTML}
                        </div>
                        <span class="kpi-trend trend-neutral kpi-total-caption">
                            Sessions: ${totalSessions} total
                        </span>
                    </div>
                </details>
            </div>
        `;

        const muscleMonthEl = document.getElementById('muscleSessionsMonth');
        if (muscleMonthEl) {
            muscleMonthEl.innerHTML = buildMuscleSessionCard(
                'Month',
                'Training frequency and variety per muscle group this calendar month (Sessions | Exercises)',
                monthMuscleFocusHTML, monthMuscleSummary.totalSessions
            );
            wireMuscleCardCollapseState(muscleMonthEl);
        }

        const muscleWeekEl = document.getElementById('muscleSessionsWeek');
        if (muscleWeekEl) {
            muscleWeekEl.innerHTML = buildMuscleSessionCard(
                'Week',
                'Training frequency and variety per muscle group this week (Sessions | Exercises)',
                weekMuscleFocusHTML, weekMuscleSummary.totalSessions
            );
            wireMuscleCardCollapseState(muscleWeekEl);
        }

        if (window.lucide) window.lucide.createIcons();
    },



    /**
     * Get the first–last day bounds for the currently navigated month
     */
    _getNavMonthBounds() {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth() + this.monthNavOffset, 1);
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
        const toStr = (d) => d.toISOString().split('T')[0];
        return { monthStartStr: toStr(start), monthEndStr: toStr(end) };
    },

    /**
     * Set up previous/next month navigation buttons in the Monthly panel
     */
    _setupMonthNavigation() {
        const prevBtn = document.getElementById('monthNavPrev');
        const nextBtn = document.getElementById('monthNavNext');
        if (!prevBtn || prevBtn._monthNavInit) return;
        prevBtn._monthNavInit = true;

        const navigate = (offset) => {
            this.monthNavOffset = offset;
            this._updateMonthNavLabel();
            if (this._cachedDataWithWorkouts && this._cachedAllWorkouts) {
                this.renderKPICards(this._cachedDataWithWorkouts);
                const { monthStartStr, monthEndStr } = this._getNavMonthBounds();
                this.renderMuscleRadarChart('muscleRadarMonthChart',
                    this._cachedAllWorkouts.filter(w => w.date >= monthStartStr && w.date <= monthEndStr), 'sessions');
                this.renderMuscleRadarChart('muscleRadarMonthExerciseChart',
                    this._cachedAllWorkouts.filter(w => w.date >= monthStartStr && w.date <= monthEndStr), 'exercises');
            }
            if (window.lucide) window.lucide.createIcons();
        };

        prevBtn.addEventListener('click', () => navigate(this.monthNavOffset - 1));
        nextBtn.addEventListener('click', () => {
            if (this.monthNavOffset < 0) navigate(this.monthNavOffset + 1);
        });
    },

    /**
     * Update the month navigation label and next-button disabled state
     */
    _updateMonthNavLabel() {
        const labelEl = document.getElementById('monthNavLabel');
        const nextBtn = document.getElementById('monthNavNext');
        if (!labelEl) return;

        if (this.monthNavOffset === 0) {
            labelEl.textContent = 'Current Month';
        } else {
            const now = new Date();
            const navDate = new Date(now.getFullYear(), now.getMonth() + this.monthNavOffset, 1);
            labelEl.textContent = navDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }

        if (nextBtn) nextBtn.disabled = this.monthNavOffset >= 0;
    },

    /**
     * Get the Mon–Sun date bounds for the currently navigated week
     */
    _getNavWeekBounds() {
        const weekStart = this.getCurrentMonday();
        weekStart.setDate(weekStart.getDate() + this.weekNavOffset * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const toStr = (d) => d.toISOString().split('T')[0];
        return { weekStartStr: toStr(weekStart), weekEndStr: toStr(weekEnd) };
    },

    /**
     * Set up previous/next week navigation buttons in the Weekly panel
     */
    _setupWeekNavigation() {
        const prevBtn = document.getElementById('weekNavPrev');
        const nextBtn = document.getElementById('weekNavNext');
        if (!prevBtn || prevBtn._weekNavInit) return;
        prevBtn._weekNavInit = true;

        const navigate = (offset) => {
            this.weekNavOffset = offset;
            this._updateWeekNavLabel();
            if (this._cachedDataWithWorkouts && this._cachedAllWorkouts) {
                this.renderKPICards(this._cachedDataWithWorkouts);
                const { weekStartStr, weekEndStr } = this._getNavWeekBounds();
                this.renderMuscleRadarChart('muscleRadarWeekChart',
                    this._cachedAllWorkouts.filter(w => w.date >= weekStartStr && w.date <= weekEndStr), 'sessions');
                this.renderMuscleRadarChart('muscleRadarWeekExerciseChart',
                    this._cachedAllWorkouts.filter(w => w.date >= weekStartStr && w.date <= weekEndStr), 'exercises');
            }
            if (window.lucide) window.lucide.createIcons();
        };

        prevBtn.addEventListener('click', () => navigate(this.weekNavOffset - 1));
        nextBtn.addEventListener('click', () => {
            if (this.weekNavOffset < 0) navigate(this.weekNavOffset + 1);
        });
    },

    /**
     * Update the week navigation label and next-button disabled state
     */
    _updateWeekNavLabel() {
        const labelEl = document.getElementById('weekNavLabel');
        const nextBtn = document.getElementById('weekNavNext');
        if (!labelEl) return;

        if (this.weekNavOffset === 0) {
            labelEl.textContent = 'Current Week';
        } else {
            const weekStart = this.getCurrentMonday();
            weekStart.setDate(weekStart.getDate() + this.weekNavOffset * 7);
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);
            const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const year = weekEnd.getFullYear();
            labelEl.textContent = `${fmt(weekStart)} – ${fmt(weekEnd)}, ${year}`;
        }

        if (nextBtn) nextBtn.disabled = this.weekNavOffset >= 0;
    },

    /**
     * Render a muscle group radar (spider) chart for a given time-filtered workout set
     * @param {string} canvasId - ID of the canvas element
     * @param {Array} workouts - Pre-filtered flat workouts array
     */
    renderMuscleRadarChart(canvasId, workouts, mode = 'sessions') {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const muscleColors = {
            'chest':     '#ff5252',
            'back':      '#448aff',
            'shoulders': '#ffab40',
            'legs':      '#7c4dff',
            'biceps':    '#00bcd4',
            'triceps':   '#667eea',
            'arms':      '#40c4ff',
            'core':      '#69f0ae',
            'neck':      '#bdbdbd',
            'full-body': '#ffd740',
            'other':     '#607d8b'
        };

        const metricSetsByMuscle = {};
        workouts.forEach(w => {
            if (!w.muscle) return;
            if (!metricSetsByMuscle[w.muscle]) metricSetsByMuscle[w.muscle] = new Set();

            if (mode === 'exercises') {
                const exerciseKey = w.exerciseId || w.exerciseName;
                if (exerciseKey) metricSetsByMuscle[w.muscle].add(exerciseKey);
            } else {
                metricSetsByMuscle[w.muscle].add(w.date);
            }
        });

        const muscles = Object.keys(metricSetsByMuscle).sort();
        const labels = muscles.map(m => m.charAt(0).toUpperCase() + m.slice(1).replace('-', ' '));
        const values = muscles.map(m => metricSetsByMuscle[m].size);
        const radarLabel = mode === 'exercises' ? 'Exercises' : 'Sessions';

        // Restore canvas if it was hidden by a previous empty-state render
        canvas.style.display = '';
        const existingMsg = canvas.parentElement.querySelector('.no-sessions-msg');
        if (existingMsg) existingMsg.style.display = 'none';

        if (muscles.length === 0) {
            canvas.style.display = 'none';
            let msgEl = canvas.parentElement.querySelector('.no-sessions-msg');
            if (!msgEl) {
                msgEl = document.createElement('p');
                msgEl.className = 'no-sessions-msg';
                canvas.parentElement.appendChild(msgEl);
            }
            msgEl.style.display = '';
            msgEl.textContent = mode === 'exercises' ? 'No exercises this period' : 'No sessions this period';
            return;
        }

        const ctx = canvas.getContext('2d');
        const existingChart = Chart.getChart(canvas);
        if (existingChart) existingChart.destroy();

        const primaryColor = '#667eea';
        const pointColors = muscles.map(m => muscleColors[m] || primaryColor);

        new Chart(ctx, {
            type: 'radar',
            data: {
                labels,
                datasets: [{
                    label: radarLabel,
                    data: values,
                    borderColor: primaryColor,
                    backgroundColor: primaryColor + '33',
                    borderWidth: 2,
                    pointBackgroundColor: pointColors,
                    pointBorderColor: '#fff',
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (c) => mode === 'exercises'
                                ? ` ${c.parsed.r} exercise${c.parsed.r !== 1 ? 's' : ''}`
                                : ` ${c.parsed.r} session${c.parsed.r !== 1 ? 's' : ''}`
                        }
                    }
                },
                scales: {
                    r: {
                        beginAtZero: true,
                        ticks: { display: false, stepSize: 1, font: { size: 9 }, backdropColor: 'transparent' },
                        pointLabels: { font: { size: 10, weight: '600' } },
                        grid: { color: 'rgba(128,128,128,0.4)' },
                        angleLines: { color: 'rgba(128,128,128,0.4)' }
                    }
                }
            }
        });
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
                        title: { display: false }
                    }
                }
            }
        });
    },

    /**
     * Render weekly muscle activity as unique exercises per muscle group (not sets)
     */
    renderMuscleActivityChart(canvas, displayData, labels) {
        const hiddenSeriesKey = 'muscleGroupActivityHiddenSeries';
        let hiddenSeries = new Set();
        try {
            const stored = JSON.parse(localStorage.getItem(hiddenSeriesKey) || '[]');
            if (Array.isArray(stored)) hiddenSeries = new Set(stored);
        } catch (error) {
            hiddenSeries = new Set();
        }

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
            muscleKey: muscle,
            label: muscle.charAt(0).toUpperCase() + muscle.slice(1).replace('-', ' '),
            data: displayData.map(d => (d.muscleGroupCounts && d.muscleGroupCounts[muscle]) || 0),
            borderColor: muscleColors[muscle] || '#667eea',
            backgroundColor: (muscleColors[muscle] || '#667eea') + '22',
            borderWidth: 2,
            fill: false,
            tension: 0.35,
            pointRadius: 0,
            pointHoverRadius: 0,
            pointHitRadius: 0,
            hidden: hiddenSeries.has(muscle)
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
                        labels: { boxWidth: 10, font: { size: 10 } },
                        onClick: (event, legendItem, legend) => {
                            const chart = legend.chart;
                            const datasetIndex = legendItem.datasetIndex;
                            if (datasetIndex == null) return;

                            if (chart.isDatasetVisible(datasetIndex)) {
                                chart.hide(datasetIndex);
                            } else {
                                chart.show(datasetIndex);
                            }

                            const nextHiddenSeries = chart.data.datasets
                                .filter((dataset, index) => !chart.isDatasetVisible(index))
                                .map(dataset => dataset.muscleKey)
                                .filter(Boolean);
                            localStorage.setItem(hiddenSeriesKey, JSON.stringify(nextHiddenSeries));
                        }
                    },
                    tooltip: {
                        enabled: true,
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: (context) => `${context.dataset.label}: ${context.parsed.y} exercises`
                        }
                    }
                },
                scales: {
                    x: {},
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 },
                        title: { display: false }
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
            <div class="chart-container category-chart-tall">
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
            <h4 class="category-selector-title">
                <span class="chevron category-selector-chevron">▼</span>
                Select Muscle Groups to View
            </h4>
            <div class="selector-actions">
                <button class="btn btn-small btn-secondary toggle-all-btn">Select All</button>
            </div>
        `;

        const checkboxContainer = document.createElement('div');
        checkboxContainer.className = 'category-checkboxes';

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
        headerTitle.addEventListener('click', () => {
            const chevron = headerTitle.querySelector('.chevron');
            const isHidden = checkboxContainer.classList.toggle('is-collapsed');
            chevron.classList.toggle('is-collapsed', isHidden);
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

        const hiddenSeriesKey = 'muscleGroupProgressHiddenSeries';
        let hiddenSeries = new Set();
        try {
            const stored = JSON.parse(localStorage.getItem(hiddenSeriesKey) || '[]');
            if (Array.isArray(stored)) hiddenSeries = new Set(stored);
        } catch (error) {
            hiddenSeries = new Set();
        }

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
                muscleKey: muscle,
                label: this.capitalize(muscle),
                data: weekValues,
                borderColor: colors[muscle] || '#667eea',
                backgroundColor: (colors[muscle] || '#667eea') + '99',
                borderWidth: 1,
                spanGaps: true,
                hidden: hiddenSeries.has(muscle)
            };
        });

        let yAxisLabel = '';
        if (this.selectedMetric === 'relative') yAxisLabel = 'Progress (% of Baseline)';
        else if (this.selectedMetric === 'weight') yAxisLabel = 'Total Volume (kg)';
        else if (this.selectedMetric === 'reps') yAxisLabel = 'Total Reps';

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: weekLabels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        onClick: (event, legendItem, legend) => {
                            const chart = legend.chart;
                            const datasetIndex = legendItem.datasetIndex;
                            if (datasetIndex == null) return;

                            if (chart.isDatasetVisible(datasetIndex)) {
                                chart.hide(datasetIndex);
                            } else {
                                chart.show(datasetIndex);
                            }

                            const nextHiddenSeries = chart.data.datasets
                                .filter((dataset, index) => !chart.isDatasetVisible(index))
                                .map(dataset => dataset.muscleKey)
                                .filter(Boolean);
                            localStorage.setItem(hiddenSeriesKey, JSON.stringify(nextHiddenSeries));
                        }
                    },
                    tooltip: {
                        enabled: true,
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
                    title: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        title: { display: true, text: this.selectedMetric === 'relative' ? 'Progress (%)' : (this.selectedMetric === 'weight' ? 'Weight (kg)' : 'Reps') }
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
                <div class="metric-btns">
                    <button class="metric-btn metric-btn--icon ${this.selectedMetric === 'relative' ? 'active' : ''}" data-metric="relative" title="Progress relative to your first workouts" aria-label="Relative progress metric">
                        <i data-lucide="percent"></i>
                    </button>
                    <button class="metric-btn metric-btn--icon ${this.selectedMetric === 'weight' ? 'active' : ''}" data-metric="weight" title="Heaviest weight lifted (PR)" aria-label="Weight PR metric">
                        <i data-lucide="dumbbell"></i>
                    </button>
                    <button class="metric-btn metric-btn--icon ${this.selectedMetric === 'reps' ? 'active' : ''}" data-metric="reps" title="Total repetitions performed" aria-label="Repetitions metric">
                        <i data-lucide="repeat"></i>
                    </button>
                </div>
            </div>
        `;

        if (window.lucide) window.lucide.createIcons();

        // Metric handlers
        controls.querySelectorAll('.metric-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchMetric(e.currentTarget.dataset.metric);
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
