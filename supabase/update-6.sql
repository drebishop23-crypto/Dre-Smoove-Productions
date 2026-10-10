-- Date each song was recorded (used for sorting by date recorded)
alter table public.sp_tracks add column if not exists recorded_date date;
