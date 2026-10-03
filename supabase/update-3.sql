-- Dré Smoove Productions: update 3 — synced lyrics. Safe to run more than once.
alter table public.sp_tracks add column if not exists lyrics_synced jsonb;
