import test from 'node:test';
import assert from 'node:assert/strict';

import {
    exerciseFromRow,
    exerciseToRow,
    templateFromRow,
    templateToRow,
    workoutFromRow,
    workoutToRow
} from '../js/supabase-records.js';

const userId = '11111111-1111-1111-1111-111111111111';

test('exercise mapping preserves optional progress fields', () => {
    const exercise = {
        id: 'exercise-1',
        name: 'Bench Press',
        equipmentType: 'barbell',
        muscle: 'chest',
        requiresWeight: true,
        lastSets: [{ reps: 5, weight: 100 }],
        lastDate: '2026-09-28'
    };

    const row = exerciseToRow(exercise, userId);

    assert.deepEqual(row, {
        user_id: userId,
        id: 'exercise-1',
        name: 'Bench Press',
        equipment_type: 'barbell',
        muscle: 'chest',
        requires_weight: true,
        extra_fields: {},
        last_sets: [{ reps: 5, weight: 100 }],
        last_date: '2026-09-28'
    });
    assert.deepEqual(exerciseFromRow(row), exercise);
});

test('workout mapping preserves all optional metadata', () => {
    const workout = {
        id: 'workout-1',
        exerciseId: 'exercise-1',
        date: '2026-09-28',
        reps: 8,
        weight: 82.5,
        sequence: 3,
        sessionId: 'session-1',
        plannedSetId: 'set-1',
        supersetGroupId: 'group-1',
        supersetRound: 2,
        source: 'planner',
        supersetExercises: ['exercise-1', 'exercise-2']
    };

    const row = workoutToRow(workout, userId);

    assert.deepEqual(row, {
        user_id: userId,
        id: 'workout-1',
        exercise_id: 'exercise-1',
        workout_date: '2026-09-28',
        reps: 8,
        weight: 82.5,
        sequence: 3,
        extra_fields: {},
        session_id: 'session-1',
        planned_set_id: 'set-1',
        superset_group_id: 'group-1',
        superset_round: 2,
        source: 'planner',
        superset_exercises: ['exercise-1', 'exercise-2']
    });
    assert.deepEqual(workoutFromRow(row), workout);
});

test('workout mapping omits absent optional metadata and preserves null weight', () => {
    const workout = {
        id: 'workout-2',
        exerciseId: 'exercise-2',
        date: '2026-09-28',
        reps: 12,
        weight: null,
        sequence: 1
    };

    const row = workoutToRow(workout, userId);

    assert.equal(row.weight, null);
    assert.equal(row.session_id, null);
    assert.equal(row.superset_group_id, null);
    assert.deepEqual(workoutFromRow(row), workout);
});

test('template mapping preserves nested JSON rows', () => {
    const template = {
        id: 'template-1',
        name: 'Push Day',
        rows: [{
            id: 'row-1',
            type: 'single',
            exerciseId: 'exercise-1',
            sets: [{ id: 'set-1', reps: 8, weight: 80 }]
        }]
    };

    const row = templateToRow(template, userId);

    assert.deepEqual(row, {
        user_id: userId,
        id: 'template-1',
        name: 'Push Day',
        rows: template.rows,
        extra_fields: {}
    });
    assert.deepEqual(templateFromRow(row), template);
});

test('record mappings round-trip unknown legacy fields through extra_fields', () => {
    const workout = {
        id: 'workout-extra',
        exerciseId: 'exercise-1',
        date: '2026-09-28',
        reps: 6,
        weight: 90,
        sequence: 1,
        tempo: '3-1-1'
    };

    const row = workoutToRow(workout, userId);

    assert.deepEqual(row.extra_fields, { tempo: '3-1-1' });
    assert.deepEqual(workoutFromRow(row), workout);
});
