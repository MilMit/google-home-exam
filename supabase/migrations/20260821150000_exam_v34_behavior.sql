-- v3.4: server-assisted behavioral integrity telemetry
alter table public.attempt_events drop constraint if exists attempt_events_event_type_check;
alter table public.attempt_events
  add constraint attempt_events_event_type_check check (event_type in (
    'tab_hidden','tab_visible','window_blur','window_focus',
    'network_offline','network_online',
    'camera_started','camera_stopped',
    'fullscreen_enter','fullscreen_exit',
    'copy_attempt','paste_attempt',
    'question_view','answer_saved'
  ));

create index if not exists attempt_events_type_time_idx
  on public.attempt_events (attempt_id, event_type, created_at);
