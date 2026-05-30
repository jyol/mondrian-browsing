# Supabase setup for Mondrian Browsing

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free project.
2. Open **SQL Editor** and run the contents of [`supabase/schema.sql`](supabase/schema.sql).

## 2. Add your credentials to the extension

1. In Supabase, open **Project Settings → API**.
2. Copy the **Project URL** and **anon public** key.
3. Paste them into [`supabase-config.js`](supabase-config.js):

```js
const SUPABASE_CONFIG = {
  url: 'https://abcdefghijklmnop.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
};
```

## 3. Reload the extension

1. Open `chrome://extensions`
2. Click **Reload** on Mondrian Browsing
3. Play a game — you'll be asked for a display name on your first score

## Ranking rules

1. **Finished paintings** always rank above unfinished runs
2. Among finishes: larger paintings rank higher (more total blocks)
3. Among unfinished runs: more blocks painted ranks higher

If you already created the database earlier, run [`supabase/update-ranking.sql`](supabase/update-ranking.sql) in the SQL Editor to update the rank function.

## Notes

- The leaderboard is **global** (all players, all pages).
- Scores are submitted from the browser, so this is meant for fun — not anti-cheat competitive play.
- Keep the anon key in the extension (that's normal), but only enable the RLS policies from `schema.sql` so clients can read/insert scores only.
