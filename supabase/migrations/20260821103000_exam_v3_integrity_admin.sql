-- v3: translation declaration, integrity scoring, camera/fullscreen events, and admin access

alter table public.exam_attempts
  add column if not exists translation_assistance boolean not null default false,
  add column if not exists camera_verified boolean not null default false,
  add column if not exists integrity_score numeric(6,2),
  add column if not exists integrity_status text,
  add column if not exists security_summary jsonb not null default '{}'::jsonb;

alter table public.attempt_events drop constraint if exists attempt_events_event_type_check;
alter table public.attempt_events
  add constraint attempt_events_event_type_check check (event_type in (
    'tab_hidden','tab_visible','window_blur','window_focus',
    'network_offline','network_online',
    'camera_started','camera_stopped',
    'fullscreen_enter','fullscreen_exit',
    'copy_attempt','paste_attempt'
  ));

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  admin_id text not null unique,
  display_name text not null default 'Administrator',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;

create index if not exists exam_attempts_integrity_idx
  on public.exam_attempts (integrity_status, submitted_at desc);
