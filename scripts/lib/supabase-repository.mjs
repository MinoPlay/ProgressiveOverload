// Paginated Supabase access and migration plan application.

import { createClient } from '@supabase/supabase-js';

const schema = 'progressive_overload';
const pageSize = 1000;
const writeBatchSize = 500;

export function createMigrationClient(url, serviceRoleKey) {
    if (!url) throw new Error('SUPABASE_URL is required');
    if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
    return createClient(url, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }).schema(schema);
}

async function selectAll(client, table, userId, orderColumn = 'id') {
    const rows = [];
    for (let from = 0; ; from += pageSize) {
        const { data, error } = await client
            .from(table)
            .select('*')
            .eq('user_id', userId)
            .order(orderColumn)
            .range(from, from + pageSize - 1);
        if (error) throw error;
        rows.push(...data);
        if (data.length < pageSize) break;
    }
    return rows;
}

export async function loadSupabaseRows(client, userId) {
    const [userSettings, exercises, workouts, sessionTemplates] = await Promise.all([
        selectAll(client, 'user_settings', userId, 'user_id'),
        selectAll(client, 'exercises', userId),
        selectAll(client, 'workouts', userId),
        selectAll(client, 'session_templates', userId)
    ]);
    return { userSettings, exercises, workouts, sessionTemplates };
}

async function upsertBatches(client, table, rows, onConflict) {
    for (let index = 0; index < rows.length; index += writeBatchSize) {
        const { error } = await client
            .from(table)
            .upsert(rows.slice(index, index + writeBatchSize), { onConflict });
        if (error) throw error;
    }
}

async function deleteBatches(client, table, userId, ids, keyField = 'id') {
    for (let index = 0; index < ids.length; index += writeBatchSize) {
        const { error } = await client
            .from(table)
            .delete()
            .eq('user_id', userId)
            .in(keyField, ids.slice(index, index + writeBatchSize));
        if (error) throw error;
    }
}

export async function createSyncRun(client, values) {
    const { data, error } = await client
        .from('sync_runs')
        .insert(values)
        .select('id')
        .single();
    if (error) throw error;
    return data.id;
}

export async function finishSyncRun(client, id, values) {
    const { error } = await client
        .from('sync_runs')
        .update({
            ...values,
            finished_at: new Date().toISOString()
        })
        .eq('id', id);
    if (error) throw error;
}

export async function applyReconciliationPlan(client, userId, plan) {
    await deleteBatches(client, 'workouts', userId, plan.workouts.deletes);
    await deleteBatches(
        client,
        'session_templates',
        userId,
        plan.sessionTemplates.deletes
    );
    await deleteBatches(client, 'exercises', userId, plan.exercises.deletes);
    await deleteBatches(
        client,
        'user_settings',
        userId,
        plan.userSettings.deletes,
        'user_id'
    );

    await upsertBatches(client, 'exercises', plan.exercises.upserts, 'user_id,id');
    await upsertBatches(client, 'workouts', plan.workouts.upserts, 'user_id,id');
    await upsertBatches(
        client,
        'session_templates',
        plan.sessionTemplates.upserts,
        'user_id,id'
    );
    await upsertBatches(
        client,
        'user_settings',
        plan.userSettings.upserts,
        'user_id'
    );
}
