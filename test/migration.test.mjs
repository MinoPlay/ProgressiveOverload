// Tests for GitHub-to-Supabase migration logic.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { checksum } from '../scripts/lib/checksum.mjs';
import { assertSafeBackupChange } from '../scripts/lib/github-backup.mjs';
import {
    mapSnapshotToRows,
    mapSupabaseRowsToSnapshot
} from '../scripts/lib/mapping.mjs';
import {
    assertSafeForwardSync,
    reconcileRows
} from '../scripts/lib/reconciliation.mjs';
import {
    parseSnapshotFiles,
    serializeSnapshotFiles
} from '../scripts/lib/serialization.mjs';
import { validateSnapshot } from '../scripts/lib/validation.mjs';

const userId = '11111111-1111-4111-8111-111111111111';
const migrationUrl = new URL(
    '../supabase/migrations/20260928102600_create_progressive_overload_schema.sql',
    import.meta.url
);

const snapshot = {
    settings: {
        theme: 'dark',
        compactMode: true
    },
    exercises: [
        {
            id: 'exercise-2',
            name: 'Pull-up',
            equipmentType: 'bodyweight',
            muscle: 'back',
            requiresWeight: false
        },
        {
            id: 'exercise-1',
            name: 'Bench Press',
            equipmentType: 'barbell',
            muscle: 'chest',
            requiresWeight: true,
            lastSets: [{ reps: 8, weight: 80 }],
            lastDate: '2026-08-31'
        }
    ],
    workouts: [
        {
            id: 'workout-2',
            exerciseId: 'exercise-2',
            date: '2026-09-02',
            reps: 8,
            weight: null,
            sequence: 2,
            supersetGroupId: 'group-1',
            tempo: '3-1-1'
        },
        {
            id: 'workout-1',
            exerciseId: 'exercise-1',
            date: '2026-08-31',
            reps: 8,
            weight: 80,
            sequence: 1,
            sessionId: 'session-1',
            source: 'planner'
        }
    ],
    sessionTemplates: [
        {
            id: 'template-1',
            name: 'Upper body',
            rows: [
                {
                    id: 'row-1',
                    type: 'single',
                    exerciseId: 'exercise-1',
                    sets: [{ id: 'set-1', reps: 8, weight: 80 }]
                }
            ]
        }
    ]
};

test('checksum is deterministic across object key order', () => {
    assert.equal(
        checksum({ beta: 2, alpha: { delta: 4, gamma: 3 } }),
        checksum({ alpha: { gamma: 3, delta: 4 }, beta: 2 })
    );
});

test('validation accepts optional missing files represented by empty data', () => {
    assert.doesNotThrow(() => validateSnapshot({
        settings: null,
        exercises: snapshot.exercises,
        workouts: [],
        sessionTemplates: []
    }));
});

test('validation rejects duplicate IDs and unknown workout exercise references', () => {
    assert.throws(
        () => validateSnapshot({
            settings: null,
            exercises: [snapshot.exercises[0], snapshot.exercises[0]],
            workouts: [{
                id: 'workout-unknown',
                exerciseId: 'missing-exercise',
                date: '2026-09-01',
                reps: 5,
                weight: null,
                sequence: 1
            }],
            sessionTemplates: []
        }),
        /duplicate exercise ID[\s\S]*unknown exercise/i
    );
});

test('validation rejects zero reps and negative weight', () => {
    const invalidWorkout = {
        id: 'workout-invalid',
        exerciseId: snapshot.exercises[0].id,
        date: '2026-09-01',
        reps: 0,
        weight: -1,
        sequence: 1
    };

    assert.throws(
        () => validateSnapshot({
            settings: null,
            exercises: snapshot.exercises,
            workouts: [invalidWorkout],
            sessionTemplates: []
        }),
        /invalid reps[\s\S]*invalid weight/i
    );
});

test('mapping preserves IDs and optional fields', () => {
    const rows = mapSnapshotToRows(snapshot, userId);

    assert.equal(rows.exercises[0].user_id, userId);
    assert.equal(rows.workouts[0].superset_group_id, 'group-1');
    assert.equal(rows.workouts[0].extra_fields.tempo, '3-1-1');
    assert.equal(rows.workouts[1].session_id, 'session-1');
    assert.equal(rows.sessionTemplates[0].id, 'template-1');
});

test('reconciliation computes deletes only after full validation', () => {
    const sourceRows = [
        { user_id: userId, id: 'keep', source_checksum: 'new' },
        { user_id: userId, id: 'add', source_checksum: 'added' }
    ];
    const existingRows = [
        { user_id: userId, id: 'keep', source_checksum: 'old' },
        { user_id: userId, id: 'delete', source_checksum: 'removed' }
    ];

    assert.throws(
        () => reconcileRows(sourceRows, existingRows, { validated: false }),
        /validation/i
    );

    assert.deepEqual(
        reconcileRows(sourceRows, existingRows, { validated: true }),
        {
            upserts: sourceRows,
            deletes: ['delete'],
            unchanged: []
        }
    );
});

test('reconciliation skips unchanged rows by checksum', () => {
    const row = { user_id: userId, id: 'same', source_checksum: 'checksum' };

    assert.deepEqual(
        reconcileRows([row], [row], { validated: true }),
        {
            upserts: [],
            deletes: [],
            unchanged: ['same']
        }
    );
});

test('forward reconciliation refuses an empty source that would erase target data', () => {
    assert.throws(
        () => assertSafeForwardSync(
            { exercises: [], workouts: [], sessionTemplates: [] },
            {
                exercises: [{ id: 'exercise-1' }],
                workouts: [{ id: 'workout-1' }],
                sessionTemplates: []
            }
        ),
        /empty source|delete existing workouts/i
    );
});

test('backup refuses to remove every workout month without an explicit override', () => {
    const files = new Map([
        ['exercises.json', '{"exercises":[]}'],
        ['stats-summary.json', '{"workouts":[]}']
    ]);
    const existingEntries = [
        { type: 'file', name: 'workouts-2026-08.json' },
        { type: 'file', name: 'workouts-2026-09.json' }
    ];

    assert.throws(
        () => assertSafeBackupChange(files, existingEntries, false),
        /empty workout backup/i
    );
    assert.doesNotThrow(() => assertSafeBackupChange(files, existingEntries, true));
});

test('serialization is deterministic and removes obsolete workout months', () => {
    const files = serializeSnapshotFiles(snapshot);

    assert.deepEqual([...files.keys()], [
        'exercises.json',
        'session-templates.json',
        'stats-summary.json',
        'user-settings.json',
        'workouts-2026-08.json',
        'workouts-2026-09.json'
    ]);
    assert.match(files.get('exercises.json'), /"id": "exercise-1"[\s\S]*"id": "exercise-2"/);
    assert.match(files.get('stats-summary.json'), /"e": "exercise-1"/);

    const obsolete = ['workouts-2026-07.json', 'workouts-2026-08.json']
        .filter(name => !files.has(name));
    assert.deepEqual(obsolete, ['workouts-2026-07.json']);
});

test('legacy files round-trip through rows without data loss', () => {
    const files = serializeSnapshotFiles(snapshot);
    const parsed = parseSnapshotFiles(files);
    validateSnapshot(parsed);

    const rows = mapSnapshotToRows(parsed, userId);
    const restored = mapSupabaseRowsToSnapshot(rows);
    const restoredFiles = serializeSnapshotFiles(restored);

    assert.deepEqual(restoredFiles, files);
});

test('schema initialization is app-scoped and does not trigger for unrelated auth users', async () => {
    const sql = await readFile(migrationUrl, 'utf8');

    assert.doesNotMatch(sql, /after insert on auth\.users/i);
    assert.match(
        sql,
        /insert into progressive_overload\.user_settings[\s\S]*on conflict \(user_id\) do nothing/i
    );
    assert.match(sql, /if initialized_user then[\s\S]*initialize_default_exercises/i);
    assert.match(sql, /weight numeric check \(weight is null or weight >= 0\)/i);
    assert.match(sql, /reps integer not null check \(reps > 0\)/i);
});
