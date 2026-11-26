// MindFit MCP server: lets an AI agent (e.g. Duet) read and update a user's areas and daily tasks.
//
// Transport: MCP Streamable HTTP, JSON responses only (POST in, JSON-RPC out; no SSE stream).
// Auth: the connector URL carries a per-user token (?key=mf_...), or it can be sent as a Bearer token.
// Only the token's SHA-256 hash is stored, in public.agent_tokens. Requests then run with the service
// role, and every query is scoped to that token's user_id.
//
// Data model (shared with the web app):
// - life_areas: the user's fixed areas (Health, Home, ...)
// - tasks_kanban: items to stay on top of. area_id, due_date, repeat_days (null = one-off),
//   done_log [{date, prev_due}] for repeating items, status todo|inprogress|done for one-off items
// - tasks_daily: one row per (user, date) with tasks jsonb [{id, text, status, source?}] plus habit
//   check-offs ({habitId}) kept after the tasks. source = {type:"kanban", cardId} links a task to an item.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_INFO = { name: "mindfit", title: "MindFit", version: "1.0.0" };
const INSTRUCTIONS = `MindFit is the user's personal tracker. "Areas" are fixed parts of their life (Health, Home, Money, ...).
Each area holds items to stay on top of: one-off things with an optional due date, or repeating things (every N days) whose
due date moves forward each time they're done. The daily task list holds what they plan to do on a given day; an item can be
planned onto a day with add_task(item_id=...). Start with get_overview. Dates are YYYY-MM-DD in the user's time zone.`;

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
  notes: string; repeat_days: number | null; done_log: { date: string; prev_due: string | null }[]; completed_at: string | null; created_at: string;
};
type Area = { id: string; name: string; color: string; position: number };

const lastDone = (c: Item) => (c.done_log?.length ? c.done_log[c.done_log.length - 1] : null);
// Same rule as the app: a repeating item finished today still reads as done today
const itemState = (c: Item, today: string) => {
  const last = lastDone(c);
  if (c.repeat_days && last && last.date === today) return { done: true, due: last.prev_due };
  return { done: c.status === "done", due: c.due_date };
};
const doneFields = (c: Item, done: boolean, today: string): Json | null => {
  if (c.repeat_days) {
    const log = c.done_log || [];
    if (done) return { status: "todo", done_log: [...log, { date: today, prev_due: c.due_date }], due_date: addDays(today, c.repeat_days), completed_at: new Date().toISOString() };
    const last = log[log.length - 1];
    if (!last) return null;
    const rest = log.slice(0, -1);
    return { done_log: rest, due_date: last.prev_due, completed_at: rest.length ? new Date(rest[rest.length - 1].date + "T12:00:00Z").toISOString() : null };
  }
  return { status: done ? "done" : "todo", completed_at: done ? new Date().toISOString() : null };
};

const describeItem = (c: Item, areas: Area[], today: string) => {
  const { done, due } = itemState(c, today);
  const daysUntil = due ? Math.round((Date.parse(due + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400000) : null;
  return {
    id: c.id,
    title: c.title,
    area: areas.find((a) => a.id === c.area_id)?.name ?? "Unsorted",
    done,
    due_date: due,
    overdue: !done && daysUntil !== null && daysUntil < 0,
    days_until_due: daysUntil,
    repeats_every_days: c.repeat_days,
    next_due_date: c.repeat_days ? c.due_date : undefined,
    last_done: c.repeat_days ? lastDone(c)?.date ?? null : (c.status === "done" && c.completed_at ? c.completed_at.slice(0, 10) : null),
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
  if (itemState(item, today).done === done) return item;
  const fields = doneFields(item, done, today);
  if (!fields) throw new ToolError("This repeating item has no completion to undo.");
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

// ---------- tools ----------

const dateProp = { type: "string", description: "YYYY-MM-DD, or 'today' / 'tomorrow'. Defaults to today." };

const TOOLS: { name: string; title: string; description: string; inputSchema: Json; annotations?: Json; run: (ctx: Ctx, args: Json) => Promise<unknown> }[] = [
  {
    name: "get_overview",
    title: "Overview",
    description: "Start here. Today's date, each area with its open item count, everything overdue or due in the next 7 days, and today's task list.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    run: async (ctx) => {
      const today = localToday(ctx.tz);
      const [areas, items, tasks] = await Promise.all([loadAreas(ctx), loadItems(ctx), loadDay(ctx, today)]);
      const open = items.filter((c) => !itemState(c, today).done).map((c) => describeItem(c, areas, today));
      return {
        today,
        timezone: ctx.tz,
        areas: [...areas.map((a) => ({ name: a.name, open_items: open.filter((i) => i.area === a.name).length })),
          ...(open.some((i) => i.area === "Unsorted") ? [{ name: "Unsorted", open_items: open.filter((i) => i.area === "Unsorted").length }] : [])],
        overdue: open.filter((i) => i.overdue),
        due_next_7_days: open.filter((i) => i.days_until_due !== null && i.days_until_due >= 0 && i.days_until_due <= 7),
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
      if (typeof a.due_within_days === "number") list = list.filter((i) => i.days_until_due !== null && i.days_until_due <= (a.due_within_days as number));
      return list.sort((x, y) => (x.due_date && y.due_date) ? x.due_date.localeCompare(y.due_date) : x.due_date ? -1 : y.due_date ? 1 : 0);
    },
  },
  {
    name: "add_item",
    title: "Add item",
    description: "Track a new thing under an area. Use repeat_every_days for recurring upkeep (e.g. 180 for a dentist cleaning); due_date is then the next time it's due.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        area: { type: "string", description: "Area name. Omit to leave it unsorted." },
        due_date: { type: "string", description: "YYYY-MM-DD" },
        repeat_every_days: { type: "integer", minimum: 1, description: "7 weekly, 30 monthly, 90 quarterly, 365 yearly." },
        notes: { type: "string" },
      },
      required: ["title"],
    },
    run: async (ctx, a) => {
      const title = String(a.title || "").trim();
      if (!title) throw new ToolError("title is required.");
      if (a.due_date != null && !isISODate(a.due_date)) throw new ToolError("due_date must be YYYY-MM-DD.");
      const repeat = a.repeat_every_days == null ? null : Number(a.repeat_every_days);
      if (repeat !== null && !(Number.isInteger(repeat) && repeat > 0)) throw new ToolError("repeat_every_days must be a positive integer.");
      const areas = await loadAreas(ctx);
      const area = await findArea(ctx, areas, a.area);
      const { data, error } = await ctx.db.from("tasks_kanban").insert({
        user_id: ctx.userId, title, status: "todo", area_id: area?.id ?? null, due_date: (a.due_date as string) ?? null,
        repeat_days: repeat, notes: typeof a.notes === "string" ? a.notes : "",
      }).select().single();
      if (error) throw new Error(error.message);
      return describeItem(data as Item, areas, localToday(ctx.tz));
    },
  },
  {
    name: "update_item",
    title: "Update item",
    description: "Change an item's title, area, due date, repetition or notes. Pass null to clear due_date or repeat_every_days.",
    inputSchema: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        title: { type: "string" },
        area: { type: "string" },
        due_date: { type: ["string", "null"] },
        repeat_every_days: { type: ["integer", "null"], minimum: 1 },
        notes: { type: "string" },
      },
      required: ["item_id"],
    },
    run: async (ctx, a) => {
      const item = await getItem(ctx, a.item_id);
      const areas = await loadAreas(ctx);
      const fields: Json = {};
      if (typeof a.title === "string" && a.title.trim()) fields.title = a.title.trim();
      if (a.area !== undefined) fields.area_id = (await findArea(ctx, areas, a.area))?.id ?? null;
      if (a.due_date !== undefined) {
        if (a.due_date !== null && !isISODate(a.due_date)) throw new ToolError("due_date must be YYYY-MM-DD or null.");
        fields.due_date = a.due_date;
      }
      if (a.repeat_every_days !== undefined) {
        const r = a.repeat_every_days === null ? null : Number(a.repeat_every_days);
        if (r !== null && !(Number.isInteger(r) && r > 0)) throw new ToolError("repeat_every_days must be a positive integer or null.");
        fields.repeat_days = r;
        if (r && item.status === "done") { fields.status = "todo"; fields.completed_at = null; }
      }
      if (typeof a.notes === "string") fields.notes = a.notes;
      if (Object.keys(fields).length === 0) throw new ToolError("Nothing to update.");
      const { data, error } = await ctx.db.from("tasks_kanban").update(fields).eq("id", item.id).eq("user_id", ctx.userId).select().single();
      if (error) throw new Error(error.message);
      return describeItem(data as Item, areas, localToday(ctx.tz));
    },
  },
  {
    name: "complete_item",
    title: "Complete item",
    description: "Mark an item done (or undo with undone=true). A repeating item logs today as done and moves its due date forward by its interval.",
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
    description: "The task list for a day (default today), plus area items due that day.",
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
        items_due: items.filter((c) => { const s = itemState(c, today); return !s.done && s.due && (s.due === date || (date === today && s.due < date)); })
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
