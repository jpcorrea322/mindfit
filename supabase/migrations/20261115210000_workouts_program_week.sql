-- Tie PPL program sessions to the program week they were logged for, instead of
-- inferring it from the calendar date (a late session spilled into the next week).
alter table public.workouts
  add column if not exists program_week smallint;

-- Backfill from the "W<n> <Phase> · RPE ..." note the Program tab writes on the core lift
update public.workouts
set program_week = substring(exercises->0->>'notes' from '^W([0-9]+) ')::smallint
where program_week is null
  and type in ('Push', 'Pull', 'Legs')
  and exercises->0->>'notes' ~ '^W[0-9]+ ';
