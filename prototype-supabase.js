// Read-only Supabase data adapter for the throwaway UI prototypes.

import { SupabaseAPI } from './js/supabase-api.js';
import { SupabaseAuth } from './js/supabase-auth.js';

const DAY_MS = 86400000;
const TARGET_WEEKLY_SESSIONS = 4;

const elements = {
    status: document.getElementById('supabaseStatus'),
    user: document.getElementById('supabaseUser'),
    recent: document.getElementById('supabaseRecent'),
    email: document.getElementById('supabaseEmail'),
    authButton: document.getElementById('supabaseMagicLink'),
    exerciseCount: document.getElementById('supabaseExerciseCount'),
    workoutCount: document.getElementById('supabaseWorkoutCount'),
    latestDate: document.getElementById('supabaseLatestDate')
};

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function setStatus(message, isError = false) {
    if (!elements.status) return;
    elements.status.textContent = message;
    elements.status.style.color = isError ? '#fecaca' : '';
}

function parseDate(value) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
}

function formatDate(value) {
    if (!value) return 'No workouts yet';
    return parseDate(value).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function formatNumber(value) {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}

function formatCompact(value) {
    return new Intl.NumberFormat(undefined, {
        notation: 'compact',
        maximumFractionDigits: 1
    }).format(value);
}

function dateKey(date) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');
}

function startOfWeek(date) {
    const result = new Date(date);
    const day = result.getDay();
    result.setDate(result.getDate() + (day === 0 ? -6 : 1 - day));
    result.setHours(0, 0, 0, 0);
    return result;
}

function estimated1rm(workout) {
    if (!workout.weight || !workout.reps) return 0;
    if (workout.reps === 1) return workout.weight;
    return workout.weight * (36 / (37 - Math.min(workout.reps, 30)));
}

function workoutVolume(workout) {
    return (workout.weight || 0) * workout.reps;
}

function uniqueDates(workouts) {
    return new Set(workouts.map(workout => workout.date));
}

function percentageChange(previous, current) {
    if (!previous) return current ? 100 : 0;
    return ((current - previous) / previous) * 100;
}

function buildModel(exercises, compactWorkouts) {
    const exerciseMap = new Map(exercises.map(exercise => [exercise.id, exercise]));
    const workouts = compactWorkouts
        .map(workout => ({
            exerciseId: workout.e,
            date: workout.d,
            reps: Number(workout.r) || 0,
            weight: workout.w === null || workout.w === undefined ? null : Number(workout.w),
            sequence: Number(workout.seq) || 0,
            exercise: exerciseMap.get(workout.e) || {
                id: workout.e,
                name: 'Unknown exercise',
                muscle: 'other',
                requiresWeight: workout.w !== null
            }
        }))
        .sort((a, b) => a.date.localeCompare(b.date) || a.sequence - b.sequence);

    const latestDate = workouts.at(-1)?.date || null;
    const anchor = latestDate ? parseDate(latestDate) : new Date();
    const recentStart = new Date(anchor);
    recentStart.setDate(recentStart.getDate() - 29);
    const previousStart = new Date(anchor);
    previousStart.setDate(previousStart.getDate() - 59);
    const previousEnd = new Date(anchor);
    previousEnd.setDate(previousEnd.getDate() - 30);
    const recentStartKey = dateKey(recentStart);
    const previousStartKey = dateKey(previousStart);
    const previousEndKey = dateKey(previousEnd);
    const recent = workouts.filter(workout => workout.date >= recentStartKey && workout.date <= dateKey(anchor));
    const previous = workouts.filter(workout => workout.date >= previousStartKey && workout.date <= previousEndKey);
    const latest = workouts.filter(workout => workout.date === latestDate);

    const latestGroups = new Map();
    latest.forEach(workout => {
        if (!latestGroups.has(workout.exerciseId)) latestGroups.set(workout.exerciseId, []);
        latestGroups.get(workout.exerciseId).push(workout);
    });

    const allDates = [...uniqueDates(workouts)].sort();
    let streak = allDates.length ? 1 : 0;
    for (let index = allDates.length - 1; index > 0; index--) {
        const difference = (parseDate(allDates[index]) - parseDate(allDates[index - 1])) / DAY_MS;
        if (difference !== 1) break;
        streak++;
    }

    const recentExercisePrs = new Set();
    const bestByExercise = new Map();
    let top1rm = { value: 0, exerciseName: 'No weighted sets' };
    workouts.forEach(workout => {
        const value = estimated1rm(workout);
        if (value > (bestByExercise.get(workout.exerciseId) || 0)) {
            bestByExercise.set(workout.exerciseId, value);
            if (workout.date >= recentStartKey) recentExercisePrs.add(workout.exerciseId);
        }
        if (value > top1rm.value) {
            top1rm = { value, exerciseName: workout.exercise.name };
        }
    });

    const weekStart = startOfWeek(anchor);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weeklySessions = uniqueDates(workouts.filter(workout =>
        workout.date >= dateKey(weekStart) && workout.date <= dateKey(weekEnd)
    )).size;
    const weeklyPercent = Math.min(100, Math.round((weeklySessions / TARGET_WEEKLY_SESSIONS) * 100));

    const months = [];
    for (let offset = 5; offset >= 0; offset--) {
        const monthDate = new Date(anchor.getFullYear(), anchor.getMonth() - offset, 1);
        const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
        const monthWorkouts = workouts.filter(workout => workout.date.startsWith(key));
        months.push({
            label: monthDate.toLocaleDateString(undefined, { month: 'short' }),
            volume: monthWorkouts.reduce((sum, workout) => sum + workoutVolume(workout), 0),
            sessions: uniqueDates(monthWorkouts).size
        });
    }

    const muscleLoad = new Map();
    recent.forEach(workout => {
        const muscle = workout.exercise.muscle || 'other';
        const load = workoutVolume(workout) || workout.reps;
        muscleLoad.set(muscle, (muscleLoad.get(muscle) || 0) + load);
    });
    const totalMuscleLoad = [...muscleLoad.values()].reduce((sum, value) => sum + value, 0);
    const muscles = [...muscleLoad.entries()]
        .map(([name, load]) => ({
            name,
            percent: totalMuscleLoad ? Math.round((load / totalMuscleLoad) * 100) : 0
        }))
        .sort((a, b) => b.percent - a.percent)
        .slice(0, 4);

    const recentVolume = recent.reduce((sum, workout) => sum + workoutVolume(workout), 0);
    const previousVolume = previous.reduce((sum, workout) => sum + workoutVolume(workout), 0);
    const recentSessions = uniqueDates(recent).size;
    const previousSessions = uniqueDates(previous).size;

    return {
        exercises,
        workouts,
        latestDate,
        latestGroups,
        recent,
        recentVolume,
        recentSessions,
        previousSessions,
        volumeTrend: percentageChange(previousVolume, recentVolume),
        sessionTrend: percentageChange(previousSessions, recentSessions),
        consistency: Math.min(100, Math.round((recentSessions / 12) * 100)),
        prCount: recentExercisePrs.size,
        streak,
        top1rm,
        weekStart: dateKey(weekStart),
        weeklySessions,
        weeklyPercent,
        months,
        muscles,
        activeExercises: new Set(recent.map(workout => workout.exerciseId)).size
    };
}

function createEmptyMessage(message) {
    const element = document.createElement('div');
    element.className = 'task';
    element.textContent = message;
    return element;
}

function renderCommandCenter(model) {
    setText('latestSessionDate', formatDate(model.latestDate));
    setText('sessions30', String(model.recentSessions));
    setText('volume30', formatCompact(model.recentVolume));
    setText('prCount30', String(model.prCount));
    setText('workoutStreak', String(model.streak));
    setText('performanceTrend', `${model.volumeTrend >= 0 ? '+' : ''}${model.volumeTrend.toFixed(1)}%`);
    setText('commandPrompt', `${model.activeExercises} active exercises · ${model.recentSessions} training days in 30d`);
    const progress = document.getElementById('weeklyProgressBar');
    if (progress) progress.style.width = `${model.weeklyPercent}%`;
    setText('weeklyProgressLabel', `${model.weeklySessions}/${TARGET_WEEKLY_SESSIONS} training days in latest week`);

    const tags = document.getElementById('commandTags');
    if (tags) {
        tags.replaceChildren();
        model.muscles.slice(0, 3).forEach(muscle => {
            const tag = document.createElement('div');
            tag.className = 'tag';
            tag.textContent = `${muscle.name} ${muscle.percent}%`;
            tags.append(tag);
        });
    }

    const list = document.getElementById('latestSessionList');
    if (!list) return;
    list.replaceChildren();
    if (!model.latestGroups.size) {
        list.append(createEmptyMessage('No workout data found for this account.'));
        return;
    }

    const colors = ['var(--accent)', 'var(--warning)', 'var(--danger)', 'var(--accent-2)'];
    [...model.latestGroups.values()].forEach((sets, index) => {
        const exercise = sets[0].exercise;
        const item = document.createElement('div');
        item.className = 'task';
        const bullet = document.createElement('div');
        bullet.className = 'bullet';
        bullet.style.background = colors[index % colors.length];
        const details = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = exercise.name;
        const summary = document.createElement('small');
        const volume = sets.reduce((sum, workout) => sum + workoutVolume(workout), 0);
        summary.textContent = `${sets.length} sets · ${sets.reduce((sum, workout) => sum + workout.reps, 0)} reps · ${formatCompact(volume)} volume`;
        details.append(name, summary);
        const best = document.createElement('div');
        best.className = 'time';
        const maxWeight = Math.max(...sets.map(workout => workout.weight || 0));
        best.textContent = maxWeight ? `${formatNumber(maxWeight)} kg` : 'Bodyweight';
        item.append(bullet, details, best);
        list.append(item);
    });
}

function renderCompactCoach(model) {
    setText('latestSessionDate', model.latestDate ? `Latest session · ${formatDate(model.latestDate)}` : 'No workouts yet');
    setText('latestSessionHeadline', model.latestGroups.size ? `${model.latestGroups.size} exercises in your latest session.` : 'Start your first workout.');
    setText('consistency30', `${model.consistency}%`);
    setText('volume30', formatCompact(model.recentVolume));
    setText('prCount30', String(model.prCount));
    setText('sessionExerciseCount', String(model.latestGroups.size));
    const latestSetCount = [...model.latestGroups.values()].reduce((sum, sets) => sum + sets.length, 0);
    setText('sessionSetCount', `${latestSetCount} logged sets`);
    setText('latestWeekLabel', `Week of ${formatDate(model.weekStart)}`);
    const progress = document.getElementById('weeklyProgressBar');
    if (progress) progress.style.width = `${model.weeklyPercent}%`;
    setText('weeklyProgressLabel', `${model.weeklySessions}/${TARGET_WEEKLY_SESSIONS} training days in latest week`);

    const list = document.getElementById('latestSessionList');
    if (list) {
        list.replaceChildren();
        [...model.latestGroups.values()].forEach(sets => {
            const exercise = sets[0].exercise;
            const row = document.createElement('div');
            row.className = 'exercise-row';
            const content = document.createElement('div');
            const meta = document.createElement('div');
            meta.className = 'exercise-meta';
            const name = document.createElement('div');
            name.className = 'exercise-title';
            name.textContent = exercise.name;
            const tag = document.createElement('div');
            tag.className = 'tag';
            tag.textContent = exercise.muscle || 'Other';
            meta.append(name, tag);
            const setList = document.createElement('div');
            setList.className = 'sets';
            sets.forEach(workout => {
                const set = document.createElement('span');
                set.className = 'set done';
                set.textContent = workout.weight
                    ? `${workout.reps} × ${formatNumber(workout.weight)}`
                    : `${workout.reps} reps`;
                setList.append(set);
            });
            content.append(meta, setList);
            row.append(content);
            list.append(row);
        });
        if (!model.latestGroups.size) list.append(createEmptyMessage('No workout data found for this account.'));
    }

    const highlights = document.getElementById('trainingHighlights');
    if (highlights) {
        highlights.replaceChildren();
        const topMuscle = model.muscles[0];
        const messages = [
            `${model.activeExercises} exercises trained in the latest 30 days`,
            `${model.prCount} exercise PR${model.prCount === 1 ? '' : 's'} set in the latest 30 days`,
            topMuscle ? `${topMuscle.name} leads recent training load at ${topMuscle.percent}%` : 'No recent muscle load to compare'
        ];
        messages.forEach(message => {
            const item = document.createElement('li');
            const check = document.createElement('span');
            check.className = 'check';
            check.textContent = '✓';
            item.append(check, document.createTextNode(message));
            highlights.append(item);
        });
    }
}

function renderInsightLab(model) {
    setText('latestSessionDate', formatDate(model.latestDate));
    setText('volumeTrend', `${model.volumeTrend >= 0 ? '+' : ''}${model.volumeTrend.toFixed(1)}%`);
    setText('sessions30', String(model.recentSessions));
    setText('sessionTrend', `${model.sessionTrend >= 0 ? '+' : ''}${model.sessionTrend.toFixed(1)}% vs prior 30d`);
    setText('top1rm', model.top1rm.value ? `${formatNumber(model.top1rm.value)} kg` : '—');
    setText('top1rmExercise', model.top1rm.exerciseName);
    setText('activeExercises30', String(model.activeExercises));
    setText('workoutStreak', String(model.streak));
    setText('weeklyGoal', `${model.weeklyPercent}%`);
    setText('momentumValue', `${model.volumeTrend >= 0 ? '+' : ''}${model.volumeTrend.toFixed(1)}%`);

    const chart = document.getElementById('monthlyVolumeChart');
    if (chart) {
        chart.replaceChildren();
        const maxVolume = Math.max(...model.months.map(month => month.volume), 1);
        const maxSessions = Math.max(...model.months.map(month => month.sessions), 1);
        model.months.forEach(month => {
            const group = document.createElement('div');
            group.className = 'bar-group';
            const bars = document.createElement('div');
            bars.className = 'bars';
            const volumeBar = document.createElement('div');
            volumeBar.className = 'bar';
            volumeBar.style.height = `${Math.max(4, (month.volume / maxVolume) * 100)}%`;
            volumeBar.title = `${formatNumber(month.volume)} kg volume`;
            const sessionBar = document.createElement('div');
            sessionBar.className = 'bar alt';
            sessionBar.style.height = `${Math.max(4, (month.sessions / maxSessions) * 100)}%`;
            sessionBar.title = `${month.sessions} training days`;
            const label = document.createElement('span');
            label.textContent = month.label;
            bars.append(volumeBar, sessionBar);
            group.append(bars, label);
            chart.append(group);
        });
    }

    const muscleBalance = document.getElementById('muscleBalance');
    if (muscleBalance) {
        muscleBalance.replaceChildren();
        const colors = ['#68d7ff', '#5ce2a6', '#8d7bff', '#ffbf69'];
        model.muscles.forEach((muscle, index) => {
            const segment = document.createElement('div');
            segment.className = 'segment';
            const label = document.createElement('span');
            const dot = document.createElement('span');
            dot.className = 'dot';
            dot.style.background = colors[index];
            label.append(dot, document.createTextNode(muscle.name));
            const value = document.createElement('strong');
            value.textContent = `${muscle.percent}%`;
            segment.append(label, value);
            muscleBalance.append(segment);
        });
        if (!model.muscles.length) muscleBalance.append(createEmptyMessage('No recent muscle data.'));
    }
}

function render(model) {
    elements.exerciseCount.textContent = String(model.exercises.length);
    elements.workoutCount.textContent = String(model.workouts.length);
    elements.latestDate.textContent = formatDate(model.latestDate);
    elements.recent.textContent = [...model.latestGroups.values()]
        .slice(0, 3)
        .map(sets => sets[0].exercise.name)
        .join(', ') || 'No workouts loaded.';

    const prototype = document.body.dataset.prototype;
    if (prototype === 'command-center') renderCommandCenter(model);
    if (prototype === 'compact-coach') renderCompactCoach(model);
    if (prototype === 'insight-lab') renderInsightLab(model);
}

async function requestMagicLink() {
    const email = elements.email?.value.trim();
    if (!email) {
        setStatus('Enter your email address first.', true);
        return;
    }
    await SupabaseAuth.requestMagicLink(email);
    setStatus('Magic link sent. Open it on this device to load your data.');
}

async function handleAuthAction() {
    try {
        if (SupabaseAuth.isAuthenticated()) {
            await SupabaseAuth.signOut();
            location.reload();
            return;
        }
        await requestMagicLink();
    } catch (error) {
        console.error('Prototype authentication failed:', error);
        setStatus(error.message || 'Authentication failed.', true);
    }
}

async function init() {
    elements.authButton?.addEventListener('click', handleAuthAction);
    try {
        setStatus('Checking Supabase session…');
        await SupabaseAuth.initialize();
        if (!SupabaseAuth.isAuthenticated()) {
            elements.user.textContent = 'Not signed in';
            setStatus('Sign in with a magic link to load your Supabase data.');
            return;
        }

        elements.user.textContent = SupabaseAuth.session.user.email || 'Authenticated';
        elements.email.style.display = 'none';
        elements.authButton.textContent = 'Sign out';
        setStatus('Loading complete workout history from Supabase…');
        const [{ exercises }, summary] = await Promise.all([
            SupabaseAPI.getExercises(),
            SupabaseAPI.getStatsSummary()
        ]);
        const model = buildModel(exercises, summary.content.workouts || []);
        render(model);
        setStatus('Live Supabase data loaded.');
    } catch (error) {
        console.error('Prototype data load failed:', error);
        setStatus(error.message || 'Failed to load Supabase data.', true);
        if (elements.user) elements.user.textContent = 'Load failed';
    }
}

window.addEventListener('DOMContentLoaded', init);
