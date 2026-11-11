// Desktop Prototype (throwaway)
// Desktop-first, view-first layout (Ocean theme) rendered from the signed-in user's real Supabase data.
// Read-only: only SELECT queries are issued. Exercise and template editors keep changes in memory only.
// Pages are addressable via the hash: #dashboard, #history, #statistics, #rankings, #exercises, #templates.

import { SupabaseAuth } from './supabase-auth.js';
import { SupabaseAPI } from './supabase-api.js';
import { escapeHtml, estimateOneRepMax, formatEquipmentType } from './utils.js';

const MUSCLES = ['chest', 'back', 'shoulders', 'legs', 'biceps', 'triceps', 'forearms', 'core', 'neck'];
const EQUIPMENT = ['barbell', 'dumbbell', 'kettlebell', 'machines', 'bodyweight', 'bodyweight+', 'bands'];

const root = document.getElementById('root');
const ui = {
    page: 'dashboard', day: null, exerciseId: null, search: '', muscle: '', exerciseForm: null,
    month: null, statsExerciseId: null, statsMetric: 'weight', statsPeriod: 12,
    rankMode: 'exercises', rankMuscle: '', rankPeriod: 3, templateId: null, tplDraft: null
};
let data = null;

// ── Data ─────────────────────────────────────────────────────────────────────

function ymd(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return ymd(d);
}

function setScore(set) {
    return set.weight ? estimateOneRepMax(set.weight, set.reps) : set.reps;
}

/** Set volume: weight × reps, or reps × 1 for bodyweight / unweighted sets. */
function setVolume(set) {
    return (+set.weight || 1) * (+set.reps || 0);
}

function fmtSet(set) {
    return set.weight ? `${set.reps}×${+set.weight}` : `${set.reps}`;
}

function fmtDate(dateStr, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
    return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, opts);
}

const SHORT = { day: 'numeric', month: 'short' };
const SHORT_Y = { day: 'numeric', month: 'short', year: '2-digit' };

function fmtNum(n) {
    return Math.round(n).toLocaleString();
}

function fmtPct(n) {
    return n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function weekKey(dateStr) {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return ymd(d);
}

function indexExercises() {
    data.exById = new Map(data.exercises.map(e => [e.id, e]));
    data.muscles = [...new Set(data.exercises.map(e => e.muscle).filter(Boolean))].sort();
}

async function loadData() {
    const [{ exercises }, workouts, { templates }] = await Promise.all([
        SupabaseAPI.getExercises(),
        SupabaseAPI.getWorkoutsInRange(new Date(2000, 0, 1), new Date()),
        SupabaseAPI.getSessionTemplates().catch(() => ({ templates: [] }))
    ]);
    const byDay = new Map();
    const byEx = new Map();

    workouts.forEach(w => {
        if (!byDay.has(w.date)) byDay.set(w.date, []);
        byDay.get(w.date).push(w);
        if (!byEx.has(w.exerciseId)) byEx.set(w.exerciseId, new Map());
        const exDays = byEx.get(w.exerciseId);
        if (!exDays.has(w.date)) exDays.set(w.date, []);
        exDays.get(w.date).push(w);
    });

    // Per exercise: sessions newest first, with top set, volume and PR flags.
    const exStats = new Map();
    const prs = [];
    byEx.forEach((days, exerciseId) => {
        const sessions = [...days.entries()]
            .map(([date, sets]) => {
                sets.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
                const top = sets.reduce((best, s) => (setScore(s) > setScore(best) ? s : best), sets[0]);
                return {
                    date,
                    sets,
                    top,
                    score: setScore(top),
                    topWeight: Math.max(...sets.map(s => +s.weight || 0)),
                    volume: sets.reduce((sum, s) => sum + setVolume(s), 0),
                    reps: sets.reduce((sum, s) => sum + (+s.reps || 0), 0)
                };
            })
            .sort((a, b) => b.date.localeCompare(a.date));
        let best = null;
        sessions.slice().reverse().forEach(s => {
            if (!best || s.score > best.score) {
                if (best) prs.push({ exerciseId, session: s, prevBest: best.score });
                s.pr = true;
                best = s;
            }
        });
        exStats.set(exerciseId, { sessions, best, lastDate: sessions[0].date });
    });
    prs.sort((a, b) => b.session.date.localeCompare(a.session.date));

    const days = [...byDay.keys()].sort().reverse();
    const dayCounts = new Map([...byDay.entries()].map(([d, sets]) => [d, sets.length]));
    data = { exercises, workouts, byDay, days, exStats, dayCounts, templates, prs };
    indexExercises();
}

function exName(id) {
    return data.exById.get(id)?.name || 'Unknown exercise';
}

function exLink(id) {
    return `<button class="link" style="font-weight:400" data-exercise="${escapeHtml(id)}">${escapeHtml(exName(id))}</button>`;
}

function exerciseOrderForDay(sets) {
    const order = [];
    sets.slice().sort((a, b) => (a.sequence || 0) - (b.sequence || 0)).forEach(s => {
        if (!order.includes(s.exerciseId)) order.push(s.exerciseId);
    });
    return order;
}

/** Previous session of an exercise strictly before a date. */
function previousSession(exerciseId, date) {
    return data.exStats.get(exerciseId)?.sessions.find(s => s.date < date) || null;
}

/** Arrow comparing a set's volume to the same-position set of the previous session; nothing when equal. */
function setTrend(set, prevSet) {
    if (!prevSet) return '';
    const diff = setVolume(set) - setVolume(prevSet);
    if (!diff) return '';
    return diff > 0 ? '<span class="up" title="Volume up vs previous session">▲</span>' : '<span class="down" title="Volume down vs previous session">▼</span>';
}

function setChips(sets, prevSets = []) {
    return sets.map((s, i) => `<span class="chip num">${fmtSet(s)}${setTrend(s, prevSets[i])}</span>`).join('');
}

/** "12 Jan: 8×60, 8×60 → [latest chips with ▲/▼]" */
function prevToLatest(prev, sets) {
    const before = prev
        ? `<span class="prev-sets num">${fmtDate(prev.date, SHORT)}: ${prev.sets.map(fmtSet).join(', ')}</span>`
        : '<span class="prev-sets">first time</span>';
    return `${before}<span class="arrow">→</span>${setChips(sets, prev?.sets)}`;
}

function periodStart(months) {
    if (!months) return '';
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return ymd(d);
}

function weekBuckets(weeks, records, valueFn) {
    const counts = new Map();
    const start = new Date();
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (weeks - 1) * 7);
    for (let i = 0; i < weeks; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i * 7);
        counts.set(ymd(d), 0);
    }
    records.forEach(w => {
        const k = weekKey(w.date);
        if (counts.has(k)) counts.set(k, counts.get(k) + valueFn(w));
    });
    return [...counts.entries()];
}

function weekStreak() {
    const weeks = new Set(data.days.map(weekKey));
    let streak = 0;
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    if (!weeks.has(ymd(d))) d.setDate(d.getDate() - 7);
    while (weeks.has(ymd(d))) {
        streak++;
        d.setDate(d.getDate() - 7);
    }
    return streak;
}

/** Exercises ranked by distinct days since a date. */
function mostDone(from, muscle = '') {
    const byEx = new Map();
    data.workouts.filter(w => w.date >= from).forEach(w => {
        if (!byEx.has(w.exerciseId)) byEx.set(w.exerciseId, new Set());
        byEx.get(w.exerciseId).add(w.date);
    });
    return [...byEx.entries()]
        .map(([id, days]) => ({ id, name: exName(id), muscle: data.exById.get(id)?.muscle, count: days.size }))
        .filter(r => !muscle || r.muscle === muscle)
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function muscleSplit(from) {
    const counts = new Map();
    data.workouts.filter(w => w.date >= from).forEach(w => {
        const m = data.exById.get(w.exerciseId)?.muscle || 'other';
        counts.set(m, (counts.get(m) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

// ── SVG / calendar / list helpers (colours come from CSS variables) ─────────

function barChart(entries, { unit = 'sets', label = d => fmtDate(d, { day: 'numeric', month: 'numeric' }), width = 420, height = 140 } = {}) {
    const max = Math.max(1, ...entries.map(([, v]) => v));
    const bw = width / entries.length;
    const every = Math.ceil(entries.length / 14);
    const bars = entries.map(([key, v], i) => {
        const h = (v / max) * (height - 22);
        return `<rect x="${i * bw + 2}" y="${height - 16 - h}" width="${Math.max(1, bw - 4)}" height="${h}" rx="3" style="fill:url(#barGrad)"><title>${label(key)}: ${fmtNum(v)} ${unit}</title></rect>
            ${i % every ? '' : `<text x="${i * bw + bw / 2}" y="${height - 3}" font-size="9" text-anchor="middle" style="fill:var(--muted)">${label(key)}</text>`}`;
    }).join('');
    return `<svg viewBox="0 0 ${width} ${height}" width="100%" preserveAspectRatio="none">
        <defs><linearGradient id="barGrad" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:var(--accent)"/><stop offset="1" style="stop-color:var(--accent-2)"/></linearGradient></defs>${bars}</svg>`;
}

function lineChart(points, width = 700, height = 190) {
    if (points.length < 2) return '<p class="muted">Not enough sessions for a trend.</p>';
    const ys = points.map(p => p.y);
    const min = Math.min(...ys);
    const max = Math.max(...ys);
    const span = max - min || 1;
    const t0 = new Date(points[0].x).getTime();
    const t1 = new Date(points[points.length - 1].x).getTime();
    const px = p => 30 + ((new Date(p.x).getTime() - t0) / (t1 - t0 || 1)) * (width - 40);
    const py = p => 10 + (1 - (p.y - min) / span) * (height - 30);
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${px(p).toFixed(1)},${py(p).toFixed(1)}`).join(' ');
    const dots = points.map(p => `<circle cx="${px(p)}" cy="${py(p)}" r="${p.pr ? 4.5 : 3}" style="fill:var(${p.pr ? '--accent-2' : '--accent'})"><title>${p.x}: ${fmtNum(p.y)}${p.pr ? ' (PR)' : ''}</title></circle>`).join('');
    const label = (x, y, text, anchor = 'start') => `<text x="${x}" y="${y}" font-size="10" text-anchor="${anchor}" style="fill:var(--muted)">${text}</text>`;
    return `<svg viewBox="0 0 ${width} ${height}" width="100%">
        ${label(0, 14, fmtNum(max))}${label(0, height - 20, fmtNum(min))}
        ${label(30, height - 4, fmtDate(points[0].x, { month: 'short', year: '2-digit' }))}
        ${label(width - 10, height - 4, fmtDate(points[points.length - 1].x, { month: 'short', year: '2-digit' }), 'end')}
        <path d="${path}" fill="none" style="stroke:var(--accent)" stroke-width="2"/>${dots}</svg>`;
}

/**
 * GitHub-style training calendar: one column per week, shade = sets that day.
 * `outlined` marks days (e.g. with the selected exercise); `current` marks the day being viewed.
 */
function heatmap(weeks, { outlined = new Set(), current = null, cell = 10 } = {}) {
    const start = new Date();
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (weeks - 1) * 7);
    const today = ymd(new Date());
    let cells = '';
    for (let i = 0; i < weeks * 7; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const key = ymd(d);
        if (key > today) { cells += '<i style="visibility:hidden"></i>'; continue; }
        const n = data.dayCounts.get(key) || 0;
        const level = n === 0 ? '' : n < 10 ? 'l1' : n < 20 ? 'l2' : 'l3';
        const cls = [level, outlined.has(key) ? 'sel' : '', key === current ? 'cur' : ''].join(' ');
        cells += `<i class="${cls}" ${n ? `data-date="${key}"` : ''} title="${fmtDate(key)}: ${n} sets"></i>`;
    }
    return `<div class="heat" style="--cell:${cell}px">${cells}</div>`;
}

function rankList(rows, limit = 10) {
    const max = rows[0]?.count || 1;
    return rows.slice(0, limit).map((r, i) => `<div class="rank-row"><span class="muted">${i + 1}</span>
        <div>${exLink(r.id)}<div class="bar-track"><div class="bar-fill" style="width:${(r.count / max) * 100}%"></div></div></div>
        <span class="num">${r.count}d</span></div>`).join('') || '<p class="muted">Nothing in this period.</p>';
}

function splitList(entries) {
    const max = entries[0]?.[1] || 1;
    return entries.map(([m, n]) => `<div class="muscle-row"><span>${escapeHtml(m)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(n / max) * 100}%"></div></div><span class="num muted">${n}</span></div>`).join('') || '<p class="muted">No sets in this period.</p>';
}

function kpi(label, value, cls = '') {
    return `<div class="panel"><span class="muted">${label}</span><b class="num ${cls}">${value}</b></div>`;
}

// ── Pages ────────────────────────────────────────────────────────────────────

function renderSessionPanel() {
    const day = ui.day && data.byDay.has(ui.day) ? ui.day : data.days[0];
    if (!day) return '<section class="panel"><h3>Session</h3><p class="muted">No workouts yet.</p></section>';
    const isLatest = day === data.days[0];
    const rows = exerciseOrderForDay(data.byDay.get(day)).map(id => {
        const session = data.exStats.get(id).sessions.find(s => s.date === day);
        return `<div class="session-ex">${exLink(id)}<div>${prevToLatest(previousSession(id, day), session.sets)}</div></div>`;
    }).join('');
    return `<section class="panel">
        <h3><span>${isLatest ? 'Last session' : 'Session'} · ${fmtDate(day)}</span>
            ${isLatest ? '' : '<button class="small-link" data-day="">Back to latest</button>'}</h3>
        ${rows}</section>`;
}

/** Average session volume per exercise: last 6 weeks vs the 6 weeks before. */
function progressRows() {
    const mid = daysAgo(42);
    const from = daysAgo(84);
    const avg = list => list.reduce((s, x) => s + x.volume, 0) / list.length;
    return [...data.exStats.entries()].map(([id, st]) => {
        const recent = st.sessions.filter(s => s.date >= mid);
        const before = st.sessions.filter(s => s.date >= from && s.date < mid);
        if (!recent.length || !before.length) return null;
        return { id, recent: avg(recent), before: avg(before), change: ((avg(recent) - avg(before)) / avg(before)) * 100 };
    }).filter(Boolean).sort((a, b) => b.change - a.change);
}

function monthlySummary(months) {
    const rows = [];
    const now = new Date();
    for (let i = 0; i < months; i++) {
        const key = ymd(new Date(now.getFullYear(), now.getMonth() - i, 1)).slice(0, 7);
        const sets = data.workouts.filter(w => w.date.startsWith(key));
        rows.push({
            key,
            days: new Set(sets.map(w => w.date)).size,
            sets: sets.length,
            volume: sets.reduce((s, w) => s + setVolume(w), 0),
            exercises: new Set(sets.map(w => w.exerciseId)).size,
            prs: data.prs.filter(p => p.session.date.startsWith(key)).length
        });
    }
    return rows;
}

function renderDashboard() {
    const from30 = daysAgo(30);
    const sets30 = data.workouts.filter(w => w.date >= from30);
    const days30 = new Set(sets30.map(w => w.date)).size;
    const thisWeek = data.workouts.filter(w => weekKey(w.date) === weekKey(ymd(new Date()))).length;
    const prs30 = data.prs.filter(p => p.session.date >= from30);
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => [d, 0]);
    data.days.filter(d => d >= daysAgo(182)).forEach(d => weekdays[(new Date(`${d}T00:00:00`).getDay() + 6) % 7][1]++);
    const progress = progressRows();
    const months = monthlySummary(12);

    return `<h1>Dashboard</h1>
        <div class="kpis">
            ${kpi('Training days · 30d', days30)}
            ${kpi('Sets this week', thisWeek)}
            ${kpi('Week streak', weekStreak())}
            ${kpi('Volume · 30d', fmtNum(sets30.reduce((s, w) => s + setVolume(w), 0)))}
            ${kpi('Avg sets / day · 30d', days30 ? (sets30.length / days30).toFixed(1) : '—')}
            ${kpi('PRs · 30d', prs30.length)}
        </div>
        <section class="panel"><h3><span>Training calendar · 52 weeks</span><span>click a day to open it</span></h3>
            ${heatmap(52, { current: ui.day || data.days[0], cell: 18 })}
            <div class="heat-legend"><span>Shade = sets that day</span><span>Dark outline = day shown below</span></div>
        </section>
        <div class="two-col">
            ${renderSessionPanel()}
            <div class="stack">
                <section class="panel"><h3>Sets per week · 12 weeks</h3>${barChart(weekBuckets(12, data.workouts, () => 1))}</section>
                <section class="panel"><h3>Volume per week · 26 weeks</h3>${barChart(weekBuckets(26, data.workouts, setVolume), { unit: 'volume' })}</section>
            </div>
        </div>
        <div class="grid3">
            <section class="panel"><h3>Most done · 90 days</h3>${rankList(mostDone(daysAgo(90)), 8)}</section>
            <section class="panel"><h3>Muscle split · 30 days (sets)</h3>${splitList(muscleSplit(from30))}</section>
            <section class="panel"><h3>Training days by weekday · 6 months</h3>${barChart(weekdays, { unit: 'days', label: d => d, height: 160 })}</section>
        </div>
        <div class="two-col">
            <section class="panel"><h3>Recent PRs (estimated 1RM / best reps)</h3>
                <table class="sessions"><thead><tr><th>Date</th><th>Exercise</th><th>Top set</th><th>New best</th><th>Gain</th></tr></thead><tbody>
                ${data.prs.slice(0, 12).map(p => `<tr><td>${fmtDate(p.session.date, SHORT_Y)}</td><td>${exLink(p.exerciseId)}</td>
                    <td class="num">${fmtSet(p.session.top)}</td><td class="num"><b>${fmtNum(p.session.score)}</b></td>
                    <td class="num up" style="font-size:inherit">+${fmtNum(p.session.score - p.prevBest)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No PRs yet.</td></tr>'}
                </tbody></table></section>
            <section class="panel"><h3>Progressing &amp; stalling · avg session volume, last 6 wk vs 6 wk before</h3>
                <table class="sessions"><thead><tr><th>Exercise</th><th>Before</th><th>Now</th><th>Change</th></tr></thead><tbody>
                ${progress.map(r => `<tr><td>${exLink(r.id)}</td><td class="num">${fmtNum(r.before)}</td><td class="num">${fmtNum(r.recent)}</td>
                    <td class="num ${r.change > 0 ? 'up' : r.change < 0 ? 'down' : ''}" style="font-size:inherit">${fmtPct(r.change)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Not enough recent data.</td></tr>'}
                </tbody></table></section>
        </div>
        <section class="panel"><h3>Monthly summary · 12 months</h3>
            <table class="sessions"><thead><tr><th>Month</th><th>Training days</th><th>Sets</th><th>Volume</th><th>Exercises</th><th>PRs</th></tr></thead><tbody>
            ${months.map(m => `<tr><td><button class="link" style="font-weight:400" data-month="${m.key}">${fmtDate(`${m.key}-01`, { month: 'long', year: 'numeric' })}</button></td>
                <td class="num">${m.days}</td><td class="num">${m.sets}</td><td class="num">${fmtNum(m.volume)}</td><td class="num">${m.exercises}</td><td class="num">${m.prs}</td></tr>`).join('')}
            </tbody></table></section>`;
}

function renderPortrait(ex) {
    const st = data.exStats.get(ex.id);
    const prs = st ? st.sessions.filter(s => s.pr) : [];
    const avgGap = st && st.sessions.length > 1
        ? (new Date(st.sessions[0].date) - new Date(st.sessions[st.sessions.length - 1].date)) / 86400000 / (st.sessions.length - 1)
        : null;

    return `<div class="stack">
        <div class="page-head"><div><span class="tag">${escapeHtml(ex.muscle || '')}</span> <span class="tag">${escapeHtml(formatEquipmentType(ex.equipmentType))}</span>
            <h1>${escapeHtml(ex.name)}</h1></div><button class="btn" data-ef-edit="${escapeHtml(ex.id)}">Edit</button></div>
        <div class="portrait-stats">
            <div class="panel"><span class="muted">${ex.requiresWeight === false ? 'Best reps' : 'Best e1RM'}</span><b class="num">${st ? fmtNum(st.best.score) : '—'}</b></div>
            <div class="panel"><span class="muted">Days done</span><b class="num">${st ? st.sessions.length : 0}</b></div>
            <div class="panel"><span class="muted">Last done</span><b>${st ? fmtDate(st.lastDate, SHORT) : '—'}</b></div>
            <div class="panel"><span class="muted">Avg gap</span><b class="num">${avgGap ? `${avgGap.toFixed(1)} d` : '—'}</b></div>
        </div>
        <div class="two-col">
            <div class="stack">
                <section class="panel"><h3>${ex.requiresWeight === false ? 'Best reps' : 'Estimated 1RM'} per session</h3>
                    ${st ? lineChart(st.sessions.slice().reverse().map(s => ({ x: s.date, y: s.score, pr: s.pr }))) : '<p class="muted">Never logged.</p>'}</section>
                <section class="panel"><h3>Sessions</h3>
                    <table class="sessions"><thead><tr><th>Date</th><th>Sets (▲▼ = set volume vs previous)</th><th>Volume</th></tr></thead><tbody>
                    ${st ? st.sessions.slice(0, 40).map((s, i) => `<tr>
                        <td><button class="link" style="font-weight:400" data-day="${s.date}">${fmtDate(s.date, { weekday: 'short', ...SHORT_Y })}</button></td>
                        <td>${setChips(s.sets, st.sessions[i + 1]?.sets)}</td>
                        <td class="num">${fmtNum(s.volume)}</td></tr>`).join('') : ''}
                    </tbody></table></section>
            </div>
            <div class="stack">
                <section class="panel"><h3>Training calendar · 26 weeks</h3>
                    ${heatmap(26, { outlined: new Set(st ? st.sessions.map(s => s.date) : []), cell: 11 })}
                    <div class="heat-legend"><span>Outlined = days with ${escapeHtml(ex.name)}</span></div></section>
                <section class="panel"><h3>PR progression</h3>
                    ${prs.slice(0, 10).map(s => `<div class="kv-row"><span>${fmtDate(s.date, SHORT_Y)}</span>
                        <span class="num">${fmtSet(s.top)} → <b>${fmtNum(s.score)}</b></span></div>`).join('') || '<p class="muted">—</p>'}</section>
            </div>
        </div>
    </div>`;
}

function renderExerciseForm() {
    const f = ui.exerciseForm;
    const opt = (value, label, current) => `<option value="${escapeHtml(value)}" ${value === current ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    return `<section class="panel stack">
        <h1>${f.id ? 'Edit exercise' : 'New exercise'}</h1>
        <div class="note">Prototype: changes stay in this browser tab only. Nothing is saved to your account.</div>
        <div class="form">
            <label for="efName">Name</label><input class="input" id="efName" data-ef="name" value="${escapeHtml(f.name)}">
            <label for="efMuscle">Muscle</label><select class="input" id="efMuscle" data-ef="muscle">${MUSCLES.map(m => opt(m, m, f.muscle)).join('')}</select>
            <label for="efEquip">Equipment</label><select class="input" id="efEquip" data-ef="equipmentType">${EQUIPMENT.map(e => opt(e, formatEquipmentType(e), f.equipmentType)).join('')}</select>
            <label for="efWeight">Logging</label><select class="input" id="efWeight" data-ef="requiresWeight">
                ${opt('true', 'Reps × weight', String(f.requiresWeight))}${opt('false', 'Reps only', String(f.requiresWeight))}</select>
        </div>
        <div><button class="btn primary" data-ef-save>Save</button> <button class="btn" data-ef-cancel>Cancel</button></div>
    </section>`;
}

function saveExerciseForm() {
    const f = ui.exerciseForm;
    if (!f.name.trim()) return alert('Name is required.');
    const fields = { name: f.name.trim(), muscle: f.muscle, equipmentType: f.equipmentType, requiresWeight: f.requiresWeight };
    if (f.id) {
        Object.assign(data.exById.get(f.id), fields);
    } else {
        f.id = `proto-${Date.now()}`;
        data.exercises.push({ id: f.id, ...fields });
    }
    indexExercises();
    ui.exerciseId = f.id;
    ui.exerciseForm = null;
    render();
}

function renderExercises() {
    const list = data.exercises
        .filter(e => !ui.muscle || e.muscle === ui.muscle)
        .filter(e => !ui.search || e.name.toLowerCase().includes(ui.search.toLowerCase()))
        .map(e => ({ e, st: data.exStats.get(e.id) }))
        .sort((a, b) => (b.st?.lastDate || '').localeCompare(a.st?.lastDate || '') || a.e.name.localeCompare(b.e.name));
    if (!ui.exerciseId || !data.exById.has(ui.exerciseId)) ui.exerciseId = list.find(x => x.st)?.e.id || list[0]?.e.id || null;
    const ex = data.exById.get(ui.exerciseId);

    return `<div class="ex-page">
        <aside class="panel ex-list">
            <header>
                <button class="btn primary" data-ef-edit="">+ New exercise</button>
                <input id="exSearch" placeholder="Search exercises…" value="${escapeHtml(ui.search)}">
                <select id="exMuscle"><option value="">All muscles</option>
                    ${data.muscles.map(m => `<option ${m === ui.muscle ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
                </select>
            </header>
            <div class="ex-items">
                ${list.map(({ e, st }) => `<div class="ex-item ${e.id === ui.exerciseId && !ui.exerciseForm ? 'active' : ''}" data-exercise="${escapeHtml(e.id)}">
                    <div>${escapeHtml(e.name)}<br><small>${escapeHtml(e.muscle || '')} · ${escapeHtml(formatEquipmentType(e.equipmentType))}</small></div>
                    <small class="num">${st ? fmtDate(st.lastDate, SHORT) : 'never'}</small>
                </div>`).join('')}
            </div>
        </aside>
        ${ui.exerciseForm ? renderExerciseForm() : ex ? renderPortrait(ex) : '<p class="muted">No exercises.</p>'}
    </div>`;
}

// ── History ─────────────────────────────────────────────────────────────────

function renderHistory() {
    const month = ui.month || (ui.day || data.days[0] || ymd(new Date())).slice(0, 7);
    const [y, m] = month.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7));
    const monthDays = data.days.filter(d => d.startsWith(month));
    const monthSets = monthDays.reduce((n, d) => n + data.byDay.get(d).length, 0);
    const weeks = Math.ceil(((first.getDay() + 6) % 7 + new Date(y, m, 0).getDate()) / 7);
    let grid = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Week'].map(d => `<div class="dow">${d}</div>`).join('');
    for (let w = 0; w < weeks; w++) {
        let weekSets = 0;
        for (let i = 0; i < 7; i++) {
            const d = new Date(start);
            d.setDate(start.getDate() + w * 7 + i);
            const key = ymd(d);
            const sets = data.byDay.get(key) || [];
            weekSets += sets.length;
            const names = exerciseOrderForDay(sets).map(id => `<div class="ex">${escapeHtml(exName(id))}</div>`).join('');
            grid += `<div class="mday ${key.startsWith(month) ? '' : 'other'} ${sets.length ? 'has' : ''} ${key === ui.day ? 'cur' : ''}" ${sets.length ? `data-hday="${key}"` : ''}>
                <div class="d"><span>${d.getDate()}</span>${sets.length ? `<small class="muted num">${sets.length}</small>` : ''}</div>${names}</div>`;
        }
        grid += `<div class="wk num">${weekSets ? `${weekSets} sets` : ''}</div>`;
    }
    const shift = n => ymd(new Date(y, m - 1 + n, 1)).slice(0, 7);
    return `<div class="page-head"><h1>${first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h1>
            <span class="muted num">${monthDays.length} days · ${monthSets} sets</span>
            <div class="seg"><button data-month="${shift(-1)}">‹</button><button data-month="${ymd(new Date()).slice(0, 7)}">Today</button><button data-month="${shift(1)}">›</button></div></div>
        <div class="two-col" style="grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)">
            <div class="month">${grid}</div>
            <div class="sticky">${renderSessionPanel()}</div>
        </div>`;
}

// ── Statistics ──────────────────────────────────────────────────────────────

const METRICS = {
    weight: ['Top weight', s => s.topWeight],
    volume: ['Session volume', s => s.volume],
    reps: ['Total reps', s => s.reps]
};
const PERIODS = [[1, '1M'], [3, '3M'], [6, '6M'], [12, '1Y'], [0, 'All']];

function renderStatistics() {
    const done = data.exercises.filter(e => data.exStats.has(e.id)).sort((a, b) => a.name.localeCompare(b.name));
    if (!data.exStats.has(ui.statsExerciseId)) ui.statsExerciseId = data.days.length ? exerciseOrderForDay(data.byDay.get(data.days[0]))[0] : done[0]?.id;
    const ex = data.exById.get(ui.statsExerciseId);
    const st = data.exStats.get(ui.statsExerciseId);
    const bodyweight = ex?.requiresWeight === false;
    const metric = bodyweight && ui.statsMetric === 'weight' ? 'reps' : ui.statsMetric;
    const [label, fn] = METRICS[metric];
    const from = periodStart(ui.statsPeriod);
    const sessions = st ? st.sessions.filter(s => s.date >= from).slice().reverse() : [];
    const vols = sessions.map(s => s.volume);
    const volChange = vols.length > 1 ? ((vols[vols.length - 1] - vols[0]) / vols[0]) * 100 : null;
    const firstDate = data.days[data.days.length - 1] || ymd(new Date());
    const weeks = Math.min(104, Math.max(4, Math.ceil((Date.now() - new Date(from || firstDate)) / 6048e5)));
    const periodRecords = data.workouts.filter(w => w.date >= from);
    const exRecords = periodRecords.filter(w => w.exerciseId === ui.statsExerciseId);
    const periodPrs = sessions.filter(s => s.pr).reverse();
    const periodLabel = PERIODS.find(([n]) => n === ui.statsPeriod)[1];

    return `<div class="page-head"><h1>Statistics</h1>
            <select class="input" id="statsEx">${done.map(e => `<option value="${escapeHtml(e.id)}" ${e.id === ui.statsExerciseId ? 'selected' : ''}>${escapeHtml(e.name)}</option>`).join('')}</select>
            <div class="seg">${PERIODS.map(([n, l]) => `<button data-sp="${n}" class="${n === ui.statsPeriod ? 'active' : ''}">${l}</button>`).join('')}</div></div>
        <h2 class="section-title">${escapeHtml(ex?.name || '')} · ${periodLabel}</h2>
        <div class="kpis">
            ${kpi('Sessions', sessions.length)}
            ${kpi(bodyweight ? 'Best total reps' : 'Best top weight', sessions.length ? fmtNum(Math.max(...sessions.map(bodyweight ? METRICS.reps[1] : METRICS.weight[1]))) : '—')}
            ${kpi('Best session volume', vols.length ? fmtNum(Math.max(...vols)) : '—')}
            ${kpi('Volume change', fmtPct(volChange), volChange > 0 ? 'up' : volChange < 0 ? 'down' : '')}
            ${kpi('PRs', periodPrs.length)}
        </div>
        <section class="panel"><h3><span>${label} per session · larger dots = PR</span>
            <span class="seg">${Object.entries(METRICS).map(([k, [l]]) => `<button data-sm="${k}" class="${k === metric ? 'active' : ''}" ${k === 'weight' && bodyweight ? 'disabled' : ''}>${l}</button>`).join('')}</span></h3>
            ${lineChart(sessions.map(s => ({ x: s.date, y: fn(s), pr: s.pr })))}</section>
        <div class="two-col">
            <section class="panel"><h3>Volume progression · per week</h3>${barChart(weekBuckets(weeks, exRecords, setVolume), { unit: 'volume' })}</section>
            <section class="panel"><h3>PR progression</h3>
                ${periodPrs.slice(0, 12).map((s, i) => `<div class="kv-row"><span>${fmtDate(s.date, SHORT_Y)}</span>
                    <span class="num">${fmtSet(s.top)} → <b>${fmtNum(s.score)}</b> ${periodPrs[i + 1] ? `<span class="up">+${fmtNum(s.score - periodPrs[i + 1].score)}</span>` : ''}</span></div>`).join('') || '<p class="muted">No PRs in this period.</p>'}</section>
        </div>
        <section class="panel"><h3>Sessions</h3>
            <table class="sessions"><thead><tr><th>Date</th><th>Sets (▲▼ = set volume vs previous)</th><th>Top weight</th><th>Total reps</th><th>Volume</th></tr></thead><tbody>
            ${sessions.slice().reverse().slice(0, 15).map(s => `<tr><td>${fmtDate(s.date, SHORT_Y)}</td>
                <td>${setChips(s.sets, previousSession(ui.statsExerciseId, s.date)?.sets)}</td>
                <td class="num">${s.topWeight || '—'}</td><td class="num">${s.reps}</td><td class="num">${fmtNum(s.volume)}</td></tr>`).join('')}
            </tbody></table></section>

        <h2 class="section-title">All exercises · ${periodLabel}</h2>
        <div class="kpis">
            ${kpi('Sets this week', data.workouts.filter(w => weekKey(w.date) === weekKey(ymd(new Date()))).length)}
            ${kpi('Week streak', weekStreak())}
            ${kpi('Training days', new Set(periodRecords.map(w => w.date)).size)}
            ${kpi('Total volume', fmtNum(periodRecords.reduce((s, w) => s + setVolume(w), 0)))}
        </div>
        <section class="panel"><h3>Weekly volume · all exercises</h3>${barChart(weekBuckets(weeks, periodRecords, setVolume), { unit: 'volume', width: 900, height: 160 })}</section>
        <div class="two-col">
            <section class="panel"><h3>Most done (days)</h3>${rankList(mostDone(from), 10)}</section>
            <section class="panel"><h3>Muscle split (sets)</h3>${splitList(muscleSplit(from))}</section>
        </div>`;
}

// ── Rankings (distinct days, tiers over distinct counts) ─────────────────────

function renderRankings() {
    const from = periodStart(ui.rankPeriod);
    let rows;
    if (ui.rankMode === 'supersets') {
        const groups = new Map();
        data.workouts.filter(w => w.date >= from && w.supersetGroupId).forEach(w => {
            const k = `${w.date}|${w.supersetGroupId}`;
            if (!groups.has(k)) groups.set(k, { date: w.date, ids: new Set() });
            groups.get(k).ids.add(w.exerciseId);
        });
        const combos = new Map();
        groups.forEach(g => {
            if (g.ids.size < 2) return;
            const name = [...g.ids].map(exName).sort().join(' + ');
            if (!combos.has(name)) combos.set(name, new Set());
            combos.get(name).add(g.date);
        });
        rows = [...combos.entries()].map(([name, days]) => ({ name, id: null, muscle: null, count: days.size }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    } else {
        rows = mostDone(from, ui.rankMuscle);
    }
    const distinct = [...new Set(rows.map(r => r.count))];
    const max = rows[0]?.count || 1;

    return `<div class="page-head"><h1>Rankings</h1>
            <div class="seg"><button data-rm="exercises" class="${ui.rankMode === 'exercises' ? 'active' : ''}">Exercises</button><button data-rm="supersets" class="${ui.rankMode === 'supersets' ? 'active' : ''}">Supersets</button></div>
            <select class="input" id="rankMuscle" ${ui.rankMode === 'supersets' ? 'disabled' : ''}><option value="">All muscles</option>
                ${data.muscles.map(m => `<option ${m === ui.rankMuscle ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}</select>
            <div class="seg">${PERIODS.map(([n, l]) => `<button data-rp="${n}" class="${n === ui.rankPeriod ? 'active' : ''}">${l}</button>`).join('')}</div></div>
        <section class="panel">
            ${rows.map(r => {
                const tier = distinct.indexOf(r.count);
                return `<div class="rank-line"><span class="${tier < 3 ? 'medal' : 'pos'}">${['🥇', '🥈', '🥉'][tier] || tier + 1}</span>
                    <div>${r.id ? exLink(r.id) : escapeHtml(r.name)}
                        ${r.muscle ? `<span class="tag">${escapeHtml(r.muscle)}</span>` : ''}
                        <div class="bar-track"><div class="bar-fill" style="width:${(r.count / max) * 100}%"></div></div></div>
                    <span class="num">${r.count} d</span></div>`;
            }).join('') || '<p class="muted">Nothing in this period.</p>'}
        </section>`;
}

// ── Templates (editor keeps changes in memory only) ─────────────────────────

function templateLine(exerciseId, sets) {
    const st = data.exStats.get(exerciseId);
    const planned = (sets || []).filter(s => s.reps !== '' && s.reps != null);
    return `<div>${exLink(exerciseId)}
            <div>${planned.map(s => `<span class="chip num">${fmtSet(s)}</span>`).join('') || '<span class="muted">no planned sets</span>'}</div></div>
        <div class="prev-sets num">${st ? `last ${fmtDate(st.lastDate, SHORT)}<br>${setChips(st.sessions[0].sets, st.sessions[1]?.sets)}` : 'never done'}</div>`;
}

/** Flatten template rows into editor items; `link` = superset with the next item. */
function toDraft(tpl) {
    const items = [];
    (tpl?.rows || []).forEach(row => {
        const list = row.type === 'superset' ? (row.exercises || []) : [row];
        list.filter(e => e.exerciseId).forEach((e, i, arr) => items.push({
            exerciseId: e.exerciseId,
            sets: (e.sets || []).map(s => ({ reps: s.reps ?? '', weight: s.weight ?? '' })),
            link: row.type === 'superset' && i < arr.length - 1
        }));
    });
    return { id: tpl?.id || null, name: tpl?.name || '', items };
}

function fromDraft(draft) {
    const rows = [];
    const stamp = Date.now();
    const sets = (item, prefix) => item.sets.map((s, j) => ({ id: `${prefix}-set-${j + 1}`, reps: s.reps, weight: s.weight }));
    for (let i = 0; i < draft.items.length; i++) {
        const id = `tpl-row-${stamp}-${i}`;
        if (draft.items[i].link && draft.items[i + 1]) {
            const exercises = [];
            do {
                exercises.push({ id: `${id}-ex-${exercises.length}`, exerciseId: draft.items[i].exerciseId, sets: sets(draft.items[i], `${id}-ex-${exercises.length}`) });
            } while (draft.items[i].link && draft.items[++i]);
            rows.push({ id, type: 'superset', exercises });
        } else {
            rows.push({ id, type: 'single', exerciseId: draft.items[i].exerciseId, sets: sets(draft.items[i], id) });
        }
    }
    return rows;
}

function renderTemplateEditor() {
    const d = ui.tplDraft;
    const options = current => data.exercises.slice().sort((a, b) => a.name.localeCompare(b.name))
        .map(e => `<option value="${escapeHtml(e.id)}" ${e.id === current ? 'selected' : ''}>${escapeHtml(e.name)}</option>`).join('');
    return `<section class="panel stack">
        <div class="page-head"><h1>${d.id ? 'Edit template' : 'New template'}</h1>
            <button class="btn" data-td-cancel>Cancel</button><button class="btn primary" data-td-save>Save</button></div>
        <div class="note">Prototype: changes stay in this browser tab only. Nothing is saved to your account. ⛓ links an exercise with the next one as a superset.</div>
        <div class="form"><label for="tdName">Name</label><input class="input" id="tdName" data-td="name" value="${escapeHtml(d.name)}"></div>
        <div>${d.items.map((it, i) => {
            const bodyweight = data.exById.get(it.exerciseId)?.requiresWeight === false;
            const st = data.exStats.get(it.exerciseId);
            return `<div class="ed-item ${it.link || d.items[i - 1]?.link ? 'linked' : ''}">
                <div><select class="input" style="width:100%" data-ti="${i}" data-tf="exerciseId">${options(it.exerciseId)}</select>
                    <div class="prev-sets num" style="margin-top:4px">${st ? `last ${fmtDate(st.lastDate, SHORT)}: ${st.sessions[0].sets.map(fmtSet).join(', ')}` : 'never done'}</div></div>
                <div class="ed-sets">${it.sets.map((s, j) => `<span class="ed-set">
                    <input class="num" id="td-${i}-${j}-r" data-ti="${i}" data-tj="${j}" data-tf="reps" placeholder="reps" value="${escapeHtml(String(s.reps))}">
                    ${bodyweight ? '' : `×<input class="num" id="td-${i}-${j}-w" data-ti="${i}" data-tj="${j}" data-tf="weight" placeholder="kg" value="${escapeHtml(String(s.weight))}">`}
                    <button class="icon-btn" data-ta="delset" data-ti="${i}" data-tj="${j}" title="Remove set">✕</button></span>`).join('')}
                    <button class="small-link" data-ta="addset" data-ti="${i}">+ set</button></div>
                <div><button class="icon-btn" data-ta="up" data-ti="${i}" title="Move up">↑</button>
                    <button class="icon-btn" data-ta="link" data-ti="${i}" title="Superset with next" ${it.link ? 'style="color:var(--accent)"' : ''}>⛓</button>
                    <button class="icon-btn" data-ta="remove" data-ti="${i}" title="Remove">✕</button></div>
            </div>`;
        }).join('')}</div>
        <select class="input" id="tdAdd" style="max-width:320px"><option value="">+ Add exercise…</option>${options(null)}</select>
    </section>`;
}

function handleTemplateAction(btn) {
    const items = ui.tplDraft.items;
    const i = Number(btn.dataset.ti);
    const action = btn.dataset.ta;
    if (action === 'addset') {
        const last = items[i].sets[items[i].sets.length - 1] || {};
        items[i].sets.push({ reps: last.reps ?? '', weight: last.weight ?? '' });
    }
    if (action === 'delset') items[i].sets.splice(Number(btn.dataset.tj), 1);
    if (action === 'remove') items.splice(i, 1);
    if (action === 'up' && i > 0) [items[i - 1], items[i]] = [items[i], items[i - 1]];
    if (action === 'link') items[i].link = !items[i].link;
    render();
}

function saveTemplate() {
    const d = ui.tplDraft;
    if (!d.name.trim()) return alert('Name is required.');
    const tpl = { id: d.id || `proto-tpl-${Date.now()}`, name: d.name.trim(), rows: fromDraft(d) };
    const idx = data.templates.findIndex(t => t.id === tpl.id);
    if (idx >= 0) data.templates[idx] = tpl;
    else data.templates.push(tpl);
    ui.templateId = tpl.id;
    ui.tplDraft = null;
    render();
}

function renderTemplates() {
    const tpl = data.templates.find(t => t.id === ui.templateId) || data.templates[0];
    const detail = ui.tplDraft ? renderTemplateEditor() : tpl ? `<section class="panel">
            <div class="page-head"><h1>${escapeHtml(tpl.name)}</h1><button class="btn" data-tpl-edit="${escapeHtml(tpl.id)}">Edit</button></div>
            ${tpl.rows.map(row => row.type === 'superset'
                ? `<div class="tpl-ss"><span class="tag">superset</span>${(row.exercises || []).filter(e => e.exerciseId).map(e => `<div class="tpl-row">${templateLine(e.exerciseId, e.sets)}</div>`).join('')}</div>`
                : row.exerciseId ? `<div class="tpl-row">${templateLine(row.exerciseId, row.sets)}</div>` : '').join('')}
        </section>` : '<section class="panel"><p class="muted">No session templates yet.</p></section>';
    return `<h1>Templates</h1>
        <div class="ex-page">
            <aside class="panel ex-list">
                <header><button class="btn primary" data-tpl-edit="">+ New template</button></header>
                <div class="ex-items">
                ${data.templates.map(t => `<div class="ex-item ${t.id === tpl?.id && !ui.tplDraft ? 'active' : ''}" data-tpl="${escapeHtml(t.id)}">
                    <div>${escapeHtml(t.name)}<br><small>${t.rows.length} rows</small></div></div>`).join('')}
                </div></aside>
            ${detail}
        </div>`;
}

// ── Shell: rendering and events ─────────────────────────────────────────────

const NAV = [
    ['dashboard', 'Dashboard', 'layout-dashboard'], ['history', 'History', 'calendar'], ['statistics', 'Statistics', 'line-chart'],
    ['rankings', 'Rankings', 'star'], ['exercises', 'Exercises', 'dumbbell'], ['templates', 'Templates', 'clipboard-list']
];
const PAGES = {
    dashboard: renderDashboard, history: renderHistory, statistics: renderStatistics,
    rankings: renderRankings, exercises: renderExercises, templates: renderTemplates
};

function go(page) {
    ui.page = page;
    if (location.hash !== `#${page}`) history.replaceState(null, '', `#${page}`);
    render();
    window.scrollTo(0, 0);
}

function render() {
    const focused = document.activeElement?.id;
    const caret = document.activeElement?.selectionStart;
    root.className = '';
    root.innerHTML = `<header class="top"><span class="brand">OverloadPro</span><span class="proto-badge">Desktop prototype</span>
            <span class="user">${escapeHtml(SupabaseAuth.session?.user?.email || '')}</span></header>
        <main class="studio-main">${PAGES[ui.page]()}</main>
        <nav class="dock">${NAV.map(([key, label, icon]) => `<button data-page="${key}" class="${ui.page === key ? 'active' : ''}" title="${label}">
            <i data-lucide="${icon}"></i>${label}</button>`).join('')}</nav>`;
    window.lucide?.createIcons();
    if (focused) {
        const el = document.getElementById(focused);
        el?.focus();
        if (el && caret != null && el.setSelectionRange) el.setSelectionRange(caret, caret);
    }
}

root.addEventListener('click', event => {
    const t = event.target;
    const nav = t.closest('[data-page]');
    if (nav) return go(nav.dataset.page);
    const ta = t.closest('[data-ta]');
    if (ta) return handleTemplateAction(ta);
    if (t.closest('[data-td-save]')) return saveTemplate();
    if (t.closest('[data-td-cancel]')) { ui.tplDraft = null; return render(); }
    const tplEdit = t.closest('[data-tpl-edit]');
    if (tplEdit) { ui.tplDraft = toDraft(data.templates.find(x => x.id === tplEdit.dataset.tplEdit)); return render(); }
    const tpl = t.closest('[data-tpl]');
    if (tpl) { ui.templateId = tpl.dataset.tpl; ui.tplDraft = null; return render(); }
    if (t.closest('[data-ef-save]')) return saveExerciseForm();
    if (t.closest('[data-ef-cancel]')) { ui.exerciseForm = null; return render(); }
    const efEdit = t.closest('[data-ef-edit]');
    if (efEdit) {
        const ex = data.exById.get(efEdit.dataset.efEdit);
        ui.exerciseForm = ex
            ? { id: ex.id, name: ex.name, muscle: ex.muscle, equipmentType: ex.equipmentType, requiresWeight: ex.requiresWeight !== false }
            : { id: null, name: '', muscle: MUSCLES[0], equipmentType: EQUIPMENT[0], requiresWeight: true };
        return render();
    }
    const exercise = t.closest('[data-exercise]');
    if (exercise) { ui.exerciseId = exercise.dataset.exercise; ui.exerciseForm = null; return go('exercises'); }
    const hday = t.closest('[data-hday]');
    if (hday) { ui.day = hday.dataset.hday; return render(); }
    const month = t.closest('[data-month]');
    if (month) { ui.month = month.dataset.month; return ui.page === 'history' ? render() : go('history'); }
    const btn = t.closest('[data-sm], [data-sp], [data-rm], [data-rp]');
    if (btn) {
        if (btn.dataset.sm) ui.statsMetric = btn.dataset.sm;
        if (btn.dataset.sp) ui.statsPeriod = Number(btn.dataset.sp);
        if (btn.dataset.rm) ui.rankMode = btn.dataset.rm;
        if (btn.dataset.rp) ui.rankPeriod = Number(btn.dataset.rp);
        return render();
    }
    const day = t.closest('[data-day], .heat i[data-date]');
    if (day) {
        ui.day = day.dataset.day ?? day.dataset.date ?? null;
        ui.month = null;
        return ui.page === 'history' ? render() : go('dashboard');
    }
});

root.addEventListener('input', event => {
    const el = event.target;
    if (el.dataset.ef) {
        ui.exerciseForm[el.dataset.ef] = el.dataset.ef === 'requiresWeight' ? el.value === 'true' : el.value;
        return;
    }
    if (el.dataset.td) { ui.tplDraft.name = el.value; return; }
    if (el.dataset.tf) {
        const item = ui.tplDraft.items[Number(el.dataset.ti)];
        if (el.dataset.tf === 'exerciseId') { item.exerciseId = el.value; return render(); }
        item.sets[Number(el.dataset.tj)][el.dataset.tf] = el.value;
        return;
    }
    if (el.id === 'tdAdd') {
        const st = data.exStats.get(el.value);
        ui.tplDraft.items.push({ exerciseId: el.value, sets: (st ? st.sessions[0].sets : [{ reps: '', weight: '' }]).map(s => ({ reps: s.reps ?? '', weight: s.weight ?? '' })), link: false });
    }
    if (el.id === 'exSearch') ui.search = el.value;
    if (el.id === 'exMuscle') ui.muscle = el.value;
    if (el.id === 'statsEx') ui.statsExerciseId = el.value;
    if (el.id === 'rankMuscle') ui.rankMuscle = el.value;
    render();
});

window.addEventListener('hashchange', () => {
    const page = location.hash.slice(1);
    if (PAGES[page] && page !== ui.page && data) go(page);
});

function renderSignIn() {
    root.className = 'center-msg';
    root.innerHTML = `<form class="signin" id="signinForm">
        <strong>Sign in to load your data</strong>
        <input type="email" id="supabase-email" placeholder="Email" autocomplete="username" required>
        <input type="password" id="supabase-password" placeholder="Password" autocomplete="current-password">
        <button type="submit">Sign in</button>
        <button type="button" class="secondary" id="magicBtn">Send magic link instead</button>
        <p class="muted" id="signinMsg"></p>
    </form>`;
    const msg = document.getElementById('signinMsg');
    document.getElementById('signinForm').addEventListener('submit', async event => {
        event.preventDefault();
        try {
            await SupabaseAuth.signInWithPassword(
                document.getElementById('supabase-email').value,
                document.getElementById('supabase-password').value
            );
            await start();
        } catch (error) {
            msg.textContent = error.message;
        }
    });
    document.getElementById('magicBtn').addEventListener('click', async () => {
        try {
            await SupabaseAuth.requestMagicLink(document.getElementById('supabase-email').value);
            msg.textContent = 'Check your email for the sign-in link.';
        } catch (error) {
            msg.textContent = error.message;
        }
    });
}

async function start() {
    try {
        await SupabaseAuth.initialize();
        if (!SupabaseAuth.isAuthenticated()) return renderSignIn();
        root.innerHTML = '<p class="muted">Loading your workouts…</p>';
        await loadData();
        const page = location.hash.slice(1);
        if (PAGES[page]) ui.page = page;
        render();
    } catch (error) {
        root.className = 'center-msg';
        root.innerHTML = `<p>Failed to load data: ${escapeHtml(error.message)}</p>`;
    }
}

start();
