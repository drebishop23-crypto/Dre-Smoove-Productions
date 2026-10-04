-- Dré Smoove Productions: update 5 — Trash (restore or delete forever). Safe to run more than once.
alter table public.sp_tracks add column if not exists deleted_at timestamptz;
create index if not exists sp_tracks_deleted_idx on public.sp_tracks (deleted_at);
