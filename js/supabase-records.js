// Supabase Record Mappers
// Converts between the app's legacy JSON shapes and relational Supabase rows.

function extraFields(record, knownFields) {
    return Object.fromEntries(
        Object.entries(record).filter(([key]) => !knownFields.has(key))
    );
}

/**
 * Map an exercise to a Supabase row.
 * @param {object} exercise
 * @param {string} userId
 * @returns {object}
 */
export function exerciseToRow(exercise, userId) {
    const knownFields = new Set([
        'id', 'name', 'equipmentType', 'muscle', 'requiresWeight',
        'lastSets', 'lastDate'
    ]);
    const row = {
        user_id: userId,
        id: exercise.id,
        name: exercise.name,
        equipment_type: exercise.equipmentType,
        muscle: exercise.muscle,
        requires_weight: exercise.requiresWeight,
        last_sets: exercise.lastSets ?? null,
        last_date: exercise.lastDate ?? null,
        extra_fields: extraFields(exercise, knownFields)
    };
    return row;
}

/**
 * Map a Supabase exercise row to the app shape.
 * @param {object} row
 * @returns {object}
 */
export function exerciseFromRow(row) {
    const exercise = {
        ...(row.extra_fields || {}),
        id: row.id,
        name: row.name,
        equipmentType: row.equipment_type,
        muscle: row.muscle,
        requiresWeight: row.requires_weight
    };
    if (row.last_sets !== undefined && row.last_sets !== null) exercise.lastSets = row.last_sets;
    if (row.last_date !== undefined && row.last_date !== null) exercise.lastDate = row.last_date;
    return exercise;
}

/**
 * Map a workout to a Supabase row.
 * @param {object} workout
 * @param {string} userId
 * @returns {object}
 */
export function workoutToRow(workout, userId) {
    const knownFields = new Set([
        'id', 'exerciseId', 'date', 'reps', 'weight', 'sequence',
        'sessionId', 'plannedSetId', 'supersetGroupId', 'supersetRound',
        'source', 'supersetExercises'
    ]);
    const row = {
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
        extra_fields: extraFields(workout, knownFields)
    };
    return row;
}

/**
 * Map a Supabase workout row to the app shape.
 * @param {object} row
 * @returns {object}
 */
export function workoutFromRow(row) {
    const workout = {
        ...(row.extra_fields || {}),
        id: row.id,
        exerciseId: row.exercise_id,
        date: row.workout_date,
        reps: row.reps,
        weight: row.weight === null ? null : Number(row.weight),
        sequence: row.sequence
    };
    const optionalFields = {
        session_id: 'sessionId',
        planned_set_id: 'plannedSetId',
        superset_group_id: 'supersetGroupId',
        superset_round: 'supersetRound',
        source: 'source',
        superset_exercises: 'supersetExercises'
    };
    Object.entries(optionalFields).forEach(([source, target]) => {
        if (row[source] !== undefined && row[source] !== null && row[source] !== '') {
            workout[target] = row[source];
        }
    });
    return workout;
}

/**
 * Map a session template to a Supabase row.
 * @param {object} template
 * @param {string} userId
 * @returns {object}
 */
export function templateToRow(template, userId) {
    const knownFields = new Set(['id', 'name', 'rows']);
    return {
        user_id: userId,
        id: template.id,
        name: template.name,
        rows: template.rows || [],
        extra_fields: extraFields(template, knownFields)
    };
}

/**
 * Map a Supabase template row to the app shape.
 * @param {object} row
 * @returns {object}
 */
export function templateFromRow(row) {
    return {
        ...(row.extra_fields || {}),
        id: row.id,
        name: row.name,
        rows: row.rows || []
    };
}
