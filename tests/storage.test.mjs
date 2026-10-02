import test from 'node:test';
import assert from 'node:assert/strict';

import './browser-globals.mjs';

import { Storage } from '../js/storage.js';
import { createInMemoryAdapter } from './in-memory-adapter.mjs';

const exerciseA = {
    id: 'exercise-a',
    name: 'Bench Press',
    equipmentType: 'barbell',
    muscle: 'chest',
    requiresWeight: true
};

const exerciseB = {
    id: 'exercise-b',
    name: 'Row',
    equipmentType: 'barbell',
    muscle: 'back',
    requiresWeight: true
};

test('addWorkoutsBatch assigns sequence numbers', async () => {
    const today = todayString();
    const adapter = createInMemoryAdapter({
        exercises: [exerciseA],
        workouts: [{
            id: 'existing-workout',
            exerciseId: 'exercise-a',
            date: today,
            reps: 5,
            weight: 100,
            sequence: 1
        }]
    });
    await initialize(adapter);

    const added = await Storage.addWorkoutsBatch([
        { exerciseId: 'exercise-a', date: today, reps: 6, weight: 105 },
        { exerciseId: 'exercise-a', date: today, reps: 7, weight: 110 }
    ]);

    assert.deepEqual(added.map(workout => workout.sequence), [2, 3]);
    assert.deepEqual(
        (await adapter.getWorkoutsInRange(new Date(), new Date())).map(workout => workout.sequence),
        [1, 2, 3]
    );
});

test('updateWorkoutSupersets reassigns superset groups', async () => {
    const today = todayString();
    const adapter = createInMemoryAdapter({
        exercises: [exerciseA, exerciseB],
        workouts: [
            workout('workout-a', 'exercise-a', today, 1, 'old-group'),
            workout('workout-b', 'exercise-b', today, 2, null)
        ]
    });
    await initialize(adapter);

    await Storage.updateWorkoutSupersets(today, {
        'exercise-a': null,
        'exercise-b': 'new-group'
    });

    const workouts = await adapter.getWorkoutsInRange(new Date(), new Date());
    assert.equal(workouts.find(item => item.id === 'workout-a').supersetGroupId, undefined);
    assert.equal(workouts.find(item => item.id === 'workout-b').supersetGroupId, 'new-group');
});

test('deleteExercise rejects exercises that are used by workouts', async () => {
    const today = todayString();
    const adapter = createInMemoryAdapter({
        exercises: [exerciseA],
        workouts: [workout('workout-a', 'exercise-a', today, 1)]
    });
    await initialize(adapter);

    await assert.rejects(
        () => Storage.deleteExercise('exercise-a'),
        /Cannot delete an exercise that has logged workouts\./
    );
    assert.equal(Storage.getExerciseById('exercise-a').id, 'exercise-a');
});

test('mutations refetch from adapter before writing', async () => {
    const today = todayString();
    const adapter = createInMemoryAdapter({ exercises: [exerciseA] });
    await initialize(adapter);

    adapter.workouts.push(workout('remote-workout', 'exercise-a', today, 1));
    const added = await Storage.addWorkoutsBatch([
        { exerciseId: 'exercise-a', date: today, reps: 8, weight: 90 }
    ]);

    assert.equal(added[0].sequence, 2);
    assert.deepEqual(
        (await adapter.getWorkoutsInRange(new Date(), new Date())).map(item => item.id === 'remote-workout' ? item.id : 'added'),
        ['remote-workout', 'added']
    );
});

test('refresh events fire only on real changes', async () => {
    const adapter = createInMemoryAdapter({ exercises: [exerciseA] });
    const events = [];
    await initialize(adapter, eventName => events.push(eventName));

    await Storage.refreshFromRemote();
    assert.deepEqual(events, []);

    adapter.exercises.push(exerciseB);
    await Storage.refreshFromRemote();
    assert.deepEqual(events, ['exercisesUpdated']);
});

test('getAllWorkouts returns domain workout objects', async () => {
    const today = todayString();
    const adapter = createInMemoryAdapter({
        exercises: [exerciseA],
        workouts: [workout('workout-a', 'exercise-a', today, 1, 'group-a')]
    });
    await initialize(adapter);

    assert.deepEqual(await Storage.getAllWorkouts(), [{
        id: 'workout-a',
        exerciseId: 'exercise-a',
        date: today,
        reps: 5,
        weight: 100,
        sequence: 1,
        supersetGroupId: 'group-a'
    }]);
});

test('deleteWorkout re-sequences a day outside the cached window', async () => {
    const pastDate = '2020-01-15';
    const adapter = createInMemoryAdapter({
        exercises: [exerciseA],
        workouts: [
            workout('workout-1', 'exercise-a', pastDate, 1, null),
            workout('workout-2', 'exercise-a', pastDate, 2, null),
            workout('workout-3', 'exercise-a', pastDate, 3, null)
        ]
    });
    await initialize(adapter);

    await Storage.deleteWorkout('workout-1', pastDate);

    const remaining = await adapter.getWorkoutsInRange(new Date(2020, 0, 15), new Date(2020, 0, 15));
    assert.deepEqual(remaining.map(w => [w.id, w.sequence]), [['workout-2', 1], ['workout-3', 2]]);
});

async function initialize(adapter, emit = () => {}) {
    await Storage.initialize({ adapter, emit });
}

function todayString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function workout(id, exerciseId, date, sequence, supersetGroupId) {
    const record = {
        id,
        exerciseId,
        date,
        reps: 5,
        weight: 100,
        sequence
    };
    if (supersetGroupId) record.supersetGroupId = supersetGroupId;
    return record;
}
