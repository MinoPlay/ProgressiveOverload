// Deterministic serialization of legacy GitHub JSON files.

function compareIds(left, right) {
    return String(left.id).localeCompare(String(right.id));
}

function compareWorkouts(left, right) {
    return left.date.localeCompare(right.date) ||
        (left.sequence || 0) - (right.sequence || 0) ||
        compareIds(left, right);
}

function canonicalize(value) {
    if (Array.isArray(value)) {
        return value.map(canonicalize);
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map(key => [key, canonicalize(value[key])])
        );
    }
    return value;
}

function jsonFile(value) {
    return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function readFile(files, name) {
    if (files instanceof Map) {
        return files.get(name);
    }
    return files[name];
}

export function parseSnapshotFiles(files) {
    const names = files instanceof Map ? [...files.keys()] : Object.keys(files);
    const parseOptional = (name, key, fallback) => {
        const content = readFile(files, name);
        if (content === undefined) {
            return fallback;
        }
        const parsed = JSON.parse(content);
        return parsed[key] ?? fallback;
    };

    const workouts = names
        .filter(name => /^workouts-\d{4}-\d{2}\.json$/.test(name))
        .sort()
        .flatMap(name => {
            const expectedMonth = name.slice('workouts-'.length, -'.json'.length);
            const monthWorkouts = parseOptional(name, 'workouts', []);
            for (const workout of monthWorkouts) {
                if (typeof workout.date !== 'string' ||
                    workout.date.slice(0, 7) !== expectedMonth) {
                    throw new Error(`${name} contains a workout outside ${expectedMonth}`);
                }
            }
            return monthWorkouts;
        });

    return {
        settings: parseOptional('user-settings.json', 'settings', null),
        exercises: parseOptional('exercises.json', 'exercises', []),
        workouts,
        sessionTemplates: parseOptional('session-templates.json', 'templates', [])
    };
}

export function serializeSnapshotFiles(snapshot) {
    const files = new Map();
    const sortedWorkouts = [...snapshot.workouts].sort(compareWorkouts);
    files.set(
        'exercises.json',
        jsonFile({ exercises: [...snapshot.exercises].sort(compareIds) })
    );
    const latestWorkoutDate = sortedWorkouts.at(-1)?.date || null;
    files.set('stats-summary.json', jsonFile({
        generated: latestWorkoutDate ? `${latestWorkoutDate}T00:00:00.000Z` : null,
        workouts: sortedWorkouts.map(workout => ({
            e: workout.exerciseId,
            d: workout.date,
            r: workout.reps,
            w: workout.weight ?? null,
            seq: workout.sequence,
            ...(workout.supersetGroupId ? { g: workout.supersetGroupId } : {})
        }))
    }));

    files.set(
        'session-templates.json',
        jsonFile({ templates: [...snapshot.sessionTemplates].sort(compareIds) })
    );
    if (snapshot.settings !== null) {
        files.set('user-settings.json', jsonFile({ settings: snapshot.settings }));
    }

    const workoutsByMonth = new Map();
    for (const workout of sortedWorkouts) {
        const month = workout.date.slice(0, 7);
        const workouts = workoutsByMonth.get(month) || [];
        workouts.push(workout);
        workoutsByMonth.set(month, workouts);
    }
    for (const [month, workouts] of [...workoutsByMonth.entries()].sort()) {
        files.set(`workouts-${month}.json`, jsonFile({ workouts }));
    }

    return new Map([...files.entries()].sort(([left], [right]) => left.localeCompare(right)));
}
