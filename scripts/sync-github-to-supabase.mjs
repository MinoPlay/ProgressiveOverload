#!/usr/bin/env node
// Reconcile the legacy GitHub snapshot into Supabase.

import { loadGitHubSnapshot } from './lib/github-snapshot.mjs';
import { mapSnapshotToRows } from './lib/mapping.mjs';
import {
    assertSafeForwardSync,
    buildReconciliationPlan
} from './lib/reconciliation.mjs';
import {
    applyReconciliationPlan,
    createMigrationClient,
    createSyncRun,
    finishSyncRun,
    loadSupabaseRows
} from './lib/supabase-repository.mjs';
import { validateSnapshot } from './lib/validation.mjs';

const dryRun = process.argv.includes('--dry-run');
const userId = process.env.SUPABASE_LEGACY_USER_ID;
const repository = process.env.GITHUB_DATA_REPOSITORY || 'MinoPlay/ProgressiveOverload';
const directory = process.env.GITHUB_DATA_DIRECTORY || 'progressive-overload';
if (!userId) throw new Error('SUPABASE_LEGACY_USER_ID is required');

const client = createMigrationClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

let syncRunId;
try {
    if (!dryRun) {
        syncRunId = await createSyncRun(client, {
            user_id: userId,
            direction: 'github_to_supabase',
            status: 'running',
            dry_run: false,
            source: `${repository}:${directory}/`,
            summary: {}
        });
    }

    const source = await loadGitHubSnapshot({
        token: process.env.GITHUB_TOKEN,
        repository,
        directory,
        ref: process.env.GITHUB_SOURCE_REF || 'main'
    });
    validateSnapshot(source.snapshot);
    const sourceRows = mapSnapshotToRows(source.snapshot, userId);
    const existingRows = await loadSupabaseRows(client, userId);
    assertSafeForwardSync(sourceRows, existingRows);
    const plan = buildReconciliationPlan(sourceRows, existingRows);
    const summary = Object.fromEntries(
        Object.entries(plan).map(([name, changes]) => [name, {
            upserts: changes.upserts.length,
            deletes: changes.deletes.length,
            unchanged: changes.unchanged.length
        }])
    );

    if (dryRun) {
        console.log(JSON.stringify({
            dryRun: true,
            sourceFiles: source.sourceFiles,
            summary
        }, null, 2));
        process.exit(0);
    }

    await applyReconciliationPlan(client, userId, plan);
    await finishSyncRun(client, syncRunId, {
        status: 'completed',
        summary
    });
    console.log(JSON.stringify({ dryRun: false, summary }, null, 2));
} catch (error) {
    if (syncRunId) {
        try {
            await finishSyncRun(client, syncRunId, {
                status: 'failed',
                error_message: error.message
            });
        } catch (logError) {
            console.error(`Could not update sync run: ${logError.message}`);
        }
    }
    throw error;
}
