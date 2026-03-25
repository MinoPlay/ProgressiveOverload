'use strict';

const fs = require('fs');
const path = require('path');

const weekStart = process.env.WEEK_START;
const weekEnd   = process.env.WEEK_END;

if (!weekStart || !weekEnd) {
  console.error('Error: WEEK_START and WEEK_END environment variables are required');
  process.exit(1);
}

const dataDir = 'data';

// Load system prompt
const systemPrompt = fs.readFileSync('.github/prompts/weekly-summary.md', 'utf8');

// Load exercises into a lookup map
let exerciseMap = {};
try {
  const raw = JSON.parse(fs.readFileSync(path.join(dataDir, 'exercises.json'), 'utf8'));
  for (const ex of (raw.exercises || [])) {
    exerciseMap[ex.id] = ex;
  }
} catch (e) {
  console.warn('Could not read exercises.json:', e.message);
}

// Load all monthly workout files
const allWorkouts = [];
try {
  const files = fs.readdirSync(dataDir).filter(f => /^workouts-\d{4}-\d{2}\.json$/.test(f));
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
    allWorkouts.push(...(data.workouts || []));
  }
} catch (e) {
  console.warn('Could not read workout files:', e.message);
}

// Workouts within the target week
const weekWorkouts = allWorkouts.filter(w => w.date >= weekStart && w.date <= weekEnd);

// All-time max weight per exercise *before* this week (used for PR detection)
const allTimeMax = {};
for (const w of allWorkouts) {
  if (w.date < weekStart && w.weight > 0) {
    allTimeMax[w.exerciseId] = Math.max(allTimeMax[w.exerciseId] || 0, w.weight);
  }
}

// Aggregate per-exercise and per-muscle stats
const perExercise = {};
const perMuscle   = {};
const perDay      = {};

for (const w of weekWorkouts) {
  const ex     = exerciseMap[w.exerciseId] || { name: w.exerciseId, muscle: 'unknown', equipmentType: 'unknown' };
  const muscle = ex.muscle || 'unknown';
  const volume = (w.weight || 0) * (w.reps || 0);

  if (!perExercise[w.exerciseId]) {
    perExercise[w.exerciseId] = {
      name: ex.name, muscle, equipmentType: ex.equipmentType || 'unknown',
      sets: 0, totalReps: 0, totalVolume: 0, maxWeight: 0
    };
  }
  const es = perExercise[w.exerciseId];
  es.sets++;
  es.totalReps  += (w.reps || 0);
  es.totalVolume += volume;
  if ((w.weight || 0) > es.maxWeight) es.maxWeight = w.weight;

  if (!perMuscle[muscle]) perMuscle[muscle] = { sets: 0, totalVolume: 0, exercises: new Set() };
  perMuscle[muscle].sets++;
  perMuscle[muscle].totalVolume += volume;
  perMuscle[muscle].exercises.add(ex.name);

  if (!perDay[w.date]) perDay[w.date] = { sets: 0, muscles: new Set() };
  perDay[w.date].sets++;
  perDay[w.date].muscles.add(muscle);
}

// Detect personal records
const personalRecords = [];
for (const [exId, stats] of Object.entries(perExercise)) {
  if (stats.maxWeight > 0) {
    const prevMax = allTimeMax[exId] || 0;
    if (stats.maxWeight > prevMax) {
      personalRecords.push({
        exercise:      stats.name,
        newMax:        stats.maxWeight,
        previousMax:   prevMax || null,
        improvementKg: prevMax ? +(stats.maxWeight - prevMax).toFixed(1) : null
      });
    }
  }
}

// Helper: day name from YYYY-MM-DD
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function dayName(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return DAY_NAMES[new Date(y, m - 1, d).getDay()];
}

// Build human-readable context for the AI user message
const lines = [];
lines.push(`Workout data for the week of ${weekStart} to ${weekEnd}:`);
lines.push('');
lines.push('=== WEEK SUMMARY ===');
lines.push(`Training days: ${Object.keys(perDay).length}/7`);
lines.push(`Total sets: ${weekWorkouts.length}`);
lines.push(`Total reps: ${weekWorkouts.reduce((s, w) => s + (w.reps || 0), 0)}`);
const totalVolume = weekWorkouts.reduce((s, w) => s + (w.weight || 0) * (w.reps || 0), 0);
lines.push(`Total volume: ${Math.round(totalVolume).toLocaleString('en')} kg·reps`);
lines.push(`Unique exercises: ${Object.keys(perExercise).length}`);
lines.push('');

if (weekWorkouts.length > 0) {
  lines.push('=== TRAINING LOG (each day) ===');
  for (const date of Object.keys(perDay).sort()) {
    const d = perDay[date];
    lines.push(`${date} (${dayName(date)}): ${d.sets} sets — muscles: ${Array.from(d.muscles).join(', ')}`);
  }
  lines.push('');

  lines.push('=== VOLUME BY MUSCLE GROUP ===');
  const byVolume = Object.entries(perMuscle).sort(([, a], [, b]) => b.totalVolume - a.totalVolume);
  for (const [muscle, s] of byVolume) {
    lines.push(`${muscle}: ${s.sets} sets, ${Math.round(s.totalVolume).toLocaleString('en')} kg·reps (exercises: ${Array.from(s.exercises).join(', ')})`);
  }
  lines.push('');

  lines.push('=== EXERCISE BREAKDOWN ===');
  for (const stats of Object.values(perExercise)) {
    const weightPart = stats.maxWeight > 0 ? `, max weight ${stats.maxWeight} kg` : '';
    lines.push(`${stats.name} (${stats.muscle}, ${stats.equipmentType}): ${stats.sets} sets, ${stats.totalReps} reps${weightPart}, total volume ${Math.round(stats.totalVolume).toLocaleString('en')} kg·reps`);
  }
  lines.push('');

  lines.push('=== PERSONAL RECORDS THIS WEEK ===');
  if (personalRecords.length > 0) {
    for (const pr of personalRecords) {
      if (pr.previousMax) {
        lines.push(`${pr.exercise}: NEW MAX ${pr.newMax} kg (previous best: ${pr.previousMax} kg, +${pr.improvementKg} kg)`);
      } else {
        lines.push(`${pr.exercise}: First time logging with weight — ${pr.newMax} kg`);
      }
    }
  } else {
    lines.push('No new personal records this week.');
  }
} else {
  lines.push('No workouts were logged during this week (rest week or data not yet synced).');
}

lines.push('');
lines.push('Please generate the weekly workout summary report based on the data above.');

// Assemble the GitHub Models API request payload
const apiRequest = {
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: lines.join('\n') }
  ],
  temperature: 0.7,
  max_tokens: 2000
};

fs.writeFileSync('api-request.json', JSON.stringify(apiRequest, null, 2));

console.log(`Built API request for ${weekStart} → ${weekEnd}`);
console.log(`Training days: ${Object.keys(perDay).length}, Total sets: ${weekWorkouts.length}, PRs: ${personalRecords.length}`);
