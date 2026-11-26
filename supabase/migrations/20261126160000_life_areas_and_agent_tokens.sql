-- Areas: the fixed list of life areas things are tracked under (Health, Home, Money, ...).
-- Items to stay on top of keep living in tasks_kanban so goals, Daily and Insights keep their links;
-- each item now belongs to an area and can repeat every N days.
create table if not exists public.life_areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  color text not null default 'blue',
  position integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.life_areas enable row level security;
drop policy if exists "Users manage own areas" on public.life_areas;
create policy "Users manage own areas" on public.life_areas
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index if not exists life_areas_user_id_idx on public.life_areas(user_id);

alter table public.tasks_kanban
  add column if not exists area_id uuid references public.life_areas(id) on delete set null,
  add column if not exists notes text not null default '',
  -- null = one-off; otherwise the item comes due again this many days after it's done
  add column if not exists repeat_days integer check (repeat_days is null or repeat_days > 0),
  -- completions of a repeating item: [{ "date": "YYYY-MM-DD", "prev_due": "YYYY-MM-DD" | null }], newest last
  add column if not exists done_log jsonb not null default '[]'::jsonb;
create index if not exists tasks_kanban_area_id_idx on public.tasks_kanban(area_id);

-- Tokens that let an AI agent (e.g. Duet) reach the mindfit-mcp edge function on a user's behalf.
-- Only a SHA-256 hash of each token is stored; the token itself is shown once when it's created.
create table if not exists public.agent_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token_hash text not null unique,
  label text not null default 'AI agent',
  timezone text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.agent_tokens enable row level security;
drop policy if exists "Users see own agent tokens" on public.agent_tokens;
create policy "Users see own agent tokens" on public.agent_tokens
  for select using ((select auth.uid()) = user_id);
drop policy if exists "Users create own agent tokens" on public.agent_tokens;
create policy "Users create own agent tokens" on public.agent_tokens
  for insert with check ((select auth.uid()) = user_id);
drop policy if exists "Users revoke own agent tokens" on public.agent_tokens;
create policy "Users revoke own agent tokens" on public.agent_tokens
  for delete using ((select auth.uid()) = user_id);
create index if not exists agent_tokens_user_id_idx on public.agent_tokens(user_id);
