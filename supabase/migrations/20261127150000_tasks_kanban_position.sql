-- Manual order of area items within their list (set by drag and drop on the Areas page).
-- Null until an item is first dragged; those sort after positioned items by due date.
alter table public.tasks_kanban
  add column if not exists position double precision;
