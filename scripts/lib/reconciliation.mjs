// Pure row reconciliation for validated migration snapshots.

export function reconcileRows(sourceRows, existingRows, options = {}) {
    if (!options.validated) {
        throw new Error('Full snapshot validation is required before reconciliation');
    }

    const keyField = options.keyField || 'id';
    const sourceByKey = new Map(sourceRows.map(row => [row[keyField], row]));
    const existingByKey = new Map(existingRows.map(row => [row[keyField], row]));
    const upserts = [];
    const unchanged = [];

    for (const [key, row] of sourceByKey) {
        const existing = existingByKey.get(key);
        if (existing?.source_checksum === row.source_checksum) {
            unchanged.push(key);
        } else {
            upserts.push(row);
        }
    }

    const deletes = [...existingByKey.keys()]
        .filter(key => !sourceByKey.has(key));

    return { upserts, deletes, unchanged };
}

export function assertSafeForwardSync(sourceRows, existingRows) {
    if (sourceRows.exercises.length === 0) {
        throw new Error('Refusing to reconcile an empty source exercise collection');
    }
    if (sourceRows.workouts.length === 0 && existingRows.workouts.length > 0) {
        throw new Error('Refusing to delete existing workouts from an empty source snapshot');
    }
}

export function buildReconciliationPlan(sourceRows, existingRows) {
    return {
        userSettings: reconcileRows(
            sourceRows.userSettings,
            existingRows.userSettings,
            { validated: true, keyField: 'user_id' }
        ),
        exercises: reconcileRows(
            sourceRows.exercises,
            existingRows.exercises,
            { validated: true }
        ),
        workouts: reconcileRows(
            sourceRows.workouts,
            existingRows.workouts,
            { validated: true }
        ),
        sessionTemplates: reconcileRows(
            sourceRows.sessionTemplates,
            existingRows.sessionTemplates,
            { validated: true }
        )
    };
}
