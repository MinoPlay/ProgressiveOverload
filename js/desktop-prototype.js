// Desktop Prototype (throwaway)
// Three structurally different desktop layouts rendered from the signed-in user's real Supabase data.
// Read-only: only SELECT queries are issued. Switch layouts with ?variant=A|B|C or the floating bar.

import { SupabaseAuth } from './supabase-auth.js';
import { SupabaseAPI } from './supabase-api.js';
import { escapeHtml, estimateOneRepMax, formatEquipmentType } from './utils.js';

const VARIANTS = [
    { key: 'A', name: 'Studio', render: renderStudio },
    { key: 'B', name: 'Ledger', render: renderLedger },
    { key: 'C', name: 'Focus', render: renderFocus }
];

const root = document.getElementById('root');
const ui = { ledgerTab: 'log', ledgerSearch: '', ledgerMuscle: '', focusId: null, focusSearch: '', focusMuscle: '' };
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

function fmtSet(set) {
    return set.weight ? `${set.reps}×${+set.weight}` : `${set.reps}`;
}

function fmtDate(dateStr, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
    return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, opts);
}

function fmtNum(n) {
    return Math.round(n).toLocaleString();
}

function weekKey(dateStr) {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return ymd(d);
}

async function loadData() {
    const [{ exercises }, workouts] = await Promise.all([
        SupabaseAPI.getExercises(),
        SupabaseAPI.getWorkoutsInRange(new Date(2000, 0, 1), new Date())
    ]);
    const exById = new Map(exercises.map(e => [e.id, e]));
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

    // Per exercise: sessions newest first, with top set and volume.
    const exStats = new Map();
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
                    volume: sets.reduce((sum, s) => sum + (s.weight ? s.weight * s.reps : 0), 0),
                    reps: sets.reduce((sum, s) => sum + s.reps, 0)
                };
            })
            .sort((a, b) => b.date.localeCompare(a.date));
        const best = sessions.reduce((b, s) => (s.score > b.score ? s : b), sessions[0]);
        exStats.set(exerciseId, { sessions, best, lastDate: sessions[0].date, totalSets: sessions.reduce((n, s) => n + s.sets.length, 0) });
    });

    const days = [...byDay.keys()].sort().reverse();
    const muscles = [...new Set(exercises.map(e => e.muscle).filter(Boolean))].sort();
    return { exercises, exById, workouts, byDay, days, exStats, muscles };
}

function exName(id) {
    return data.exById.get(id)?.name || 'Unknown exercise';
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

function deltaHtml(current, previous) {
    if (!previous) return '<span class="muted">new</span>';
    const diff = current - previous;
    if (Math.abs(diff) < 0.5) return '<span class="muted">=</span>';
    return diff > 0 ? `<span class="delta-up">▲ ${fmtNum(diff)}</span>` : `<span class="delta-down">▼ ${fmtNum(-diff)}</span>`;
}

function setsInRange(fromDate) {
    return data.workouts.filter(w => w.date >= fromDate);
}

function weeklySetCounts(weeks) {
    const counts = new Map();
    const start = new Date();
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (weeks - 1) * 7);
    for (let i = 0; i < weeks; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i * 7);
        counts.set(ymd(d), 0);
    }
    data.workouts.forEach(w => {
        const k = weekKey(w.date);
        if (counts.has(k)) counts.set(k, counts.get(k) + 1);
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

// ── SVG helpers ──────────────────────────────────────────────────────────────

function barChart(entries, width = 560, height = 150) {
    const max = Math.max(1, ...entries.map(([, v]) => v));
    const bw = width / entries.length;
    const bars = entries.map(([label, v], i) => {
        const h = (v / max) * (height - 22);
        return `<rect x="${i * bw + 3}" y="${height - 16 - h}" width="${bw - 6}" height="${h}" rx="3" fill="url(#g)"><title>Week of ${label}: ${v} sets</title></rect>
            <text x="${i * bw + bw / 2}" y="${height - 3}" font-size="9" text-anchor="middle" fill="#6b7088">${fmtDate(label, { day: 'numeric', month: 'numeric' })}</text>`;
    }).join('');
    return `<svg viewBox="0 0 ${width} ${height}" width="100%" preserveAspectRatio="none">
        <defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#667eea"/><stop offset="1" stop-color="#764ba2"/></linearGradient></defs>${bars}</svg>`;
}

function lineChart(points, width = 700, height = 200) {
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
    const dots = points.map(p => `<circle cx="${px(p)}" cy="${py(p)}" r="3" fill="#667eea"><title>${p.x}: ${fmtNum(p.y)}</title></circle>`).join('');
    return `<svg viewBox="0 0 ${width} ${height}" width="100%">
        <text x="0" y="14" font-size="10" fill="#6b7088">${fmtNum(max)}</text>
        <text x="0" y="${height - 20}" font-size="10" fill="#6b7088">${fmtNum(min)}</text>
        <text x="30" y="${height - 4}" font-size="10" fill="#6b7088">${fmtDate(points[0].x, { month: 'short', year: '2-digit' })}</text>
        <text x="${width - 10}" y="${height - 4}" font-size="10" text-anchor="end" fill="#6b7088">${fmtDate(points[points.length - 1].x, { month: 'short', year: '2-digit' })}</text>
        <path d="${path}" fill="none" stroke="#667eea" stroke-width="2"/>${dots}</svg>`;
}

function heatmap(dateCounts, weeks = 26, selectedDates = new Set()) {
    const start = new Date();
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (weeks - 1) * 7);
    const today = ymd(new Date());
    let cells = '';
    for (let i = 0; i < weeks * 7; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const key = ymd(d);
        if (key > today) { cells += '<i style="visibility:hidden"></i>'; continue; }
        const n = dateCounts.get(key) || 0;
        const level = n === 0 ? '' : n < 10 ? 'l1' : n < 20 ? 'l2' : 'l3';
        cells += `<i class="${level} ${selectedDates.has(key) ? 'sel' : ''}" title="${key}: ${n} sets"></i>`;
    }
    return `<div class="heat">${cells}</div>`;
}

// ── Variant A: Studio (sidebar + dashboard cards) ───────────────────────────

function renderStudio() {
    const lastDay = data.days[0];
    const lastSets = lastDay ? data.byDay.get(lastDay) : [];
    const sets30 = setsInRange(daysAgo(30));
    const days30 = new Set(sets30.map(w => w.date)).size;
    const volume30 = sets30.reduce((s, w) => s + (w.weight ? w.weight * w.reps : 0), 0);
    const thisWeek = data.workouts.filter(w => weekKey(w.date) === weekKey(ymd(new Date()))).length;

    const rankCounts = new Map();
    const since90 = daysAgo(90);
    data.exStats.forEach((st, id) => {
        const n = st.sessions.filter(s => s.date >= since90).length;
        if (n) rankCounts.set(id, n);
    });
    const ranking = [...rankCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const rankMax = ranking[0]?.[1] || 1;

    const muscleSets = new Map();
    sets30.forEach(w => {
        const m = data.exById.get(w.exerciseId)?.muscle || 'other';
        muscleSets.set(m, (muscleSets.get(m) || 0) + 1);
    });
    const muscleRows = [...muscleSets.entries()].sort((a, b) => b[1] - a[1]);
    const muscleMax = muscleRows[0]?.[1] || 1;

    const sessionHtml = lastDay ? exerciseOrderForDay(lastSets).map(id => {
        const session = data.exStats.get(id).sessions.find(s => s.date === lastDay);
        const prev = previousSession(id, lastDay);
        return `<div class="session-ex">
            <strong>${escapeHtml(exName(id))}</strong>
            <span class="num">${deltaHtml(session.score, prev?.score)}</span>
            <div>${session.sets.map(s => `<span class="chip num">${fmtSet(s)}</span>`).join('')}</div>
            <span class="muted num">${prev ? `prev ${prev.sets.map(fmtSet).join(', ')}` : ''}</span>
        </div>`;
    }).join('') : '<p class="muted">No workouts yet.</p>';

    return `<div class="studio">
        <aside class="studio-side">
            <div class="brand">OverloadPro</div>
            <a href="#" class="active">Dashboard</a>
            <a href="#">Workout</a>
            <a href="#">History</a>
            <a href="#">Statistics</a>
            <a href="#">Rankings</a>
            <a href="#">Exercises</a>
            <a href="#">Templates</a>
            <div class="user">${escapeHtml(SupabaseAuth.session?.user?.email || '')}</div>
        </aside>
        <main class="studio-main">
            <h1>Dashboard</h1>
            <div class="kpis">
                <div class="panel kpi"><span class="muted">Training days · 30d</span><b class="num">${days30}</b></div>
                <div class="panel kpi"><span class="muted">Sets this week</span><b class="num">${thisWeek}</b></div>
                <div class="panel kpi"><span class="muted">Volume · 30d (kg)</span><b class="num">${fmtNum(volume30)}</b></div>
                <div class="panel kpi"><span class="muted">Week streak</span><b class="num">${weekStreak()}</b></div>
            </div>
            <div class="studio-grid">
                <section class="panel">
                    <h3>Last session · ${lastDay ? fmtDate(lastDay) : '—'}</h3>
                    ${sessionHtml}
                </section>
                <div style="display:grid; gap:18px; align-content:start">
                    <section class="panel"><h3>Sets per week · 12 weeks</h3>${barChart(weeklySetCounts(12), 420, 140)}</section>
                    <section class="panel"><h3>Most done · 90 days</h3>
                        ${ranking.map(([id, n], i) => `<div class="rank-row"><span class="muted">${i + 1}</span>
                            <div><div>${escapeHtml(exName(id))}</div><div class="bar-track"><div class="bar-fill" style="width:${(n / rankMax) * 100}%"></div></div></div>
                            <span class="num">${n}d</span></div>`).join('') || '<p class="muted">Nothing in the last 90 days.</p>'}
                    </section>
                    <section class="panel"><h3>Muscle split · 30 days (sets)</h3>
                        ${muscleRows.map(([m, n]) => `<div class="muscle-row"><span>${escapeHtml(m)}</span>
                            <div class="bar-track"><div class="bar-fill" style="width:${(n / muscleMax) * 100}%"></div></div><span class="num muted">${n}</span></div>`).join('') || '<p class="muted">No sets in the last 30 days.</p>'}
                    </section>
                </div>
            </div>
        </main>
    </div>`;
}

// ── Variant B: Ledger (dense spreadsheet) ───────────────────────────────────

function ledgerMatches(exerciseId) {
    const ex = data.exById.get(exerciseId);
    if (ui.ledgerMuscle && ex?.muscle !== ui.ledgerMuscle) return false;
    if (ui.ledgerSearch && !(ex?.name || '').toLowerCase().includes(ui.ledgerSearch.toLowerCase())) return false;
    return true;
}

function renderLedgerLog() {
    let rows = '';
    let shown = 0;
    for (const date of data.days) {
        const ids = exerciseOrderForDay(data.byDay.get(date)).filter(ledgerMatches);
        if (!ids.length) continue;
        if (shown++ >= 60) break;
        const daySets = data.byDay.get(date).filter(w => ids.includes(w.exerciseId));
        rows += `<tr class="day"><td colspan="3">${fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</td>
            <td class="r num">${daySets.length} sets</td><td class="r num">${fmtNum(daySets.reduce((s, w) => s + (w.weight ? w.weight * w.reps : 0), 0))}</td><td></td><td></td></tr>`;
        ids.forEach(id => {
            const ex = data.exById.get(id);
            const session = data.exStats.get(id).sessions.find(s => s.date === date);
            const prev = previousSession(id, date);
            rows += `<tr>
                <td>${escapeHtml(exName(id))}</td>
                <td><span class="tag">${escapeHtml(ex?.muscle || '')}</span> <span class="tag">${escapeHtml(formatEquipmentType(ex?.equipmentType || ''))}</span></td>
                <td class="num">${session.sets.map(fmtSet).join('  ·  ')}</td>
                <td class="r num">${session.sets.length}</td>
                <td class="r num">${session.volume ? fmtNum(session.volume) : '—'}</td>
                <td class="r num">${fmtNum(session.score)}</td>
                <td class="r num">${deltaHtml(session.score, prev?.score)}</td>
            </tr>`;
        });
    }
    return `<table class="ledger-table"><thead><tr>
        <th>Exercise</th><th>Tags</th><th>Sets (reps×kg)</th><th class="r">Sets</th><th class="r">Volume</th><th class="r">Best e1RM</th><th class="r">vs prev</th>
    </tr></thead><tbody>${rows || '<tr><td colspan="7" class="muted">No matching workouts.</td></tr>'}</tbody></table>`;
}

function renderLedgerExercises() {
    const rows = data.exercises.filter(e => ledgerMatches(e.id)).map(e => ({ e, st: data.exStats.get(e.id) }))
        .sort((a, b) => (b.st?.lastDate || '').localeCompare(a.st?.lastDate || ''))
        .map(({ e, st }) => `<tr>
            <td>${escapeHtml(e.name)}</td>
            <td><span class="tag">${escapeHtml(e.muscle || '')}</span> <span class="tag">${escapeHtml(formatEquipmentType(e.equipmentType))}</span></td>
            <td class="num">${st ? fmtDate(st.lastDate, { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}</td>
            <td class="r num">${st ? st.sessions.length : 0}</td>
            <td class="r num">${st ? st.totalSets : 0}</td>
            <td class="num">${st ? st.sessions[0].sets.map(fmtSet).join('  ·  ') : ''}</td>
            <td class="r num">${st ? `${fmtNum(st.best.score)} <span class="muted">(${fmtDate(st.best.date, { month: 'short', year: '2-digit' })})</span>` : '—'}</td>
        </tr>`).join('');
    return `<table class="ledger-table"><thead><tr>
        <th>Exercise</th><th>Tags</th><th>Last done</th><th class="r">Days</th><th class="r">Sets</th><th>Last sets</th><th class="r">Best e1RM</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}

function renderLedger() {
    const sets7 = setsInRange(daysAgo(7));
    const sets30 = setsInRange(daysAgo(30));
    const totalVolume = data.workouts.reduce((s, w) => s + (w.weight ? w.weight * w.reps : 0), 0);
    return `<div class="ledger">
        <div class="ledger-top">
            <span class="brand">OverloadPro</span>
            <div class="ledger-tabs">
                <button data-tab="log" class="${ui.ledgerTab === 'log' ? 'active' : ''}">Log</button>
                <button data-tab="exercises" class="${ui.ledgerTab === 'exercises' ? 'active' : ''}">Exercises</button>
            </div>
            <div class="ledger-filters">
                <input id="ledgerSearch" placeholder="Filter exercise…" value="${escapeHtml(ui.ledgerSearch)}">
                <select id="ledgerMuscle"><option value="">All muscles</option>
                    ${data.muscles.map(m => `<option ${m === ui.ledgerMuscle ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="ledger-body">
            <div class="ledger-table-wrap">${ui.ledgerTab === 'log' ? renderLedgerLog() : renderLedgerExercises()}</div>
            <aside class="ledger-side">
                <section><h3 class="muted" style="font-size:12px;text-transform:uppercase">Totals</h3>
                    <div class="stat-line"><span>Training days</span><b class="num">${data.days.length}</b></div>
                    <div class="stat-line"><span>Total sets</span><b class="num">${data.workouts.length}</b></div>
                    <div class="stat-line"><span>Total volume</span><b class="num">${fmtNum(totalVolume)}</b></div>
                    <div class="stat-line"><span>Exercises used</span><b class="num">${data.exStats.size} / ${data.exercises.length}</b></div>
                    <div class="stat-line"><span>Sets · 7d / 30d</span><b class="num">${sets7.length} / ${sets30.length}</b></div>
                    <div class="stat-line"><span>Week streak</span><b class="num">${weekStreak()}</b></div>
                </section>
                <section><h3 class="muted" style="font-size:12px;text-transform:uppercase">Sets per week</h3>${barChart(weeklySetCounts(10), 260, 110)}</section>
            </aside>
        </div>
    </div>`;
}

// ── Variant C: Focus (exercise list · detail · context) ─────────────────────

function renderFocus() {
    const list = data.exercises
        .filter(e => !ui.focusMuscle || e.muscle === ui.focusMuscle)
        .filter(e => !ui.focusSearch || e.name.toLowerCase().includes(ui.focusSearch.toLowerCase()))
        .map(e => ({ e, st: data.exStats.get(e.id) }))
        .sort((a, b) => (b.st?.lastDate || '').localeCompare(a.st?.lastDate || '') || a.e.name.localeCompare(b.e.name));
    if (!ui.focusId || !data.exById.has(ui.focusId)) ui.focusId = list.find(x => x.st)?.e.id || list[0]?.e.id || null;

    const ex = data.exById.get(ui.focusId);
    const st = data.exStats.get(ui.focusId);
    const dayCounts = new Map([...data.byDay.entries()].map(([d, sets]) => [d, sets.length]));
    const exDates = new Set(st ? st.sessions.map(s => s.date) : []);

    // Running PRs: sessions that beat every earlier session.
    const prs = [];
    if (st) {
        let best = -Infinity;
        st.sessions.slice().reverse().forEach(s => {
            if (s.score > best) { best = s.score; prs.push(s); }
        });
    }
    const avgGap = st && st.sessions.length > 1
        ? (new Date(st.sessions[0].date) - new Date(st.sessions[st.sessions.length - 1].date)) / 86400000 / (st.sessions.length - 1)
        : null;

    const main = ex ? `
        <div><span class="tag">${escapeHtml(ex.muscle || '')}</span> <span class="tag">${escapeHtml(formatEquipmentType(ex.equipmentType))}</span>
            <h1>${escapeHtml(ex.name)}</h1></div>
        <div class="focus-stats">
            <div class="panel"><span class="muted">Best e1RM</span><b class="num">${st ? fmtNum(st.best.score) : '—'}</b></div>
            <div class="panel"><span class="muted">Days done</span><b class="num">${st ? st.sessions.length : 0}</b></div>
            <div class="panel"><span class="muted">Last done</span><b>${st ? fmtDate(st.lastDate, { day: 'numeric', month: 'short' }) : '—'}</b></div>
            <div class="panel"><span class="muted">Avg gap</span><b class="num">${avgGap ? `${avgGap.toFixed(1)} d` : '—'}</b></div>
        </div>
        <section class="panel"><h3>${ex.requiresWeight === false ? 'Best reps' : 'Estimated 1RM'} per session</h3>
            ${st ? lineChart(st.sessions.slice().reverse().map(s => ({ x: s.date, y: s.score }))) : '<p class="muted">Never logged.</p>'}</section>
        <section class="panel"><h3>Sessions</h3>
            <table class="sessions"><thead><tr><th>Date</th><th>Sets</th><th>Top set</th><th>Volume</th><th>vs prev</th></tr></thead><tbody>
            ${st ? st.sessions.slice(0, 40).map((s, i) => `<tr>
                <td>${fmtDate(s.date, { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' })}</td>
                <td class="num">${s.sets.map(x => `<span class="chip">${fmtSet(x)}</span>`).join('')}</td>
                <td class="num">${fmtSet(s.top)}</td>
                <td class="num">${s.volume ? fmtNum(s.volume) : '—'}</td>
                <td class="num">${deltaHtml(s.score, st.sessions[i + 1]?.score)}</td></tr>`).join('') : ''}
            </tbody></table></section>` : '<p class="muted">No exercises.</p>';

    return `<div class="focus">
        <aside class="focus-list">
            <header>
                <span class="brand">OverloadPro</span>
                <input id="focusSearch" placeholder="Search exercises…" value="${escapeHtml(ui.focusSearch)}">
                <select id="focusMuscle"><option value="">All muscles</option>
                    ${data.muscles.map(m => `<option ${m === ui.focusMuscle ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
                </select>
            </header>
            <div class="focus-items">
                ${list.map(({ e, st: s }) => `<div class="focus-item ${e.id === ui.focusId ? 'active' : ''}" data-id="${escapeHtml(e.id)}">
                    <div>${escapeHtml(e.name)}<br><small>${escapeHtml(e.muscle || '')} · ${escapeHtml(formatEquipmentType(e.equipmentType))}</small></div>
                    <small class="num">${s ? fmtDate(s.lastDate, { day: 'numeric', month: 'short' }) : 'never'}</small>
                </div>`).join('')}
            </div>
        </aside>
        <main class="focus-main">${main}</main>
        <aside class="focus-side">
            <section><h3 class="muted" style="font-size:12px;text-transform:uppercase;margin-bottom:8px">Training calendar · 26 weeks</h3>
                ${heatmap(dayCounts, 26, exDates)}
                <p class="muted" style="font-size:11px;margin-top:6px">Outlined = days with this exercise</p></section>
            <section><h3 class="muted" style="font-size:12px;text-transform:uppercase;margin-bottom:6px">PR progression</h3>
                ${prs.slice().reverse().slice(0, 10).map(s => `<div class="pr-row"><span>${fmtDate(s.date, { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                    <span class="num">${fmtSet(s.top)} → <b>${fmtNum(s.score)}</b></span></div>`).join('') || '<p class="muted">—</p>'}</section>
            <section><h3 class="muted" style="font-size:12px;text-transform:uppercase;margin-bottom:6px">Done together with</h3>
                ${companions(ui.focusId).map(([id, n]) => `<div class="pr-row"><span>${escapeHtml(exName(id))}</span><span class="num muted">${n}×</span></div>`).join('') || '<p class="muted">—</p>'}</section>
        </aside>
    </div>`;
}

function companions(exerciseId) {
    const st = data.exStats.get(exerciseId);
    if (!st) return [];
    const counts = new Map();
    st.sessions.forEach(s => {
        new Set(data.byDay.get(s.date).map(w => w.exerciseId)).forEach(id => {
            if (id !== exerciseId) counts.set(id, (counts.get(id) || 0) + 1);
        });
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
}

// ── Shell: rendering, events, switcher ──────────────────────────────────────

function currentVariant() {
    const key = new URLSearchParams(location.search).get('variant')?.toUpperCase();
    return VARIANTS.find(v => v.key === key) || VARIANTS[0];
}

function render() {
    const variant = currentVariant();
    const focused = document.activeElement?.id;
    const caret = document.activeElement?.selectionStart;
    root.className = '';
    root.innerHTML = variant.render() + `<div class="proto-switcher" role="toolbar" aria-label="Prototype variant switcher">
        <button data-step="-1" aria-label="Previous variant">←</button>
        <span>${variant.key} (${variant.name}) · prototype</span>
        <button data-step="1" aria-label="Next variant">→</button></div>`;
    if (focused) {
        const el = document.getElementById(focused);
        el?.focus();
        if (el && caret != null && el.setSelectionRange) el.setSelectionRange(caret, caret);
    }
}

function step(dir) {
    const i = VARIANTS.indexOf(currentVariant());
    const next = VARIANTS[(i + dir + VARIANTS.length) % VARIANTS.length];
    const url = new URL(location.href);
    url.searchParams.set('variant', next.key);
    history.replaceState(null, '', url);
    render();
}

root.addEventListener('click', event => {
    const stepBtn = event.target.closest('[data-step]');
    if (stepBtn) return step(Number(stepBtn.dataset.step));
    const tab = event.target.closest('[data-tab]');
    if (tab) { ui.ledgerTab = tab.dataset.tab; return render(); }
    const item = event.target.closest('.focus-item');
    if (item) { ui.focusId = item.dataset.id; return render(); }
    if (event.target.closest('a[href="#"]')) event.preventDefault();
});

root.addEventListener('input', event => {
    const map = { ledgerSearch: 'ledgerSearch', ledgerMuscle: 'ledgerMuscle', focusSearch: 'focusSearch', focusMuscle: 'focusMuscle' };
    const key = map[event.target.id];
    if (key) { ui[key] = event.target.value; render(); }
});

document.addEventListener('keydown', event => {
    if (event.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (event.key === 'ArrowLeft') step(-1);
    if (event.key === 'ArrowRight') step(1);
});

function renderSignIn(message = '') {
    root.className = 'center-msg';
    root.innerHTML = `<form class="signin" id="signinForm">
        <strong>Sign in to load your data</strong>
        <input type="email" id="supabase-email" placeholder="Email" autocomplete="username" required>
        <input type="password" id="supabase-password" placeholder="Password" autocomplete="current-password">
        <button type="submit">Sign in</button>
        <button type="button" class="secondary" id="magicBtn">Send magic link instead</button>
        <p class="muted" id="signinMsg">${escapeHtml(message)}</p>
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
        data = await loadData();
        render();
    } catch (error) {
        root.className = 'center-msg';
        root.innerHTML = `<p>Failed to load data: ${escapeHtml(error.message)}</p>`;
    }
}

start();
