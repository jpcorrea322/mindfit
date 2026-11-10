import { useState, useEffect, useRef } from "react";
import { TrendingUp, Dumbbell, Plus, BarChart3, Edit2, Trash2, SmilePlus, Lightbulb, ChevronLeft, ChevronRight, X, Check, Heart, Target, CheckSquare, Calendar, Flag, ChevronDown, ChevronUp, LogOut, Smile, Zap, Moon, Activity, Settings, Repeat, Flame, History, GripVertical } from "lucide-react";
import { supabase } from "./supabase.js";

//  Constants 
const SEED_TAGS = ["work","sleep","family","stress","exercise","diet","social","health","rest","travel","focus","anxiety","tired","motivated","productive","grateful","overwhelmed","calm","lonely","connected","sick","energy","outdoors","creative","frustrated"];

// Mood scale keeps its original colors (green high, red low) regardless of the app theme.
// Solid swatches are the original shades; text/light/border are those hues tuned to read on navy.
const MOOD_SPECTRUM = [
  { min: 8, bg: "bg-emerald-600", text: "text-emerald-400", light: "bg-emerald-100", border: "border-emerald-300", hex: "#059669", fg: "text-white" },
  { min: 6, bg: "bg-emerald-400", text: "text-emerald-300", light: "bg-emerald-50",  border: "border-emerald-200", hex: "#34d399", fg: "text-white" },
  { min: 4, bg: "bg-yellow-400",  text: "text-yellow-400",  light: "bg-yellow-100",  border: "border-yellow-300",  hex: "#facc15", fg: "text-white" },
  { min: 2, bg: "bg-orange-400",  text: "text-orange-400",  light: "bg-orange-100",  border: "border-orange-300",  hex: "#fb923c", fg: "text-white" },
  { min: 0, bg: "bg-rose-600",    text: "text-rose-400",    light: "bg-rose-100",    border: "border-rose-300",    hex: "#e11d48", fg: "text-white" },
];
const MOOD_COLORS = (score) => MOOD_SPECTRUM.find(c => score >= c.min) || MOOD_SPECTRUM[MOOD_SPECTRUM.length - 1];

const GOAL_COLORS = [
  { id: "rose",    hex: "#f43f5e", label: "Red"     },
  { id: "amber",   hex: "#fb923c", label: "Orange"  },
  { id: "yellow",  hex: "#facc15", label: "Yellow"  },
  { id: "emerald", hex: "#4ade80", label: "Green"   },
  { id: "cyan",    hex: "#22d3ee", label: "Cyan"    },
  { id: "blue",    hex: "#3b82f6", label: "Blue"    },
  { id: "violet",  hex: "#a855f7", label: "Violet"  },
  { id: "fuchsia", hex: "#ec4899", label: "Pink"    },
  { id: "slate",   hex: "#7c8bb3", label: "Slate"   },
];

const KANBAN_STATUSES = ["todo", "inprogress", "done"];
const KANBAN_LABELS   = { todo: "To Do", inprogress: "In Progress", done: "Done" };
const KANBAN_COLORS   = { todo: "bg-gray-100 text-gray-700", inprogress: "bg-blue-100 text-blue-700", done: "bg-emerald-100 text-emerald-700" };

// Local-time ISO date (YYYY-MM-DD) so dates don't switch before midnight
const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const todayISO = () => toISO(new Date());
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate()+1); return toISO(d); };
const addDaysISO = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate()+n); return toISO(d); };
const isoToLong = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const daysAgoLabel = (d) => {
  if (!(d instanceof Date) || isNaN(d)) return "—";
  const diff = Math.round((new Date(todayISO() + "T00:00:00") - new Date(toISO(d) + "T00:00:00")) / 86400000);
  return diff <= 0 ? "Today" : diff === 1 ? "Yesterday" : `${diff} days ago`;
};

// Habit check-offs are stored in tasks_daily next to that day's tasks, as items flagged with habitId.
const tasksOn      = (dailyTasks, iso) => (dailyTasks[iso]?.tasks || []).filter(t => !t.habitId);
const habitsDoneOn = (dailyTasks, iso) => new Set((dailyTasks[iso]?.tasks || []).filter(t => t.habitId).map(t => t.habitId));
const habitStreak  = (dailyTasks, habitId, fromISO) => {
  let d = habitsDoneOn(dailyTasks, fromISO).has(habitId) ? fromISO : addDaysISO(fromISO, -1);
  let streak = 0;
  while (streak < 3650 && habitsDoneOn(dailyTasks, d).has(habitId)) { streak++; d = addDaysISO(d, -1); }
  return streak;
};

const isoToLabel = (iso) => { if (!iso) return ""; const d = new Date(iso + "T00:00:00"); return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); };

// A daily task can be planned from a Kanban card or a goal milestone. It then carries
// source = { type: "kanban", cardId } or { type: "milestone", goalId, milestoneId }.
// The card or milestone stays the record of its title and completion; the daily task is that day's plan to work on it.
const goalHex = (g) => GOAL_COLORS.find(c => c.id === g?.color)?.hex || "#666";
const stampISO = (ts) => ts ? toISO(new Date(ts)) : null;
const sameSource = (a, b) => !!a && !!b && a.type === b.type
  && (a.type === "kanban" ? a.cardId === b.cardId : a.goalId === b.goalId && a.milestoneId === b.milestoneId);
// Looks a source up; null when the card or milestone has since been deleted (the task then behaves as a plain one)
const resolveSource = (source, kanbanCards, goals) => {
  if (!source) return null;
  if (source.type === "kanban") {
    const card = kanbanCards.find(c => c.id === source.cardId);
    return card ? { kind: "kanban", title: card.title, done: card.status === "done", goal: goals.find(g => g.id === card.goal_id) || null } : null;
  }
  const goal = goals.find(g => g.id === source.goalId);
  const m = (goal?.milestones || []).find(x => x.id === source.milestoneId);
  return m ? { kind: "milestone", title: m.text, done: !!m.done, goal } : null;
};
const isPlannedOn = (dailyTasks, iso, source) => tasksOn(dailyTasks, iso).some(t => sameSource(t.source, source));

function GoalChip({ goal, label }) {
  if (!goal && !label) return null;
  return (
    <span className="inline-flex items-center gap-1 max-w-[11rem] text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 align-middle">
      {goal && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: goalHex(goal) }}/>}
      <span className="truncate">{label || goal.title}</span>
    </span>
  );
}

// Adds or removes a card/milestone from today's daily list
function PlanTodayButton({ planned, onClick, className = "" }) {
  return (
    <button onClick={onClick} title={planned ? "Remove from today's tasks" : "Add to today's tasks"}
      className={`text-xs font-medium rounded border touch-manipulation flex items-center justify-center gap-1 ${planned ? "bg-cyan-50 border-cyan-200 text-cyan-700" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-100"} ${className}`}>
      {planned ? <Check size={12}/> : <Plus size={12}/>} Today
    </button>
  );
}

//  Auth Screen 
function AuthScreen() {
  const [mode, setMode]       = useState("login");
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [message, setMessage] = useState("");

  const handle = async () => {
    setLoading(true); setError(""); setMessage("");
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else setMessage("Check your email to confirm your account, then log in.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-app flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 w-full max-w-sm relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1 bg-rainbow"/>
        <div className="flex items-center gap-2 mb-6 justify-center">
          <Dumbbell className="text-cyan-400" size={28} />
          <span className="font-bold text-2xl text-rainbow">MindFit</span>
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-6">
          {["login","signup"].map(m => (
            <button key={m} onClick={() => { setMode(m); setError(""); setMessage(""); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode===m?"bg-white shadow text-slate-900":"text-slate-500 hover:text-slate-700"}`}>
              {m === "login" ? "Log In" : "Sign Up"}
            </button>
          ))}
        </div>
        {error   && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
        {message && <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">{message}</div>}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
              placeholder="you@example.com" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handle()}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
              placeholder="" />
          </div>
          <button onClick={handle} disabled={loading || !email || !password}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? "Please wait" : mode === "login" ? "Log In" : "Create Account"}
          </button>
        </div>
      </div>
    </div>
  );
}

//  Main App 
export default function App() {
  const [session, setSession]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState("tasks");
  const [isMobile, setIsMobile] = useState(false);

  // Shared task state
  const [dailyTasks, setDailyTasks] = useState({});
  const [kanbanCards, setKanbanCards] = useState([]);
  const [goals, setGoals] = useState([]);
  const [habits, setHabits] = useState([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!session) return;
    loadDailyTasks();
    loadKanban();
    loadGoals();
    loadHabits();
  }, [session]);

  const uid = () => session?.user?.id;

  //  Daily Tasks 
  const loadDailyTasks = async () => {
    const { data } = await supabase.from("tasks_daily").select("date,tasks").eq("user_id", uid());
    if (!data) return;
    const map = {};
    data.forEach(row => { map[row.date] = { tasks: row.tasks || [] }; });
    setDailyTasks(map);
    const migrated = await migrateLegacyHabits(map);
    if (migrated) setDailyTasks(migrated);
  };

  // Habits used to be checked off inside mood check-ins (mood_entries.completed_habits).
  // Move any of those into tasks_daily, then clear them so they aren't copied again.
  const migrateLegacyHabits = async (map) => {
    const { data } = await supabase.from("mood_entries").select("id,date,completed_habits").eq("user_id", uid());
    const legacy = (data || []).filter(e => (e.completed_habits || []).length > 0);
    if (legacy.length === 0) return null;
    const next = { ...map };
    legacy.forEach(e => {
      const items = next[e.date]?.tasks || [];
      const have = habitsDoneOn(next, e.date);
      const added = e.completed_habits.filter(h => !have.has(h)).map(h => ({ id: `habit-${h}`, habitId: h, status: "complete" }));
      next[e.date] = { tasks: [...items, ...added] };
    });
    const dates = [...new Set(legacy.map(e => e.date))];
    const { error } = await supabase.from("tasks_daily").upsert(
      dates.map(date => ({ user_id: uid(), date, tasks: next[date].tasks, updated_at: new Date().toISOString() })),
      { onConflict: "user_id,date" }
    );
    if (error) return null;
    await supabase.from("mood_entries").update({ completed_habits: [] }).in("id", legacy.map(e => e.id)).eq("user_id", uid());
    return next;
  };

  // Only the days that changed are written
  const saveDailyTasks = async (next) => {
    const upserts = Object.entries(next).filter(([date, day]) => day !== dailyTasks[date]).map(([date, { tasks }]) => ({
      user_id: uid(), date, tasks, updated_at: new Date().toISOString()
    }));
    setDailyTasks(next);
    if (upserts.length > 0) {
      await supabase.from("tasks_daily").upsert(upserts, { onConflict: "user_id,date" });
    }
  };

  //  Kanban 
  const loadKanban = async () => {
    const { data } = await supabase.from("tasks_kanban").select("*").eq("user_id", uid()).order("created_at");
    if (data) setKanbanCards(data);
  };

  const saveKanban = async (next) => {
    setKanbanCards(next);
  };

  const addKanbanCard = async (card) => {
    const { data } = await supabase.from("tasks_kanban").insert({ ...card, user_id: uid() }).select().single();
    if (data) setKanbanCards(prev => [...prev, data]);
  };

  const updateKanbanCard = async (id, updates) => {
    await supabase.from("tasks_kanban").update(updates).eq("id", id).eq("user_id", uid());
    setKanbanCards(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const deleteKanbanCard = async (id) => {
    await supabase.from("tasks_kanban").delete().eq("id", id).eq("user_id", uid());
    setKanbanCards(prev => prev.filter(c => c.id !== id));
  };

  //  Goals 
  const loadGoals = async () => {
    const { data } = await supabase.from("tasks_goals").select("*").eq("user_id", uid()).order("created_at");
    if (data) setGoals(data);
  };

  const saveGoals = async (next) => {
    setGoals(next);
  };

  const addGoal = async (goal) => {
    const { data } = await supabase.from("tasks_goals").insert({ ...goal, user_id: uid() }).select().single();
    if (data) setGoals(prev => [...prev, data]);
  };

  const updateGoal = async (id, updates) => {
    setGoals(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
    await supabase.from("tasks_goals").update(updates).eq("id", id).eq("user_id", uid());
  };

  const deleteGoal = async (id) => {
    // Older Kanban cards may still reference the goal through a foreign key
    await supabase.from("tasks_kanban").update({ goal_id: null }).eq("goal_id", id).eq("user_id", uid());
    setKanbanCards(prev => prev.map(c => c.goal_id === id ? { ...c, goal_id: null } : c));
    await supabase.from("tasks_goals").delete().eq("id", id).eq("user_id", uid());
    setGoals(prev => prev.filter(g => g.id !== id));
  };

  //  Links between Daily, Kanban and Goals 
  // Completes or reopens a card/milestone and keeps the daily list in step with it.
  // `at` is the daily task being checked ({ date, taskId, status }); today's other tasks planned from the same source follow along.
  const setSourceDone = async (source, done, at) => {
    const next = { ...dailyTasks };
    const patch = (date, fn) => {
      const items = next[date]?.tasks;
      if (!items) return;
      const mapped = items.map(fn);
      if (mapped.some((t, i) => t !== items[i])) next[date] = { tasks: mapped };
    };
    if (at) patch(at.date, t => t.id === at.taskId ? { ...t, status: at.status } : t);
    patch(todayISO(), t => sameSource(t.source, source) && t.status === (done ? "pending" : "complete") ? { ...t, status: done ? "complete" : "pending" } : t);
    saveDailyTasks(next);

    if (source.type === "kanban") {
      const card = kanbanCards.find(c => c.id === source.cardId);
      if (card && (card.status === "done") !== done)
        await updateKanbanCard(card.id, { status: done ? "done" : "inprogress", completed_at: done ? new Date().toISOString() : null });
    } else {
      const goal = goals.find(g => g.id === source.goalId);
      const m = (goal?.milestones || []).find(x => x.id === source.milestoneId);
      if (m && !!m.done !== done)
        await updateGoal(goal.id, { milestones: goal.milestones.map(x => x.id === m.id ? { ...x, done, done_at: done ? new Date().toISOString() : null } : x) });
    }
  };

  const moveKanbanCard = (card, status) => (status === "done") !== (card.status === "done")
    ? setSourceDone({ type: "kanban", cardId: card.id }, status === "done")
    : updateKanbanCard(card.id, { status });

  const renameSource = (source, text) => {
    if (source.type === "kanban") return updateKanbanCard(source.cardId, { title: text });
    const goal = goals.find(g => g.id === source.goalId);
    if (goal) return updateGoal(goal.id, { milestones: (goal.milestones || []).map(x => x.id === source.milestoneId ? { ...x, text } : x) });
  };

  // Puts a card or milestone on a day's task list (kept ahead of the habit check-offs stored after the tasks)
  const planSource = (source, text, date = todayISO()) => {
    const items = dailyTasks[date]?.tasks || [];
    if (items.some(t => sameSource(t.source, source))) return;
    saveDailyTasks({ ...dailyTasks, [date]: { tasks: [...items.filter(t => !t.habitId), { id: Date.now(), text, status: "pending", source }, ...items.filter(t => t.habitId)] } });
  };

  const unplanSource = (source, date = todayISO()) => {
    const items = dailyTasks[date]?.tasks || [];
    saveDailyTasks({ ...dailyTasks, [date]: { tasks: items.filter(t => !sameSource(t.source, source)) } });
  };
  const links = { setSourceDone, moveKanbanCard, renameSource, planSource, unplanSource };

  //  Habits 
  const loadHabits = async () => {
    const { data } = await supabase.from("habit_definitions").select("*").eq("user_id", uid()).order("created_at");
    if (data) setHabits(data);
  };

  const addHabit = async (name) => {
    const { data } = await supabase.from("habit_definitions").insert({ user_id: uid(), name }).select().single();
    if (data) setHabits(prev => [...prev, data]);
  };

  const deleteHabit = async (id) => {
    await supabase.from("habit_definitions").delete().eq("id", id).eq("user_id", uid());
    setHabits(prev => prev.filter(h => h.id !== id));
  };

  const signOut = () => supabase.auth.signOut();

  const changeTab = (id) => {
    if (id !== tab) window.scrollTo(0, 0);
    setTab(id);
  };

  if (loading) return (
    <div className="min-h-screen bg-app flex items-center justify-center">
      <div className="text-slate-400 text-sm">Loading</div>
    </div>
  );

  if (!session) return <AuthScreen />;

  const TABS = [
    { id: "tasks",    label: "Tasks",    icon: Target,    accent: "text-cyan-400",   bar: "border-cyan-400"   },
    { id: "workouts", label: "Workouts", icon: Dumbbell,  accent: "text-orange-400", bar: "border-orange-400" },
    { id: "mood",     label: "Mood",     icon: Heart,     accent: "text-pink-400",   bar: "border-pink-400"   },
    { id: "insights", label: "Insights", icon: BarChart3, accent: "text-violet-400", bar: "border-violet-400" },
  ];

  return (
    <div className="min-h-screen bg-app">
      <header className="bg-navy-950/85 backdrop-blur border-b border-slate-100 sticky top-0 z-40 pt-safe">
        <div className={`max-w-4xl mx-auto px-4 ${isMobile ? "py-2.5" : "py-3"} flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <Dumbbell className={TABS.find(t => t.id === tab)?.accent} size={isMobile ? 22 : 28} />
            {isMobile
              ? <span className="font-bold text-lg text-slate-900">{TABS.find(t => t.id === tab)?.label}</span>
              : <span className="font-bold text-xl text-rainbow">MindFit</span>}
          </div>
          <button onClick={signOut} className={`flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors ${isMobile ? "p-2.5" : "px-2 py-1.5"}`} aria-label="Sign out">
            <LogOut size={isMobile ? 18 : 14} />{!isMobile && " Sign out"}
          </button>
        </div>
        {!isMobile && (
          <div className="max-w-4xl mx-auto px-4">
            <div className="flex">
              {TABS.map(({ id, label, icon: Icon, accent, bar }) => (
                <button key={id} onClick={() => changeTab(id)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab===id?`${bar} ${accent}`:"border-transparent text-slate-500 hover:text-slate-700"}`}>
                  <Icon size={15} />{label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="h-0.5 bg-rainbow opacity-80"/>
      </header>
      {isMobile && (
        <nav className="fixed bottom-0 inset-x-0 z-40 bg-navy-950/90 backdrop-blur border-t border-slate-100 pb-safe">
          <div className="h-0.5 bg-rainbow opacity-60"/>
          <div className="flex">
            {TABS.map(({ id, label, icon: Icon, accent }) => (
              <button key={id} onClick={() => changeTab(id)}
                className={`flex-1 flex flex-col items-center gap-0.5 pt-2 pb-1.5 min-h-[56px] touch-manipulation ${tab===id ? accent : "text-slate-400"}`}>
                <Icon size={22} strokeWidth={tab===id ? 2.4 : 2} />
                <span className="text-[11px] font-medium">{label}</span>
              </button>
            ))}
          </div>
        </nav>
      )}
      <main className={`max-w-4xl mx-auto px-4 ${isMobile ? "pt-4 pb-nav" : "py-6"}`}>
        {tab === "tasks"    && (
          <TasksTab
            isMobile={isMobile}
            dailyTasks={dailyTasks} saveDailyTasks={saveDailyTasks}
            kanbanCards={kanbanCards}
            addKanbanCard={addKanbanCard} updateKanbanCard={updateKanbanCard} deleteKanbanCard={deleteKanbanCard}
            goals={goals}
            addGoal={addGoal} updateGoal={updateGoal} deleteGoal={deleteGoal}
            habits={habits} addHabit={addHabit} deleteHabit={deleteHabit}
            links={links}
          />
        )}
        {tab === "workouts" && <WorkoutsTab session={session} isMobile={isMobile} />}
        {tab === "mood"     && <MoodTab session={session} isMobile={isMobile} dailyTasks={dailyTasks} habits={habits} kanbanCards={kanbanCards} goals={goals} />}
        {tab === "insights" && <InsightsTab session={session} isMobile={isMobile} dailyTasks={dailyTasks} kanbanCards={kanbanCards} goals={goals} habits={habits}/>}
      </main>
    </div>
  );
}

//
// SHARED UI
//
function Sheet({ title, onClose, closeOnBackdrop = true, children }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prevOverflow; window.removeEventListener("keydown", onKey); };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-slate-900/40 md:p-4" onClick={() => closeOnBackdrop && onClose()}>
      <div className="bg-white w-full md:max-w-lg max-h-[92vh] max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-2xl md:rounded-2xl shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-white flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100" aria-label="Close"><X size={20}/></button>
        </div>
        <div className="p-5 pb-safe"><div className="pb-5">{children}</div></div>
      </div>
    </div>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
      {options.map(({ id, label, icon: Icon }) => (
        <button key={id} onClick={() => onChange(id)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${value===id?"bg-white shadow text-slate-900":"text-slate-500 hover:text-slate-700"}`}>
          {Icon && <Icon size={15}/>}{label}
        </button>
      ))}
    </div>
  );
}

const isValidDate = (d) => d instanceof Date && !isNaN(d);

// Splits an already-sorted list into consecutive month buckets for history views.
const groupByMonth = (items, getDate) => {
  const groups = [];
  items.forEach(item => {
    const d = getDate(item);
    const key = isValidDate(d) ? `${d.getFullYear()}-${d.getMonth()}` : "unknown";
    let g = groups[groups.length-1];
    if (!g || g.key !== key) {
      g = { key, label: isValidDate(d) ? d.toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "Undated", items: [] };
      groups.push(g);
    }
    g.items.push(item);
  });
  return groups;
};

//
// WORKOUTS TAB
//
const WORKOUT_TYPES = ["Push","Pull","Legs","Run","Other"];
const WORKOUT_TYPE_STYLES = {
  Push:  "bg-blue-100 text-blue-700",
  Pull:  "bg-violet-100 text-violet-700",
  Legs:  "bg-amber-100 text-amber-700",
  Run:   "bg-emerald-100 text-emerald-700",
  Other: "bg-slate-100 text-slate-600",
};
const workoutTypeStyle = (type) => WORKOUT_TYPE_STYLES[type] || WORKOUT_TYPE_STYLES.Other;

const parseWorkoutDate = (s) => {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + "T00:00:00");
  const p = s.split("/");
  if (p.length === 2) { const m = parseInt(p[0])-1; const d = parseInt(p[1]); return new Date(m > new Date().getMonth() ? 2024 : 2025, m, d); }
  return new Date(s);
};
const formatDate = (d) => isValidDate(d) ? `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}` : "";

const parseWeights = (weight) => {
  if (!weight && weight !== 0) return [""];
  return String(weight).split(",").map(v => v.trim());
};
const maxWeight = (weight) => {
  const vals = parseWeights(weight).map(Number).filter(v => v > 0);
  return vals.length ? Math.max(...vals) : 0;
};
const formatWeightDisplay = (weight) => {
  if (!weight) return "";
  const vals = parseWeights(weight).filter(Boolean);
  if (!vals.length) return "";
  return ` @ ${vals.join("/")}lbs`;
};

const normEx = (name) => {
  let n = (name || "").trim().toLowerCase();
  // Normalize plurals: "Squats" → "squat", but "Press" stays "press" (ends in ss)
  if (n.endsWith("s") && !n.endsWith("ss")) n = n.slice(0, -1);
  return n;
};
const dedupeExercises = (names) => {
  const seen = new Set();
  return names.filter(Boolean).filter(n => { const k = normEx(n); if (seen.has(k)) return false; seen.add(k); return true; });
};

const getProgressionData = (workouts, exerciseName, timeScale) => {
  const normTarget = normEx(exerciseName);
  const cutoff = new Date();
  if (timeScale === "month") cutoff.setMonth(cutoff.getMonth()-1);
  if (timeScale === "year")  cutoff.setFullYear(cutoff.getFullYear()-1);
  return workouts.filter(w => w.exercises.some(e => normEx(e.name) === normTarget))
    .map(w => ({ date: w.date, weight: maxWeight(w.exercises.find(e => normEx(e.name) === normTarget)?.weight), dateObj: parseWorkoutDate(w.date) }))
    .filter(i => i.weight > 0 && isValidDate(i.dateObj) && (timeScale === "all" || i.dateObj >= cutoff))
    .sort((a,b) => a.dateObj - b.dateObj)
    .map((i, idx) => ({ ...i, sessionNumber: idx+1 }));
};

function WorkoutsTab({ session, isMobile }) {
  const [workouts, setWorkouts]           = useState([]);
  const [formWorkout, setFormWorkout]     = useState(null); // null = closed, no id = new (maybe prefilled), id = editing
  const [view, setView]                   = useState("history");
  const [typeFilter, setTypeFilter]       = useState("All");
  const [visibleCount, setVisibleCount]   = useState(15);
  const [expandedId, setExpandedId]       = useState(null);
  const [selectedExercise, setSelectedExercise] = useState("");
  const [timeScale, setTimeScale]         = useState("all");

  const uid = session?.user?.id;

  useEffect(() => { loadWorkouts(); }, []);

  const loadWorkouts = async () => {
    const { data } = await supabase.from("workouts").select("*").eq("user_id", uid).order("date", { ascending: false });
    if (data) setWorkouts(data);
  };

  const saveWorkout = async (workout) => {
    if (workout.id && typeof workout.id === "string" && workout.id.includes("-")) {
      await supabase.from("workouts").update({ date: workout.date, type: workout.type, exercises: workout.exercises }).eq("id", workout.id).eq("user_id", uid);
      setWorkouts(prev => prev.map(w => w.id === workout.id ? workout : w));
    } else {
      const { data } = await supabase.from("workouts").insert({ user_id: uid, date: workout.date, type: workout.type, exercises: workout.exercises }).select().single();
      if (data) setWorkouts(prev => [data, ...prev]);
    }
  };

  const deleteWorkout = async (id) => {
    await supabase.from("workouts").delete().eq("id", id).eq("user_id", uid);
    setWorkouts(prev => prev.filter(w => w.id !== id));
  };

  const sorted = [...workouts].sort((a,b) => (parseWorkoutDate(b.date) || 0) - (parseWorkoutDate(a.date) || 0));

  // Summary
  const now = new Date();
  const startOfWeek  = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisWeek  = sorted.filter(w => parseWorkoutDate(w.date) >= startOfWeek).length;
  const thisMonth = sorted.filter(w => parseWorkoutDate(w.date) >= startOfMonth).length;
  const lastWorkout = sorted[0] ? daysAgoLabel(parseWorkoutDate(sorted[0].date)) : "—";

  // History
  const types = [...new Set(sorted.map(w => w.type).filter(Boolean))];
  const filteredWorkouts = typeFilter === "All" ? sorted : sorted.filter(w => w.type === typeFilter);
  const historyGroups = groupByMonth(filteredWorkouts.slice(0, visibleCount), w => parseWorkoutDate(w.date));

  // Progress
  const exercisesByType = {};
  types.forEach(t => { exercisesByType[t] = dedupeExercises(sorted.filter(w => w.type===t).flatMap(w => w.exercises.map(e => e.name))); });
  const records = dedupeExercises(sorted.flatMap(w => w.exercises.map(e => e.name)))
    .map(name => {
      const prog = getProgressionData(workouts, name, "all");
      return { name, sessions: prog.length, best: prog.length ? Math.max(...prog.map(p => p.weight)) : 0, last: prog[prog.length-1]?.weight || 0 };
    })
    .filter(r => r.sessions > 0)
    .sort((a,b) => b.sessions - a.sessions);
  const activeExercise = selectedExercise || records[0]?.name || "";

  const openNew = () => setFormWorkout({});

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[{label:"This week",value:thisWeek},{label:"This month",value:thisMonth},{label:"Last workout",value:lastWorkout}].map(({label,value}) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-3 text-center">
            <div className={`font-bold text-slate-800 ${typeof value === "number" ? "text-2xl" : "text-sm py-1.5"}`}>{value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <button onClick={openNew} className="w-full py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2 font-semibold shadow-sm">
        <Plus size={20} /> Log Workout
      </button>

      <Segmented value={view} onChange={setView}
        options={[{id:"history",label:"History",icon:History},{id:"progress",label:"Progress",icon:TrendingUp},{id:"program",label:"Program",icon:Calendar}]}/>

      {view === "program" && <PPLProgram session={session} workouts={sorted} onLogSession={setFormWorkout} onUnlog={deleteWorkout}/>}

      {view === "history" && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          {types.length > 1 && (
            <div className="flex gap-1.5 flex-wrap mb-4">
              {["All", ...types].map(t => (
                <button key={t} onClick={() => { setTypeFilter(t); setVisibleCount(15); }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${typeFilter===t ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {t}
                </button>
              ))}
            </div>
          )}
          {filteredWorkouts.length === 0 ? (
            <div className="text-center py-8">
              <Dumbbell size={32} className="text-slate-300 mx-auto mb-3"/>
              <p className="text-slate-400 text-sm">No workouts logged yet.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {historyGroups.map(group => (
                <div key={group.key}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">{group.label}</p>
                  <div className="space-y-2">
                    {group.items.map(w => {
                      const d = parseWorkoutDate(w.date);
                      const open = expandedId === w.id;
                      return (
                        <div key={w.id} className="border border-slate-100 rounded-lg overflow-hidden">
                          <button onClick={() => setExpandedId(open ? null : w.id)} className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 touch-manipulation">
                            <div className="w-10 flex-shrink-0 text-center">
                              <div className="text-[10px] font-semibold uppercase text-slate-400">{isValidDate(d) ? d.toLocaleDateString("en-US",{weekday:"short"}) : ""}</div>
                              <div className="text-lg font-bold text-slate-800 leading-tight">{isValidDate(d) ? d.getDate() : "?"}</div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${workoutTypeStyle(w.type)}`}>{w.type}</span>
                                <span className="text-xs text-slate-400">{w.exercises.length} exercise{w.exercises.length===1?"":"s"}</span>
                              </div>
                              <p className="text-sm text-slate-600 truncate mt-1">{w.exercises.map(e => e.name).join(" · ")}</p>
                            </div>
                            {open ? <ChevronUp size={16} className="text-slate-400 flex-shrink-0"/> : <ChevronDown size={16} className="text-slate-400 flex-shrink-0"/>}
                          </button>
                          {open && (
                            <div className="px-3 pb-3 pt-3 border-t border-slate-100 bg-slate-50">
                              <div className="space-y-2">
                                {w.exercises.map((ex,i) => (
                                  <div key={i}>
                                    <div className="flex items-baseline justify-between gap-3 text-sm">
                                      <span className="font-medium text-slate-700">{ex.name}</span>
                                      <span className="text-blue-600 text-xs whitespace-nowrap">{ex.sets}×{ex.reps}{formatWeightDisplay(ex.weight)}</span>
                                    </div>
                                    {ex.notes && <p className="text-xs text-slate-400">{ex.notes}</p>}
                                  </div>
                                ))}
                              </div>
                              <div className="flex justify-end mt-3">
                                <button onClick={() => setFormWorkout(w)} className="text-xs px-3 py-1.5 bg-white border border-slate-200 text-blue-600 rounded-lg hover:bg-blue-50 flex items-center gap-1 font-medium"><Edit2 size={12}/>Edit</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {filteredWorkouts.length > visibleCount && (
                <button onClick={() => setVisibleCount(c => c + 15)} className="w-full py-2 text-sm font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-lg">
                  Show older workouts ({filteredWorkouts.length - visibleCount} more)
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {view === "progress" && (
        records.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <TrendingUp size={32} className="text-slate-300 mx-auto mb-3"/>
            <p className="text-slate-400 text-sm">Log workouts with weights to see your progress.</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
              <div className="flex gap-2 flex-wrap items-center">
                <select value={activeExercise} onChange={e => setSelectedExercise(e.target.value)} className="flex-1 min-w-[160px] px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
                  {types.map(t => {
                    const options = exercisesByType[t].filter(name => records.some(r => r.name === name));
                    return options.length > 0 && (
                      <optgroup key={t} label={t}>
                        {options.map(name => <option key={name} value={name}>{name}</option>)}
                      </optgroup>
                    );
                  })}
                </select>
                <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                  {["month","year","all"].map(s => <button key={s} onClick={()=>setTimeScale(s)} className={`px-3 py-1 rounded text-xs font-medium transition ${timeScale===s?"bg-emerald-600 text-white":"text-slate-600 hover:bg-slate-200"}`}>{s.charAt(0).toUpperCase()+s.slice(1)}</button>)}
                </div>
              </div>
              <ExerciseChart exercise={activeExercise} prog={getProgressionData(workouts, activeExercise, timeScale)}/>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <h2 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><Flame size={16} className="text-amber-500"/> Personal Bests</h2>
              <div className="divide-y divide-slate-100">
                <div className="flex text-[11px] font-semibold uppercase tracking-wide text-slate-400 pb-2">
                  <span className="flex-1">Exercise</span><span className="w-16 text-right">Best</span><span className="w-16 text-right">Last</span><span className="w-12 text-right">Logs</span>
                </div>
                {records.map(r => (
                  <button key={r.name} onClick={() => setSelectedExercise(r.name)}
                    className={`w-full flex items-center text-sm py-2 text-left rounded ${r.name===activeExercise?"text-blue-700 font-semibold":"text-slate-700 hover:bg-slate-50"}`}>
                    <span className="flex-1 truncate pr-2">{r.name}</span>
                    <span className="w-16 text-right">{r.best}lbs</span>
                    <span className="w-16 text-right text-slate-500">{r.last}lbs</span>
                    <span className="w-12 text-right text-slate-400">{r.sessions}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )
      )}

      {formWorkout && (
        <WorkoutForm workout={formWorkout} isMobile={isMobile}
          onSave={async (w) => { await saveWorkout(w); setFormWorkout(null); }}
          onDelete={async (id) => { await deleteWorkout(id); setFormWorkout(null); }}
          onClose={() => setFormWorkout(null)}/>
      )}
    </div>
  );
}

//
// PPL PROGRAM (12-week weekly undulating periodization)
//
const PPL_DAYS = [
  {
    id: "push", name: "Push", weekday: "Mon", dayOffset: 0, coreKey: "bench", isLower: false,
    core: { name: "Barbell Bench Press", cue: "Control 3s descent, explosive press, retract scapula", rest: "3–4 min" },
    secondary: [
      { name: "Incline DB Press", cue: "Full stretch at bottom, squeeze at top", rest: "90s–2 min" },
      { name: "Seated DB Shoulder Press", cue: "Neutral grip, controlled, full ROM", rest: "90s" },
    ],
    ancillary: [
      { name: "Cable Lateral Raise", cue: "Slight lean, lead with elbow, no momentum", rest: "60s" },
      { name: "Triceps Rope Pushdown", cue: "Full extension at bottom, squeeze", rest: "60s" },
      { name: "Overhead Triceps Extension", cue: "Elbows tight, deep stretch overhead", rest: "60s" },
    ],
  },
  {
    id: "pull", name: "Pull", weekday: "Wed", dayOffset: 2, coreKey: "dead", isLower: true,
    core: { name: "Conventional Deadlift", cue: "Brace hard, push floor away, hips and shoulders rise together", rest: "3–5 min" },
    secondary: [
      { name: "Weighted Pull-Up (or Lat Pulldown)", cue: "Full hang, chin over bar, control descent", rest: "2 min" },
      { name: "Seated Cable Row", cue: "Chest proud, drive elbows back, don't round", rest: "90s" },
    ],
    ancillary: [
      { name: "Face Pull", cue: "High cable, external rotation at end range", rest: "60s" },
      { name: "DB Hammer Curl", cue: "Neutral grip, full extension, no swing", rest: "60s" },
      { name: "Incline DB Curl", cue: "Supinated, deep stretch at bottom", rest: "60s" },
    ],
  },
  {
    id: "legs", name: "Legs", weekday: "Fri", dayOffset: 4, coreKey: "squat", isLower: true,
    core: { name: "Back Squat", cue: "Brace, break parallel, drive knees out, vertical torso", rest: "3–4 min" },
    secondary: [
      { name: "Romanian Deadlift", cue: "Hinge deep, soft knee, neutral spine, feel the hamstring", rest: "2 min" },
      { name: "Leg Press", cue: "Full depth, feet shoulder-width, don't lock knees", rest: "90s" },
    ],
    ancillary: [
      { name: "Leg Curl (Lying or Seated)", cue: "Full ROM, hold contraction 1s at top", rest: "60s" },
      { name: "Walking Lunge", cue: "Upright torso, knee tracks toe, controlled step", rest: "90s" },
      { name: "Standing Calf Raise", cue: "Full ROM, 2s hold at top, slow eccentric", rest: "60s" },
    ],
  },
];

// The 4-week cycle repeats each month; loads rise each month
const PPL_PHASES = [
  { id: "vol",  label: "Volume",      rpe: "RPE 6–7", core: "3–4 × 10–12", sec: "3 × 12–15",   anc: "3 × 15–20", pct: 0.65, style: "bg-sky-50 border-sky-200 text-sky-700",       bar: "bg-sky-500",
    desc: "High-rep accumulation. Build work capacity and connective tissue. Leave 3+ reps in the tank on every set." },
  { id: "hype", label: "Hypertrophy", rpe: "RPE 7–8", core: "4 × 8–10",    sec: "3–4 × 10–12", anc: "3 × 12–15", pct: 0.74, style: "bg-amber-50 border-amber-200 text-amber-700", bar: "bg-amber-500",
    desc: "Prime hypertrophy zone. Moderate load, controlled tempo, maximize time under tension. Last set AMRAP." },
  { id: "str",  label: "Strength",    rpe: "RPE 8–9", core: "4–5 × 4–6",   sec: "3 × 8–10",    anc: "3 × 10–12", pct: 0.82, style: "bg-rose-50 border-rose-200 text-rose-700",     bar: "bg-rose-500",
    desc: "Heavy and focused. Neural drive and motor unit recruitment, converting muscle mass to maximal strength." },
  { id: "dl",   label: "Deload",      rpe: "RPE 4–5", core: "3 × 5",       sec: "2 × 8",       anc: "2 × 10",    pct: 0.50, style: "bg-slate-50 border-slate-200 text-slate-600",  bar: "bg-slate-400",
    desc: "Recovery week. Cut volume by 50%, keep some weight on the bar. Connective tissue repair, CNS reset, technique work." },
];
const PPL_WEEKS = 12;
const PPL_DEFAULT_RMS = { bench: 225, dead: 315, squat: 275 };
const PPL_RM_LABELS = { bench: "Bench Press", dead: "Deadlift", squat: "Back Squat" };

const PPL_TIPS = [
  ["Weekly undulation", "Don't chase PRs every week. Volume week is intentionally easy, hypertrophy week is your bread and butter, strength week is where you test. Each phase primes the next."],
  ["Deadlift goes first", "Deadlifts are the heaviest lift, so they open Pull day before pull-ups or rows. Reset fully between sets: 3–5 minutes."],
  ["Tempo", "On volume and hypertrophy weeks: 3s down, 1s pause, explosive up on core lifts. Secondaries: 2s down, controlled up."],
  ["Deload rules", "Week 4 of every month: halve the sets, keep some weight on the bar. Don't skip it to stay on a roll; that's how you stall in month 2."],
  ["When to add weight", "The monthly +5 lb (bench) / +10 lb (deadlift, squat) assumes you hit your reps at RPE ≤ 8. If strength week felt like a 9+, hold the load next month."],
  ["Lower back", "Deadlift (Pull) and RDL (Legs) sit on different days with rest between. If back fatigue builds, swap week-3 RDLs for leg press and leg curl."],
  ["Rest by tier", "Core: 3–5 min. Secondary: 90s–2 min. Ancillary: 45–75s; short rest there is intentional."],
  ["Track the right things", "Log weight, reps and RPE for core and secondary sets; weight is enough for ancillary. Strength-week numbers rising month to month means it's working."],
];

const r5 = (n) => Math.round(n / 5) * 5;
const pplCoreLoad = (rms, day, weekIdx) => {
  const month = Math.floor(weekIdx / 4);
  const inc = month * (day.isLower ? 10 : 5);
  return r5(((Number(rms[day.coreKey]) || 0) + inc) * PPL_PHASES[weekIdx % 4].pct);
};
// "3–4 × 10–12" → { sets: "4", reps: "10-12" }
const parseScheme = (scheme) => {
  const [setsPart, repsPart] = scheme.split("×").map(s => s.trim());
  return { sets: setsPart.split("–").pop(), reps: repsPart.replace("–", "-") };
};
const mondayOf = (d) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return toISO(x); };
const daysBetween = (fromISO, toISO_) => Math.round((new Date(toISO_ + "T00:00:00") - new Date(fromISO + "T00:00:00")) / 86400000);

function PPLProgram({ session, workouts, onLogSession, onUnlog }) {
  const saved = session?.user?.user_metadata?.ppl;
  const [settings, setSettings] = useState(saved || null);
  const [editing, setEditing]   = useState(!saved);
  const [draft, setDraft]       = useState(saved || { startDate: mondayOf(new Date()), rms: PPL_DEFAULT_RMS });
  const [weekOffset, setWeekOffset] = useState(0);
  const [openDay, setOpenDay]   = useState(null);
  const [confirmUnlog, setConfirmUnlog] = useState(null); // day id awaiting "remove this logged session?"
  const [guide, setGuide]       = useState(null);
  const [saving, setSaving]     = useState(false);

  const saveSettings = async () => {
    setSaving(true);
    const next = { startDate: draft.startDate, rms: Object.fromEntries(Object.keys(PPL_DEFAULT_RMS).map(k => [k, Number(draft.rms[k]) || 0])) };
    // Stored on the user's profile so it follows them across devices without a new table
    await supabase.auth.updateUser({ data: { ppl: next } });
    setSettings(next); setEditing(false); setWeekOffset(0); setSaving(false);
  };

  if (editing || !settings) return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
      <div>
        <h2 className="font-bold text-slate-800 text-lg">PPL Hypertrophy Program</h2>
        <p className="text-sm text-slate-500 mt-1">12 weeks of Push (Mon) · Pull (Wed) · Legs (Fri). Each month cycles Volume → Hypertrophy → Strength → Deload, and core-lift loads rise every month.</p>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Start date (week 1, Monday)</label>
        <input type="date" value={draft.startDate} onChange={e => setDraft(d => ({ ...d, startDate: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"/>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {Object.keys(PPL_DEFAULT_RMS).map(k => (
          <div key={k}>
            <label className="block text-xs font-medium text-slate-600 mb-1">{PPL_RM_LABELS[k]} 1RM</label>
            <input type="number" inputMode="numeric" value={draft.rms[k]} onChange={e => setDraft(d => ({ ...d, rms: { ...d.rms, [k]: e.target.value } }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"/>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={saveSettings} disabled={!draft.startDate || saving} className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-sm disabled:opacity-50">{settings ? "Save" : "Start Program"}</button>
        {settings && <button onClick={() => { setDraft(settings); setEditing(false); }} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm hover:bg-slate-200">Cancel</button>}
      </div>
    </div>
  );

  const today = todayISO();
  const currentWeek = Math.floor(daysBetween(settings.startDate, today) / 7);
  const notStarted = currentWeek < 0, finished = currentWeek >= PPL_WEEKS;
  const baseWeek = Math.min(Math.max(currentWeek, 0), PPL_WEEKS - 1);
  const weekIdx = Math.min(Math.max(baseWeek + weekOffset, 0), PPL_WEEKS - 1);
  const phase = PPL_PHASES[weekIdx % 4];
  const month = Math.floor(weekIdx / 4) + 1;
  const weekStart = addDaysISO(settings.startDate, weekIdx * 7);
  const weekEnd = addDaysISO(weekStart, 6);

  const loggedFor = (day) => workouts.find(w => w.type === day.name && w.date >= weekStart && w.date <= weekEnd);
  const lastWeightFor = (name) => {
    const w = workouts.find(w => w.exercises.some(e => normEx(e.name) === normEx(name) && maxWeight(e.weight) > 0));
    return w ? maxWeight(w.exercises.find(e => normEx(e.name) === normEx(name)).weight) : "";
  };

  const logSession = (day) => {
    const tier = (lifts, scheme, weightOf) => lifts.map(l => ({ name: l.name, ...parseScheme(scheme), weight: String(weightOf(l) || ""), notes: "" }));
    onLogSession({
      date: today >= weekStart && today <= weekEnd ? today : addDaysISO(weekStart, day.dayOffset),
      type: day.name,
      exercises: [
        ...tier([day.core], phase.core, () => pplCoreLoad(settings.rms, day, weekIdx)).map(e => ({ ...e, notes: `W${weekIdx+1} ${phase.label} · ${phase.rpe}` })),
        ...tier(day.secondary, phase.sec, l => lastWeightFor(l.name)),
        ...tier(day.ancillary, phase.anc, l => lastWeightFor(l.name)),
      ],
    });
  };

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border p-4 ${phase.style}`}>
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => setWeekOffset(o => o - 1)} disabled={weekIdx === 0} className="p-2 rounded-lg hover:bg-white/60 disabled:opacity-30"><ChevronLeft size={18}/></button>
          <div className="text-center flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Month {month} · Week {weekIdx+1} of {PPL_WEEKS}</p>
            <p className="text-xl font-bold">{phase.label} Week</p>
            <p className="text-xs opacity-80">{phase.rpe} · {isoToLabel(weekStart)} – {isoToLabel(weekEnd)}</p>
          </div>
          <button onClick={() => setWeekOffset(o => o + 1)} disabled={weekIdx === PPL_WEEKS - 1} className="p-2 rounded-lg hover:bg-white/60 disabled:opacity-30"><ChevronRight size={18}/></button>
        </div>
        <p className="text-sm mt-2 opacity-90 text-center">{phase.desc}</p>
        <div className="flex gap-1 mt-3">
          {Array.from({ length: PPL_WEEKS }).map((_, i) => (
            <button key={i} onClick={() => setWeekOffset(i - baseWeek)} title={`Week ${i+1}`}
              className={`flex-1 h-2 rounded-full ${PPL_PHASES[i % 4].bar} ${i === weekIdx ? "ring-2 ring-offset-1 ring-slate-700" : i < currentWeek ? "opacity-90" : "opacity-30"}`}/>
          ))}
        </div>
        <div className="flex items-center justify-between mt-3 text-xs">
          <span className="opacity-80">{notStarted ? `Starts ${isoToLabel(settings.startDate)}` : finished ? "Program complete" : weekOffset !== 0 ? "" : "This week"}</span>
          <div className="flex gap-3">
            {weekOffset !== 0 && <button onClick={() => setWeekOffset(0)} className="font-semibold underline">Back to current</button>}
            <button onClick={() => { setDraft(settings); setEditing(true); }} className="font-semibold flex items-center gap-1"><Settings size={12}/> 1RMs & start</button>
          </div>
        </div>
      </div>

      {finished && weekOffset === 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-800">
          You've finished all 12 weeks. Retest your 1RMs and set a new start date to run another block.
        </div>
      )}

      {PPL_DAYS.map(day => {
        const logged = loggedFor(day);
        const open = openDay === day.id;
        const tiers = [
          { label: "Core", scheme: phase.core, lifts: [day.core], tag: "bg-amber-100 text-amber-800" },
          { label: "Secondary", scheme: phase.sec, lifts: day.secondary, tag: "bg-emerald-100 text-emerald-700" },
          { label: "Ancillary", scheme: phase.anc, lifts: day.ancillary, tag: "bg-slate-100 text-slate-600" },
        ];
        return (
          <div key={day.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${workoutTypeStyle(day.name)}`}>{day.name}</span>
                  <span className="text-xs text-slate-400">{day.weekday} · {isoToLabel(addDaysISO(weekStart, day.dayOffset))}</span>
                </div>
                {logged && confirmUnlog === day.id ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500">Remove?</span>
                    <button onClick={async () => { await onUnlog(logged.id); setConfirmUnlog(null); }} className="px-2.5 py-1.5 bg-red-600 text-white rounded-lg font-semibold">Remove</button>
                    <button onClick={() => setConfirmUnlog(null)} className="px-2.5 py-1.5 bg-slate-100 text-slate-600 rounded-lg font-semibold">Keep</button>
                  </div>
                ) : logged ? (
                  <div className="flex items-center gap-1">
                    <button onClick={() => onLogSession(logged)} title="View or edit the logged session"
                      className="flex items-center gap-1 text-xs font-semibold text-emerald-600 px-2 py-1.5 rounded-lg hover:bg-emerald-50"><Check size={13}/> Logged</button>
                    <button onClick={() => setConfirmUnlog(day.id)} title="Unlog this session"
                      className="text-xs px-2 py-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-50 font-semibold flex items-center gap-1"><X size={13}/> Unlog</button>
                  </div>
                ) : <button onClick={() => logSession(day)} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold flex items-center gap-1"><Plus size={13}/> Log session</button>}
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800">{day.core.name}</p>
                  <p className="text-xs text-slate-500">{phase.core}</p>
                </div>
                <span className="text-lg font-bold text-blue-700 whitespace-nowrap">{pplCoreLoad(settings.rms, day, weekIdx)} lb</span>
              </div>
              <p className="text-xs text-slate-500 mt-2 truncate">{[...day.secondary, ...day.ancillary].map(l => l.name).join(" · ")}</p>
            </div>
            <button onClick={() => setOpenDay(open ? null : day.id)} className="w-full flex items-center justify-center gap-1 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 border-t border-slate-100">
              {open ? "Hide" : "Show"} all lifts & cues {open ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
            </button>
            {open && (
              <div className="px-4 pb-4 space-y-4 border-t border-slate-100 pt-3 bg-slate-50">
                {tiers.map(t => (
                  <div key={t.label}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${t.tag}`}>{t.label}</span>
                      <span className="text-xs text-slate-500">{t.scheme}</span>
                    </div>
                    <div className="space-y-1.5">
                      {t.lifts.map(l => (
                        <div key={l.name} className="flex justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-700">{l.name}</p>
                            <p className="text-xs text-slate-400 italic">{l.cue}</p>
                          </div>
                          <span className="text-xs text-slate-400 whitespace-nowrap">Rest {l.rest}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 divide-y divide-slate-100">
        {[["cycle","The 4-week cycle"],["loads","12-week load table"],["tips","Training tips"]].map(([id, label]) => (
          <div key={id}>
            <button onClick={() => setGuide(guide === id ? null : id)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50">
              <span className="text-sm font-semibold text-slate-700">{label}</span>
              {guide === id ? <ChevronUp size={16} className="text-slate-400"/> : <ChevronDown size={16} className="text-slate-400"/>}
            </button>
            {guide === id && id === "cycle" && (
              <div className="px-4 pb-4 grid grid-cols-2 gap-2">
                {PPL_PHASES.map((p, i) => (
                  <div key={p.id} className={`rounded-lg border p-3 ${p.style}`}>
                    <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">Week {i+1}</p>
                    <p className="font-bold">{p.label}</p>
                    <p className="text-xs">{p.rpe} · ~{Math.round(p.pct*100)}% 1RM</p>
                    <p className="text-xs opacity-80">Core {p.core}</p>
                  </div>
                ))}
              </div>
            )}
            {guide === id && id === "loads" && (
              <div className="px-4 pb-4 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-400 uppercase tracking-wide">
                      <th className="py-1.5 pr-2 font-semibold">Week</th>
                      {PPL_DAYS.map(d => <th key={d.id} className="py-1.5 px-1 font-semibold text-right">{PPL_RM_LABELS[d.coreKey]}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: PPL_WEEKS }).map((_, i) => {
                      const p = PPL_PHASES[i % 4];
                      return (
                        <tr key={i} className={`border-t border-slate-100 ${i === weekIdx ? "bg-blue-50 font-semibold" : ""} ${p.id === "dl" ? "text-slate-400" : "text-slate-700"}`}>
                          <td className="py-1.5 pr-2 whitespace-nowrap">W{i+1} · {p.label}</td>
                          {PPL_DAYS.map(d => <td key={d.id} className="py-1.5 px-1 text-right">{pplCoreLoad(settings.rms, d, i)} lb</td>)}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="text-xs text-slate-400 mt-2">Rounded to 5 lb. Monthly +5 lb bench, +10 lb deadlift and squat. Secondary and ancillary lifts are RPE-based (aim RPE 7–8); Log session pre-fills your last weight for them.</p>
              </div>
            )}
            {guide === id && id === "tips" && (
              <div className="px-4 pb-4 space-y-3">
                {PPL_TIPS.map(([t, b]) => (
                  <div key={t}>
                    <p className="text-sm font-semibold text-slate-700">{t}</p>
                    <p className="text-sm text-slate-500">{b}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkoutForm({ workout, isMobile, onSave, onDelete, onClose }) {
  const isEditing = !!workout?.id;
  const [exercises, setExercises]   = useState(workout?.exercises?.length ? workout.exercises.map(e => ({ ...e })) : [{ name:"",sets:"",reps:"",weight:"",notes:"" }]);
  const [formDate, setFormDate]     = useState(workout?.date || todayISO());
  const [formType, setFormType]     = useState(workout?.type || "Push");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errors, setErrors]         = useState([]);

  const updateEx = (idx, patch) => setExercises(prev => prev.map((ex, i) => i === idx ? { ...ex, ...patch } : ex));
  const weightsOf = (ex) => String(ex.weight ?? "").split(",");

  const save = async () => {
    const errs = [];
    if (!formDate) errs.push("Please select a date");
    const valid = exercises.filter(ex => ex.name && ex.sets && ex.reps);
    if (valid.length === 0) errs.push("Add at least one exercise with name, sets, and reps");
    if (errs.length) { setErrors(errs); return; }
    await onSave({ ...(workout||{}), date: formDate, type: formType, exercises: valid });
  };

  const typeOptions = WORKOUT_TYPES.includes(formType) ? WORKOUT_TYPES : [...WORKOUT_TYPES, formType];

  return (
    <Sheet title={isEditing ? "Edit Workout" : "Log Workout"} onClose={onClose} closeOnBackdrop={false}>
      {errors.length > 0 && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{errors.map((e,i) => <div key={i}>{e}</div>)}</div>}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div><label className="block text-xs font-medium text-slate-600 mb-1">Date</label><input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
        <div><label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
          <select value={formType} onChange={e => setFormType(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
            {typeOptions.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-3">
        {exercises.map((ex, idx) => (
          <div key={idx} className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-2">
            <div className="flex gap-2 items-center">
              <input placeholder="Exercise name" value={ex.name} onChange={e => updateEx(idx, { name: e.target.value })} className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              <button onClick={() => setExercises(exercises.filter((_,i) => i!==idx))} className="p-2 text-slate-300 hover:text-red-500" title="Remove exercise"><Trash2 size={15}/></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="Sets" inputMode="numeric" value={ex.sets} onChange={e => updateEx(idx, { sets: e.target.value })} className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              <input placeholder="Reps" inputMode="numeric" value={ex.reps} onChange={e => updateEx(idx, { reps: e.target.value })} className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
            </div>
            <div className="space-y-1">
              {weightsOf(ex).map((w, wi, arr) => (
                <div key={wi} className="flex gap-1 items-center">
                  <input
                    placeholder={arr.length > 1 ? `Set ${wi+1} weight (lbs)` : "Weight (lbs)"}
                    inputMode="decimal"
                    value={w.trim()}
                    onChange={e => { const ws = weightsOf(ex); ws[wi] = e.target.value; updateEx(idx, { weight: ws.join(",") }); }}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                  {arr.length > 1 && (
                    <button type="button" onClick={() => updateEx(idx, { weight: weightsOf(ex).filter((_,i)=>i!==wi).join(",") })} className="px-3 py-2 text-slate-400 hover:text-red-500 text-lg leading-none" aria-label="Remove set weight">×</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => updateEx(idx, { weight: String(ex.weight ?? "") + "," })} className="text-xs text-blue-500 hover:text-blue-700 font-medium">+ add set weight</button>
            </div>
            <input placeholder="Notes (optional)" value={ex.notes || ""} onChange={e => updateEx(idx, { notes: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs" />
          </div>
        ))}
        <button onClick={() => setExercises([...exercises, {name:"",sets:"",reps:"",weight:"",notes:""}])} className="w-full py-2.5 border-2 border-dashed border-slate-200 rounded-lg text-slate-500 hover:border-slate-400 text-sm">+ Add Exercise</button>
        <button onClick={save} className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-sm">{isEditing ? "Update Workout" : "Save Workout"}</button>
        {isEditing && !confirmDelete && <button onClick={() => setConfirmDelete(true)} className="w-full py-2.5 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 text-sm font-semibold flex items-center justify-center gap-1"><Trash2 size={14}/> Delete Workout</button>}
        {isEditing && confirmDelete && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm text-center mb-3">Delete this workout permanently?</p>
            <div className="flex gap-2">
              <button onClick={() => onDelete(workout.id)} className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold">Yes, Delete</button>
              <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function ExerciseChart({ exercise, prog }) {
  if (prog.length < 2) return (
    <div className="border border-amber-200 rounded-lg p-4 bg-amber-50 text-sm text-amber-800">
      <strong>{exercise}</strong> — need at least 2 sessions with weight data in this range ({prog.length} logged).
    </div>
  );
  const maxW = Math.max(...prog.map(p => p.weight));
  const minW = Math.min(...prog.map(p => p.weight));
  const range = maxW - minW || 1;
  const latest = prog[prog.length-1], prev = prog[prog.length-2];
  const change = latest.weight - prev.weight;
  const point = (p, i) => ({ x: (i/(prog.length-1))*100, y: ((maxW-p.weight)/range)*86+7 });
  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <span className="font-semibold text-slate-800">{exercise}</span>
        <div className="flex gap-3 text-xs text-slate-500">
          <span>Latest: <strong className="text-slate-800">{latest.weight}lbs</strong></span>
          {change !== 0 && <span className={`font-semibold ${change>0?"text-emerald-600":"text-red-500"}`}>{change>0?"+":"−"}{Math.abs(change)}lbs vs last</span>}
        </div>
      </div>
      <div className="relative bg-slate-50 rounded border border-slate-100" style={{height:"160px"}}>
        <div className="absolute left-0 top-0 bottom-0 w-10 flex flex-col justify-between text-xs text-slate-400 pr-1 text-right py-2">
          <span>{maxW}</span><span>{Math.round(maxW-range*0.5)}</span><span>{minW}</span>
        </div>
        <div className="ml-10 mr-4 h-full relative py-2">
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" style={{overflow:"visible"}}>
            <polyline points={prog.map((p,i) => { const {x,y} = point(p,i); return `${x},${y}`; }).join(" ")} fill="none" stroke="#3b82f6" strokeWidth="2" opacity="0.6" vectorEffect="non-scaling-stroke"/>
          </svg>
          {prog.map((p,i) => { const {x,y} = point(p,i); return (
            <div key={i} className="absolute w-2.5 h-2.5 bg-blue-600 rounded-full border-2 border-white shadow" style={{left:`${x}%`,top:`${y}%`,transform:"translate(-50%,-50%)"}} title={`${formatDate(p.dateObj)}: ${p.weight}lbs`}/>
          );})}
        </div>
      </div>
      <div className="flex justify-between text-xs text-slate-400 mt-1 ml-10 mr-4">
        <span>{formatDate(prog[0].dateObj)}</span><span>{formatDate(latest.dateObj)}</span>
      </div>
      <div className="mt-2 flex gap-2 text-xs">
        <div className="flex-1 bg-slate-50 rounded p-2 text-center"><div className="text-slate-500">Gain</div><div className="font-bold text-emerald-600">+{maxW-prog[0].weight}lbs</div></div>
        <div className="flex-1 bg-slate-50 rounded p-2 text-center"><div className="text-slate-500">Best</div><div className="font-bold">{maxW}lbs</div></div>
        <div className="flex-1 bg-slate-50 rounded p-2 text-center"><div className="text-slate-500">Sessions</div><div className="font-bold">{prog.length}</div></div>
      </div>
    </div>
  );
}

//
// MOOD TAB
//
const MOOD_METRICS = [
  { key: "mood",   label: "Mood",   icon: Smile    },
  { key: "energy", label: "Energy", icon: Zap      },
  { key: "stress", label: "Stress", icon: Activity, inverted: true },
  { key: "sleep",  label: "Sleep",  icon: Moon     },
];
const metricColors = (metric, value) => MOOD_COLORS(metric.inverted ? 9 - value : value);
const moodLabel = (score) => score>=7 ? "Great day" : score>=5 ? "Good day" : score>=3 ? "Fair day" : "Tough day";

function MetricPills({ entry }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {MOOD_METRICS.filter(m => m.key !== "mood").map(m => {
        const Icon = m.icon;
        return (
          <span key={m.key} className="flex items-center gap-1 text-xs text-slate-500">
            <Icon size={12} className={metricColors(m, entry[m.key]).text}/>{m.label} <strong className="text-slate-700">{entry[m.key]}</strong>
          </span>
        );
      })}
    </div>
  );
}

function MoodTab({ session, isMobile, dailyTasks = {}, habits = [], kanbanCards = [], goals = [] }) {
  const [moodEntries, setMoodEntries]   = useState([]);
  const [formEntry, setFormEntry]       = useState(null);
  const [detailDate, setDetailDate]     = useState(null);
  const [view, setView]                 = useState("calendar");
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(() => addDaysISO(todayISO(), -1));
  const [visibleCount, setVisibleCount] = useState(14);

  const uid = session?.user?.id;

  useEffect(() => { loadMoodEntries(); }, []);

  const loadMoodEntries = async () => {
    const { data } = await supabase.from("mood_entries").select("*").eq("user_id", uid).order("date", { ascending: false });
    if (data) setMoodEntries(data);
  };

  const saveMoodEntry = async (entry) => {
    // Habits now live on the Tasks tab, so completed_habits is only written (empty) for new rows.
    const payload = { user_id: uid, date: entry.date, mood: entry.mood, energy: entry.energy, stress: entry.stress, sleep: entry.sleep, tags: entry.tags||[], note: entry.note||"" };
    const existing = entry.id ? { id: entry.id } : moodEntries.find(e => e.date === entry.date);
    if (existing) {
      await supabase.from("mood_entries").update(payload).eq("id", existing.id).eq("user_id", uid);
      setMoodEntries(prev => prev.map(e => e.id === existing.id ? { ...e, ...payload } : e));
    } else {
      const { data } = await supabase.from("mood_entries").insert({ ...payload, completed_habits: [] }).select().single();
      if (data) setMoodEntries(prev => [data, ...prev]);
    }
  };

  const deleteMoodEntry = async (id) => {
    await supabase.from("mood_entries").delete().eq("id", id).eq("user_id", uid);
    setMoodEntries(prev => prev.filter(e => e.id !== id));
  };

  const entryByDate = {};
  moodEntries.forEach(e => { entryByDate[e.date] = e; });
  const sortedEntries = [...moodEntries].sort((a,b) => b.date.localeCompare(a.date));

  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const monthName = calendarDate.toLocaleString("default", { month: "long" });
  const todayStr = todayISO();
  const monthPrefix = `${year}-${String(month+1).padStart(2,"0")}`;
  const monthEntries = moodEntries.filter(e => e.date.startsWith(monthPrefix));
  const monthAvg = monthEntries.length ? (monthEntries.reduce((s,e) => s + e.mood, 0) / monthEntries.length).toFixed(1) : null;

  const todayEntry = entryByDate[todayStr];


  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        {todayEntry ? (
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-full ${MOOD_COLORS(todayEntry.mood).bg} ${MOOD_COLORS(todayEntry.mood).fg} flex items-center justify-center font-bold text-2xl flex-shrink-0`}>{todayEntry.mood}</div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Today</p>
              <p className={`font-bold ${MOOD_COLORS(todayEntry.mood).text}`}>{moodLabel(todayEntry.mood)}</p>
              <MetricPills entry={todayEntry}/>
            </div>
            <button onClick={() => setFormEntry(todayEntry)} className="px-3 py-1.5 text-sm bg-violet-50 text-violet-600 rounded-lg hover:bg-violet-100 font-medium flex items-center gap-1 flex-shrink-0"><Edit2 size={13}/> Edit</button>
          </div>
        ) : (
          <>
            <p className="font-bold text-slate-800 flex items-center gap-2"><SmilePlus size={18} className="text-violet-500"/> How are you feeling today?</p>
            <p className="text-xs text-slate-400 mt-0.5 mb-3">Tap a score to start your check-in.</p>
            <div className="flex gap-1.5">
              {[1,2,3,4,5,6,7,8].map(n => (
                <button key={n} onClick={() => setFormEntry({ date: todayStr, mood: n })}
                  className={`flex-1 py-3 rounded-lg text-sm font-bold ${MOOD_COLORS(n).light} ${MOOD_COLORS(n).text} hover:brightness-125 hover:scale-105 transition-all touch-manipulation`}>
                  {n}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <Segmented value={view} onChange={setView}
        options={[{id:"calendar",label:"Calendar",icon:Calendar},{id:"history",label:"History",icon:History}]}/>

      {view === "calendar" && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCalendarDate(new Date(year, month-1, 1))} className="p-2 hover:bg-slate-100 rounded-lg"><ChevronLeft size={18} className="text-slate-500"/></button>
            <div className="text-center">
              <h2 className="text-lg font-bold text-slate-800">{monthName} {year}</h2>
              <p className="text-xs text-slate-400">{monthEntries.length} check-in{monthEntries.length===1?"":"s"}{monthAvg && <> · avg mood <strong className={MOOD_COLORS(parseFloat(monthAvg)).text}>{monthAvg}</strong></>}</p>
            </div>
            <button onClick={() => setCalendarDate(new Date(year, month+1, 1))} className="p-2 hover:bg-slate-100 rounded-lg"><ChevronRight size={18} className="text-slate-500"/></button>
          </div>
          <div className="grid grid-cols-7 mb-2">
            {["S","M","T","W","T","F","S"].map((d,i) => <div key={i} className="text-center text-xs font-semibold text-slate-400 py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }).map((_,i) => <div key={`e${i}`}/>)}
            {Array.from({ length: daysInMonth }).map((_,i) => {
              const day = i+1;
              const isoDate = `${monthPrefix}-${String(day).padStart(2,"0")}`;
              const entry = entryByDate[isoDate];
              const isToday = isoDate === todayStr;
              const isFuture = isoDate > todayStr;
              const isSelected = isoDate === selectedDate;
              const dayTasks = tasksOn(dailyTasks, isoDate);
              const taskDone = dayTasks.filter(t => t.status === "complete").length;
              return (
                <button key={day} onClick={() => setSelectedDate(isoDate)} disabled={isFuture}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center transition-all touch-manipulation
                    ${entry ? `${MOOD_COLORS(entry.mood).bg} ${MOOD_COLORS(entry.mood).fg} hover:brightness-110` : isToday ? "border-2 border-violet-400 text-violet-600 hover:bg-violet-50" : isFuture ? "text-slate-300 cursor-default" : "bg-slate-50 text-slate-600 hover:bg-slate-100"}
                    ${isSelected ? "ring-2 ring-slate-800 ring-offset-2" : ""}`}>
                  <span className="text-sm font-semibold">{day}</span>
                  {dayTasks.length > 0 && (
                    <span className={`text-[9px] leading-none mt-0.5 font-semibold ${entry ? "opacity-75" : "text-slate-400"}`}>✓{taskDone}/{dayTasks.length}</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-center gap-1.5 mt-4 pt-4 border-t border-slate-100 flex-wrap">
            <span className="text-xs text-slate-400 mr-1">Low</span>
            {[1,2,4,6,8].map(n => <div key={n} className={`w-5 h-3 rounded ${MOOD_COLORS(n).bg}`}/>)}
            <span className="text-xs text-slate-400 ml-1">High</span>
            <span className="text-xs text-slate-400 ml-4">✓ tasks done</span>
          </div>
        </div>
      )}

      {view === "calendar" && selectedDate && (
        <DayPanel iso={selectedDate} entry={entryByDate[selectedDate]} dailyTasks={dailyTasks} habits={habits} kanbanCards={kanbanCards} goals={goals}
          onDetails={() => setDetailDate(selectedDate)}
          onCheckIn={() => setFormEntry(entryByDate[selectedDate] || { date: selectedDate })}/>
      )}

      {view === "history" && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          {sortedEntries.length === 0 ? (
            <div className="text-center py-8">
              <Heart size={32} className="text-slate-300 mx-auto mb-3"/>
              <p className="text-slate-400 text-sm">No check-ins yet.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {groupByMonth(sortedEntries.slice(0, visibleCount), e => new Date(e.date + "T00:00:00")).map(group => (
                <div key={group.key}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">{group.label}</p>
                  <div className="space-y-1">
                    {group.items.map(entry => {
                      const colors = MOOD_COLORS(entry.mood);
                      return (
                        <button key={entry.id} onClick={() => setDetailDate(entry.date)}
                          className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors text-left">
                          <div className={`w-10 h-10 rounded-full ${colors.bg} ${colors.fg} flex items-center justify-center font-bold text-lg flex-shrink-0`}>{entry.mood}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-slate-700 text-sm">{isoToLong(entry.date)}</span>
                              <span className={`text-xs font-medium ${colors.text}`}>{moodLabel(entry.mood)}</span>
                            </div>
                            <MetricPills entry={entry}/>
                            {(entry.tags||[]).length > 0 && (
                              <div className="flex gap-1 flex-wrap mt-1.5">
                                {entry.tags.map(tag => <span key={tag} className={`text-xs px-2 py-0.5 rounded-full ${colors.light} ${colors.text} font-medium`}>{tag}</span>)}
                              </div>
                            )}
                            {entry.note && <p className="text-sm text-slate-400 mt-1 line-clamp-2">{entry.note}</p>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {sortedEntries.length > visibleCount && (
                <button onClick={() => setVisibleCount(c => c + 14)} className="w-full py-2 text-sm font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-lg">
                  Show older check-ins ({sortedEntries.length - visibleCount} more)
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {detailDate && entryByDate[detailDate] && (
        <DayDetail entry={entryByDate[detailDate]} habits={habits} dailyTasks={dailyTasks} kanbanCards={kanbanCards} goals={goals}
          onEdit={(entry) => { setDetailDate(null); setFormEntry(entry); }}
          onClose={() => setDetailDate(null)} />
      )}

      {formEntry && (
        <MoodForm entry={formEntry} moodEntries={moodEntries}
          onSave={async (entry) => { await saveMoodEntry(entry); setFormEntry(null); }}
          onDelete={async (id) => { await deleteMoodEntry(id); setFormEntry(null); }}
          onClose={() => setFormEntry(null)}
          isMobile={isMobile} />
      )}
    </div>
  );
}

function DayDetail({ entry, onEdit, onClose, habits, dailyTasks, kanbanCards, goals }) {
  const colors = MOOD_COLORS(entry.mood);
  return (
    <Sheet title={isoToLong(entry.date)} onClose={onClose}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-12 h-12 rounded-full ${colors.bg} ${colors.fg} flex items-center justify-center text-xl font-bold`}>{entry.mood}</div>
        <p className={`flex-1 font-semibold ${colors.text}`}>{moodLabel(entry.mood)}</p>
        <button onClick={() => onEdit(entry)} className="px-3 py-1.5 text-sm bg-violet-50 text-violet-600 rounded-lg hover:bg-violet-100 font-medium flex items-center gap-1"><Edit2 size={13}/> Edit</button>
      </div>
      <div className="grid grid-cols-4 gap-2 mb-4">
        {MOOD_METRICS.map(m => {
          const Icon = m.icon;
          const c = metricColors(m, entry[m.key]);
          return (
            <div key={m.key} className={`${c.light} rounded-lg p-3 text-center`}>
              <Icon size={16} className={`${c.text} mx-auto mb-1`}/>
              <div className={`text-xl font-bold ${c.text}`}>{entry[m.key]}</div>
              <div className="text-xs text-slate-500">{m.label}</div>
            </div>
          );
        })}
      </div>
      {(entry.tags||[]).length > 0 && <div className="flex gap-2 flex-wrap mb-4">{entry.tags.map(tag => <span key={tag} className={`px-3 py-1 rounded-full text-sm font-medium ${colors.light} ${colors.text}`}>{tag}</span>)}</div>}
      {entry.note && <div className="bg-slate-50 rounded-lg p-3 mb-4"><p className="text-sm text-slate-600 italic">"{entry.note}"</p></div>}
      <div className="border-t border-slate-100 pt-4">
        <DayTasks iso={entry.date} dailyTasks={dailyTasks} habits={habits} kanbanCards={kanbanCards} goals={goals}/>
      </div>
    </Sheet>
  );
}

const TASK_STATUS_STYLES = {
  complete: { icon: Check, dot: "bg-emerald-500 text-navy-950", text: "text-slate-700" },
  skipped:  { icon: X,     dot: "bg-slate-200 text-slate-500",  text: "text-slate-400 line-through" },
  pending:  { icon: null,  dot: "border-2 border-amber-400",    text: "text-slate-700" },
};

// A day's tasks and habit check-offs from the Tasks tab, read-only
function DayTasks({ iso, dailyTasks, habits, kanbanCards = [], goals = [] }) {
  const dayTasks = tasksOn(dailyTasks, iso);
  const tasksDone = dayTasks.filter(t => t.status === "complete").length;
  const doneHabitIds = habitsDoneOn(dailyTasks, iso);
  // Cards and milestones finished this day that aren't already on its task list
  const listed = (source) => dayTasks.some(t => sameSource(t.source, source));
  const alsoDone = [
    ...kanbanCards.filter(c => c.status === "done" && stampISO(c.completed_at) === iso && !listed({ type: "kanban", cardId: c.id }))
      .map(c => ({ key: `c-${c.id}`, text: c.title, goal: goals.find(g => g.id === c.goal_id), label: "Kanban" })),
    ...goals.flatMap(g => (g.milestones || []).filter(m => m.done && stampISO(m.done_at) === iso && !listed({ type: "milestone", goalId: g.id, milestoneId: m.id }))
      .map(m => ({ key: `m-${m.id}`, text: m.text, goal: g }))),
  ];
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Tasks</p>
        {dayTasks.length > 0 && <span className="text-xs text-slate-500"><strong className="text-slate-800">{tasksDone}/{dayTasks.length}</strong> done</span>}
      </div>
      {dayTasks.length === 0
        ? <p className="text-sm text-slate-400">No tasks logged for this day.</p>
        : (
          <ul className="space-y-1.5">
            {dayTasks.map(t => {
              const st = TASK_STATUS_STYLES[t.status] || TASK_STATUS_STYLES.pending;
              const Icon = st.icon;
              const src = resolveSource(t.source, kanbanCards, goals);
              return (
                <li key={t.id} className="flex items-start gap-2.5">
                  <span className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${st.dot}`}>{Icon && <Icon size={10} strokeWidth={3}/>}</span>
                  <span className="text-sm"><span className={st.text}>{src?.title || t.text}</span>{t.status === "skipped" && <span className="ml-1.5 text-xs text-slate-400">skipped</span>}{src && <span className="ml-1.5"><GoalChip goal={src.goal} label={src.goal ? null : "Kanban"}/></span>}</span>
                </li>
              );
            })}
          </ul>
        )}
      {alsoDone.length > 0 && (
        <>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-4 mb-2">Also finished</p>
          <ul className="space-y-1.5">
            {alsoDone.map(x => (
              <li key={x.key} className="flex items-start gap-2.5">
                <span className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${TASK_STATUS_STYLES.complete.dot}`}><Check size={10} strokeWidth={3}/></span>
                <span className="text-sm"><span className="text-slate-700">{x.text}</span><span className="ml-1.5"><GoalChip goal={x.goal} label={x.goal ? null : x.label}/></span></span>
              </li>
            ))}
          </ul>
        </>
      )}
      {habits.length > 0 && (
        <>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-4 mb-2">Habits</p>
          <div className="flex flex-wrap gap-2">
            {habits.map(h => {
              const done = doneHabitIds.has(h.id);
              return (
                <span key={h.id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${done ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-400 border-slate-200"}`}>
                  {done ? <Check size={11}/> : <X size={11}/>} {h.name}
                </span>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// Summary of the day picked on the mood calendar: its check-in plus what got done
function DayPanel({ iso, entry, dailyTasks, habits, kanbanCards, goals, onDetails, onCheckIn }) {
  const today = todayISO();
  const rel = iso === today ? "Today" : iso === addDaysISO(today, -1) ? "Yesterday" : null;
  const colors = entry ? MOOD_COLORS(entry.mood) : null;
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <div className="flex items-center gap-3 mb-4">
        {entry
          ? <button onClick={onDetails} className={`w-11 h-11 rounded-full ${colors.bg} ${colors.fg} flex items-center justify-center font-bold text-lg flex-shrink-0`} aria-label="Check-in details">{entry.mood}</button>
          : <div className="w-11 h-11 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 flex-shrink-0"><SmilePlus size={18}/></div>}
        <div className="flex-1 min-w-0">
          {rel && <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{rel}</p>}
          <p className="font-bold text-slate-800">{isoToLong(iso)}</p>
          {entry ? <p className={`text-xs font-medium ${colors.text}`}>{moodLabel(entry.mood)}</p> : <p className="text-xs text-slate-400">No check-in</p>}
        </div>
        {entry
          ? <button onClick={onDetails} className="px-3 py-1.5 text-sm bg-violet-50 text-violet-600 rounded-lg hover:bg-violet-100 font-medium flex-shrink-0">Details</button>
          : <button onClick={onCheckIn} className="px-3 py-1.5 text-sm bg-violet-50 text-violet-600 rounded-lg hover:bg-violet-100 font-medium flex items-center gap-1 flex-shrink-0"><Plus size={13}/> Check in</button>}
      </div>
      {entry && <div className="-mt-2 mb-4"><MetricPills entry={entry}/></div>}
      <div className="border-t border-slate-100 pt-4">
        <DayTasks iso={iso} dailyTasks={dailyTasks} habits={habits} kanbanCards={kanbanCards} goals={goals}/>
      </div>
    </div>
  );
}

function ScaleInput({ metric, value, onChange }) {
  const Icon = metric.icon;
  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-2">
        <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Icon size={15} className="text-slate-400"/>{metric.label}{metric.inverted && <span className="text-xs font-normal text-slate-400">(lower is better)</span>}</label>
        <span className={`text-lg font-bold ${metricColors(metric, value).text}`}>{value}<span className="text-sm text-slate-400 font-normal">/8</span></span>
      </div>
      <div className="flex gap-1.5">
        {[1,2,3,4,5,6,7,8].map(n => {
          const c = metricColors(metric, n);
          return <button key={n} onClick={() => onChange(n)} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all touch-manipulation ${value===n?`${c.bg} ${c.fg} shadow-md scale-105`:"bg-slate-100 text-slate-400 hover:bg-slate-200"}`}>{n}</button>;
        })}
      </div>
    </div>
  );
}

const MAX_MOOD_TAGS = 3;

function MoodForm({ entry, moodEntries, onSave, onDelete, onClose }) {
  const isEditing = !!entry?.id;
  const [formDate, setFormDate] = useState(entry?.date || todayISO());
  const [values, setValues]     = useState({ mood: entry?.mood || 5, energy: entry?.energy || 5, stress: entry?.stress || 4, sleep: entry?.sleep || 5 });
  const [note, setNote]         = useState(entry?.note || "");
  const [tags, setTags]         = useState((entry?.tags || []).slice(0, MAX_MOOD_TAGS));
  const [tagInput, setTagInput] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const tagStats = {};
  moodEntries.forEach(e => { (e.tags||[]).forEach(tag => { if (!tagStats[tag]) tagStats[tag]={total:0,count:0}; tagStats[tag].total+=e.mood; tagStats[tag].count+=1; }); });
  const rankedTags = Object.entries(tagStats).sort((a,b)=>(b[1].total/b[1].count)-(a[1].total/a[1].count)).map(x=>x[0]);
  const allSuggestions = [...new Set([...rankedTags, ...SEED_TAGS])];
  const query = tagInput.trim().toLowerCase();
  const suggestions = (query ? allSuggestions.filter(t => t.toLowerCase().includes(query)) : allSuggestions).filter(t => !tags.includes(t)).slice(0, 15);
  const full = tags.length >= MAX_MOOD_TAGS;

  const addTag = (tag) => {
    const t = tag.trim().slice(0, 20);
    if (!t || tags.includes(t) || full) return;
    setTags([...tags, t]);
    setTagInput("");
  };

  const save = async () => {
    await onSave({ id: entry?.id, date: formDate, ...values, tags, note: note.trim() });
  };

  return (
    <Sheet title={isEditing ? "Edit Check-in" : "Daily Check-in"} onClose={onClose} closeOnBackdrop={false}>
      <div className="mb-5">
        <label className="block text-sm font-semibold text-slate-700 mb-1">Date</label>
        <input type="date" value={formDate} max={todayISO()} onChange={e => setFormDate(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-base"/>
      </div>
      {MOOD_METRICS.map(m => (
        <ScaleInput key={m.key} metric={m} value={values[m.key]} onChange={v => setValues(prev => ({ ...prev, [m.key]: v }))}/>
      ))}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-slate-700 mb-2">Tags <span className="text-slate-400 font-normal text-xs">(up to {MAX_MOOD_TAGS})</span></label>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {tags.map(tag => (
              <span key={tag} className="flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-full text-xs font-semibold bg-violet-600 text-white">
                {tag}
                <button onClick={() => setTags(tags.filter(t => t !== tag))} className="p-1 -my-0.5 rounded-full hover:bg-violet-500" aria-label={`Remove ${tag}`}><X size={12}/></button>
              </span>
            ))}
          </div>
        )}
        <input value={tagInput} onChange={e => setTagInput(e.target.value)} disabled={full}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); } }}
          placeholder={full ? "Tag limit reached" : "Search or type a new tag, then Enter"} maxLength={20}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-violet-400 focus:outline-none mb-2 disabled:bg-slate-50"/>
        {!full && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map(tag => {
              const avg = tagStats[tag] ? tagStats[tag].total/tagStats[tag].count : null;
              const colors = avg ? MOOD_COLORS(avg) : null;
              return (
                <button key={tag} onClick={() => addTag(tag)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${colors?`${colors.light} ${colors.text} ${colors.border} hover:opacity-80`:"bg-white text-slate-500 border-slate-200 hover:bg-violet-50 hover:text-violet-600"}`}>
                  {tag}{avg && <span className="ml-1 opacity-60">{avg.toFixed(1)}</span>}
                </button>
              );
            })}
            {query && !allSuggestions.some(t => t.toLowerCase() === query) && (
              <button onClick={() => addTag(tagInput)} className="px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-violet-300 text-violet-600 hover:bg-violet-50">+ "{tagInput.trim()}"</button>
            )}
          </div>
        )}
      </div>
      <div className="mb-5">
        <label className="block text-sm font-semibold text-slate-700 mb-1">Journal Note <span className="text-slate-400 font-normal text-xs">(optional)</span></label>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:border-violet-400 focus:outline-none"/>
      </div>
      <p className="text-xs text-slate-400 mb-3">Habits are now checked off on the Tasks tab and show up in each day's details here.</p>
      <button onClick={save} className="w-full py-3 bg-violet-600 text-white rounded-lg hover:bg-violet-700 font-semibold flex items-center justify-center gap-2">
        <Check size={18}/> {isEditing ? "Update Check-in" : "Save Check-in"}
      </button>
      {isEditing && !confirmDelete && (
        <button onClick={() => setConfirmDelete(true)} className="w-full mt-2 py-3 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 font-semibold flex items-center justify-center gap-2">
          <Trash2 size={16}/> Delete Entry
        </button>
      )}
      {isEditing && confirmDelete && (
        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm text-center mb-3">Delete this check-in permanently?</p>
          <div className="flex gap-2">
            <button onClick={() => onDelete(entry.id)} className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold">Yes, Delete</button>
            <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold">Cancel</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

// 
// TASKS TAB
// 
function TasksTab({ isMobile, dailyTasks, saveDailyTasks, kanbanCards, addKanbanCard, updateKanbanCard, deleteKanbanCard, goals, addGoal, updateGoal, deleteGoal, habits, addHabit, deleteHabit, links }) {
  const [section, setSection] = useState("daily");
  return (
    <div>
      <div className="mb-5">
        <Segmented value={section} onChange={setSection}
          options={[{id:"daily",label:"Daily",icon:CheckSquare},{id:"kanban",label:"Kanban",icon:Calendar},{id:"goals",label:"Goals",icon:Flag}]}/>
      </div>
      {section==="daily"  && <DailySection  isMobile={isMobile} dailyTasks={dailyTasks} saveDailyTasks={saveDailyTasks} habits={habits} addHabit={addHabit} deleteHabit={deleteHabit} kanbanCards={kanbanCards} goals={goals} links={links}/>}
      {section==="kanban" && <KanbanSection isMobile={isMobile} kanbanCards={kanbanCards} addKanbanCard={addKanbanCard} updateKanbanCard={updateKanbanCard} deleteKanbanCard={deleteKanbanCard} goals={goals} dailyTasks={dailyTasks} links={links}/>}
      {section==="goals"  && <GoalsSection  goals={goals} addGoal={addGoal} updateGoal={updateGoal} deleteGoal={deleteGoal} kanbanCards={kanbanCards} dailyTasks={dailyTasks} links={links}/>}
    </div>
  );
}

// Cards due on a day. Today also carries everything overdue, including overdue cards finished today so they can be unticked.
const cardsDueOn = (kanbanCards, iso) => kanbanCards.filter(c => c.due_date && (c.due_date === iso
  || (iso === todayISO() && c.due_date < iso && (c.status !== "done" || stampISO(c.completed_at) === iso))));

function DailySection({ isMobile, dailyTasks, saveDailyTasks, habits, addHabit, deleteHabit, kanbanCards, goals, links }) {
  const [showPicker, setShowPicker] = useState(false);
  const [viewDate, setViewDate]     = useState(todayISO());
  const [newTaskText, setNewTaskText] = useState("");
  const [editingTask, setEditingTask] = useState(null);
  const [editText, setEditText] = useState("");
  const [dragId, setDragId]       = useState(null);
  const [dragOrder, setDragOrder] = useState(null); // task ids in their in-progress order while dragging
  const calendarRef = useRef(null);
  const rowRefs = useRef({});

  const tasks = tasksOn(dailyTasks, viewDate);
  const habitItems = (dailyTasks[viewDate]?.tasks || []).filter(t => t.habitId);
  // Writes this day's tasks while keeping its habit check-offs intact
  const putTasks = (nextTasks) => saveDailyTasks({ ...dailyTasks, [viewDate]: { tasks: [...nextTasks, ...habitItems] } });
  const isToday = viewDate === todayISO();
  const isTom   = viewDate === tomorrow();
  // Kanban cards due this day show up on their own, unless they're already planned as one of its tasks
  const dueCards = cardsDueOn(kanbanCards, viewDate).filter(c => !isPlannedOn(dailyTasks, viewDate, { type: "kanban", cardId: c.id }))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const dueDone = dueCards.filter(c => c.status === "done").length;
  const total   = tasks.length + dueCards.length;
  const done    = tasks.filter(t=>t.status==="complete").length + dueDone;
  const skipped = tasks.filter(t=>t.status==="skipped").length;
  const pending = tasks.filter(t=>t.status==="pending").length + dueCards.length - dueDone;

  // Open milestones and cards that could be pulled onto this day
  const pickable = [
    ...goals.map(g => ({
      key: g.id, goal: g, title: g.title,
      items: [
        ...(g.milestones || []).filter(m => !m.done).map(m => ({ key: `m-${m.id}`, text: m.text, source: { type: "milestone", goalId: g.id, milestoneId: m.id } })),
        ...kanbanCards.filter(c => c.goal_id === g.id && c.status !== "done").map(c => ({ key: `c-${c.id}`, text: c.title, card: c, source: { type: "kanban", cardId: c.id } })),
      ],
    })),
    { key: "board", goal: null, title: "Kanban board",
      items: kanbanCards.filter(c => c.status !== "done" && !goals.some(g => g.id === c.goal_id)).map(c => ({ key: `c-${c.id}`, text: c.title, card: c, source: { type: "kanban", cardId: c.id } })) },
  ].map(grp => ({ ...grp, items: grp.items.filter(i => !isPlannedOn(dailyTasks, viewDate, i.source) && !dueCards.some(c => c.id === i.card?.id)) }))
   .filter(grp => grp.items.length > 0);
  const hasLinkables = goals.some(g => (g.milestones || []).length) || kanbanCards.length > 0;

  const days14 = Array.from({length:14}, (_,i) => { const d=new Date(); d.setDate(d.getDate()-7+i); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,"0"); const day=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${day}`; });

  useEffect(() => {
    if (calendarRef.current) {
      const todayEl = calendarRef.current.querySelector("[data-istoday='true']");
      if (todayEl) todayEl.scrollIntoView({ behavior: "instant", block: "nearest", inline: "center" });
    }
  }, []);

  const addTask = () => {
    if (!newTaskText.trim()) return;
    putTasks([...tasks, { id: Date.now(), text: newTaskText.trim(), status: "pending" }]);
    setNewTaskText("");
  };

  const sourceOf = (t) => resolveSource(t.source, kanbanCards, goals);

  // Renaming a planned task renames the card or milestone it came from
  const saveTaskEdit = (taskId) => {
    const text = editText.trim();
    if (!text) return;
    const t = tasks.find(x => x.id === taskId);
    putTasks(tasks.map(x => x.id === taskId ? { ...x, text } : x));
    if (t && sourceOf(t)) links.renameSource(t.source, text);
    setEditingTask(null);
  };

  // Checking or unchecking a planned task completes or reopens its card/milestone; skipping only affects the day
  const setStatus = (taskId, status) => {
    const t = tasks.find(x => x.id === taskId);
    if (t && sourceOf(t) && (status === "complete") !== (t.status === "complete"))
      links.setSourceDone(t.source, status === "complete", { date: viewDate, taskId, status });
    else putTasks(tasks.map(x => x.id===taskId?{...x,status}:x));
  };

  const deleteTask = (taskId) => {
    putTasks(tasks.filter(t=>t.id!==taskId));
  };

  // Drag to reorder: the grip captures the pointer, the dragged task slots in after every row whose midpoint it passes,
  // and the new order is saved on release.
  const shownTasks = dragOrder ? dragOrder.map(id => tasks.find(t => t.id === id)).filter(Boolean) : tasks;
  const startDrag = (e, taskId) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setEditingTask(null);
    setDragId(taskId);
    setDragOrder(tasks.map(t => t.id));
  };
  const moveDrag = (e) => {
    if (dragId === null) return;
    const others = dragOrder.filter(id => id !== dragId);
    const idx = others.filter(id => { const r = rowRefs.current[id]?.getBoundingClientRect(); return r && e.clientY > r.top + r.height / 2; }).length;
    const next = [...others.slice(0, idx), dragId, ...others.slice(idx)];
    if (next.join() !== dragOrder.join()) setDragOrder(next);
  };
  const endDrag = (save) => {
    if (save && dragOrder && dragOrder.join() !== tasks.map(t => t.id).join()) putTasks(shownTasks);
    setDragId(null);
    setDragOrder(null);
  };
  const moveTaskBy = (taskId, delta) => {
    const i = tasks.findIndex(t => t.id === taskId), j = i + delta;
    if (i < 0 || j < 0 || j >= tasks.length) return;
    const next = [...tasks]; [next[i], next[j]] = [next[j], next[i]];
    putTasks(next);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-xs font-medium text-slate-500 mb-3">Jump to date</p>
        <div className="-mx-4 px-4 overflow-x-auto" ref={calendarRef}>
          <div className="flex gap-1 pb-2 min-w-max">
            {days14.map(d => {
              const t = tasksOn(dailyTasks, d);
              const due = cardsDueOn(kanbanCards, d).filter(c => !isPlannedOn(dailyTasks, d, { type: "kanban", cardId: c.id }));
              const dueOpen = due.some(c => c.status !== "done");
              const allDone = t.length+due.length>0 && t.every(x=>x.status==="complete") && !dueOpen;
              const hasPending = t.some(x=>x.status==="pending") || dueOpen;
              const isActive = d===viewDate;
              const isT = d===todayISO();
              return (
                <button key={d} onClick={()=>setViewDate(d)} data-istoday={isT}
                  className={`flex-shrink-0 flex flex-col items-center px-2 py-2 rounded-lg text-xs transition-all min-w-[48px] touch-manipulation border ${isActive?"bg-blue-600 text-white border-blue-600":isT?"border-blue-300 text-blue-600 bg-blue-50":"border-transparent text-slate-500 hover:bg-slate-50"}`}>
                  <span className="text-xs opacity-70">{new Date(d+"T00:00:00").toLocaleDateString("en-US",{weekday:"narrow"})}</span>
                  <span className="font-semibold text-sm">{new Date(d+"T00:00:00").getDate()}</span>
                  <div className={`w-1.5 h-1.5 rounded-full mt-0.5 ${allDone?"bg-emerald-400":hasPending?"bg-amber-400":t.length+due.length>0?"bg-red-400":"bg-transparent"}`}/>
                </button>
              );
            })}
          </div>
        </div>
        <p className="md:hidden text-xs text-slate-400 text-center mt-1">← Swipe to navigate →</p>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-slate-800">{isToday?"Today":isTom?"Tomorrow":isoToLabel(viewDate)}</h3>
            {total>0 && <p className="text-xs text-slate-400 mt-0.5">{done} done  {pending} pending  {skipped} skipped</p>}
          </div>
          {total>0 && (
            <div className="h-2 w-24 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{width:`${Math.round(done/total*100)}%`}}/>
            </div>
          )}
        </div>
        {total===0 && <p className="text-slate-400 text-sm text-center py-4">No tasks for this day yet.</p>}
        {isMobile && tasks.length>0 && <p className="text-xs text-slate-400 -mt-2 mb-3">Tap a task to edit, skip or delete it. Drag the handle to reorder.</p>}
        <div className="space-y-2 mb-4">
          {shownTasks.map(t => {
            const src = sourceOf(t);
            const label = src?.title || t.text;
            const chip = src && <GoalChip goal={src.goal} label={src.goal ? null : "Kanban"}/>;
            return (
              <div key={t.id} ref={el => { rowRefs.current[t.id] = el; }}
                className={`flex items-center gap-2 px-3 ${isMobile?"py-3":"py-2.5"} rounded-lg border transition-colors ${dragId===t.id?"ring-2 ring-blue-400 shadow-lg relative z-10":""} ${t.status==="complete"?"bg-emerald-50 border-emerald-100 opacity-75":t.status==="skipped"?"bg-slate-50 border-slate-100 opacity-60":"bg-white border-slate-200"}`}>
                {editingTask === t.id ? (
                  // EDIT MODE (on mobile this also holds skip and delete)
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <input
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && saveTaskEdit(t.id)}
                        className="flex-1 min-w-0 px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:border-blue-500"
                        autoFocus
                      />
                      <button onClick={() => saveTaskEdit(t.id)} className={`${isMobile?"p-2":""} text-emerald-600 hover:text-emerald-700 flex-shrink-0`} title="Save"><Check size={isMobile?18:14}/></button>
                      <button onClick={() => setEditingTask(null)} className={`${isMobile?"p-2":""} text-slate-400 hover:text-slate-600 flex-shrink-0`} title="Cancel"><X size={isMobile?18:14}/></button>
                    </div>
                    {isMobile && (
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => { setStatus(t.id, t.status==="skipped"?"pending":"skipped"); setEditingTask(null); }}
                          className="flex-1 py-2 text-sm font-medium rounded-lg bg-slate-100 text-slate-600">{t.status==="skipped" ? "Unskip" : "Skip today"}</button>
                        <button onClick={() => { deleteTask(t.id); setEditingTask(null); }}
                          className="flex-1 py-2 text-sm font-medium rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center gap-1"><Trash2 size={14}/> {src ? "Remove" : "Delete"}</button>
                      </div>
                    )}
                  </div>
                ) : (
                  // VIEW MODE
                  <>
                    {tasks.length > 1 && (
                      <button aria-label="Drag to reorder" title="Drag to reorder"
                        onPointerDown={e => startDrag(e, t.id)} onPointerMove={moveDrag}
                        onPointerUp={() => endDrag(true)} onPointerCancel={() => endDrag(false)}
                        onKeyDown={e => { if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); moveTaskBy(t.id, e.key === "ArrowUp" ? -1 : 1); } }}
                        className={`${isMobile?"-ml-1 p-1":"-ml-1"} text-slate-300 hover:text-slate-500 flex-shrink-0 touch-none select-none ${dragId===t.id?"cursor-grabbing":"cursor-grab"}`}>
                        <GripVertical size={isMobile?18:14}/>
                      </button>
                    )}
                    <button onClick={()=>setStatus(t.id,t.status==="complete"?"pending":"complete")} aria-label="Complete"
                      className={`${isMobile?"w-9 h-9":"w-6 h-6"} rounded-full flex items-center justify-center flex-shrink-0 border transition-all touch-manipulation ${t.status==="complete"?"bg-emerald-500 border-emerald-500 text-white":"border-slate-300 text-slate-300 hover:border-emerald-400 hover:text-emerald-500"}`}>
                      <Check size={isMobile?15:12}/>
                    </button>
                    {!isMobile && (
                      <button onClick={()=>setStatus(t.id,t.status==="skipped"?"pending":"skipped")} aria-label="Skip"
                        className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border transition-all ${t.status==="skipped"?"bg-slate-400 border-slate-400 text-white":"border-slate-300 text-slate-300 hover:border-slate-400 hover:text-slate-500"}`}>
                        <X size={12}/>
                      </button>
                    )}
                    {isMobile ? (
                      <button onClick={() => { setEditingTask(t.id); setEditText(label); }} className="flex-1 min-w-0 text-left py-1 touch-manipulation">
                        <span className={`text-base ${t.status!=="pending"?"line-through text-slate-400":"text-slate-700"}`}>{label}</span>
                        {t.status==="skipped" && <span className="ml-2 text-xs text-slate-400">skipped</span>}
                        {chip && <span className="block mt-0.5">{chip}</span>}
                      </button>
                    ) : (
                      <>
                        <span className={`flex-1 min-w-0 text-sm ${t.status==="complete"?"line-through text-slate-400":t.status==="skipped"?"line-through text-slate-400":"text-slate-700"}`}>{label}</span>
                        {chip}
                        <button onClick={() => { setEditingTask(t.id); setEditText(label); }} className="p-0.5 text-slate-300 hover:text-blue-600 flex-shrink-0" title="Edit task"><Edit2 size={14}/></button>
                        <button onClick={()=>deleteTask(t.id)} className="p-0.5 text-slate-300 hover:text-red-400 flex-shrink-0" title={src ? "Remove from this day" : "Delete task"}><Trash2 size={14}/></button>
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
        {dueCards.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Due on the Kanban board</p>
            <div className="space-y-2">
              {dueCards.map(c => {
                const cardDone = c.status === "done";
                const overdue = !cardDone && c.due_date < todayISO();
                return (
                  <div key={c.id} className={`flex items-center gap-2 px-3 ${isMobile?"py-3":"py-2.5"} rounded-lg border ${cardDone?"bg-emerald-50 border-emerald-100 opacity-75":"bg-white border-slate-200"}`}>
                    <button onClick={() => links.setSourceDone({ type: "kanban", cardId: c.id }, !cardDone)} aria-label={cardDone ? "Reopen card" : "Mark card done"}
                      className={`${isMobile?"w-9 h-9":"w-6 h-6"} rounded-full flex items-center justify-center flex-shrink-0 border transition-all touch-manipulation ${cardDone?"bg-emerald-500 border-emerald-500 text-white":"border-slate-300 text-slate-300 hover:border-emerald-400 hover:text-emerald-500"}`}>
                      <Check size={isMobile?15:12}/>
                    </button>
                    <div className="flex-1 min-w-0">
                      <span className={`${isMobile?"text-base":"text-sm"} ${cardDone?"line-through text-slate-400":"text-slate-700"}`}>{c.title}</span>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        {overdue && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-medium">Overdue · {isoToLabel(c.due_date)}</span>}
                        {c.status === "inprogress" && <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${KANBAN_COLORS.inprogress}`}>{KANBAN_LABELS.inprogress}</span>}
                        <GoalChip goal={goals.find(g => g.id === c.goal_id)}/>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <input value={newTaskText} onChange={e=>setNewTaskText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addTask()} placeholder="Add a task" className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"/>
          <button onClick={addTask} className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"><Plus size={16}/></button>
        </div>
        {hasLinkables && (
          <div className="mt-3">
            <button onClick={() => setShowPicker(v => !v)} className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 py-1">
              <Flag size={14}/> Add from goals and Kanban {showPicker ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
            </button>
            {showPicker && (
              <div className="mt-2 space-y-3">
                {pickable.length === 0 && <p className="text-sm text-slate-400">Nothing open left to add for this day.</p>}
                {pickable.map(grp => (
                  <div key={grp.key}>
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-1">
                      {grp.goal && <span className="w-2 h-2 rounded-full" style={{ background: goalHex(grp.goal) }}/>}{grp.title}
                    </p>
                    <div className="space-y-1">
                      {grp.items.map(i => (
                        <button key={i.key} onClick={() => links.planSource(i.source, i.text, viewDate)}
                          className={`w-full flex items-center gap-2 px-3 ${isMobile?"py-2.5":"py-1.5"} rounded-lg border border-slate-200 hover:bg-slate-50 text-left touch-manipulation`}>
                          <Plus size={14} className="text-slate-400 flex-shrink-0"/>
                          <span className="flex-1 min-w-0 text-sm text-slate-700 truncate">{i.text}</span>
                          <span className="text-xs text-slate-400 flex-shrink-0">{i.card ? (i.card.due_date ? `Card · due ${isoToLabel(i.card.due_date)}` : "Card") : "Milestone"}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <HabitsCard habits={habits} addHabit={addHabit} deleteHabit={deleteHabit}
        dailyTasks={dailyTasks} saveDailyTasks={saveDailyTasks} viewDate={viewDate} isMobile={isMobile}/>
    </div>
  );
}

function HabitsCard({ habits, addHabit, deleteHabit, dailyTasks, saveDailyTasks, viewDate, isMobile }) {
  const [managing, setManaging] = useState(false);
  const doneIds = habitsDoneOn(dailyTasks, viewDate);
  const doneCount = habits.filter(h => doneIds.has(h.id)).length;
  const isFuture = viewDate > todayISO();

  const toggle = (habitId) => {
    const items = dailyTasks[viewDate]?.tasks || [];
    const next = doneIds.has(habitId)
      ? items.filter(t => t.habitId !== habitId)
      : [...items, { id: `habit-${habitId}`, habitId, status: "complete" }];
    saveDailyTasks({ ...dailyTasks, [viewDate]: { tasks: next } });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Repeat size={16} className="text-violet-500"/>
          <h3 className="font-bold text-slate-800">Daily Habits</h3>
          {habits.length > 0 && <span className="text-xs bg-violet-100 text-violet-600 font-semibold px-2 py-0.5 rounded-full">{doneCount}/{habits.length}</span>}
        </div>
        {habits.length > 0 && (
          <button onClick={() => setManaging(m => !m)} className={`p-1.5 rounded-lg transition-colors ${managing ? "bg-violet-100 text-violet-600" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"}`} title="Manage habits">
            <Settings size={15}/>
          </button>
        )}
      </div>
      {(managing || habits.length === 0) ? (
        <HabitManager habits={habits} onAdd={addHabit} onDelete={deleteHabit} onDone={habits.length > 0 ? () => setManaging(false) : null}/>
      ) : (
        <div className="space-y-2">
          {habits.map(habit => {
            const done = doneIds.has(habit.id);
            const streak = habitStreak(dailyTasks, habit.id, viewDate);
            return (
              <button key={habit.id} onClick={() => toggle(habit.id)} disabled={isFuture}
                className={`w-full flex items-center gap-3 px-3 ${isMobile?"py-3":"py-2.5"} rounded-lg border transition-all text-left touch-manipulation disabled:opacity-50 ${done ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-200 hover:border-violet-300 hover:bg-violet-50"}`}>
                <div className={`${isMobile?"w-7 h-7":"w-5 h-5"} rounded-md flex items-center justify-center flex-shrink-0 border-2 transition-all ${done ? "bg-emerald-500 border-emerald-500" : "border-slate-300 bg-white"}`}>
                  {done && <Check size={isMobile?15:12} className="text-white" strokeWidth={3}/>}
                </div>
                <span className={`flex-1 text-sm font-medium ${done ? "text-emerald-800" : "text-slate-700"}`}>{habit.name}</span>
                {streak > 0 && <span className="flex items-center gap-0.5 text-xs font-semibold text-amber-600"><Flame size={13}/>{streak}</span>}
              </button>
            );
          })}
          {isFuture && <p className="text-xs text-slate-400 text-center pt-1">Habits can be checked off on the day.</p>}
        </div>
      )}
    </div>
  );
}

function HabitManager({ habits, onAdd, onDelete, onDone }) {
  const [newHabit, setNewHabit]       = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const addHabit = async () => {
    const name = newHabit.trim();
    if (!name || habits.some(h => h.name.toLowerCase() === name.toLowerCase())) return;
    await onAdd(name); setNewHabit("");
  };
  return (
    <div>
      <p className="text-xs text-slate-400 mb-3">Habits repeat every day. Check them off here; they also show up in each day's mood details.</p>
      <div className="flex gap-2 mb-3">
        <input value={newHabit} onChange={e => setNewHabit(e.target.value)} onKeyDown={e => { if (e.key==="Enter") { e.preventDefault(); addHabit(); }}}
          placeholder="e.g. Morning walk, Read 10 pages" className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-violet-400 focus:outline-none" />
        <button onClick={addHabit} disabled={!newHabit.trim()} className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-40">Add</button>
      </div>
      {habits.length > 0 && (
        <div className="space-y-2">
          {habits.map(habit => (
            <div key={habit.id} className="flex items-center justify-between px-3 py-2.5 bg-slate-50 rounded-lg border border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-violet-400 flex-shrink-0"/>
                <span className="text-sm font-medium text-slate-700">{habit.name}</span>
              </div>
              {confirmDelete === habit.id ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-rose-600">Remove?</span>
                  <button onClick={() => { onDelete(habit.id); setConfirmDelete(null); }} className="text-xs px-2 py-1 bg-rose-600 text-white rounded font-semibold">Yes</button>
                  <button onClick={() => setConfirmDelete(null)} className="text-xs px-2 py-1 bg-slate-200 text-slate-600 rounded font-semibold">No</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(habit.id)} className="p-2 -m-2 text-slate-300 hover:text-rose-400" aria-label={`Remove ${habit.name}`}><X size={16}/></button>
              )}
            </div>
          ))}
        </div>
      )}
      {onDone && <button onClick={onDone} className="w-full mt-3 py-2 text-sm font-medium text-violet-600 hover:bg-violet-50 rounded-lg">Done</button>}
    </div>
  );
}

// Done cards completed before the current two-week bucket (which starts this week's Sunday) are archived.
const currentBucketStart = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return toISO(d); };
const cardDoneDate = (c) => c.completed_at ? toISO(new Date(c.completed_at)) : (c.due_date || (c.created_at ? toISO(new Date(c.created_at)) : todayISO()));
const isArchivedCard = (c, bucketStart) => c.status === "done" && cardDoneDate(c) < bucketStart;

function KanbanSection({ isMobile, kanbanCards, addKanbanCard, updateKanbanCard, deleteKanbanCard, goals, dailyTasks, links }) {
  const [newGoal, setNewGoal]           = useState("");
  const [editCardGoal, setEditCardGoal] = useState("");
  const goalOf = (card) => goals.find(g => g.id === card.goal_id);
  const goalSelect = (value, onChange, cls) => goals.length > 0 && (
    <select value={value} onChange={e => onChange(e.target.value)} aria-label="Goal" className={cls}>
      <option value="">No goal</option>
      {goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
    </select>
  );
  const [kanbanView, setKanbanView]   = useState("board");
  const [showAddCard, setShowAddCard] = useState(false);
  const [newTitle, setNewTitle]       = useState("");
  const [newDue, setNewDue]           = useState("");
  const [newStatus, setNewStatus]     = useState("todo");
  const [editingCard, setEditingCard] = useState(null);
  const [editCardTitle, setEditCardTitle] = useState("");
  const [editCardDue, setEditCardDue] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const [mobileColumn, setMobileColumn] = useState("todo");
  const [calStart, setCalStart]       = useState(currentBucketStart);
  const [calSelectedDay, setCalSelectedDay] = useState(null);

  const calDays14 = Array.from({ length: 14 }, (_, i) => addDaysISO(calStart, i));
  const calEnd = calDays14[13];
  const shiftCal = (weeks) => { setCalStart(addDaysISO(calStart, weeks * 7)); setCalSelectedDay(null); };
  const calPeriodCards = kanbanCards.filter(c => c.due_date && c.due_date >= calStart && c.due_date <= calEnd);
  const calDoneCount   = calPeriodCards.filter(c => c.status === "done").length;

  const bucketStart = currentBucketStart();
  const archivedCards = kanbanCards.filter(c => isArchivedCard(c, bucketStart))
    .sort((a,b) => cardDoneDate(b).localeCompare(cardDoneDate(a)));

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    await addKanbanCard({ title: newTitle.trim(), status: newStatus, due_date: newDue||null, goal_id: newGoal||null, completed_at: newStatus === "done" ? new Date().toISOString() : null });
    setNewTitle(""); setNewDue(""); setNewStatus("todo"); setNewGoal(""); setShowAddCard(false);
  };

  const moveCard = links.moveKanbanCard;

  const saveCardEdit = async (cardId) => {
    if (!editCardTitle.trim()) return;
    await updateKanbanCard(cardId, { title: editCardTitle.trim(), due_date: editCardDue || null, goal_id: editCardGoal || null });
    setEditingCard(null);
  };

  const dueBadge = (card) => {
    if (!card.due_date) return <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded">No due date</span>;
    const label = isoToLabel(card.due_date);
    if (card.status !== "done" && card.due_date < todayISO()) return <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-medium">Overdue · {label}</span>;
    return <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded">{label}</span>;
  };

  const renderCard = (card) => {
    const status = card.status;
    const nextStatus = status==="todo"?"inprogress":status==="inprogress"?"done":null;
    const prevStatus = status==="done"?"inprogress":status==="inprogress"?"todo":null;
    if (editingCard === card.id) return (
      <div key={card.id} className="bg-slate-50 rounded-lg p-3 border border-slate-100 space-y-2">
        <input value={editCardTitle} onChange={e => setEditCardTitle(e.target.value)} onKeyDown={e => e.key === "Enter" && saveCardEdit(card.id)}
          className="w-full px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:border-blue-500" placeholder="Card title" autoFocus/>
        <input type="date" value={editCardDue} onChange={e => setEditCardDue(e.target.value)} className="w-full px-2 py-1 text-sm border border-slate-200 rounded"/>
        {goalSelect(editCardGoal, setEditCardGoal, "w-full px-2 py-1 text-sm border border-slate-200 rounded bg-white")}
        <div className="flex gap-1">
          <button onClick={() => saveCardEdit(card.id)} className="flex-1 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 font-medium">Save</button>
          <button onClick={() => setEditingCard(null)} className="flex-1 py-1 text-xs bg-slate-200 text-slate-600 rounded hover:bg-slate-300">Cancel</button>
        </div>
      </div>
    );
    const goal = goalOf(card);
    const source = { type: "kanban", cardId: card.id };
    const planned = isPlannedOn(dailyTasks, todayISO(), source);
    return (
      <div key={card.id} className="bg-slate-50 rounded-lg p-3 border border-slate-100" style={goal ? { borderLeft: `3px solid ${goalHex(goal)}` } : undefined}>
        <div className="flex items-start justify-between gap-1 mb-2">
          <span className={`text-sm font-medium leading-tight flex-1 ${status==="done"?"text-slate-500 line-through":"text-slate-800"}`}>{card.title}</span>
          <div className="flex gap-0.5 flex-shrink-0">
            <button onClick={() => { setEditingCard(card.id); setEditCardTitle(card.title); setEditCardDue(card.due_date || ""); setEditCardGoal(goalOf(card) ? card.goal_id : ""); }}
              className={`${isMobile?"p-2":"p-0.5"} text-slate-300 hover:text-blue-600 touch-manipulation`} title="Edit card"><Edit2 size={14}/></button>
            <button onClick={() => deleteKanbanCard(card.id)}
              className={`${isMobile?"p-2":"p-0.5"} text-slate-300 hover:text-red-400 touch-manipulation`} title="Delete card"><Trash2 size={14}/></button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">{dueBadge(card)}<GoalChip goal={goal}/></div>
        <div className="flex gap-1 mt-2">
          {status !== "done" && <PlanTodayButton planned={planned} onClick={() => planned ? links.unplanSource(source) : links.planSource(source, card.title)} className={`px-2 ${isMobile?"py-2":"py-1"}`}/>}
          {prevStatus && <button onClick={() => moveCard(card, prevStatus)} className={`flex-1 ${isMobile?"py-2":"py-1"} text-xs bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-500 touch-manipulation`}>← Back</button>}
          {nextStatus && <button onClick={() => moveCard(card, nextStatus)} className={`flex-1 ${isMobile?"py-2":"py-1"} text-xs bg-white border border-slate-200 rounded hover:bg-blue-50 text-blue-600 font-medium touch-manipulation`}>Move →</button>}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {kanbanView === "board" && (
          <button onClick={()=>setShowAddCard(!showAddCard)} className="flex-1 py-2.5 bg-slate-800 text-white rounded-xl hover:bg-slate-900 flex items-center justify-center gap-2 text-sm font-medium">
            <Plus size={16}/> Add Card
          </button>
        )}
        {kanbanView === "calendar" && <p className="flex-1 self-center text-sm font-semibold text-slate-700">Due dates · 2 weeks</p>}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {[{id:"board",icon:CheckSquare,label:"Board"},{id:"calendar",icon:Calendar,label:"Calendar"}].map(({id,icon:Icon,label}) => (
            <button key={id} onClick={() => setKanbanView(id)} aria-label={label} title={label}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-sm font-medium transition-all ${kanbanView===id?"bg-white shadow text-slate-900":"text-slate-500"}`}>
              <Icon size={16}/>{!isMobile && label}
            </button>
          ))}
        </div>
      </div>

      {kanbanView === "calendar" && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <button onClick={() => shiftCal(-2)} className="p-2 hover:bg-slate-100 rounded-lg"><ChevronLeft size={16} className="text-slate-500"/></button>
            <div className="text-center">
              <p className="text-sm font-bold text-slate-800">{isoToLabel(calStart)} – {isoToLabel(calEnd)}</p>
              <p className="text-xs text-slate-400 mt-0.5">{calPeriodCards.length} cards due · <span className="text-emerald-600 font-medium">{calDoneCount} done</span></p>
            </div>
            <button onClick={() => shiftCal(2)} className="p-2 hover:bg-slate-100 rounded-lg"><ChevronRight size={16} className="text-slate-500"/></button>
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
              <div key={d} className="text-center text-xs font-semibold text-slate-400 py-1">{d}</div>
            ))}
            {calDays14.map(iso => {
              const dayCards = kanbanCards.filter(c => c.due_date === iso);
              const doneCards = dayCards.filter(c => c.status === "done");
              const overdueCards = dayCards.filter(c => c.status !== "done" && iso < todayISO());
              const isToday = iso === todayISO();
              const isSelected = iso === calSelectedDay;
              return (
                <button key={iso} onClick={() => setCalSelectedDay(isSelected ? null : iso)}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center text-xs transition-all border
                    ${isSelected ? "bg-blue-600 text-white border-blue-600"
                      : isToday ? "border-blue-300 bg-blue-50"
                      : dayCards.length > 0 ? "border-slate-200 bg-slate-50 hover:bg-slate-100"
                      : "border-transparent hover:bg-slate-50"}`}>
                  <span className={`font-semibold ${isSelected?"text-white":isToday?"text-blue-600":"text-slate-600"}`}>
                    {new Date(iso+"T00:00:00").getDate()}
                  </span>
                  {dayCards.length > 0 && (
                    <span className={`text-[9px] leading-none mt-0.5 font-medium ${isSelected?"text-white":overdueCards.length>0?"text-red-500":doneCards.length===dayCards.length?"text-emerald-600":"text-blue-500"}`}>
                      {doneCards.length}/{dayCards.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {calSelectedDay && (() => {
            const dayCards = kanbanCards.filter(c => c.due_date === calSelectedDay);
            if (dayCards.length === 0) return <p className="text-xs text-slate-400 text-center py-2">No cards due on {isoToLabel(calSelectedDay)}</p>;
            return (
              <div className="space-y-1.5 border-t border-slate-100 pt-3">
                <p className="text-xs font-semibold text-slate-500 mb-2">Cards due {isoToLabel(calSelectedDay)}</p>
                {dayCards.map(card => (
                  <div key={card.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${KANBAN_COLORS[card.status]}`}>{KANBAN_LABELS[card.status]}</span>
                    <span className="text-sm text-slate-700 flex-1">{card.title}</span>
                    <GoalChip goal={goalOf(card)}/>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {kanbanView === "board" && <>
      {showAddCard && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-800 mb-4">New Card</h3>
          <div className="space-y-3">
            <input value={newTitle} onChange={e=>setNewTitle(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAdd()} placeholder="Card title" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"/>
            <div className="grid grid-cols-2 gap-2">
              <select value={newStatus} onChange={e=>setNewStatus(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
                {KANBAN_STATUSES.map(s=><option key={s} value={s}>{KANBAN_LABELS[s]}</option>)}
              </select>
              <input type="date" value={newDue} onChange={e=>setNewDue(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm"/>
            </div>
            {goalSelect(newGoal, setNewGoal, "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white")}
            <div className="flex gap-2">
              <button onClick={handleAdd} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">Add Card</button>
              <button onClick={()=>setShowAddCard(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm hover:bg-slate-200">Cancel</button>
            </div>
          </div>
        </div>
      )}
      {isMobile && (
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {KANBAN_STATUSES.map(status => {
            const count = kanbanCards.filter(c => c.status===status && !isArchivedCard(c, bucketStart)).length;
            return (
              <button key={status} onClick={() => setMobileColumn(status)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 transition-all ${mobileColumn===status?"bg-white shadow text-slate-900":"text-slate-500"}`}>
                {KANBAN_LABELS[status]}
                <span className={`text-xs font-bold px-1.5 rounded-full ${mobileColumn===status ? KANBAN_COLORS[status] : "bg-slate-200 text-slate-500"}`}>{count}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className={`grid ${isMobile?"grid-cols-1":"grid-cols-3"} gap-4`}>
        {KANBAN_STATUSES.filter(status => !isMobile || status === mobileColumn).map(status => {
          const cards = kanbanCards.filter(c => c.status===status && !isArchivedCard(c, bucketStart));
          return (
            <div key={status} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {!isMobile && (
                <div className={`px-4 py-3 flex items-center justify-between ${KANBAN_COLORS[status]}`}>
                  <span className="font-semibold text-sm">{KANBAN_LABELS[status]}</span>
                  <span className="text-xs font-bold bg-white bg-opacity-60 px-2 py-0.5 rounded-full">{cards.length}</span>
                </div>
              )}
              <div className="p-3 space-y-2 min-h-[80px]">
                {cards.length===0 && <p className="text-xs text-slate-400 text-center py-3">{status === "done" ? "Nothing done in this two-week window yet" : "No cards"}</p>}
                {cards.map(renderCard)}
              </div>
            </div>
          );
        })}
      </div>
      {archivedCards.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <button onClick={() => setShowArchive(a => !a)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 text-left">
            <span className="text-sm font-semibold text-slate-600">Archived done cards <span className="ml-1 text-xs font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{archivedCards.length}</span></span>
            {showArchive ? <ChevronUp size={16} className="text-slate-400"/> : <ChevronDown size={16} className="text-slate-400"/>}
          </button>
          {showArchive && (
            <div className="border-t border-slate-100 px-4 py-2 divide-y divide-slate-100">
              {groupByMonth(archivedCards, c => new Date(cardDoneDate(c) + "T00:00:00")).map(group => (
                <div key={group.key} className="py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">{group.label}</p>
                  {group.items.map(card => (
                    <div key={card.id} className="flex items-center gap-2 py-1.5">
                      <Check size={13} className="text-emerald-500 flex-shrink-0"/>
                      <span className="flex-1 text-sm text-slate-600 truncate">{card.title}</span>
                      <span className="text-xs text-slate-400 flex-shrink-0">{isoToLabel(cardDoneDate(card))}</span>
                      <button onClick={() => moveCard(card, "inprogress")} className="text-xs text-blue-500 hover:text-blue-700 font-medium flex-shrink-0 px-2 py-2">Reopen</button>
                      <button onClick={() => deleteKanbanCard(card.id)} className="p-2 -mr-2 text-slate-300 hover:text-red-400 flex-shrink-0" title="Delete card"><Trash2 size={15}/></button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      </>}
    </div>
  );
}

// Each goal picks how its progress is tracked; milestones is the only type so far.
// Kanban cards linked to the goal count as steps alongside its milestones.
const GOAL_TRACKING_TYPES = [
  { id: "milestones", label: "Milestones checklist" },
];
const goalProgress = (g, kanbanCards = []) => {
  const ms = g.milestones || [];
  const cards = kanbanCards.filter(c => c.goal_id === g.id);
  const msDone = ms.filter(m => m.done).length, cardsDone = cards.filter(c => c.status === "done").length;
  const done = msDone + cardsDone, total = ms.length + cards.length;
  return { done, total, pct: total ? Math.round(done / total * 100) : 0, complete: total > 0 && done === total, msDone, msTotal: ms.length, cardsDone, cardsTotal: cards.length, cards };
};
const goalProgressLabel = (p) => !p.total ? "No milestones yet"
  : [p.msTotal ? `${p.msDone} of ${p.msTotal} milestones` : null, p.cardsTotal ? `${p.cardsDone} of ${p.cardsTotal} cards` : null].filter(Boolean).join(" · ");
const newMilestone = (text) => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`, text, done: false });

function GoalsSection({ goals, addGoal, updateGoal, deleteGoal, kanbanCards, dailyTasks, links }) {
  const [showForm, setShowForm]     = useState(false);
  const [editGoal, setEditGoal]     = useState(null);
  const [title, setTitle]           = useState("");
  const [desc, setDesc]             = useState("");
  const [color, setColor]           = useState("blue");
  const [trackingType, setTrackingType] = useState("milestones");
  const [milestones, setMilestones] = useState([]);
  const [milestoneInput, setMilestoneInput] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [quickAdd, setQuickAdd]     = useState({});

  const openNew  = () => { setTitle(""); setDesc(""); setColor("blue"); setTrackingType("milestones"); setMilestones([]); setMilestoneInput(""); setEditGoal(null); setShowForm(true); };
  const openEdit = (g) => { setTitle(g.title); setDesc(g.description||""); setColor(g.color); setTrackingType(g.tracking_type || "milestones"); setMilestones((g.milestones || []).map(m => ({ ...m }))); setMilestoneInput(""); setEditGoal(g); setShowForm(true); };
  const cancel   = () => { setShowForm(false); setEditGoal(null); };

  const addFormMilestone = () => {
    const text = milestoneInput.trim();
    if (!text) return;
    setMilestones([...milestones, newMilestone(text)]);
    setMilestoneInput("");
  };

  const save = async () => {
    if (!title.trim()) return;
    // Keep a milestone typed but not yet added with Enter
    const finalMilestones = milestoneInput.trim() ? [...milestones, newMilestone(milestoneInput.trim())] : milestones;
    const fields = { title: title.trim(), description: desc.trim(), color, tracking_type: trackingType, milestones: finalMilestones.filter(m => m.text.trim()) };
    if (editGoal) await updateGoal(editGoal.id, fields);
    else await addGoal(fields);
    cancel();
  };

  const toggleMilestone = (g, m) => links.setSourceDone({ type: "milestone", goalId: g.id, milestoneId: m.id }, !m.done);
  const quickAddMilestone = (g) => {
    const text = (quickAdd[g.id] || "").trim();
    if (!text) return;
    updateGoal(g.id, { milestones: [...(g.milestones || []), newMilestone(text)] });
    setQuickAdd(q => ({ ...q, [g.id]: "" }));
  };

  const sortedGoals = [...goals].sort((a,b) => Number(goalProgress(a, kanbanCards).complete) - Number(goalProgress(b, kanbanCards).complete));

  return (
    <div className="space-y-4">
      <button onClick={openNew} className="w-full py-2.5 bg-slate-800 text-white rounded-xl hover:bg-slate-900 flex items-center justify-center gap-2 text-sm font-medium">
        <Plus size={16}/> Create Goal
      </button>
      {showForm && (
        <Sheet title={editGoal ? "Edit Goal" : "New Goal"} onClose={cancel} closeOnBackdrop={false}>
          <div className="space-y-4">
            <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Goal title" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"/>
            <textarea value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Description (optional)" rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none"/>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Track progress by</label>
              <select value={trackingType} onChange={e => setTrackingType(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
                {GOAL_TRACKING_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            {trackingType === "milestones" && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Milestones</label>
                <div className="space-y-1.5 mb-2">
                  {milestones.map((m, i) => (
                    <div key={m.id} className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 w-4 text-right">{i+1}.</span>
                      <input value={m.text} onChange={e => setMilestones(milestones.map(x => x.id === m.id ? { ...x, text: e.target.value } : x))}
                        className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm"/>
                      <button onClick={() => setMilestones(milestones.filter(x => x.id !== m.id))} className="p-2 text-slate-300 hover:text-red-400" aria-label="Remove milestone"><X size={16}/></button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={milestoneInput} onChange={e => setMilestoneInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addFormMilestone(); } }}
                    placeholder="Add a milestone, then Enter" className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"/>
                  <button onClick={addFormMilestone} disabled={!milestoneInput.trim()} className="px-3 py-2 bg-slate-800 text-white rounded-lg text-sm disabled:opacity-40"><Plus size={16}/></button>
                </div>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-slate-600 mb-2">Color</p>
              <div className="flex gap-2 flex-wrap">
                {GOAL_COLORS.map(c => (
                  <button key={c.id} onClick={()=>setColor(c.id)} className={`w-7 h-7 rounded-full border-2 transition-all ${color===c.id?"border-slate-800 scale-110":"border-transparent hover:scale-105"}`} style={{background:c.hex}} title={c.label}/>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={save} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">{editGoal?"Update":"Create"} Goal</button>
              <button onClick={cancel} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm hover:bg-slate-200">Cancel</button>
            </div>
          </div>
        </Sheet>
      )}
      {goals.length===0 && !showForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <Flag size={32} className="text-slate-300 mx-auto mb-3"/>
          <p className="text-slate-500 text-sm">No goals yet. Create one and break it into milestones.</p>
        </div>
      )}
      {sortedGoals.map(g => {
        const gc = GOAL_COLORS.find(c=>c.id===g.color)?.hex || "#666";
        const prog = goalProgress(g, kanbanCards);
        const today = todayISO();
        return (
          <div key={g.id} className={`bg-white rounded-xl border border-slate-200 overflow-hidden ${prog.complete ? "opacity-75" : ""}`}>
            <div className="h-1.5" style={{background:gc}}/>
            <div className="p-5">
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{background:gc}}/>
                  <h3 className="font-bold text-slate-800 truncate">{g.title}</h3>
                  {prog.complete && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0">Complete</span>}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={()=>openEdit(g)} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg" aria-label="Edit goal"><Edit2 size={15}/></button>
                  {confirmDelete===g.id
                    ? <><button onClick={()=>{ deleteGoal(g.id); setConfirmDelete(null); }} className="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600">Delete</button><button onClick={()=>setConfirmDelete(null)} className="text-xs px-2 py-1 bg-slate-100 rounded">Cancel</button></>
                    : <button onClick={()=>setConfirmDelete(g.id)} className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-lg" aria-label="Delete goal"><Trash2 size={15}/></button>
                  }
                </div>
              </div>
              {g.description && <p className="text-sm text-slate-500 ml-5">{g.description}</p>}
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium text-slate-500">{goalProgressLabel(prog)}</span>
                  <span className="font-bold text-slate-700">{prog.pct}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{width:`${prog.pct}%`,background:gc}}/></div>
              </div>
              <div className="mt-3 space-y-1">
                {(g.milestones || []).map(m => {
                  const source = { type: "milestone", goalId: g.id, milestoneId: m.id };
                  const planned = isPlannedOn(dailyTasks, today, source);
                  return (
                    <div key={m.id} className="flex items-center gap-1">
                      <button onClick={() => toggleMilestone(g, m)} className="flex-1 min-w-0 flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-left touch-manipulation">
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border-2 transition-all ${m.done ? "border-transparent" : "border-slate-300 bg-white"}`} style={m.done ? {background:gc} : undefined}>
                          {m.done && <Check size={12} className="text-white" strokeWidth={3}/>}
                        </div>
                        <span className={`flex-1 text-sm ${m.done ? "line-through text-slate-400" : "text-slate-700"}`}>{m.text}</span>
                        {m.done && m.done_at && <span className="text-xs text-slate-400">{isoToLabel(toISO(new Date(m.done_at)))}</span>}
                      </button>
                      {!m.done && <PlanTodayButton planned={planned} onClick={() => planned ? links.unplanSource(source) : links.planSource(source, m.text)} className="px-2 py-1.5 flex-shrink-0"/>}
                    </div>
                  );
                })}
              </div>
              {prog.cards.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-2 mb-1">Kanban cards</p>
                  {prog.cards.map(c => {
                    const cardDone = c.status === "done";
                    const source = { type: "kanban", cardId: c.id };
                    const planned = isPlannedOn(dailyTasks, today, source);
                    return (
                      <div key={c.id} className="flex items-center gap-1">
                        <button onClick={() => links.setSourceDone(source, !cardDone)} className="flex-1 min-w-0 flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-left touch-manipulation">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all ${cardDone ? "border-transparent" : "border-slate-300 bg-white"}`} style={cardDone ? {background:gc} : undefined}>
                            {cardDone && <Check size={12} className="text-white" strokeWidth={3}/>}
                          </div>
                          <span className={`flex-1 min-w-0 text-sm ${cardDone ? "line-through text-slate-400" : "text-slate-700"}`}>{c.title}</span>
                          {cardDone
                            ? c.completed_at && <span className="text-xs text-slate-400">{isoToLabel(stampISO(c.completed_at))}</span>
                            : <span className={`text-xs flex-shrink-0 ${c.due_date && c.due_date < today ? "text-red-500 font-medium" : "text-slate-400"}`}>{c.due_date ? `${c.due_date < today ? "Overdue" : "Due"} ${isoToLabel(c.due_date)}` : KANBAN_LABELS[c.status]}</span>}
                        </button>
                        {!cardDone && <PlanTodayButton planned={planned} onClick={() => planned ? links.unplanSource(source) : links.planSource(source, c.title)} className="px-2 py-1.5 flex-shrink-0"/>}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-2 mt-2">
                <input value={quickAdd[g.id] || ""} onChange={e => setQuickAdd(q => ({ ...q, [g.id]: e.target.value }))} onKeyDown={e => e.key === "Enter" && quickAddMilestone(g)}
                  placeholder="Add milestone" className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm"/>
                <button onClick={() => quickAddMilestone(g)} disabled={!(quickAdd[g.id] || "").trim()} className="px-2.5 py-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 disabled:opacity-40"><Plus size={15}/></button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

//
// INSIGHTS TAB
//
const INSIGHT_RANGES = [{ id: "7", label: "7 days" }, { id: "30", label: "30 days" }, { id: "90", label: "90 days" }, { id: "all", label: "All time" }];
const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const WEEKDAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const WEEK_ORDER = [1,2,3,4,5,6,0];
const avgOf = (xs) => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
const pctOf = (n, d) => d ? Math.round(n / d * 100) : null;
const daySpan = (from, to) => Math.round((new Date(to + "T00:00:00") - new Date(from + "T00:00:00")) / 86400000) + 1;
const fmtSigned = (n, digits = 1) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(digits)}`;

// A comparison is only shown once both sides have this many check-ins
const MIN_SIDE = 3;
// Mean mood on days where test() is true vs false; test() returns null to leave a day out.
const splitAvg = (days, test, metric = "mood") => {
  const yes = [], no = [];
  days.forEach(d => { if (!d.mood) return; const t = test(d); if (t === null || t === undefined) return; (t ? yes : no).push(d.mood[metric]); });
  if (yes.length < MIN_SIDE || no.length < MIN_SIDE) return null;
  return { yes: avgOf(yes), no: avgOf(no), delta: avgOf(yes) - avgOf(no) };
};

// One record per calendar day joining mood, tasks, habits and workouts
const buildDays = (from, to, { moodByDate, dailyTasks, workoutsByDate, habits, goalSteps = {} }) => {
  const days = [];
  for (let iso = from; iso <= to; iso = addDaysISO(iso, 1)) {
    const tasks = tasksOn(dailyTasks, iso);
    days.push({
      iso,
      weekday: new Date(iso + "T00:00:00").getDay(),
      mood: moodByDate[iso] || null,
      tasks: { total: tasks.length, done: tasks.filter(t => t.status === "complete").length, skipped: tasks.filter(t => t.status === "skipped").length },
      habitsDone: habitsDoneOn(dailyTasks, iso),
      activeHabits: habits.filter(h => h.created <= iso),
      workouts: workoutsByDate[iso] || 0,
      goalSteps: goalSteps[iso] || 0,
    });
  }
  return days;
};

const summarize = (days) => {
  const moods = days.filter(d => d.mood);
  const metricAvg = (k) => avgOf(moods.map(d => d.mood[k]));
  const taskTotal = days.reduce((s, d) => s + d.tasks.total, 0);
  const taskDone  = days.reduce((s, d) => s + d.tasks.done, 0);
  const habitPossible = days.reduce((s, d) => s + d.activeHabits.length, 0);
  const habitDone = days.reduce((s, d) => s + d.activeHabits.filter(h => d.habitsDone.has(h.id)).length, 0);
  return {
    checkIns: moods.length,
    mood: metricAvg("mood"), energy: metricAvg("energy"), stress: metricAvg("stress"), sleep: metricAvg("sleep"),
    taskTotal, taskDone, taskSkipped: days.reduce((s, d) => s + d.tasks.skipped, 0), completion: pctOf(taskDone, taskTotal),
    habitRate: pctOf(habitDone, habitPossible),
    workouts: days.reduce((s, d) => s + d.workouts, 0),
  };
};

// Plain-language patterns, strongest first. Each needs MIN_SIDE check-ins on both sides and a gap of at least half a point.
const buildFindings = (days, habits, tagRows) => {
  const out = [];
  const add = (key, delta, text) => { if (Math.abs(delta) >= 0.5) out.push({ key, delta, text }); };
  const b = (n) => <strong className="text-slate-900">{n.toFixed(1)}</strong>;

  const tasks = splitAvg(days, d => d.tasks.total ? d.tasks.done / d.tasks.total >= 0.8 : null);
  if (tasks) add("tasks", tasks.delta, <>Your mood averages {b(tasks.yes)} on days you finish most of your tasks, vs {b(tasks.no)} on days you don't.</>);

  const workout = splitAvg(days, d => d.workouts > 0);
  if (workout) add("workout", workout.delta, <>Mood averages {b(workout.yes)} on workout days and {b(workout.no)} on rest days.</>);

  const goalDays = splitAvg(days, d => d.goalSteps > 0);
  if (goalDays) add("goals", goalDays.delta, <>On days you move a goal forward, mood averages {b(goalDays.yes)}, vs {b(goalDays.no)} on other days.</>);

  const sleep = splitAvg(days, d => d.mood.sleep >= 6 ? true : d.mood.sleep <= 4 ? false : null);
  if (sleep) add("sleep", sleep.delta, <>When you rate sleep 6 or higher, mood averages {b(sleep.yes)}, vs {b(sleep.no)} when it's 4 or lower.</>);

  habits.forEach(h => {
    const r = splitAvg(days, d => d.iso >= h.created ? d.habitsDone.has(h.id) : null);
    if (r) add(`habit-${h.id}`, r.delta, <>On days you do <strong className="text-slate-900">{h.name}</strong>, mood averages {b(r.yes)}, vs {b(r.no)} when you skip it.</>);
  });

  const byWeekday = WEEKDAYS.map((_, wd) => avgOf(days.filter(d => d.mood && d.weekday === wd).map(d => d.mood.mood)));
  const counts = WEEKDAYS.map((_, wd) => days.filter(d => d.mood && d.weekday === wd).length);
  const ranked = WEEKDAYS.map((_, wd) => wd).filter(wd => counts[wd] >= MIN_SIDE).sort((x, y) => byWeekday[y] - byWeekday[x]);
  if (ranked.length >= 4) {
    const best = ranked[0], worst = ranked[ranked.length - 1];
    add("weekday", byWeekday[best] - byWeekday[worst], <>{WEEKDAY_NAMES[best]}s tend to be your best days (mood {b(byWeekday[best])}) and {WEEKDAY_NAMES[worst]}s the toughest ({b(byWeekday[worst])}).</>);
  }

  const lift = tagRows.find(t => t.delta > 0), drag = [...tagRows].reverse().find(t => t.delta < 0);
  if (lift) add(`tag-${lift.tag}`, lift.delta, <>Days tagged <strong className="text-slate-900">{lift.tag}</strong> average {b(lift.avg)}, {fmtSigned(lift.delta)} above your usual mood.</>);
  if (drag) add(`tag-${drag.tag}`, drag.delta, <>Days tagged <strong className="text-slate-900">{drag.tag}</strong> average {b(drag.avg)}, {fmtSigned(drag.delta)} below your usual mood.</>);

  return out.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)).slice(0, 4);
};

function DeltaBadge({ value, unit = "", digits = 1, label }) {
  if (value === null || value === undefined || isNaN(value)) return <span className="text-xs text-slate-400">{label ? `— ${label}` : ""}</span>;
  const up = value > 0, flat = Math.abs(value) < Math.pow(10, -digits) / 2;
  const Icon = flat ? null : up ? ChevronUp : ChevronDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${flat ? "text-slate-400" : up ? "text-emerald-600" : "text-rose-600"}`}>
      {Icon && <Icon size={12}/>}{flat ? "no change" : `${Math.abs(value).toFixed(digits)}${unit}`}
      {label && <span className="text-slate-400 font-normal ml-1">{label}</span>}
    </span>
  );
}

// Mood-metric line over task-completion bars, sharing one date axis and one hover readout
function TrendsCard({ days, isMobile }) {
  const [metricKey, setMetricKey] = useState("mood");
  const [hover, setHover] = useState(null);
  const plotRef = useRef(null);
  const metric = MOOD_METRICS.find(m => m.key === metricKey);

  // Long ranges are averaged by week so the chart stays readable
  const weekly = days.length > 92;
  const size = weekly ? 7 : 1;
  const buckets = [];
  for (let i = 0; i < days.length; i += size) {
    const slice = days.slice(i, i + size);
    const moods = slice.filter(d => d.mood);
    const total = slice.reduce((s, d) => s + d.tasks.total, 0), done = slice.reduce((s, d) => s + d.tasks.done, 0);
    buckets.push({ from: slice[0].iso, to: slice[slice.length - 1].iso, value: avgOf(moods.map(d => d.mood[metricKey])), total, done, rate: pctOf(done, total) });
  }
  const n = buckets.length;
  const xPct = (i) => (i + 0.5) / n * 100;
  const yPct = (v) => (8 - v) / 7 * 100;
  const pts = buckets.map((b, i) => b.value === null ? null : { i, x: xPct(i), y: yPct(b.value), v: b.value }).filter(Boolean);
  const hasTasks = buckets.some(b => b.total > 0);
  const labelOf = (b) => weekly ? `Week of ${isoToLabel(b.from)}` : isoToLong(b.from);

  const onMove = (e) => {
    const r = plotRef.current?.getBoundingClientRect();
    if (!r) return;
    const i = Math.min(n - 1, Math.max(0, Math.floor((e.clientX - r.left) / r.width * n)));
    setHover(i);
  };
  const hb = hover !== null ? buckets[hover] : null;
  const tipAlign = hover === null ? "" : xPct(hover) < 20 ? "translate-x-0" : xPct(hover) > 80 ? "-translate-x-full" : "-translate-x-1/2";

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h3 className="font-bold text-slate-800 flex items-center gap-2"><TrendingUp size={16} className="text-indigo-500"/> Trends</h3>
        <div className="flex gap-1">
          {MOOD_METRICS.map(m => (
            <button key={m.key} onClick={() => setMetricKey(m.key)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${metricKey === m.key ? "bg-indigo-600 text-white" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"}`}>{m.label}</button>
          ))}
        </div>
      </div>

      <div className="relative select-none" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
        {/* Metric line, 1–8 scale */}
        <p className="text-xs text-slate-400 mb-1">{metric.label}{metric.inverted ? " (lower is better)" : ""}{weekly ? " · weekly average" : ""}</p>
        <div className="flex">
          <div className="w-6 flex flex-col justify-between text-[10px] text-slate-400 text-right pr-1.5" style={{ height: isMobile ? 110 : 140 }}><span>8</span><span>4</span><span>1</span></div>
          <div ref={plotRef} className="flex-1 relative" style={{ height: isMobile ? 110 : 140 }}>
            {[8, 6, 4, 2].map(v => <div key={v} className="absolute left-0 right-0 border-t border-slate-100" style={{ top: `${yPct(v)}%` }}/>)}
            <div className="absolute left-0 right-0 bottom-0 border-t border-slate-200"/>
            {pts.length === 0 && <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">No check-ins in this range.</p>}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ overflow: "visible" }}>
              <defs>
                <linearGradient id="trendSpectrum" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="100">
                  {[8,7,6,5,4,3,2,1].map((v, i) => <stop key={v} offset={`${(i / 7) * 100}%`} stopColor={metricColors(metric, v).hex}/>)}
                </linearGradient>
              </defs>
              {pts.length > 1 && <polyline points={pts.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="url(#trendSpectrum)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>}
            </svg>
            {pts.length <= 45 && pts.map(p => (
              <div key={p.i} className={`absolute rounded-full ${metricColors(metric, p.v).bg} ${hover === p.i ? "w-3 h-3" : "w-2 h-2"}`}
                style={{ left: `${p.x}%`, top: `${p.y}%`, transform: "translate(-50%,-50%)", boxShadow: "0 0 0 2px #0e1630" }}/>
            ))}
            {hover !== null && <div className="absolute top-0 bottom-0 border-l border-slate-400/60 pointer-events-none" style={{ left: `${xPct(hover)}%` }}/>}
          </div>
        </div>

        {/* Task completion bars on the same date axis */}
        {hasTasks && (
          <>
            <p className="text-xs text-slate-400 mt-4 mb-1">Tasks completed</p>
            <div className="flex">
              <div className="w-6 flex flex-col justify-between text-[10px] text-slate-400 text-right pr-1.5 h-12"><span>100%</span><span></span></div>
              <div className="flex-1 relative h-12">
                <div className="absolute inset-0 flex items-end" style={{ gap: n > 60 ? 1 : 2 }}>
                  {buckets.map((b, i) => (
                    <div key={i} className="flex-1 h-full flex items-end">
                      {b.total > 0
                        ? <div className={`w-full bg-emerald-500 rounded-t-sm ${hover !== null && hover !== i ? "opacity-60" : ""}`} style={{ height: `${Math.max(b.rate, 4)}%` }}/>
                        : <div className="w-full h-px bg-slate-200"/>}
                    </div>
                  ))}
                </div>
                {hover !== null && <div className="absolute top-0 bottom-0 border-l border-slate-400/60 pointer-events-none" style={{ left: `${xPct(hover)}%` }}/>}
              </div>
            </div>
          </>
        )}

        <div className="flex justify-between text-[11px] text-slate-400 mt-2 ml-6">
          <span>{isoToLabel(days[0].iso)}</span>
          <span>{isoToLabel(days[days.length - 1].iso)}</span>
        </div>

        {hb && (
          <div className={`absolute top-5 z-10 pointer-events-none ${tipAlign}`} style={{ left: `calc(1.5rem + (100% - 1.5rem) * ${xPct(hover) / 100})` }}>
            <div className="bg-slate-50 border border-slate-300 rounded-lg shadow-lg px-3 py-2 text-xs whitespace-nowrap">
              <p className="font-semibold text-slate-800 mb-0.5">{labelOf(hb)}</p>
              <p className="text-slate-500">{metric.label}: <span className="text-slate-800 font-semibold">{hb.value === null ? "no check-in" : hb.value.toFixed(weekly ? 1 : 0)}</span></p>
              <p className="text-slate-500">Tasks: <span className="text-slate-800 font-semibold">{hb.total ? `${hb.done}/${hb.total}` : "none"}</span></p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InsightsTab({ session, isMobile, dailyTasks, kanbanCards, goals, habits }) {
  const [moodEntries, setMoodEntries] = useState([]);
  const [workouts, setWorkouts]       = useState([]);
  const [loaded, setLoaded]           = useState(false);
  const [range, setRange]             = useState("30");
  const uid = session?.user?.id;

  useEffect(() => {
    Promise.all([
      supabase.from("mood_entries").select("*").eq("user_id", uid).order("date"),
      supabase.from("workouts").select("date,type").eq("user_id", uid),
    ]).then(([m, w]) => {
      if (m.data) setMoodEntries(m.data);
      if (w.data) setWorkouts(w.data);
      setLoaded(true);
    });
  }, []);

  const today = todayISO();
  const moodByDate = {};
  moodEntries.forEach(e => { moodByDate[e.date] = e; });
  const workoutsByDate = {};
  workouts.forEach(w => { const d = parseWorkoutDate(w.date); if (isValidDate(d)) { const iso = toISO(d); workoutsByDate[iso] = (workoutsByDate[iso] || 0) + 1; } });
  const habitList = habits.map(h => ({ ...h, created: h.created_at ? toISO(new Date(h.created_at)) : today }));
  // Steps toward a goal by the day they were finished: milestones plus Kanban cards linked to a goal
  const goalStepDates = goals.map(g => ({ id: g.id, dates: [
    ...(g.milestones || []).filter(m => m.done && m.done_at).map(m => stampISO(m.done_at)),
    ...kanbanCards.filter(c => c.goal_id === g.id && c.status === "done" && c.completed_at).map(c => stampISO(c.completed_at)),
  ] }));
  const goalSteps = {};
  goalStepDates.forEach(g => g.dates.forEach(d => { goalSteps[d] = (goalSteps[d] || 0) + 1; }));
  const sources = { moodByDate, dailyTasks, workoutsByDate, habits: habitList, goalSteps };

  // "All time" starts at the earliest thing logged, capped at three years
  const earliest = [
    ...Object.keys(moodByDate),
    ...Object.keys(workoutsByDate),
    ...Object.keys(dailyTasks).filter(d => (dailyTasks[d]?.tasks || []).length),
  ].filter(d => d <= today).sort()[0] || today;
  const from = range === "all" ? (earliest < addDaysISO(today, -1095) ? addDaysISO(today, -1095) : earliest) : addDaysISO(today, -(parseInt(range) - 1));
  const span = daySpan(from, today);
  const days = buildDays(from, today, sources);
  const cur = summarize(days);
  const prev = range === "all" ? null : summarize(buildDays(addDaysISO(from, -span), addDaysISO(from, -1), sources));
  const prevLabel = range === "all" ? "" : `vs prev ${span}d`;
  const diff = (k) => prev && cur[k] !== null && prev[k] !== null ? cur[k] - prev[k] : null;

  // Tags: compare each tag's average with the overall average so rare one-off tags can't top the list
  const tagAgg = {};
  days.forEach(d => (d.mood?.tags || []).forEach(tag => { (tagAgg[tag] ||= []).push(d.mood.mood); }));
  const tagRows = Object.entries(tagAgg)
    .filter(([, v]) => v.length >= MIN_SIDE)
    .map(([tag, v]) => ({ tag, count: v.length, avg: avgOf(v), delta: avgOf(v) - cur.mood }))
    .sort((x, y) => y.delta - x.delta);
  const lifts = tagRows.filter(t => t.delta >= 0.2).slice(0, 5);
  const drags = tagRows.filter(t => t.delta <= -0.2).reverse().slice(0, 5);
  const mostUsed = Object.entries(tagAgg).map(([tag, v]) => ({ tag, count: v.length })).sort((x, y) => y.count - x.count).slice(0, 10);

  const findings = buildFindings(days, habitList, tagRows);

  // Weekly rhythm
  const rhythm = WEEK_ORDER.map(wd => {
    const ds = days.filter(d => d.weekday === wd);
    const moods = ds.filter(d => d.mood).map(d => d.mood.mood);
    const total = ds.reduce((s, d) => s + d.tasks.total, 0), done = ds.reduce((s, d) => s + d.tasks.done, 0);
    return { wd, mood: avgOf(moods), rate: pctOf(done, total) };
  });
  const showRhythm = span >= 14 && rhythm.filter(r => r.mood !== null || r.rate !== null).length >= 4;

  // Current task streak (independent of range): consecutive days with a completed task, today allowed to be in progress
  let streak = 0;
  for (let d = today, i = 0; i < 3650; i++, d = addDaysISO(d, -1)) {
    if (tasksOn(dailyTasks, d).some(t => t.status === "complete")) streak++;
    else if (i > 0) break;
  }

  const habitRows = habitList.map(h => {
    const hd = days.filter(d => d.iso >= h.created);
    const done = hd.filter(d => d.habitsDone.has(h.id)).length;
    const impact = splitAvg(days, d => d.iso >= h.created ? d.habitsDone.has(h.id) : null);
    return { ...h, done, days: hd.length, rate: pctOf(done, hd.length) || 0, streak: habitStreak(dailyTasks, h.id, today), impact };
  });

  const kanbanDone = kanbanCards.filter(c => c.status === "done" && c.due_date && c.completed_at && toISO(new Date(c.completed_at)) >= from);
  const timing = { early: 0, ontime: 0, late: 0 };
  kanbanDone.forEach(c => {
    const late = daySpan(c.due_date, toISO(new Date(c.completed_at))) - 1;
    timing[late < 0 ? "early" : late === 0 ? "ontime" : "late"]++;
  });

  const nothingYet = loaded && moodEntries.length === 0 && workouts.length === 0 && habits.length === 0 && goals.length === 0 && kanbanCards.length === 0
    && !Object.values(dailyTasks).some(d => (d.tasks || []).length);
  if (nothingYet) return (
    <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
      <Lightbulb className="text-slate-300 mx-auto mb-3" size={48}/>
      <h3 className="text-lg font-bold text-slate-500 mb-2">Insights will appear here</h3>
      <p className="text-slate-400 text-sm">Log moods, tasks, habits and workouts, and this page will start connecting the dots.</p>
    </div>
  );

  const card = "bg-white rounded-xl border border-slate-200 p-5";
  const kpis = [
    { label: "Avg mood", value: cur.mood === null ? "—" : cur.mood.toFixed(1), sub: cur.mood === null ? "no check-ins" : `${cur.checkIns} check-in${cur.checkIns === 1 ? "" : "s"}`, color: cur.mood === null ? "text-slate-400" : MOOD_COLORS(cur.mood).text, delta: <DeltaBadge value={diff("mood")} label={prevLabel}/> },
    { label: "Tasks done", value: cur.completion === null ? "—" : `${cur.completion}%`, sub: `${cur.taskDone}/${cur.taskTotal} tasks`, color: "text-emerald-600", delta: <DeltaBadge value={diff("completion")} digits={0} unit=" pts" label={prevLabel}/> },
    { label: "Habits kept", value: cur.habitRate === null ? "—" : `${cur.habitRate}%`, sub: `${habits.length} habit${habits.length === 1 ? "" : "s"}`, color: "text-violet-600", delta: <DeltaBadge value={diff("habitRate")} digits={0} unit=" pts" label={prevLabel}/> },
    { label: "Workouts", value: cur.workouts, sub: `${(cur.workouts / span * 7).toFixed(1)} / week`, color: "text-blue-600", delta: <DeltaBadge value={diff("workouts")} digits={0} label={prevLabel}/> },
  ];

  return (
    <div className="space-y-4">
      <Segmented value={range} onChange={setRange} options={INSIGHT_RANGES}/>

      {/* Headline numbers with change vs the previous period of the same length */}
      <div className={`grid ${isMobile ? "grid-cols-2" : "grid-cols-4"} gap-3`}>
        {kpis.map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500">{k.label}</div>
            <div className={`text-2xl font-bold mt-0.5 ${k.color}`}>{k.value}</div>
            <div className="text-xs text-slate-400">{k.sub}</div>
            {prev && <div className="mt-1.5">{k.delta}</div>}
          </div>
        ))}
      </div>

      {/* What stands out */}
      <div className={card}>
        <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><Lightbulb size={16} className="text-amber-500"/> What stands out</h3>
        {findings.length > 0 ? (
          <>
            <ul className="space-y-2.5">
              {findings.map(f => (
                <li key={f.key} className="flex gap-3 text-sm text-slate-600">
                  <span className={`mt-0.5 flex-shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded h-fit ${f.delta > 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{fmtSigned(f.delta)}</span>
                  <span>{f.text}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-400 mt-3">Mood is on a 1–8 scale. These are patterns in your own logs, not proof of cause.</p>
          </>
        ) : (
          <p className="text-sm text-slate-400">No clear patterns yet. Comparisons appear once there are at least {MIN_SIDE} mood check-ins on each side, e.g. {MIN_SIDE} workout days and {MIN_SIDE} rest days{range === "7" ? "; try a longer range" : ""}.</p>
        )}
      </div>

      <TrendsCard key={range} days={days} isMobile={isMobile}/>

      {showRhythm && (
        <div className={card}>
          <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><Calendar size={16} className="text-cyan-400"/> Weekly rhythm</h3>
          <div className="grid grid-cols-7 gap-1.5 text-center">
            {rhythm.map(r => {
              const c = r.mood !== null ? MOOD_COLORS(r.mood) : null;
              return (
                <div key={r.wd}>
                  <div className="text-xs text-slate-400 mb-1">{WEEKDAYS[r.wd].slice(0, isMobile ? 1 : 3)}</div>
                  <div className={`rounded-lg py-2 ${c ? `${c.light}` : "bg-slate-50"}`} title={r.mood !== null ? `Average mood ${r.mood.toFixed(1)}` : "No check-ins"}>
                    <div className={`text-sm font-bold ${c ? c.text : "text-slate-300"}`}>{r.mood !== null ? r.mood.toFixed(1) : "—"}</div>
                    <div className="text-[10px] text-slate-400">mood</div>
                  </div>
                  <div className="text-xs text-slate-500 mt-1" title="Tasks completed">{r.rate !== null ? `${r.rate}%` : "—"}</div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-400 mt-2">Average mood and share of tasks completed by day of the week.</p>
        </div>
      )}

      {cur.taskTotal > 0 && (
        <div className={card}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2"><CheckSquare size={16} className="text-cyan-400"/> Tasks</h3>
            {streak > 0 && <span className="flex items-center gap-1 text-sm font-semibold text-amber-600"><Flame size={14}/>{streak}-day streak</span>}
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3 text-center">
            <div><div className="text-2xl font-bold text-emerald-600">{cur.taskDone}</div><div className="text-xs text-slate-500">Done</div></div>
            <div><div className="text-2xl font-bold text-amber-600">{cur.taskTotal - cur.taskDone - cur.taskSkipped}</div><div className="text-xs text-slate-500">Not done</div></div>
            <div><div className="text-2xl font-bold text-slate-400">{cur.taskSkipped}</div><div className="text-xs text-slate-500">Skipped</div></div>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${cur.completion || 0}%` }}/></div>
          {kanbanDone.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Kanban cards finished</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 rounded-lg p-2 text-center"><div className="text-xl font-bold text-emerald-600">{timing.early}</div><div className="text-xs text-slate-500">Early</div></div>
                <div className="bg-blue-50 rounded-lg p-2 text-center"><div className="text-xl font-bold text-blue-600">{timing.ontime}</div><div className="text-xs text-slate-500">On time</div></div>
                <div className="bg-rose-50 rounded-lg p-2 text-center"><div className="text-xl font-bold text-rose-600">{timing.late}</div><div className="text-xs text-slate-500">Late</div></div>
              </div>
            </div>
          )}
        </div>
      )}

      {habitRows.length > 0 && (
        <div className={card}>
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Repeat size={15} className="text-violet-500"/> Habits</h3>
          <div className="space-y-3">
            {habitRows.map(h => (
              <div key={h.id}>
                <div className="flex items-center justify-between gap-2 text-sm mb-1">
                  <span className="font-medium text-slate-700 truncate">{h.name}</span>
                  <span className="flex items-center gap-2 text-xs text-slate-500 flex-shrink-0">
                    {h.impact && Math.abs(h.impact.delta) >= 0.3 && (
                      <span className={`font-semibold px-1.5 py-0.5 rounded ${h.impact.delta > 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`} title="Average mood on days you did it vs days you didn't">{fmtSigned(h.impact.delta)} mood</span>
                    )}
                    {h.streak > 0 && <span className="flex items-center gap-0.5 font-semibold text-amber-600"><Flame size={12}/>{h.streak}</span>}
                    {h.done}/{h.days} days
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-violet-500 rounded-full" style={{ width: `${h.rate}%` }}/></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {mostUsed.length > 0 && (
        <div className={card}>
          <h3 className="font-bold text-slate-800 mb-1 flex items-center gap-2"><SmilePlus size={16} className="text-rose-400"/> What moves your mood</h3>
          <p className="text-xs text-slate-400 mb-4">Average mood on tagged days compared with your overall {cur.mood?.toFixed(1)}. Tags need {MIN_SIDE}+ uses to count.</p>
          {(lifts.length > 0 || drags.length > 0) ? (
            <div className={`grid ${isMobile ? "grid-cols-1" : "grid-cols-2"} gap-5 mb-4`}>
              {[["Lifts you up", lifts, "bg-emerald-500"], ["Brings you down", drags, "bg-rose-500"]].map(([title, rows, bar]) => (
                <div key={title}>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{title}</p>
                  {rows.length === 0 ? <p className="text-sm text-slate-400">Nothing yet.</p> : (
                    <div className="space-y-2">
                      {rows.map(t => (
                        <div key={t.tag} className="flex items-center gap-3 text-sm">
                          <span className="w-24 truncate font-medium text-slate-700">{t.tag}</span>
                          <div className="flex-1 bg-slate-100 rounded-full h-2"><div className={`${bar} h-2 rounded-full`} style={{ width: `${Math.min(Math.abs(t.delta) / 3 * 100, 100)}%` }}/></div>
                          <span className="w-10 text-right font-semibold text-slate-700">{fmtSigned(t.delta)}</span>
                          <span className="w-8 text-right text-xs text-slate-400">{t.count}×</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-slate-400 mb-4">No tag stands out yet in this range.</p>}
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Most used</p>
          <div className="flex flex-wrap gap-1.5">
            {mostUsed.map(t => <span key={t.tag} className="px-2.5 py-1 rounded-full text-xs bg-slate-100 text-slate-600">{t.tag} <span className="text-slate-400">{t.count}</span></span>)}
          </div>
        </div>
      )}

      {goals.length > 0 && (
        <div className={card}>
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Flag size={15} className="text-blue-500"/> Goal Progress</h3>
          <div className="space-y-3">
            {goals.map(g => {
              const hex = GOAL_COLORS.find(c => c.id === g.color)?.hex || "#666";
              const prog = goalProgress(g, kanbanCards);
              const recent = goalStepDates.find(x => x.id === g.id).dates.filter(d => d >= from).length;
              const open = prog.cards.filter(c => c.status !== "done");
              const overdue = open.filter(c => c.due_date && c.due_date < today).length;
              return (
                <div key={g.id}>
                  <div className="flex items-center justify-between gap-2 text-sm mb-1">
                    <span className="flex items-center gap-2 font-medium text-slate-700 min-w-0"><span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background:hex}}/><span className="truncate">{g.title}</span></span>
                    <span className="flex items-center gap-2 text-xs text-slate-500 flex-shrink-0">
                      {recent > 0 && <span className="font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700" title="Milestones and cards finished in this range">+{recent} {range === "all" ? "dated" : `in ${span}d`}</span>}
                      {overdue > 0 && <span className="font-semibold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">{overdue} overdue</span>}
                      {prog.done}/{prog.total} steps
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:`${prog.pct}%`,background:hex}}/></div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
