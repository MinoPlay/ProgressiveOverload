// Mapping between legacy JSON records and Supabase rows.

import { checksum } from './checksum.mjs';

function splitFields(record, knownFields) {
    return Object.fromEntries(
        Object.entries(record).filter(([key]) => !knownFields.has(key))
    );
}

function withExtraFields(extraFields, fields) {
    return {
        ...(extraFields || {}),
        ...Object.fromEntries(
            Object.entries(fields).filter(([, value]) => value !== undefined)
        )
    };
}

function mapExerciseToRow(exercise, userId) {
    const known = new Set([
        'id', 'name', 'equipmentType', 'muscle', 'requiresWeight',
        'lastSets', 'lastDate'
    ]);
    return {
        user_id: userId,
        id: exercise.id,
        name: exercise.name,
        equipment_type: exercise.equipmentType,
        muscle: exercise.muscle,
        requires_weight: exercise.requiresWeight,
        last_sets: exercise.lastSets ?? null,
        last_date: exercise.lastDate ?? null,
        extra_fields: splitFields(exercise, known),
        source_checksum: checksum(exercise)
    };
}

function mapWorkoutToRow(workout, userId) {
    const known = new Set([
        'id', 'exerciseId', 'date', 'reps', 'weight', 'sequence',
        'sessionId', 'plannedSetId', 'supersetGroupId', 'supersetRound',
        'source', 'supersetExercises'
    ]);
    return {
        user_id: userId,
        id: workout.id,
        exercise_id: workout.exerciseId,
        workout_date: workout.date,
        reps: workout.reps,
        weight: workout.weight ?? null,
        sequence: workout.sequence,
        session_id: workout.sessionId ?? null,
        planned_set_id: workout.plannedSetId ?? null,
        superset_group_id: workout.supersetGroupId ?? null,
        superset_round: workout.supersetRound ?? null,
        source: workout.source ?? null,
        superset_exercises: workout.supersetExercises ?? null,
        extra_fields: splitFields(workout, known),
        source_checksum: checksum(workout)
    };
}

function mapTemplateToRow(template, userId) {
    const known = new Set(['id', 'name', 'rows']);
    return {
        user_id: userId,
        id: template.id,
        name: template.name,
        rows: template.rows,
        extra_fields: splitFields(template, known),
        source_checksum: checksum(template)
    };
}

export function mapSnapshotToRows(snapshot, userId) {
    return {
        userSettings: [{
            user_id: userId,
            settings: snapshot.settings || {},
            source_checksum: checksum(snapshot.settings || {})
        }],
        exercises: snapshot.exercises.map(exercise => mapExerciseToRow(exercise, userId)),
        workouts: snapshot.workouts.map(workout => mapWorkoutToRow(workout, userId)),
        sessionTemplates: snapshot.sessionTemplates.map(template => mapTemplateToRow(template, userId))
    };
}

export function mapSupabaseRowsToSnapshot(rows) {
    return {
        settings: rows.userSettings[0]?.settings ?? null,
        exercises: rows.exercises.map(row => withExtraFields(row.extra_fields, {
            id: row.id,
            name: row.name,
            equipmentType: row.equipment_type,
            muscle: row.muscle,
            requiresWeight: row.requires_weight,
            lastSets: row.last_sets ?? undefined,
            lastDate: row.last_date ?? undefined
        })),
        workouts: rows.workouts.map(row => withExtraFields(row.extra_fields, {
            id: row.id,
            exerciseId: row.exercise_id,
            date: row.workout_date,
            reps: row.reps,
            weight: row.weight === null ? null : Number(row.weight),
            sequence: row.sequence,
            sessionId: row.session_id ?? undefined,
            plannedSetId: row.planned_set_id ?? undefined,
            supersetGroupId: row.superset_group_id ?? undefined,
            supersetRound: row.superset_round ?? undefined,
            source: row.source ?? undefined,
            supersetExercises: row.superset_exercises ?? undefined
        })),
        sessionTemplates: rows.sessionTemplates.map(row => withExtraFields(row.extra_fields, {
            id: row.id,
            name: row.name,
            rows: row.rows
        }))
    };
}
