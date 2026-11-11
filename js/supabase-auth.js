// Supabase Authentication
// Handles email password and magic-link sessions without exposing credentials to iframes.

import { getSupabaseClient } from './supabase-client.js';

export const SupabaseAuth = {
    session: null,
    initialized: false,

    /**
     * Restore the current session and subscribe to future auth changes.
     * @returns {Promise<object|null>}
     */
    async initialize() {
        if (this.initialized) return this.session;

        const client = await getSupabaseClient();
        const { data, error } = await client.auth.getSession();
        if (error) throw error;

        this.session = data.session;
        this.initialized = true;
        this.updateUI();

        client.auth.onAuthStateChange((_event, session) => {
            this.session = session;
            this.updateUI();
        });

        return this.session;
    },

    /**
     * Send an email magic link.
     * @param {string} email
     * @returns {Promise<void>}
     */
    async requestMagicLink(email) {
        const normalizedEmail = String(email || '').trim();
        if (!normalizedEmail) {
            throw new Error('Email is required');
        }

        const client = await getSupabaseClient();
        const redirectUrl = `${window.location.origin}${window.location.pathname}`;
        const { error } = await client.auth.signInWithOtp({
            email: normalizedEmail,
            options: {
                emailRedirectTo: redirectUrl
            }
        });
        if (error) throw error;
    },

    /**
     * Sign in with email and password.
     * @param {string} email
     * @param {string} password
     * @returns {Promise<void>}
     */
    async signInWithPassword(email, password) {
        const normalizedEmail = String(email || '').trim();
        if (!normalizedEmail || !password) {
            throw new Error('Email and password are required');
        }

        const client = await getSupabaseClient();
        const { data, error } = await client.auth.signInWithPassword({ email: normalizedEmail, password });
        if (error) throw error;
        this.session = data.session;
        this.updateUI();
    },

    /**
     * Set or change the signed-in user's password.
     * @param {string} password
     * @returns {Promise<void>}
     */
    async updatePassword(password) {
        if (!password) {
            throw new Error('Password is required');
        }

        const client = await getSupabaseClient();
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
    },

    /**
     * Sign out of Supabase.
     * @returns {Promise<void>}
     */
    async signOut() {
        const client = await getSupabaseClient();
        const { error } = await client.auth.signOut();
        if (error) throw error;
        this.session = null;
        this.updateUI();
    },

    /**
     * Return whether an authenticated Supabase session is available.
     * @returns {boolean}
     */
    isAuthenticated() {
        return !!this.session?.user;
    },

    /**
     * Return the authenticated user ID.
     * @returns {string}
     */
    getUserId() {
        const userId = this.session?.user?.id;
        if (!userId) {
            throw new Error('Sign in to Supabase before accessing data.');
        }
        return userId;
    },

    /**
     * Synchronize the compact configuration UI with the current session.
     */
    updateUI() {
        const signedOut = document.getElementById('supabase-signed-out');
        const signedIn = document.getElementById('supabase-signed-in');
        const email = document.getElementById('supabase-user-email');
        const authenticated = this.isAuthenticated();

        if (signedOut) signedOut.style.display = authenticated ? 'none' : 'flex';
        if (signedIn) signedIn.style.display = authenticated ? 'flex' : 'none';
        if (email) email.textContent = this.session?.user?.email || '';
    }
};

window.requestSupabaseMagicLink = async function () {
    try {
        const input = document.getElementById('supabase-email');
        await SupabaseAuth.requestMagicLink(input?.value);
        window.showToast?.('Check your email for the Supabase sign-in link.', 'success');
    } catch (error) {
        window.showToast?.(error.message, 'error');
    }
};

window.signInSupabaseWithPassword = async function () {
    try {
        const email = document.getElementById('supabase-email')?.value;
        const password = document.getElementById('supabase-password')?.value;
        await SupabaseAuth.signInWithPassword(email, password);
        window.showToast?.('Signed in.', 'success');
        setTimeout(() => location.reload(), 300);
    } catch (error) {
        window.showToast?.(error.message, 'error');
    }
};

window.setSupabasePassword = async function () {
    try {
        const input = document.getElementById('supabase-new-password');
        await SupabaseAuth.updatePassword(input?.value);
        if (input) input.value = '';
        window.showToast?.('Password set. You can now sign in with it.', 'success');
    } catch (error) {
        window.showToast?.(error.message, 'error');
    }
};

window.signOutSupabase = async function () {
    try {
        await SupabaseAuth.signOut();
        window.showToast?.('Signed out of Supabase.', 'success');
        setTimeout(() => location.reload(), 300);
    } catch (error) {
        window.showToast?.(error.message, 'error');
    }
};
