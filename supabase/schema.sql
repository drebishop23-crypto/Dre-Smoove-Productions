-- Dré Smoove Productions: database + storage setup
-- Every table starts with sp_ and every bucket with sp- so nothing collides
-- with the DJ Dre Smoove Bookings site in the same Supabase project.
-- Safe to run more than once.

create extension if not exists pgcrypto;

create table if not exists public.sp_tracks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  artist        text not null default 'Dré Smoove',
  source        text not null default 'upload' check (source in ('upload', 'ai')),
  tags          text[] not null default '{}',
  release_date  date,
  audio_path    text not null,
  artwork_path  text,
  format        text,
  duration      numeric,
  peaks         jsonb,
  prompt        text,
  lyrics        text,
  model         text,
  created_at    timestamptz not null default now()
);

create index if not exists sp_tracks_created_at_idx on public.sp_tracks (created_at desc);
create index if not exists sp_tracks_source_idx on public.sp_tracks (source);

create table if not exists public.sp_playlists (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.sp_playlist_tracks (
  playlist_id  uuid not null references public.sp_playlists (id) on delete cascade,
  track_id     uuid not null references public.sp_tracks (id) on delete cascade,
  position     integer not null default 0,
  added_at     timestamptz not null default now(),
  primary key (playlist_id, track_id)
);

create table if not exists public.sp_generations (
  id          text primary key,
  provider    text,
  mode        text,
  title       text,
  tags        text[] not null default '{}',
  prompt      text,
  lyrics      text,
  status      text,
  error       text,
  track_id    uuid references public.sp_tracks (id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.sp_tracks enable row level security;
alter table public.sp_playlists enable row level security;
alter table public.sp_playlist_tracks enable row level security;
alter table public.sp_generations enable row level security;

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('sp-audio', 'sp-audio', false, 52428800),
  ('sp-artwork', 'sp-artwork', false, 10485760)
on conflict (id) do nothing;
