// ============================================================
//  supabase-client.js — Single source of truth for Supabase.
//
//  LOAD ORDER (in every HTML file):
//    1. <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2">
//    2. <script src="supabase-client.js">
//    3. Any page script that uses `supabase`
//
//  HOW IT WORKS:
//  The CDN sets window.supabase = the Supabase LIBRARY (createClient, etc.)
//  This file calls createClient() and overwrites window.supabase with the
//  resulting CLIENT INSTANCE (which has .auth.signUp, .auth.getSession, etc.)
//  Every page script then reads window.supabase and gets the client — correct.
// ============================================================

const SUPABASE_URL      = 'https://sllcyyqwgmjcxaefqxml.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGN5eXF3Z21qY3hhZWZxeG1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1MDU5MDMsImV4cCI6MjA4ODA4MTkwM30.jlw1reEYM_gt7iyw6bDdHntIie_1ZMuxJ-GybuC-iGU';

(function () {
    // Check the CDN library loaded correctly
    if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
        console.error(
            '[GitMatch] Supabase CDN script did not load correctly. ' +
            'Check your internet connection or CDN availability.'
        );
        // Stub so pages fail gracefully with readable errors
        // instead of a hard crash
        window.supabase = {
            auth: {
                getSession:         () => Promise.resolve({ data: { session: null }, error: null }),
                signInWithPassword: () => Promise.resolve({ data: null, error: { message: 'Supabase unavailable — check your connection.' } }),
                signUp:             () => Promise.resolve({ data: null, error: { message: 'Supabase unavailable — check your connection.' } }),
                signOut:            () => Promise.resolve({}),
                getUser:            () => Promise.resolve({ data: { user: null }, error: null }),
                onAuthStateChange:  () => ({ data: { subscription: { unsubscribe: () => {} } } }),
            },
            from: () => ({
                select:  () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }), data: null, error: null }) }),
                upsert:  () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
                insert:  () => Promise.resolve({ data: null, error: null }),
                delete:  () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
            }),
        };
        return;
    }

    // ── Create the client and overwrite window.supabase ──────
    // This is the critical line. The CDN put the LIBRARY on window.supabase.
    // We replace it with the CLIENT INSTANCE so every page script gets
    // supabase.auth.signUp / supabase.auth.getSession etc. directly.
    window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();