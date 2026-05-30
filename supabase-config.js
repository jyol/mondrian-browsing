/**
 * Supabase credentials for Mondrian Browsing.
 * Create a project at https://supabase.com and run supabase/schema.sql,
 * then paste your Project URL and publishable (anon) key below.
 */
const SUPABASE_CONFIG = {
  url: 'https://slixswedyfgixlgwmlgi.supabase.co',
  anonKey: 'sb_publishable_YuQ-bI0v97xlZpAy7jnpdQ_9gMl53pt'
};

const PLAYER_NAME_STORAGE_KEY = 'mondrianPlayerName';
const LEADERBOARD_LIMIT = 10;

function isSupabaseConfigured() {
  return (
    SUPABASE_CONFIG.url &&
    SUPABASE_CONFIG.anonKey &&
    !SUPABASE_CONFIG.url.includes('YOUR_PROJECT') &&
    !SUPABASE_CONFIG.anonKey.includes('YOUR_SUPABASE')
  );
}
