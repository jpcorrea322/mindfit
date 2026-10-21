alter table public.tasks_goals
  add column if not exists tracking_type text not null default 'milestones',
  add column if not exists milestones jsonb not null default '[]'::jsonb;

alter table public.tasks_kanban
  add column if not exists completed_at timestamptz;
