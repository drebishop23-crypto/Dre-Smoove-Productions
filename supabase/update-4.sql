-- Dré Smoove Productions: update 4
-- Suno-style Create, Library, Editor and Studio.
-- Safe to run more than once.

-- Songs: versions, publishing, likes, workspaces, stems
alter table public.sp_tracks add column if not exists lyrics_synced jsonb;
alter table public.sp_tracks drop constraint if exists sp_tracks_source_check;
alter table public.sp_tracks add column if not exists parent_id uuid references public.sp_tracks (id) on delete set null;
alter table public.sp_tracks add column if not exists edit_note text;
alter table public.sp_tracks add column if not exists is_public boolean not null default false;
alter table public.sp_tracks add column if not exists pinned boolean not null default false;
alter table public.sp_tracks add column if not exists allow_remixes boolean not null default true;
alter table public.sp_tracks add column if not exists allow_comments boolean not null default true;
alter table public.sp_tracks add column if not exists liked boolean not null default false;
alter table public.sp_tracks add column if not exists disliked boolean not null default false;
alter table public.sp_tracks add column if not exists instrumental boolean not null default false;
alter table public.sp_tracks add column if not exists workspace_id uuid;
alter table public.sp_tracks add column if not exists stems jsonb;
alter table public.sp_tracks add column if not exists midi_path text;

create table if not exists public.sp_workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sp_tracks_workspace_fk') then
    alter table public.sp_tracks
      add constraint sp_tracks_workspace_fk foreign key (workspace_id) references public.sp_workspaces (id) on delete set null;
  end if;
end $$;

-- AI jobs: what kind of job, which song it came from, extra settings
alter table public.sp_generations add column if not exists kind text;
alter table public.sp_generations add column if not exists parent_id uuid;
alter table public.sp_generations add column if not exists workspace_id uuid;
alter table public.sp_generations add column if not exists params jsonb;
alter table public.sp_generations add column if not exists result jsonb;

-- Multitrack Studio projects
create table if not exists public.sp_projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Untitled project',
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Hooks: short highlight clips cut from songs
create table if not exists public.sp_hooks (
  id          uuid primary key default gen_random_uuid(),
  track_id    uuid not null references public.sp_tracks (id) on delete cascade,
  title       text,
  start_sec   numeric not null default 0,
  end_sec     numeric not null default 15,
  liked       boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Comments on public song pages
create table if not exists public.sp_comments (
  id          uuid primary key default gen_random_uuid(),
  track_id    uuid not null references public.sp_tracks (id) on delete cascade,
  name        text not null default 'Guest',
  body        text not null,
  created_at  timestamptz not null default now()
);

-- Listening history
create table if not exists public.sp_plays (
  id          bigint generated always as identity primary key,
  track_id    uuid not null references public.sp_tracks (id) on delete cascade,
  played_at   timestamptz not null default now()
);

create index if not exists sp_plays_played_at_idx on public.sp_plays (played_at desc);
create index if not exists sp_hooks_track_idx on public.sp_hooks (track_id);
create index if not exists sp_comments_track_idx on public.sp_comments (track_id, created_at);
create index if not exists sp_tracks_parent_idx on public.sp_tracks (parent_id);

alter table public.sp_workspaces enable row level security;
alter table public.sp_projects enable row level security;
alter table public.sp_hooks enable row level security;
alter table public.sp_comments enable row level security;
alter table public.sp_plays enable row level security;

-- Trash: deleted songs wait here until restored or deleted forever
alter table public.sp_tracks add column if not exists deleted_at timestamptz;
create index if not exists sp_tracks_deleted_idx on public.sp_tracks (deleted_at);
