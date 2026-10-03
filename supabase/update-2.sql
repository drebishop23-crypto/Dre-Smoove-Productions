-- Dré Smoove Productions: update 2
-- Profile page, plays/likes, platform links, AI videos, platform connections.
-- Safe to run more than once.

alter table public.sp_tracks add column if not exists plays integer not null default 0;
alter table public.sp_tracks add column if not exists likes integer not null default 0;
alter table public.sp_tracks add column if not exists video_path text;
alter table public.sp_tracks add column if not exists spotify_url text;
alter table public.sp_tracks add column if not exists apple_music_url text;
alter table public.sp_tracks add column if not exists soundcloud_url text;
alter table public.sp_tracks add column if not exists youtube_url text;

create table if not exists public.sp_profile (
  id              integer primary key default 1 check (id = 1),
  display_name    text not null default 'Dré Smoove',
  handle          text not null default 'dresmoove',
  bio             text,
  avatar_path     text,
  banner_path     text,
  genres          text[] not null default '{}',
  soundcloud_url  text,
  youtube_url     text,
  spotify_url     text,
  apple_music_url text,
  instagram_url   text,
  profile_views   integer not null default 0,
  updated_at      timestamptz not null default now()
);

insert into public.sp_profile (id, display_name, handle, bio, genres)
values (
  1,
  'Dré Smoove',
  'dresmoove',
  'Dré Bishop, born and raised in Brooklyn, NY, began writing songs in the late 80s and early 90s, inspired by his favorite group New Edition. His music moves from R&B and soul to pop and hip-hop, built on emotion, honesty, and timeless melody.',
  array['R&B', 'Hip-Hop', 'Soul', 'Heartfelt']
)
on conflict (id) do nothing;

create table if not exists public.sp_video_jobs (
  id          uuid primary key default gen_random_uuid(),
  track_id    uuid not null references public.sp_tracks (id) on delete cascade,
  look        text,
  status      text not null default 'generating',
  clip_count  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.sp_video_clips (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null references public.sp_video_jobs (id) on delete cascade,
  idx            integer not null,
  prompt         text not null,
  prediction_id  text,
  status         text not null default 'pending',
  output_url     text,
  r2_path        text,
  error          text,
  unique (job_id, idx)
);

alter table public.sp_video_clips add column if not exists output_url text;

create index if not exists sp_video_clips_job_idx on public.sp_video_clips (job_id, idx);

create table if not exists public.sp_connections (
  service        text primary key,
  access_token   text,
  refresh_token  text,
  expires_at     timestamptz,
  account_name   text,
  pkce_verifier  text,
  oauth_state    text,
  updated_at     timestamptz not null default now()
);

alter table public.sp_profile enable row level security;
alter table public.sp_video_jobs enable row level security;
alter table public.sp_video_clips enable row level security;
alter table public.sp_connections enable row level security;
