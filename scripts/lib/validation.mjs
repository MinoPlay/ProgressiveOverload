// Validation for legacy GitHub snapshots.

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function validateCollection(name, items, errors) {
    if (!Array.isArray(items)) {
        errors.push(`${name} must be an array`);
        return new Set();
    }

    const ids = new Set();
    for (const [index, item] of items.entries()) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            errors.push(`${name}[${index}] must be an object`);
            continue;
        }
        if (typeof item.id !== 'string' || !item.id.trim()) {
            errors.push(`${name}[${index}] must have a non-empty string ID`);
            continue;
        }
        if (ids.has(item.id)) {
            errors.push(`Duplicate ${name.slice(0, -1)} ID: ${item.id}`);
        }
        ids.add(item.id);
    }
    return ids;
}

function collectTemplateExerciseReferences(value, references) {
    if (Array.isArray(value)) {
        value.forEach(item => collectTemplateExerciseReferences(item, references));
        return;
    }
    if (!value || typeof value !== 'object') {
        return;
    }

    if (typeof value.exerciseId === 'string') {
        references.add(value.exerciseId);
    }
    if (Array.isArray(value.supersetExercises)) {
        value.supersetExercises
            .filter(id => typeof id === 'string')
            .forEach(id => references.add(id));
    }
    Object.values(value).forEach(item => collectTemplateExerciseReferences(item, references));
}

export function validateSnapshot(snapshot) {
    const errors = [];

    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
        throw new Error('Snapshot must be an object');
    }
    if (snapshot.settings !== null &&
        (typeof snapshot.settings !== 'object' || Array.isArray(snapshot.settings))) {
        errors.push('settings must be an object or null');
    }

    const exerciseIds = validateCollection('exercises', snapshot.exercises, errors);
    validateCollection('workouts', snapshot.workouts, errors);
    validateCollection('session templates', snapshot.sessionTemplates, errors);

    for (const [index, exercise] of (snapshot.exercises || []).entries()) {
        if (typeof exercise.name !== 'string' || !exercise.name.trim()) {
            errors.push(`exercises[${index}] must have a name`);
        }
        if (typeof exercise.equipmentType !== 'string' || !exercise.equipmentType) {
            errors.push(`exercises[${index}] must have an equipmentType`);
        }
        if (typeof exercise.muscle !== 'string' || !exercise.muscle) {
            errors.push(`exercises[${index}] must have a muscle`);
        }
        if (typeof exercise.requiresWeight !== 'boolean') {
            errors.push(`exercises[${index}] must have a boolean requiresWeight`);
        }
        if (exercise.lastDate !== undefined &&
            exercise.lastDate !== null &&
            !datePattern.test(exercise.lastDate)) {
            errors.push(`exercises[${index}] has an invalid lastDate`);
        }
    }

    for (const [index, workout] of (snapshot.workouts || []).entries()) {
        if (!exerciseIds.has(workout.exerciseId)) {
            errors.push(`workouts[${index}] references unknown exercise: ${workout.exerciseId}`);
        }
        if (!datePattern.test(workout.date || '')) {
            errors.push(`workouts[${index}] has an invalid date`);
        }
        if (!Number.isInteger(workout.reps) || workout.reps < 1) {
            errors.push(`workouts[${index}] has invalid reps`);
        }
        if (workout.weight !== null &&
            workout.weight !== undefined &&
            (typeof workout.weight !== 'number' ||
                !Number.isFinite(workout.weight) ||
                workout.weight < 0)) {
            errors.push(`workouts[${index}] has invalid weight`);
        }
        if (!Number.isInteger(workout.sequence) || workout.sequence < 1) {
            errors.push(`workouts[${index}] has invalid sequence`);
        }
        for (const exerciseId of workout.supersetExercises || []) {
            if (!exerciseIds.has(exerciseId)) {
                errors.push(`workouts[${index}] references unknown superset exercise: ${exerciseId}`);
            }
        }
    }

    for (const template of snapshot.sessionTemplates || []) {
        if (typeof template.name !== 'string' || !template.name.trim()) {
            errors.push(`Session template ${template.id || '(unknown)'} must have a name`);
        }
        if (!Array.isArray(template.rows)) {
            errors.push(`Session template ${template.id || '(unknown)'} rows must be an array`);
            continue;
        }
        const references = new Set();
        collectTemplateExerciseReferences(template.rows, references);
        for (const exerciseId of references) {
            if (!exerciseIds.has(exerciseId)) {
                errors.push(`Session template ${template.id} references unknown exercise: ${exerciseId}`);
            }
        }
    }

    if (errors.length > 0) {
        throw new Error(`Snapshot validation failed:\n- ${errors.join('\n- ')}`);
    }

    return snapshot;
}
