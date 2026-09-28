#!/usr/bin/env node
// Export one Supabase user to deterministic legacy JSON on a backup branch.

import { writeBackupBranch } from './lib/github-backup.mjs';
import { mapSupabaseRowsToSnapshot } from './lib/mapping.mjs';
import {
    createMigrationClient,
    createSyncRun,
    finishSyncRun,
    loadSupabaseRows
} from './lib/supabase-repository.mjs';
import { serializeSnapshotFiles } from './lib/serialization.mjs';
import { validateSnapshot } from './lib/validation.mjs';

const userId = process.env.SUPABASE_LEGACY_USER_ID;
if (!userId) throw new Error('SUPABASE_LEGACY_USER_ID is required');
if (!process.env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is required');

const client = createMigrationClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);
const branch = process.env.SUPABASE_BACKUP_BRANCH || 'supabase-backup';
const repository = process.env.GITHUB_BACKUP_REPOSITORY || 'MinoPlay/ProgressiveOverload';
const directory = process.env.GITHUB_DATA_DIRECTORY || 'progressive-overload';

let syncRunId;
try {
    syncRunId = await createSyncRun(client, {
        user_id: userId,
        direction: 'supabase_to_github',
        status: 'running',
        dry_run: false,
        source: `${repository}:${branch}`,
        summary: {}
    });
    const rows = await loadSupabaseRows(client, userId);
    const snapshot = mapSupabaseRowsToSnapshot(rows);
    validateSnapshot(snapshot);
    if (snapshot.exercises.length === 0) {
        throw new Error('Refusing to back up a Supabase user with no exercises');
    }
    const files = serializeSnapshotFiles(snapshot);
    const result = await writeBackupBranch({
        token: process.env.GITHUB_TOKEN,
        repository,
        branch,
        sourceBranch: process.env.GITHUB_SOURCE_REF || 'main',
        directory,
        files,
        allowDestructiveChanges: process.env.ALLOW_DESTRUCTIVE_BACKUP === 'true'
    });
    await finishSyncRun(client, syncRunId, {
        status: 'completed',
        summary: result
    });
    console.log(JSON.stringify({ branch, ...result }, null, 2));
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
