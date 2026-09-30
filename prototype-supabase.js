import { getSupabaseClient } from './js/supabase-client.js';

const elements = {
    status: document.getElementById('supabaseStatus'),
    user: document.getElementById('supabaseUser'),
    recent: document.getElementById('supabaseRecent'),
    email: document.getElementById('supabaseEmail'),
    magicLinkButton: document.getElementById('supabaseMagicLink'),
    exerciseCount: document.getElementById('supabaseExerciseCount'),
    workoutCount: document.getElementById('supabaseWorkoutCount'),
    latestDate: document.getElementById('supabaseLatestDate')
};

const state = {
    session: null,
    exercises: [],
    workouts: []
};

function setStatus(message, isError = false) {
    if (!elements.status) return;
    elements.status.textContent = message;
    elements.status.style.color = isError ? '#fecaca' : '#dfeaff';
}

function setUserLabel(label) {
    if (elements.user) {
        elements.user.textContent = label;
    }
}

function renderSummary() {
    if (!elements.exerciseCount || !elements.workoutCount || !elements.latestDate) return;
    elements.exerciseCount.textContent = String(state.exercises.length);
    elements.workoutCount.textContent = String(state.workouts.length);
    const latest = state.workouts[0]?.workout_date || state.workouts[0]?.date || null;
    elements.latestDate.textContent = latest ? new Date(`${latest}T12:00:00`).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    }) : '—';

    const recentNames = state.workouts.slice(0, 3).map((row) => {
        const exercise = state.exercises.find((item) => item.id === row.exercise_id) || null;
        return exercise ? exercise.name : (row.exercise_id || 'Workout');
    });

    if (elements.recent) {
        elements.recent.textContent = recentNames.length ? recentNames.join(', ') : 'No data loaded yet.';
    }
}

async function fetchData() {
    const client = await getSupabaseClient();
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    const activeSession = sessionData?.session;
    if (!activeSession) {
        setUserLabel('Not signed in');
        setStatus('Sign in with a magic link to load Supabase data.');
        state.session = null;
        state.exercises = [];
        state.workouts = [];
        renderSummary();
        return;
    }

    state.session = activeSession;
    setUserLabel(activeSession.user.email || 'Authenticated');
    setStatus('Loading latest workout data from Supabase…');

    const userId = activeSession.user.id;
    const [{ data: exercises = [] }, { data: workouts = [] }] = await Promise.all([
        client.from('exercises').select('*').eq('user_id', userId).order('name'),
        client.from('workouts').select('*').eq('user_id', userId).order('workout_date', { ascending: false }).limit(25)
    ]);

    state.exercises = exercises;
    state.workouts = workouts;
    renderSummary();
    setStatus('Supabase data loaded successfully.');
}

async function requestMagicLink() {
    const email = (elements.email?.value || '').trim();
    if (!email) {
        setStatus('Please enter your email address.', true);
        return;
    }

    try {
        const client = await getSupabaseClient();
        const redirectUrl = `${window.location.origin}${window.location.pathname}`;
        const { error } = await client.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: redirectUrl }
        });
        if (error) throw error;
        setStatus('Magic link sent. Check your email and then refresh this page.');
    } catch (error) {
        console.error(error);
        setStatus(error.message || 'Could not send magic link.', true);
    }
}

async function init() {
    if (elements.magicLinkButton) {
        elements.magicLinkButton.addEventListener('click', requestMagicLink);
    }

    try {
        await fetchData();
    } catch (error) {
        console.error(error);
        setStatus(error.message || 'Failed to load Supabase data.', true);
        setUserLabel('Error');
    }
}

window.addEventListener('DOMContentLoaded', init);
