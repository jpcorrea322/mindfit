// MindFit MCP server: lets an AI agent (e.g. Duet) read and update a user's areas and daily tasks.
//
// Transport: MCP Streamable HTTP, JSON responses only (POST in, JSON-RPC out; no SSE stream).
// Auth: the connector URL carries a per-user token (?key=mf_...), or it can be sent as a Bearer token.
// Only the token's SHA-256 hash is stored, in public.agent_tokens. Requests then run with the service
// role, and every query is scoped to that token's user_id.
//
// Data model (shared with the web app):
// - life_areas: the user's fixed areas (Health, Home, ...)
// - tasks_kanban: items to stay on top of, each in an area, with a cadence:
//     once   - one-off; due_date is the deadline; with start_date it covers a period (start_date..due_date)
//     weekly - resets every Monday; done for the week after per_week check-offs
//     every  - comes due again repeat_days after it's done (due_date moves forward)
//   weekly/every items with an end_date (and optionally start_date) are temporary; without one they're permanent.
//   Recurring check-offs are kept in done_log [{date, prev_due}], at most one per day.
// - tasks_daily: one row per (user, date) with tasks jsonb [{id, text, status, source?}] plus habit
//   check-offs ({habitId}) kept after the tasks. source = {type:"kanban", cardId} links a task to an item.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_INFO = { name: "mindfit", title: "MindFit", version: "1.0.0" };
const INSTRUCTIONS = `MindFit is the user's personal tracker. "Areas" are fixed parts of their life (Health, Home, Money, ...).
Each area holds items to stay on top of:
- permanent weekly items: a checklist that resets every Monday (optionally N times a week),
- temporary recurring items: weekly or every N days, but only between a start and end date,
- period items: something that runs from a start date to an end date,
- one-off items with an optional due date, and permanent "every N days" upkeep (e.g. dentist every 180 days).
The daily task list holds what the user plans to do on a given day; plan an item onto a day with add_task(item_id=...).
Start with get_overview. Dates are YYYY-MM-DD in the user's time zone; weeks start on Monday.`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version, mcp-session-id, x-client-info, apikey",
  "Access-Control-Expose-Headers": "mcp-session-id",
};

type Json = Record<string, unknown>;
type Ctx = { db: SupabaseClient; userId: string; tz: string };

class ToolError extends Error {}

// ---------- helpers ----------

const sha256Hex = async (text: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))))
    .map((b) => b.toString(16).padStart(2, "0")).join("");

const localToday = (tz: string) => {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
  catch { return new Date().toISOString().slice(0, 10); }
};
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const isISODate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T00:00:00Z"));
const resolveDate = (input: unknown, today: string) => {
  if (input === undefined || input === null || input === "" || input === "today") return today;
  if (input === "tomorrow") return addDays(today, 1);
  if (isISODate(input)) return input;
  throw new ToolError(`Invalid date "${input}". Use YYYY-MM-DD, "today" or "tomorrow".`);
};

type Item = {
  id: string; title: string; status: string; due_date: string | null; area_id: string | null; goal_id: string | null;
  notes: string; cadence?: string; per_week?: number; repeat_days: number | null; start_date?: string | null; end_date?: string | null;
  done_log: { date: string; prev_due?: string | null }[]; completed_at: string | null; created_at: string;
};
type Area = { id: string; name: string; color: string; position: number };

const cadenceOf = (c: Item) => c.cadence === "weekly" ? "weekly" : (c.cadence === "every" || c.repeat_days) ? "every" : "once";
const weekStart = (iso: string) => { const d = new Date(iso + "T00:00:00Z"); return addDays(iso, -((d.getUTCDay() + 6) % 7)); };
const lastDone = (c: Item) => (c.done_log?.length ? c.done_log[c.done_log.length - 1] : null);

// Same rules as the app (src/App.jsx itemState)
const itemState = (c: Item, today: string) => {
  const log = c.done_log || [];
  const cad = cadenceOf(c);
  const upcoming = !!c.start_date && c.start_date > today;
  const doneToday = cad === "once" ? c.status === "done" && (c.completed_at || "").slice(0, 10) === today : log.some((e) => e.date === today);
  if (cad === "weekly") {
    const ws = weekStart(today), we = addDays(ws, 6);
    const ended = !!c.end_date && c.end_date < today;
    const count = log.filter((e) => e.date >= ws && e.date <= we).length;
    const target = c.per_week || 1;
    return { cad, count, target, upcoming, ended, doneToday, done: ended || (!upcoming && count >= target), due: upcoming || ended ? null : (c.end_date && c.end_date < we ? c.end_date : we) };
  }
  if (cad === "every") {
    const last = lastDone(c);
    if (last && last.date === today) return { cad, upcoming, ended: false, doneToday, done: true, due: last.prev_due ?? null };
    const ended = !!c.end_date && (c.end_date < today || (!!c.due_date && c.due_date > c.end_date));
    return { cad, upcoming, ended, doneToday, done: ended, due: ended ? null : c.due_date || c.start_date || null };
  }
  return { cad, upcoming, ended: false, doneToday, done: c.status === "done", due: c.due_date };
};
// What a daily task planned from the item mirrors: recurring items are checked off a day at a time
const sourceDone = (c: Item, today: string) => { const s = itemState(c, today); return s.cad === "once" ? s.done : s.doneToday; };

const doneFields = (c: Item, done: boolean, today: string): Json | null => {
  const cad = cadenceOf(c);
  const log = c.done_log || [];
  if (cad === "once") return { status: done ? "done" : "todo", completed_at: done ? new Date().toISOString() : null };
  if (done) {
    const entry = { date: today, prev_due: c.due_date };
    return cad === "weekly"
      ? { done_log: [...log, entry], completed_at: new Date().toISOString() }
      : { done_log: [...log, entry], due_date: addDays(today, c.repeat_days || 1), completed_at: new Date().toISOString() };
  }
  const from = cad === "weekly" ? weekStart(today) : today;
  let i = log.length - 1;
  while (i >= 0 && log[i].date < from) i--;
  if (i < 0) return null;
  const rest = [...log.slice(0, i), ...log.slice(i + 1)];
  const fields: Json = { done_log: rest, completed_at: rest.length ? new Date(rest[rest.length - 1].date + "T12:00:00Z").toISOString() : null };
  if (cad === "every") fields.due_date = log[i].prev_due ?? null;
  return fields;
};

const kindOf = (c: Item) => {
  const cad = cadenceOf(c);
  if (cad === "once") return c.start_date ? "period" : "one_off";
  if (c.end_date || c.start_date) return cad === "weekly" ? "temporary_weekly" : "temporary_every_n_days";
  return cad === "weekly" ? "permanent_weekly" : "every_n_days";
};

const describeItem = (c: Item, areas: Area[], today: string) => {
  const s = itemState(c, today);
  const daysUntil = s.due ? Math.round((Date.parse(s.due + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400000) : null;
  return {
    id: c.id,
    title: c.title,
    area: areas.find((a) => a.id === c.area_id)?.name ?? "Unsorted",
    kind: kindOf(c),
    done: s.done,
    checked_off_today: s.cad === "once" ? undefined : s.doneToday,
    this_week: s.cad === "weekly" ? `${s.count} of ${s.target}` : undefined,
    times_per_week: s.cad === "weekly" ? s.target : undefined,
    repeats_every_days: s.cad === "every" ? c.repeat_days : undefined,
    starts: c.start_date || undefined,
    ends: (s.cad === "once" ? (c.start_date ? c.due_date : undefined) : c.end_date) || undefined,
    not_started_yet: s.upcoming || undefined,
    finished_period: s.ended || undefined,
    due_date: s.cad === "weekly" ? undefined : s.due,
    next_due_date: s.cad === "every" ? c.due_date : undefined,
    overdue: s.cad !== "weekly" && !s.done && !s.upcoming && daysUntil !== null && daysUntil < 0,
    days_until_due: s.cad === "weekly" ? undefined : daysUntil,
    last_done: s.cad === "once" ? (c.status === "done" && c.completed_at ? c.completed_at.slice(0, 10) : null) : lastDone(c)?.date ?? null,
    notes: c.notes || undefined,
  };
};

async function loadAreas(ctx: Ctx): Promise<Area[]> {
  const { data, error } = await ctx.db.from("life_areas").select("id,name,color,position").eq("user_id", ctx.userId).order("position");
  if (error) throw new Error(error.message);
  return data as Area[];
}
async function loadItems(ctx: Ctx): Promise<Item[]> {
  const { data, error } = await ctx.db.from("tasks_kanban").select("*").eq("user_id", ctx.userId).order("created_at");
  if (error) throw new Error(error.message);
  return data as Item[];
}
async function getItem(ctx: Ctx, id: unknown): Promise<Item> {
  if (typeof id !== "string" || !id) throw new ToolError("item_id is required.");
  const { data } = await ctx.db.from("tasks_kanban").select("*").eq("user_id", ctx.userId).eq("id", id).maybeSingle();
  if (!data) throw new ToolError(`No item with id ${id}. Use list_items to find ids.`);
  return data as Item;
}
async function findArea(ctx: Ctx, areas: Area[], name: unknown): Promise<Area | null> {
  if (name === undefined || name === null || name === "") return null;
  if (typeof name !== "string") throw new ToolError("area must be a string.");
  const q = name.trim().toLowerCase();
  const match = areas.find((a) => a.id === name || a.name.toLowerCase() === q)
    ?? areas.find((a) => a.name.toLowerCase().startsWith(q) || q.startsWith(a.name.toLowerCase()));
  if (!match) throw new ToolError(`No area named "${name}". Areas: ${areas.map((a) => a.name).join(", ")}. Use add_area to create one.`);
  return match;
}

type DayTask = { id: number | string; text?: string; status?: string; source?: { type: string; cardId?: string }; habitId?: string };
async function loadDay(ctx: Ctx, date: string): Promise<DayTask[]> {
  const { data } = await ctx.db.from("tasks_daily").select("tasks").eq("user_id", ctx.userId).eq("date", date).maybeSingle();
  return (data?.tasks as DayTask[]) || [];
}
async function saveDay(ctx: Ctx, date: string, tasks: DayTask[]) {
  const { error } = await ctx.db.from("tasks_daily").upsert(
    { user_id: ctx.userId, date, tasks, updated_at: new Date().toISOString() }, { onConflict: "user_id,date" });
  if (error) throw new Error(error.message);
}
const newTaskId = () => Date.now() + Math.floor(Math.random() * 1000);

// Marks an item done/undone and keeps today's planned tasks for it in step (as the app does)
async function setItemDone(ctx: Ctx, item: Item, done: boolean, today: string) {
  const s = itemState(item, today);
  if (s.upcoming || s.ended) throw new ToolError(s.upcoming ? `"${item.title}" doesn't start until ${item.start_date}.` : `"${item.title}" has finished its period.`);
  if (sourceDone(item, today) === done) {
    if (done) return item; // already checked off today (recurring items take one check-off a day)
    if (s.cad !== "weekly") return item;
  }
  const fields = doneFields(item, done, today);
  if (!fields) throw new ToolError("There's no check-off to undo.");
  const { data, error } = await ctx.db.from("tasks_kanban").update(fields).eq("id", item.id).eq("user_id", ctx.userId).select().single();
  if (error) throw new Error(error.message);
  const tasks = await loadDay(ctx, today);
  let changed = false;
  const next = tasks.map((t) => {
    if (t.source?.type === "kanban" && t.source.cardId === item.id && t.status === (done ? "pending" : "complete")) { changed = true; return { ...t, status: done ? "complete" : "pending" }; }
    return t;
  });
  if (changed) await saveDay(ctx, today, next);
  return data as Item;
}

// Turns the schedule arguments of add_item/update_item into item columns
const SCHEDULES = ["weekly", "every_n_days", "period", "one_off"];
const scheduleOf = (c: Item) => { const cad = cadenceOf(c); return cad === "weekly" ? "weekly" : cad === "every" ? "every_n_days" : c.start_date ? "period" : "one_off"; };
function scheduleFields(a: Json, today: string, prev?: Item): Json {
  const has = (k: string) => Object.prototype.hasOwnProperty.call(a, k);
  const schedule = String(a.schedule ?? (prev ? scheduleOf(prev) : (a.repeat_every_days != null ? "every_n_days" : "one_off")));
  if (!SCHEDULES.includes(schedule)) throw new ToolError(`schedule must be one of ${SCHEDULES.join(", ")}.`);
  const date = (k: string, fallback: unknown) => {
    const v = has(k) ? a[k] : fallback;
    if (v === null || v === undefined || v === "") return null;
    if (!isISODate(v)) throw new ToolError(`${k} must be YYYY-MM-DD.`);
    return v;
  };
  const prevEnd = prev ? (cadenceOf(prev) === "once" ? (prev.start_date ? prev.due_date : null) : prev.end_date) : null;
  const start = date("start_date", prev?.start_date);
  const end = date("end_date", prevEnd);
  if (start && end && end < start) throw new ToolError("end_date is before start_date.");
  if (schedule === "one_off") return { cadence: "once", repeat_days: null, start_date: null, end_date: null, due_date: date("due_date", prev && cadenceOf(prev) === "once" ? prev.due_date : null) };
  if (schedule === "period") {
    if (!start || !end) throw new ToolError("A period needs start_date and end_date.");
    return { cadence: "once", repeat_days: null, start_date: start, end_date: null, due_date: end };
  }
  const reopen = prev?.status === "done" ? { status: "todo", completed_at: null } : {};
  if (schedule === "weekly") {
    const n = Number(a.times_per_week ?? prev?.per_week ?? 1);
    if (!(Number.isInteger(n) && n >= 1 && n <= 7)) throw new ToolError("times_per_week must be 1-7.");
    return { cadence: "weekly", per_week: n, repeat_days: null, due_date: null, start_date: end ? start || today : start, end_date: end, ...reopen };
  }
  const days = Number(a.repeat_every_days ?? prev?.repeat_days);
  if (!(Number.isInteger(days) && days > 0)) throw new ToolError("every_n_days needs repeat_every_days (a positive integer).");
  const s0 = end ? start || today : start;
  return { cadence: "every", repeat_days: days, start_date: s0, end_date: end, due_date: date("due_date", prev?.due_date) || s0 || today, ...reopen };
}

const scheduleProps = {
  schedule: { type: "string", enum: SCHEDULES, description: "weekly: a checklist item that resets every Monday. every_n_days: comes due again N days after it's done. period: runs from start_date to end_date. one_off: done once, optional due_date." },
  times_per_week: { type: "integer", minimum: 1, maximum: 7, description: "weekly only. Default 1." },
  repeat_every_days: { type: "integer", minimum: 1, description: "every_n_days only, e.g. 2, 30, 180." },
  start_date: { type: ["string", "null"], description: "YYYY-MM-DD. For weekly/every_n_days, with end_date makes it temporary (defaults to today)." },
  end_date: { type: ["string", "null"], description: "YYYY-MM-DD. weekly/every_n_days stop recurring after it; required for period. Omit for a permanent recurring item." },
  due_date: { type: ["string", "null"], description: "YYYY-MM-DD. one_off deadline, or the first/next due date for every_n_days." },
};

// ---------- tools ----------

const dateProp = { type: "string", description: "YYYY-MM-DD, or 'today' / 'tomorrow'. Defaults to today." };

const TOOLS: { name: string; title: string; description: string; inputSchema: Json; annotations?: Json; run: (ctx: Ctx, args: Json) => Promise<unknown> }[] = [
  {
    name: "get_overview",
    title: "Overview",
    description: "Start here. Today's date, each area's weekly progress and open items, weekly items still to do this week, everything overdue or due in the next 7 days, and today's task list.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    run: async (ctx) => {
      const today = localToday(ctx.tz);
      const [areas, items, tasks] = await Promise.all([loadAreas(ctx), loadItems(ctx), loadDay(ctx, today)]);
      const all = items.map((c) => describeItem(c, areas, today));
      const open = all.filter((i) => !i.done && !i.not_started_yet);
      const weekly = all.filter((i) => i.kind === "permanent_weekly");
      const areaNames = [...areas.map((a) => a.name), ...(all.some((i) => i.area === "Unsorted") ? ["Unsorted"] : [])];
      return {
        today,
        week_starts: weekStart(today),
        timezone: ctx.tz,
        areas: areaNames.map((name) => {
          const w = weekly.filter((i) => i.area === name);
          return { name, weekly_done: `${w.filter((i) => i.done).length} of ${w.length}`, other_open_items: open.filter((i) => i.area === name && i.kind !== "permanent_weekly").length };
        }),
        weekly_still_to_do: open.filter((i) => i.kind === "permanent_weekly" || i.kind === "temporary_weekly"),
        overdue: open.filter((i) => i.overdue),
        due_next_7_days: open.filter((i) => i.days_until_due != null && i.days_until_due >= 0 && i.days_until_due <= 7),
        today_tasks: tasks.filter((t) => !t.habitId).map((t) => ({ id: t.id, text: t.text, status: t.status, item_id: t.source?.type === "kanban" ? t.source.cardId : undefined })),
      };
    },
  },
  {
    name: "list_areas",
    title: "List areas",
    description: "The user's life areas in display order.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    run: async (ctx) => (await loadAreas(ctx)).map((a) => ({ id: a.id, name: a.name })),
  },
  {
    name: "add_area",
    title: "Add area",
    description: "Create a new life area. Only do this when the user asks; prefer the existing areas.",
    inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    run: async (ctx, a) => {
      const name = String(a.name || "").trim();
      if (!name) throw new ToolError("name is required.");
      const areas = await loadAreas(ctx);
      if (areas.some((x) => x.name.toLowerCase() === name.toLowerCase())) throw new ToolError(`Area "${name}" already exists.`);
      const colors = ["rose", "amber", "yellow", "emerald", "cyan", "blue", "violet", "fuchsia", "slate"];
      const { data, error } = await ctx.db.from("life_areas").insert({
        user_id: ctx.userId, name, color: colors[areas.length % colors.length], position: Math.max(-1, ...areas.map((x) => x.position)) + 1,
      }).select("id,name").single();
      if (error) throw new Error(error.message);
      return data;
    },
  },
  {
    name: "list_items",
    title: "List items",
    description: "Items being tracked, optionally filtered to one area. Sorted overdue first, then by due date.",
    inputSchema: {
      type: "object",
      properties: {
        area: { type: "string", description: "Area name (case-insensitive). Omit for all areas." },
        include_done: { type: "boolean", description: "Include finished one-off items. Default false." },
        due_within_days: { type: "integer", description: "Only items due within this many days (overdue included)." },
      },
    },
    annotations: { readOnlyHint: true },
    run: async (ctx, a) => {
      const today = localToday(ctx.tz);
      const [areas, items] = await Promise.all([loadAreas(ctx), loadItems(ctx)]);
      const area = await findArea(ctx, areas, a.area);
      let list = items.filter((c) => !area || c.area_id === area.id).map((c) => describeItem(c, areas, today));
      if (!a.include_done) list = list.filter((i) => !i.done);
      if (typeof a.due_within_days === "number") list = list.filter((i) => i.days_until_due != null && i.days_until_due <= (a.due_within_days as number));
      return list.sort((x, y) => (x.due_date && y.due_date) ? x.due_date.localeCompare(y.due_date) : x.due_date ? -1 : y.due_date ? 1 : 0);
    },
  },
  {
    name: "add_item",
    title: "Add item",
    description: "Track something under an area. Examples: permanent weekly chore -> schedule=weekly; '3 times a week for the next month' -> schedule=weekly, times_per_week=3, end_date; 'every 2 days until Dec 20' -> every_n_days with end_date; dentist every 6 months -> every_n_days, repeat_every_days=180; 'Dec 1 to Dec 20' -> period; plain to-do -> one_off.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        area: { type: "string", description: "Area name. Omit to leave it unsorted." },
        ...scheduleProps,
        notes: { type: "string" },
      },
      required: ["title"],
    },
    run: async (ctx, a) => {
      const title = String(a.title || "").trim();
      if (!title) throw new ToolError("title is required.");
      const today = localToday(ctx.tz);
      const areas = await loadAreas(ctx);
      const area = await findArea(ctx, areas, a.area);
      const { data, error } = await ctx.db.from("tasks_kanban").insert({
        user_id: ctx.userId, title, status: "todo", area_id: area?.id ?? null, notes: typeof a.notes === "string" ? a.notes : "",
        ...scheduleFields(a, today),
      }).select().single();
      if (error) throw new Error(error.message);
      return describeItem(data as Item, areas, today);
    },
  },
  {
    name: "update_item",
    title: "Update item",
    description: "Change an item's title, area, notes or schedule. Schedule fields you don't pass keep their current values; pass null to clear a date.",
    inputSchema: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        title: { type: "string" },
        area: { type: "string" },
        ...scheduleProps,
        notes: { type: "string" },
      },
      required: ["item_id"],
    },
    run: async (ctx, a) => {
      const today = localToday(ctx.tz);
      const item = await getItem(ctx, a.item_id);
      const areas = await loadAreas(ctx);
      const fields: Json = {};
      if (typeof a.title === "string" && a.title.trim()) fields.title = a.title.trim();
      if (a.area !== undefined) fields.area_id = (await findArea(ctx, areas, a.area))?.id ?? null;
      if (typeof a.notes === "string") fields.notes = a.notes;
      if (Object.keys(scheduleProps).some((k) => k in a)) {
        Object.assign(fields, scheduleFields(a, today, item));
        // Switching to a one-off clears the recurring history
        if (fields.cadence === "once" && cadenceOf(item) !== "once") Object.assign(fields, { status: "todo", done_log: [] });
      }
      if (Object.keys(fields).length === 0) throw new ToolError("Nothing to update.");
      const { data, error } = await ctx.db.from("tasks_kanban").update(fields).eq("id", item.id).eq("user_id", ctx.userId).select().single();
      if (error) throw new Error(error.message);
      return describeItem(data as Item, areas, today);
    },
  },
  {
    name: "complete_item",
    title: "Complete item",
    description: "Check an item off for today (or undo with undone=true). One-off/period items become done. Weekly items count toward this week's times_per_week. every_n_days items log today and move their due date forward. Recurring items take one check-off per day.",
    inputSchema: { type: "object", properties: { item_id: { type: "string" }, undone: { type: "boolean" } }, required: ["item_id"] },
    run: async (ctx, a) => {
      const today = localToday(ctx.tz);
      const item = await getItem(ctx, a.item_id);
      const updated = await setItemDone(ctx, item, !a.undone, today);
      return describeItem(updated, await loadAreas(ctx), today);
    },
  },
  {
    name: "delete_item",
    title: "Delete item",
    description: "Permanently delete an item. Confirm with the user first.",
    inputSchema: { type: "object", properties: { item_id: { type: "string" } }, required: ["item_id"] },
    annotations: { destructiveHint: true },
    run: async (ctx, a) => {
      const item = await getItem(ctx, a.item_id);
      const { error } = await ctx.db.from("tasks_kanban").delete().eq("id", item.id).eq("user_id", ctx.userId);
      if (error) throw new Error(error.message);
      return { deleted: item.title };
    },
  },
  {
    name: "get_day",
    title: "Get a day's tasks",
    description: "The task list for a day (default today), plus area items (not weekly ones) due that day.",
    inputSchema: { type: "object", properties: { date: dateProp } },
    annotations: { readOnlyHint: true },
    run: async (ctx, a) => {
      const today = localToday(ctx.tz);
      const date = resolveDate(a.date, today);
      const [areas, items, tasks] = await Promise.all([loadAreas(ctx), loadItems(ctx), loadDay(ctx, date)]);
      const planned = new Set(tasks.map((t) => t.source?.cardId).filter(Boolean));
      return {
        date,
        tasks: tasks.filter((t) => !t.habitId).map((t) => {
          const item = t.source?.type === "kanban" ? items.find((c) => c.id === t.source!.cardId) : undefined;
          return { id: t.id, text: item?.title ?? t.text, status: t.status, item_id: item?.id, area: item ? describeItem(item, areas, today).area : undefined };
        }),
        items_due: items.filter((c) => { const s = itemState(c, today); return s.cad !== "weekly" && !s.done && !s.upcoming && s.due && (s.due === date || (date === today && s.due < date)); })
          .filter((c) => !planned.has(c.id)).map((c) => describeItem(c, areas, today)),
      };
    },
  },
  {
    name: "add_task",
    title: "Add task to a day",
    description: "Add a task to a day's list. Pass item_id to plan an area item (checking the task off then completes the item), or text for a plain task.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string" }, item_id: { type: "string" }, date: dateProp },
    },
    run: async (ctx, a) => {
      const date = resolveDate(a.date, localToday(ctx.tz));
      const tasks = await loadDay(ctx, date);
      let task: DayTask;
      if (a.item_id) {
        const item = await getItem(ctx, a.item_id);
        const existing = tasks.find((t) => t.source?.type === "kanban" && t.source.cardId === item.id);
        if (existing) return { already_planned: true, date, task_id: existing.id };
        task = { id: newTaskId(), text: item.title, status: "pending", source: { type: "kanban", cardId: item.id } };
      } else {
        const text = String(a.text || "").trim();
        if (!text) throw new ToolError("Pass text or item_id.");
        task = { id: newTaskId(), text, status: "pending" };
      }
      // Tasks stay ahead of the habit check-offs stored at the end of the list
      await saveDay(ctx, date, [...tasks.filter((t) => !t.habitId), task, ...tasks.filter((t) => t.habitId)]);
      return { date, task_id: task.id, text: task.text };
    },
  },
  {
    name: "set_task_status",
    title: "Set task status",
    description: "Mark a day's task complete, pending or skipped. Completing a task planned from an item also completes the item.",
    inputSchema: {
      type: "object",
      properties: { task_id: { type: ["string", "integer"] }, status: { type: "string", enum: ["complete", "pending", "skipped"] }, date: dateProp },
      required: ["task_id", "status"],
    },
    run: async (ctx, a) => {
      const today = localToday(ctx.tz);
      const date = resolveDate(a.date, today);
      const status = String(a.status);
      if (!["complete", "pending", "skipped"].includes(status)) throw new ToolError("status must be complete, pending or skipped.");
      const tasks = await loadDay(ctx, date);
      const task = tasks.find((t) => !t.habitId && String(t.id) === String(a.task_id));
      if (!task) throw new ToolError(`No task ${a.task_id} on ${date}. Use get_day to find task ids.`);
      await saveDay(ctx, date, tasks.map((t) => (t === task ? { ...t, status } : t)));
      if (task.source?.type === "kanban" && (status === "complete") !== (task.status === "complete")) {
        const { data } = await ctx.db.from("tasks_kanban").select("*").eq("user_id", ctx.userId).eq("id", task.source.cardId).maybeSingle();
        if (data) await setItemDone(ctx, data as Item, status === "complete", today);
      }
      return { date, task_id: task.id, status };
    },
  },
  {
    name: "remove_task",
    title: "Remove task from a day",
    description: "Take a task off a day's list. A task planned from an item only removes the plan; the item stays tracked.",
    inputSchema: { type: "object", properties: { task_id: { type: ["string", "integer"] }, date: dateProp }, required: ["task_id"] },
    run: async (ctx, a) => {
      const date = resolveDate(a.date, localToday(ctx.tz));
      const tasks = await loadDay(ctx, date);
      const task = tasks.find((t) => !t.habitId && String(t.id) === String(a.task_id));
      if (!task) throw new ToolError(`No task ${a.task_id} on ${date}.`);
      await saveDay(ctx, date, tasks.filter((t) => t !== task));
      return { removed: task.text, date };
    },
  },
];

// ---------- JSON-RPC ----------

const rpcResult = (id: unknown, result: unknown) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function handle(msg: Json, ctx: Ctx): Promise<Json | null> {
  const { id, method } = msg as { id?: unknown; method?: string };
  const params = (msg.params || {}) as Json;
  if (typeof method !== "string") return rpcError(id, -32600, "Invalid request");
  if (id === undefined) return null; // notification (e.g. notifications/initialized)

  switch (method) {
    case "initialize": {
      const asked = String(params.protocolVersion || "");
      return rpcResult(id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, ...(annotations ? { annotations } : {}) })) });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${params.name}`);
      try {
        const out = await tool.run(ctx, (params.arguments || {}) as Json);
        return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], isError: false });
      } catch (e) {
        const message = e instanceof ToolError ? e.message : `Something went wrong: ${(e as Error).message}`;
        return rpcResult(id, { content: [{ type: "text", text: message }], isError: true });
      }
    }
    case "resources/list":
      return rpcResult(id, { resources: [] });
    case "prompts/list":
      return rpcResult(id, { prompts: [] });
    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", ...extra } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  // No server-initiated stream or sessions: GET (SSE) and DELETE (end session) aren't offered
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });

  const url = new URL(req.url);
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(mf_[0-9a-f]+)$/i)?.[1];
  const key = url.searchParams.get("key") || bearer;
  if (!key || !/^mf_[0-9a-f]{20,}$/.test(key)) return json(rpcError(null, -32001, "Missing or malformed MindFit connector key"), 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: token } = await db.from("agent_tokens").select("id,user_id,timezone,last_used_at").eq("token_hash", await sha256Hex(key)).maybeSingle();
  if (!token) return json(rpcError(null, -32001, "This MindFit connector key was revoked or doesn't exist"), 401);

  // Record use at most every 10 minutes
  if (!token.last_used_at || Date.now() - Date.parse(token.last_used_at) > 600000)
    await db.from("agent_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", token.id);

  let body: unknown;
  try { body = await req.json(); } catch { return json(rpcError(null, -32700, "Parse error"), 400); }
  const ctx: Ctx = { db, userId: token.user_id, tz: token.timezone || "UTC" };

  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handle(m as Json, ctx)))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
  }
  const out = await handle(body as Json, ctx);
  return out ? json(out) : new Response(null, { status: 202, headers: CORS });
});
