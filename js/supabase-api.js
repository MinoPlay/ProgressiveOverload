// Supabase Storage Adapter
// Implements the legacy storage operations with tenant-scoped relational rows.

import { CONFIG } from './config.js';
import { getSupabaseClient } from './supabase-client.js';
import { SupabaseAuth } from './supabase-auth.js';
import {
    exerciseFromRow,
    exerciseToRow,
    templateFromRow,
    templateToRow,
    workoutFromRow,
    workoutToRow
} from './supabase-records.js';

const PAGE_SIZE = 1000;
const WRITE_BATCH_SIZE = 500;

export const SupabaseAPI = {
    _throw(error) {
        if (error?.code === 'PGRST106') {
            throw new Error(
                'Expose the progressive_overload schema in the Supabase Data API settings.'
            );
        }
        throw error;
    },

    /**
     * Initialize default rows for the authenticated user.
     * @returns {Promise<void>}
     */
    async initializeUser() {
        const client = await getSupabaseClient();
        const { error } = await client.rpc('initialize_user_data');
        if (error) this._throw(error);
    },

    /**
     * Select every matching row without PostgREST truncation.
     * @param {string} table
     * @param {string} columns
     * @param {function} configure
     * @returns {Promise<array>}
     */
    async _selectAll(table, columns, configure = query => query, orderColumns = ['id']) {
        const rows = [];
        const client = await getSupabaseClient();
        for (let from = 0; ; from += PAGE_SIZE) {
            let query = client
                .from(table)
                .select(columns)
                .range(from, from + PAGE_SIZE - 1);
            query = configure(query);
            orderColumns.forEach(column => {
                query = query.order(column);
            });
            const { data, error } = await query;
            if (error) this._throw(error);
            rows.push(...data);
            if (data.length < PAGE_SIZE) break;
        }
        return rows;
    },

    async _upsertBatches(table, rows) {
        const client = await getSupabaseClient();
        for (let i = 0; i < rows.length; i += WRITE_BATCH_SIZE) {
            const { error } = await client
                .from(table)
                .upsert(rows.slice(i, i + WRITE_BATCH_SIZE), {
                    onConflict: 'user_id,id'
                });
            if (error) this._throw(error);
        }
    },

    async _deleteIds(table, userId, ids) {
        const client = await getSupabaseClient();
        for (let i = 0; i < ids.length; i += WRITE_BATCH_SIZE) {
            const { error } = await client
                .from(table)
                .delete()
                .eq('user_id', userId)
                .in('id', ids.slice(i, i + WRITE_BATCH_SIZE));
            if (error) this._throw(error);
        }
    },

    async getExercises() {
        const userId = SupabaseAuth.getUserId();
        const rows = await this._selectAll(
            'exercises',
            '*',
            query => query.eq('user_id', userId),
            ['name', 'id']
        );
        return {
            exercises: rows.map(exerciseFromRow),
            sha: null
        };
    },

    async saveExercises(exercises) {
        const userId = SupabaseAuth.getUserId();
        const existing = await this._selectAll('exercises', 'id', query => query.eq('user_id', userId));
        const incomingIds = new Set(exercises.map(exercise => exercise.id));
        const staleIds = existing.map(row => row.id).filter(id => !incomingIds.has(id));

        if (staleIds.length > 0) {
            const client = await getSupabaseClient();
            const { data, error } = await client
                .from('workouts')
                .select('exercise_id')
                .eq('user_id', userId)
                .in('exercise_id', staleIds)
                .limit(1);
            if (error) this._throw(error);
            if (data.length > 0) {
                throw new Error('Cannot delete an exercise that has logged workouts.');
            }
        }

        await this._upsertBatches('exercises', exercises.map(exercise => exerciseToRow(exercise, userId)));
        await this._deleteIds('exercises', userId, staleIds);
        return { content: { sha: null } };
    },

    getWorkoutFilePath(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${CONFIG.paths.workoutsPrefix}${year}-${month}.json`;
    },

    _monthBounds(date) {
        const year = date.getFullYear();
        const month = date.getMonth();
        const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const next = new Date(year, month + 1, 1);
        const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
        return { start, end };
    },

    async getWorkouts(date) {
        const { start, end } = this._monthBounds(date);
        const workouts = await this.getWorkoutsInRange(
            new Date(`${start}T00:00:00`),
            new Date(new Date(`${end}T00:00:00`).getTime() - 86400000)
        );
        return {
            workouts,
            sha: null,
            path: this.getWorkoutFilePath(date)
        };
    },

    async saveWorkouts(date, workouts) {
        const userId = SupabaseAuth.getUserId();
        const { start, end } = this._monthBounds(date);
        const existing = await this._selectAll('workouts', 'id', query => query
            .eq('user_id', userId)
            .gte('workout_date', start)
            .lt('workout_date', end));
        const incomingIds = new Set(workouts.map(workout => workout.id));
        const staleIds = existing.map(row => row.id).filter(id => !incomingIds.has(id));

        await this._upsertBatches('workouts', workouts.map(workout => workoutToRow(workout, userId)));
        await this._deleteIds('workouts', userId, staleIds);
        return { content: { sha: null } };
    },

    async getWorkoutsInRange(startDate, endDate) {
        const userId = SupabaseAuth.getUserId();
        const start = this._dateString(startDate);
        const end = this._dateString(endDate);
        const rows = await this._selectAll(
            'workouts',
            '*',
            query => query
                .eq('user_id', userId)
                .gte('workout_date', start)
                .lte('workout_date', end),
            ['workout_date', 'sequence', 'id']
        );
        return rows.map(workoutFromRow);
    },

    _dateString(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    },

    async listFiles(path) {
        const userId = SupabaseAuth.getUserId();
        const rows = await this._selectAll(
            'workouts',
            'workout_date',
            query => query.eq('user_id', userId),
            ['workout_date']
        );
        const prefix = CONFIG.paths.workoutsPrefix.split('/').pop();
        const directory = path || CONFIG.paths.workoutsPrefix.substring(0, CONFIG.paths.workoutsPrefix.lastIndexOf('/'));
        const months = [...new Set(rows.map(row => row.workout_date.slice(0, 7)))];
        return months.map(month => ({
            name: `${prefix}${month}.json`,
            path: `${directory}/${prefix}${month}.json`
        }));
    },

    async getSessionTemplates() {
        const userId = SupabaseAuth.getUserId();
        const rows = await this._selectAll(
            'session_templates',
            '*',
            query => query.eq('user_id', userId),
            ['name', 'id']
        );
        return {
            templates: rows.map(templateFromRow),
            sha: null
        };
    },

    async saveSessionTemplates(templates) {
        const userId = SupabaseAuth.getUserId();
        const existing = await this._selectAll('session_templates', 'id', query => query.eq('user_id', userId));
        const incomingIds = new Set(templates.map(template => template.id));
        const staleIds = existing.map(row => row.id).filter(id => !incomingIds.has(id));

        await this._upsertBatches('session_templates', templates.map(template => templateToRow(template, userId)));
        await this._deleteIds('session_templates', userId, staleIds);
        return { content: { sha: null } };
    },

    async getStatsSummary() {
        const userId = SupabaseAuth.getUserId();
        const rows = await this._selectAll(
            'workouts',
            '*',
            query => query.eq('user_id', userId),
            ['workout_date', 'sequence', 'id']
        );
        const allWorkouts = rows.map(workoutFromRow);
        return {
            content: {
                generated: new Date().toISOString(),
                workouts: allWorkouts.map(workout => {
                    const entry = {
                        e: workout.exerciseId,
                        d: workout.date,
                        r: workout.reps,
                        w: workout.weight,
                        seq: workout.sequence
                    };
                    if (workout.supersetGroupId) entry.g = workout.supersetGroupId;
                    return entry;
                })
            },
            sha: null
        };
    },

    async saveStatsSummary() {
        return { content: { sha: null } };
    },

    async getRateLimit() {
        return null;
    }
};
