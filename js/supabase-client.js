// Supabase Client
// Lazily creates the authenticated browser client for the ProgressiveOverload schema.

import { CONFIG } from './config.js';

let clientPromise = null;

/**
 * Get the shared Supabase browser client.
 * @returns {Promise<object>}
 */
export async function getSupabaseClient() {
    if (!clientPromise) {
        if (!CONFIG.supabase.url || !CONFIG.supabase.publishableKey) {
            throw new Error('Supabase is not configured. Set CONFIG.supabase.url and publishableKey.');
        }
        clientPromise = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm')
            .then(({ createClient }) => createClient(
                CONFIG.supabase.url,
                CONFIG.supabase.publishableKey,
                {
                    db: {
                        schema: CONFIG.supabase.schema
                    },
                    auth: {
                        persistSession: true,
                        autoRefreshToken: true,
                        detectSessionInUrl: true
                    }
                }
            ));
    }
    return clientPromise;
}
