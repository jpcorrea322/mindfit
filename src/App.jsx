import { useState, useEffect, useRef } from "react";
import { TrendingUp, Dumbbell, Plus, Brain, BarChart3, Edit2, Trash2, SmilePlus, Lightbulb, ChevronLeft, ChevronRight, X, Check, Heart, Target, CheckSquare, Calendar, Flag, ChevronDown, ChevronUp, LogOut } from "lucide-react";
import { supabase } from "./supabase.js";

//  Constants 
const SEED_TAGS = ["work","sleep","family","stress","exercise","diet","social","health","rest","travel","focus","anxiety","tired","motivated","productive","grateful","overwhelmed","calm","lonely","connected","sick","energy","outdoors","creative","frustrated"];

const MOOD_COLORS = (score) => {
  if (score >= 8) return { bg: "bg-emerald-600", text: "text-emerald-700", light: "bg-emerald-100", border: "border-emerald-300", hex: "#059669" };
  if (score >= 6) return { bg: "bg-emerald-400", text: "text-emerald-600", light: "bg-emerald-50",  border: "border-emerald-200", hex: "#34d399" };
  if (score >= 4) return { bg: "bg-yellow-400",  text: "text-yellow-700", light: "bg-yellow-100",  border: "border-yellow-300",  hex: "#facc15" };
  if (score >= 2) return { bg: "bg-orange-400",  text: "text-orange-700", light: "bg-orange-100",  border: "border-orange-300",  hex: "#fb923c" };
  return              { bg: "bg-rose-600",    text: "text-rose-700",   light: "bg-rose-100",    border: "border-rose-300",    hex: "#e11d48" };
};

const GOAL_COLORS = [
  { id: "blue",    hex: "#3b82f6", label: "Blue"    },
  { id: "violet",  hex: "#7c3aed", label: "Violet"  },
  { id: "rose",    hex: "#e11d48", label: "Rose"    },
  { id: "amber",   hex: "#d97706", label: "Amber"   },
  { id: "emerald", hex: "#059669", label: "Green"   },
  { id: "cyan",    hex: "#0891b2", label: "Cyan"    },
  { id: "fuchsia", hex: "#c026d3", label: "Fuchsia" },
  { id: "slate",   hex: "#475569", label: "Slate"   },
];

const KANBAN_STATUSES = ["todo", "inprogress", "done"];
const KANBAN_LABELS   = { todo: "To Do", inprogress: "In Progress", done: "Done" };
const KANBAN_COLORS   = { todo: "bg-gray-100 text-gray-700", inprogress: "bg-blue-100 text-blue-700", done: "bg-emerald-100 text-emerald-700" };

// Fixed: Use local time instead of UTC to prevent date switching before midnight
const todayISO = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const tomorrow = () => {
  const now = new Date();
  now.setDate(now.getDate() + 1);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const fmtDisplay = (iso) => { const [y,m,d] = iso.split("-"); return `${parseInt(m)}/${parseInt(d)}/${y}`; };
const isoToLabel = (iso) => { if (!iso) return ""; const d = new Date(iso + "T00:00:00"); return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); };

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <Dumbbell className="text-blue-600" size={28} />
          <span className="font-bold text-2xl text-slate-900">MindFit</span>
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
  const [tab, setTab]           = useState("workouts");
  const [isMobile, setIsMobile] = useState(false);

  // Shared task state
  const [dailyTasks, setDailyTasks] = useState({});
  const [kanbanCards, setKanbanCards] = useState([]);
  const [goals, setGoals] = useState([]);

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
  }, [session]);

  const uid = () => session?.user?.id;

  //  Daily Tasks 
  const loadDailyTasks = async () => {
    const { data } = await supabase.from("tasks_daily").select("date,tasks").eq("user_id", uid());
    if (!data) return;
    const map = {};
    data.forEach(row => { map[row.date] = { tasks: row.tasks || [] }; });
    setDailyTasks(map);
  };

  const saveDailyTasks = async (next) => {
    setDailyTasks(next);
    const upserts = Object.entries(next).map(([date, { tasks }]) => ({
      user_id: uid(), date, tasks, updated_at: new Date().toISOString()
    }));
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
    await supabase.from("tasks_goals").update(updates).eq("id", id).eq("user_id", uid());
    setGoals(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
  };

  const deleteGoal = async (id) => {
    await supabase.from("tasks_goals").delete().eq("id", id).eq("user_id", uid());
    setGoals(prev => prev.filter(g => g.id !== id));
  };

  const signOut = () => supabase.auth.signOut();

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
      <div className="text-slate-400 text-sm">Loading</div>
    </div>
  );

  if (!session) return <AuthScreen />;

  const TABS = [
    { id: "workouts", label: "Workouts", icon: Dumbbell  },
    { id: "mood",     label: "Mood",     icon: Heart     },
    { id: "tasks",    label: "Tasks",    icon: Target    },
    { id: "insights", label: "Insights", icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Dumbbell className="text-blue-600" size={28} />
            <span className="font-bold text-xl text-slate-900">MindFit</span>
          </div>
          <button onClick={signOut} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <LogOut size={14} /> Sign out
          </button>
        </div>
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 ${isMobile?"flex-1 justify-center px-2 py-3.5":"px-4 py-3"} text-sm font-medium border-b-2 transition-colors touch-manipulation ${tab===id?"border-blue-600 text-blue-600":"border-transparent text-slate-500 hover:text-slate-700"}`}>
                <Icon size={isMobile?18:15} />
                {!isMobile && label}
                {isMobile && <span className="text-xs">{label}</span>}
              </button>
            ))}
          </div>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6">
        {tab === "workouts" && <WorkoutsTab session={session} isMobile={isMobile} />}
        {tab === "mood"     && <MoodTab session={session} isMobile={isMobile} dailyTasks={dailyTasks} />}
        {tab === "tasks"    && (
          <TasksTab
            isMobile={isMobile}
            dailyTasks={dailyTasks} saveDailyTasks={saveDailyTasks}
            kanbanCards={kanbanCards}
            addKanbanCard={addKanbanCard} updateKanbanCard={updateKanbanCard} deleteKanbanCard={deleteKanbanCard}
            goals={goals}
            addGoal={addGoal} updateGoal={updateGoal} deleteGoal={deleteGoal}
          />
        )}
        {tab === "insights" && <InsightsTab session={session} isMobile={isMobile} dailyTasks={dailyTasks} kanbanCards={kanbanCards} goals={goals}/>}
      </main>
    </div>
  );
}

// 
// WORKOUTS TAB
// 
function WorkoutsTab({ session, isMobile }) {
  const [workouts, setWorkouts]             = useState([]);
  const [showAddForm, setShowAddForm]       = useState(false);
  const [editingWorkout, setEditingWorkout] = useState(null);
  const [analyzing, setAnalyzing]           = useState(false);
  const [aiSuggestion, setAiSuggestion]     = useState(null);
  const [selectedType, setSelectedType]     = useState("Push");
  const [chartView, setChartView]           = useState("time");
  const [timeScale, setTimeScale]           = useState("all");
  const [progressionExpanded, setProgressionExpanded] = useState(true);
  const [expandedWorkoutTypes, setExpandedWorkoutTypes] = useState({});

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

  const parseDate = (s) => {
    const p = s.split("/");
    if (p.length === 2) { const m = parseInt(p[0])-1; const d = parseInt(p[1]); return new Date(m > new Date().getMonth() ? 2024 : 2025, m, d); }
    return new Date(s);
  };
  const formatDate = (d) => d ? `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}` : "";

  const getAISuggestion = async () => {
    setAnalyzing(true);
    try {
      const history = workouts.filter(w => w.type === selectedType).slice(0,10)
        .map(w => `${w.date}: ${w.exercises.map(e => `${e.name} ${e.sets}x${e.reps} @ ${e.weight}lbs`).join(", ")}`).join("\n");
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000,
          messages: [{ role: "user", content: `You're a fitness coach. Based on this ${selectedType} workout history, suggest today's workout.\n\nRecent History:\n${history || "No previous workouts"}\n\nProvide JSON only (no markdown):\n{"exercises":[{"name":"Exercise","sets":5,"reps":5,"suggestedWeight":200,"notes":"Tip"}],"overallTips":"Advice"}` }] })
      });
      const data = await res.json();
      const text = data.content.find(c => c.type === "text")?.text || "";
      setAiSuggestion(JSON.parse(text.replace(/```json\n?|\n?```/g, "").trim()));
    } catch { setAiSuggestion({ exercises: [], overallTips: "Unable to generate suggestions." }); }
    setAnalyzing(false);
  };

  const normEx = (name) => (name || "").trim().toLowerCase();
  const dedupeExercises = (names) => {
    const seen = new Set();
    return names.filter(Boolean).filter(n => { const k = normEx(n); if (seen.has(k)) return false; seen.add(k); return true; });
  };

  const getProgressionData = (exerciseName) => {
    const normTarget = normEx(exerciseName);
    const data = workouts.filter(w => w.exercises.some(e => normEx(e.name) === normTarget))
      .map(w => ({ date: w.date, weight: parseInt(w.exercises.find(e => normEx(e.name) === normTarget)?.weight)||0, dateObj: parseDate(w.date) }))
      .filter(i => i.weight > 0).reverse();
    return data.filter(i => {
      if (timeScale === "month") { const ago = new Date(); ago.setMonth(ago.getMonth()-1); return i.dateObj >= ago; }
      if (timeScale === "year")  { const ago = new Date(); ago.setFullYear(ago.getFullYear()-1); return i.dateObj >= ago; }
      return true;
    }).map((i, idx) => ({ ...i, sessionNumber: idx+1 }));
  };
  const uniqueExercises = dedupeExercises(workouts.flatMap(w => w.exercises.map(e => e.name)));
  const workoutTypes    = [...new Set(workouts.map(w => w.type))].filter(Boolean);
  const exercisesByType = {};
  workoutTypes.forEach(t => { exercisesByType[t] = dedupeExercises(workouts.filter(w => w.type===t).flatMap(w => w.exercises.map(e => e.name))); });

  const WorkoutForm = ({ workout, onClose }) => {
    const isEditing = !!workout;
    const [exercises, setExercises]   = useState(workout ? [...workout.exercises] : [{ name:"",sets:"",reps:"",weight:"",notes:"" }]);
    const [formDate, setFormDate]     = useState(workout ? workout.date : todayISO());
    const [formType, setFormType]     = useState(workout ? workout.type : selectedType);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [errors, setErrors]         = useState([]);

    const save = async () => {
      const errs = [];
      if (!formDate) errs.push("Please select a date");
      const valid = exercises.filter(ex => ex.name && ex.sets && ex.reps);
      if (valid.length === 0) errs.push("Add at least one exercise with name, sets, and reps");
      if (errs.length) { setErrors(errs); return; }
      await saveWorkout({ ...(workout||{}), date: formDate, type: formType, exercises: valid });
      setAiSuggestion(null);
      onClose();
    };

    const applyAI = () => {
      if (aiSuggestion?.exercises) setExercises(aiSuggestion.exercises.map(e => ({ name: e.name, sets: e.sets.toString(), reps: e.reps.toString(), weight: e.suggestedWeight.toString(), notes: e.notes||"" })));
    };

    return (
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-slate-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-900">{isEditing ? "Edit Workout" : "Log New Workout"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        {errors.length > 0 && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{errors.map((e,i) => <div key={i}>{e}</div>)}</div>}
        <div className={`grid ${isMobile?"grid-cols-1":"grid-cols-2"} gap-4 mb-4`}>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Date</label><input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
            <select value={formType} onChange={e => setFormType(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
              {["Push","Pull","Legs","Run","Other"].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
        {!isEditing && (
          <>
            <button onClick={getAISuggestion} disabled={analyzing} className="w-full mb-4 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 flex items-center justify-center gap-2 text-sm font-medium">
              <Brain size={16} />{analyzing ? "Analyzing" : "Get AI Suggestion"}
            </button>
            {aiSuggestion && (
              <div className="mb-4 p-4 bg-violet-50 rounded-lg border border-violet-200">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-semibold text-violet-900 text-sm">AI Suggestion</span>
                  <button onClick={applyAI} className="text-xs px-2 py-1 bg-violet-600 text-white rounded hover:bg-violet-700">Apply</button>
                </div>
                <p className="text-xs text-violet-700 mb-2">{aiSuggestion.overallTips}</p>
                {aiSuggestion.exercises?.map((ex,i) => <div key={i} className="text-xs text-violet-600"><strong>{ex.name}</strong>: {ex.sets}x{ex.reps} @ {ex.suggestedWeight}lbs{ex.notes && `  ${ex.notes}`}</div>)}
              </div>
            )}
          </>
        )}
        <div className="space-y-3">
          {exercises.map((ex, idx) => (
            <div key={idx} className="p-3 bg-slate-50 rounded-lg">
              <div className={`grid ${isMobile?"grid-cols-1":"grid-cols-2"} gap-2 mb-2`}>
                <input placeholder="Exercise name" value={ex.name} onChange={e => { const n=[...exercises]; n[idx].name=e.target.value; setExercises(n); }} className={`${isMobile?"":"col-span-2"} px-3 py-2 border border-slate-200 rounded-lg text-sm`} />
                <input placeholder="Sets" value={ex.sets} onChange={e => { const n=[...exercises]; n[idx].sets=e.target.value; setExercises(n); }} className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                <input placeholder="Reps" value={ex.reps} onChange={e => { const n=[...exercises]; n[idx].reps=e.target.value; setExercises(n); }} className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                <input placeholder="Weight (lbs)" value={ex.weight} onChange={e => { const n=[...exercises]; n[idx].weight=e.target.value; setExercises(n); }} className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                <button onClick={() => setExercises(exercises.filter((_,i) => i!==idx))} className="text-red-500 hover:text-red-700 text-sm font-medium">Remove</button>
              </div>
              <input placeholder="Notes (optional)" value={ex.notes} onChange={e => { const n=[...exercises]; n[idx].notes=e.target.value; setExercises(n); }} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs" />
            </div>
          ))}
          <button onClick={() => setExercises([...exercises, {name:"",sets:"",reps:"",weight:"",notes:""}])} className="w-full py-2.5 border-2 border-dashed border-slate-200 rounded-lg text-slate-500 hover:border-slate-400 text-sm">+ Add Exercise</button>
          <button onClick={save} className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-sm">{isEditing ? "Update Workout" : "Save Workout"}</button>
          {isEditing && !confirmDelete && <button onClick={() => setConfirmDelete(true)} className="w-full py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm flex items-center justify-center gap-1"><Trash2 size={14}/> Delete Workout</button>}
          {isEditing && confirmDelete && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm text-center mb-3">Delete this workout permanently?</p>
              <div className="flex gap-2">
                <button onClick={async () => { await deleteWorkout(workout.id); onClose(); }} className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold">Yes, Delete</button>
                <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const ExerciseChart = ({ exercise }) => {
    const prog = getProgressionData(exercise);
    if (prog.length < 2) return (
      <div className="border border-amber-200 rounded-lg p-4 bg-amber-50 text-sm text-amber-800">
        <strong>{exercise}</strong>  need at least 2 sessions with weight data ({prog.length} logged).
      </div>
    );
    const maxW = Math.max(...prog.map(p => p.weight));
    const minW = Math.min(...prog.map(p => p.weight));
    const range = maxW - minW || 1;
    const latest = prog[prog.length-1], prev = prog[prog.length-2];
    const change = latest.weight - prev.weight;
    return (
      <div className="border border-slate-200 rounded-lg p-4 bg-white">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <span className="font-semibold text-slate-800">{exercise}</span>
          <div className="flex gap-3 text-xs text-slate-500">
            <span>Latest: <strong className="text-slate-800">{latest.weight}lbs</strong></span>
            <span>Max: <strong className="text-slate-800">{maxW}lbs</strong></span>
            {change !== 0 && <span className={`font-semibold ${change>0?"text-emerald-600":"text-red-500"}`}>{change>0?"":""}{Math.abs(change)}lbs</span>}
          </div>
        </div>
        <div className="relative bg-slate-50 rounded border border-slate-100" style={{height:"160px"}}>
          <div className="absolute left-0 top-0 bottom-0 w-10 flex flex-col justify-between text-xs text-slate-400 pr-1 text-right py-2">
            <span>{maxW}</span><span>{Math.round(maxW-range*0.5)}</span><span>{minW}</span>
          </div>
          <div className="ml-10 mr-4 h-full relative py-2">
            <svg className="absolute inset-0 w-full h-full" style={{overflow:"visible"}}>
              <polyline points={prog.map((p,i) => { const x=(i/(prog.length-1))*100; const y=((maxW-p.weight)/range)*86+7; return `${x}%,${y}%`; }).join(" ")} fill="none" stroke="#3b82f6" strokeWidth="2" opacity="0.6"/>
            </svg>
            {prog.map((p,i) => { const x=(i/(prog.length-1))*100; const y=((maxW-p.weight)/range)*86+7; return (
              <div key={i} className="absolute w-2.5 h-2.5 bg-blue-600 rounded-full border-2 border-white shadow" style={{left:`${x}%`,top:`${y}%`,transform:"translate(-50%,-50%)"}} title={`${formatDate(p.dateObj)}: ${p.weight}lbs`}/>
            );})}
          </div>
        </div>
        <div className="mt-2 flex gap-2 text-xs">
          <div className="flex-1 bg-slate-50 rounded p-2 text-center"><div className="text-slate-500">Gain</div><div className="font-bold text-emerald-600">+{maxW-prog[0].weight}lbs</div></div>
          <div className="flex-1 bg-slate-50 rounded p-2 text-center"><div className="text-slate-500">Avg</div><div className="font-bold">{Math.round(prog.reduce((s,p)=>s+p.weight,0)/prog.length)}lbs</div></div>
          <div className="flex-1 bg-slate-50 rounded p-2 text-center"><div className="text-slate-500">Sessions</div><div className="font-bold">{prog.length}</div></div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="mb-4">
        <button onClick={() => { setShowAddForm(!showAddForm); setEditingWorkout(null); }} className="w-full py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2 font-semibold shadow-sm">
          <Plus size={20} /> Log New Workout
        </button>
      </div>
      {showAddForm && !editingWorkout && <WorkoutForm onClose={() => setShowAddForm(false)} />}
      {editingWorkout && <WorkoutForm workout={editingWorkout} onClose={() => setEditingWorkout(null)} />}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-4">
        <div className="flex items-center gap-2 mb-4"><BarChart3 size={18} className="text-blue-600"/><h2 className="font-bold text-slate-800">Recent Workouts</h2></div>
        {workouts.length === 0 ? <p className="text-slate-400 text-sm text-center py-6">No workouts logged yet.</p> : (
          <div className="space-y-3">
            {workouts.slice(0,10).map(w => (
              <div key={w.id} className="border border-slate-100 rounded-lg p-3 hover:bg-slate-50">
                <div className="flex justify-between items-start mb-2">
                  <div><span className="font-semibold text-slate-800">{w.type} Day</span><span className="ml-2 text-xs text-slate-400">{w.date}</span></div>
                  <button onClick={() => { setShowAddForm(false); setEditingWorkout(w); }} className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 flex items-center gap-1"><Edit2 size={12}/>Edit</button>
                </div>
                <div className="space-y-1">
                  {w.exercises.map((ex,i) => (
                    <div key={i} className="text-xs bg-slate-50 px-2 py-1 rounded">
                      <span className="font-medium">{ex.name}</span>
                      <span className="text-blue-600">  {ex.sets}{ex.reps}{ex.weight && ` @ ${ex.weight}lbs`}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {uniqueExercises.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between p-5 cursor-pointer hover:bg-slate-50 rounded-xl" onClick={() => setProgressionExpanded(!progressionExpanded)}>
            <div className="flex items-center gap-2"><TrendingUp size={18} className="text-emerald-600"/><h2 className="font-bold text-slate-800">Exercise Progression</h2></div>
            {progressionExpanded ? <ChevronUp size={18} className="text-slate-400"/> : <ChevronDown size={18} className="text-slate-400"/>}
          </div>
          {progressionExpanded && (
            <div className="px-5 pb-5">
              <div className="flex gap-2 mb-4 flex-wrap">
                <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                  {["month","year","all"].map(s => <button key={s} onClick={()=>setTimeScale(s)} className={`px-3 py-1 rounded text-xs font-medium transition ${timeScale===s?"bg-emerald-600 text-white":"text-slate-600 hover:bg-slate-200"}`}>{s.charAt(0).toUpperCase()+s.slice(1)}</button>)}
                </div>
              </div>
              <div className="space-y-4">
                {workoutTypes.map(type => (
                  <div key={type} className="border border-slate-200 rounded-lg">
                    <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-50 bg-blue-50 rounded-lg" onClick={() => setExpandedWorkoutTypes(p => ({...p,[type]:!p[type]}))}>
                      <span className="font-semibold text-blue-900 text-sm">{type}  {exercisesByType[type].length} exercises</span>
                      {expandedWorkoutTypes[type] ? <ChevronUp size={16} className="text-blue-600"/> : <ChevronDown size={16} className="text-blue-600"/>}
                    </div>
                    {expandedWorkoutTypes[type] && <div className="p-4 space-y-4">{exercisesByType[type].map(ex => <ExerciseChart key={ex} exercise={ex}/>)}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 
// MOOD TAB
// 
function MoodTab({ session, isMobile, dailyTasks = {} }) {
  const [moodEntries, setMoodEntries] = useState([]);
  const [habits, setHabits]           = useState([]);
  const [showForm, setShowForm]       = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [habitsExpanded, setHabitsExpanded] = useState(false);

  const uid = session?.user?.id;

  useEffect(() => { loadMoodEntries(); loadHabits(); }, []);

  const loadMoodEntries = async () => {
    const { data } = await supabase.from("mood_entries").select("*").eq("user_id", uid).order("date", { ascending: false });
    if (data) setMoodEntries(data);
  };

  const loadHabits = async () => {
    const { data } = await supabase.from("habit_definitions").select("*").eq("user_id", uid).order("created_at");
    if (data) setHabits(data);
  };

  const saveMoodEntry = async (entry) => {
    const payload = { user_id: uid, date: entry.date, mood: entry.mood, energy: entry.energy, stress: entry.stress, sleep: entry.sleep, tags: entry.tags||[], note: entry.note||"", completed_habits: entry.completedHabits||[] };
    if (entry.id) {
      await supabase.from("mood_entries").update(payload).eq("id", entry.id).eq("user_id", uid);
      setMoodEntries(prev => prev.map(e => e.id === entry.id ? { ...e, ...payload, id: entry.id } : e));
    } else {
      const existing = moodEntries.find(e => e.date === entry.date);
      if (existing) {
        await supabase.from("mood_entries").update(payload).eq("id", existing.id).eq("user_id", uid);
        setMoodEntries(prev => prev.map(e => e.id === existing.id ? { ...e, ...payload } : e));
      } else {
        const { data } = await supabase.from("mood_entries").insert(payload).select().single();
        if (data) setMoodEntries(prev => [data, ...prev]);
      }
    }
  };

  const deleteMoodEntry = async (id) => {
    await supabase.from("mood_entries").delete().eq("id", id).eq("user_id", uid);
    setMoodEntries(prev => prev.filter(e => e.id !== id));
  };

  const saveHabit = async (name) => {
    const { data } = await supabase.from("habit_definitions").insert({ user_id: uid, name }).select().single();
    if (data) setHabits(prev => [...prev, data]);
  };

  const deleteHabit = async (id) => {
    await supabase.from("habit_definitions").delete().eq("id", id).eq("user_id", uid);
    setHabits(prev => prev.filter(h => h.id !== id));
  };

  const entryByDate = {};
  moodEntries.forEach(e => { entryByDate[e.date] = e; });

  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const monthName = calendarDate.toLocaleString("default", { month: "long" });
  const todayStr = todayISO();

  const handleDayClick = (isoDate) => {
    const entry = entryByDate[isoDate];
    if (entry) setSelectedDay(isoDate);
    else { setEditingEntry({ date: isoDate }); setShowForm(true); }
  };

  return (
    <div>
      <div className="mb-6">
        <button onClick={() => { setEditingEntry(entryByDate[todayStr] || { date: todayStr }); setShowForm(true); }}
          className="w-full py-4 bg-violet-600 text-white rounded-xl hover:bg-violet-700 flex items-center justify-center gap-2 font-semibold text-lg shadow-md">
          <SmilePlus size={22} />
          {entryByDate[todayStr] ? "Edit Today's Check-in" : "Log Today's Mood"}
        </button>
      </div>

      {showForm && (
        <MoodForm entry={editingEntry} moodEntries={moodEntries} habits={habits}
          onSave={async (entry) => { await saveMoodEntry(entry); setShowForm(false); setEditingEntry(null); }}
          onDelete={async (id) => { await deleteMoodEntry(id); setShowForm(false); setEditingEntry(null); }}
          onClose={() => { setShowForm(false); setEditingEntry(null); }}
          isMobile={isMobile} />
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setCalendarDate(new Date(year, month-1, 1))} className="p-2 hover:bg-slate-100 rounded-lg"><ChevronLeft size={18} className="text-slate-500"/></button>
          <h2 className="text-lg font-bold text-slate-800">{monthName} {year}</h2>
          <button onClick={() => setCalendarDate(new Date(year, month+1, 1))} className="p-2 hover:bg-slate-100 rounded-lg"><ChevronRight size={18} className="text-slate-500"/></button>
        </div>
        <div className="grid grid-cols-7 mb-2">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => <div key={d} className="text-center text-xs font-semibold text-slate-400 py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDay }).map((_,i) => <div key={`e${i}`}/>)}
          {Array.from({ length: daysInMonth }).map((_,i) => {
            const day = i+1;
            const isoDate = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const entry = entryByDate[isoDate];
            const isToday = isoDate === todayStr;
            const colors = entry ? MOOD_COLORS(entry.mood) : null;
            return (
              <button key={day} onClick={() => handleDayClick(isoDate)}
                className={`aspect-square rounded-lg flex flex-col items-center justify-center transition-all relative
                  ${entry ? `${colors.bg} text-white hover:opacity-90` : isToday ? "border-2 border-violet-400 hover:bg-violet-50" : "hover:bg-slate-50 border border-transparent"}`}>
                <span className={`text-sm font-semibold ${entry?"text-white":isToday?"text-violet-600":"text-slate-600"}`}>{day}</span>
                {entry && <span className="text-[9px] font-bold text-white opacity-90 leading-tight">{entry.mood}/{entry.energy}/{entry.sleep}</span>}
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-slate-100">
          {[{label:"Very Low (1)",score:1},{label:"Low (2-3)",score:2},{label:"Mid (4-5)",score:4},{label:"High (6-7)",score:6},{label:"Best (8)",score:8}].map(({label,score}) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-full ${MOOD_COLORS(score).bg}`}/>
              <span className="text-xs text-slate-500">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {selectedDay && entryByDate[selectedDay] && (
        <DayDetail entry={entryByDate[selectedDay]} habits={habits}
          onEdit={(entry) => { setSelectedDay(null); setEditingEntry(entry); setShowForm(true); }}
          onClose={() => setSelectedDay(null)} />
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 mb-6 overflow-hidden">
        <button onClick={() => setHabitsExpanded(h => !h)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors text-left">
          <div className="flex items-center gap-2">
            <Check size={18} className="text-violet-500"/>
            <span className="font-bold text-slate-800">Habit Tracker</span>
            {habits.length > 0 && <span className="text-xs bg-violet-100 text-violet-600 font-semibold px-2 py-0.5 rounded-full">{habits.length}</span>}
          </div>
          <span className="text-slate-400 text-lg">{habitsExpanded ? "" : "+"}</span>
        </button>
        {habitsExpanded && <HabitManager habits={habits} onAdd={saveHabit} onDelete={deleteHabit} />}
      </div>

      {moodEntries.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
          <h3 className="font-bold text-slate-800 mb-3 text-lg">Recent Check-ins</h3>
          <div className="space-y-2">
            {[...moodEntries].sort((a,b) => b.date.localeCompare(a.date)).slice(0,7).map(entry => {
              const colors = MOOD_COLORS(entry.mood);
              return (
                <button key={entry.id} onClick={() => setSelectedDay(entry.date)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors text-left">
                  <div className={`w-10 h-10 rounded-full ${colors.bg} flex items-center justify-center text-white font-bold text-lg flex-shrink-0`}>{entry.mood}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-700">{fmtDisplay(entry.date)}</span>
                      {(entry.tags||[]).map(tag => <span key={tag} className={`text-xs px-2 py-0.5 rounded-full ${colors.light} ${colors.text} font-medium`}>{tag}</span>)}
                    </div>
                    {entry.note && <p className="text-sm text-slate-400 truncate mt-0.5">{entry.note}</p>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function HabitManager({ habits, onAdd, onDelete }) {
  const [newHabit, setNewHabit]       = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const addHabit = async () => {
    const name = newHabit.trim();
    if (!name || habits.some(h => h.name.toLowerCase() === name.toLowerCase())) return;
    await onAdd(name); setNewHabit("");
  };
  return (
    <div className="px-5 pb-5 border-t border-slate-100">
      <p className="text-xs text-slate-400 mt-4 mb-3">Habits added here appear as a checklist in every daily check-in.</p>
      <div className="flex gap-2 mb-4">
        <input value={newHabit} onChange={e => setNewHabit(e.target.value)} onKeyDown={e => { if (e.key==="Enter") { e.preventDefault(); addHabit(); }}}
          placeholder="e.g. Morning walk, Read..." className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-violet-400 focus:outline-none" />
        <button onClick={addHabit} disabled={!newHabit.trim()} className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-40">Add</button>
      </div>
      {habits.length === 0 ? <p className="text-sm text-slate-400 text-center py-4">No habits yet.</p> : (
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
                <button onClick={() => setConfirmDelete(habit.id)} className="text-slate-300 hover:text-rose-400"><X size={15}/></button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DayDetail({ entry, onEdit, onClose, habits }) {
  const colors = MOOD_COLORS(entry.mood);
  const completedIds = new Set(entry.completed_habits || []);
  const completedHabits = habits.filter(h => completedIds.has(h.id));
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-full ${colors.bg} flex items-center justify-center text-white text-xl font-bold`}>{entry.mood}</div>
          <div>
            <h3 className="font-bold text-slate-800">{fmtDisplay(entry.date)}</h3>
            <p className={`text-sm font-medium ${colors.text}`}>{entry.mood>=7?"Great day":entry.mood>=5?"Good day":entry.mood>=3?"Fair day":"Tough day"}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onEdit(entry)} className="px-3 py-1.5 text-sm bg-violet-50 text-violet-600 rounded-lg hover:bg-violet-100 font-medium flex items-center gap-1"><Edit2 size={13}/> Edit</button>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><X size={16}/></button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[{label:"Mood",value:entry.mood,icon:""},{label:"Energy",value:entry.energy,icon:""},{label:"Stress",value:entry.stress,icon:""},{label:"Sleep",value:entry.sleep,icon:""}].map(({label,value,icon}) => (
          <div key={label} className={`${colors.light} rounded-lg p-3 text-center`}>
            <div className="text-lg mb-1">{icon}</div>
            <div className={`text-xl font-bold ${colors.text}`}>{value}</div>
            <div className="text-xs text-slate-500">{label}</div>
          </div>
        ))}
      </div>
      {(entry.tags||[]).length > 0 && <div className="flex gap-2 flex-wrap mb-3">{entry.tags.map(tag => <span key={tag} className={`px-3 py-1 rounded-full text-sm font-medium ${colors.light} ${colors.text}`}>{tag}</span>)}</div>}
      {completedHabits.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Habits completed</p>
          <div className="flex flex-wrap gap-2">
            {completedHabits.map(h => <span key={h.id} className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-medium"><Check size={11}/> {h.name}</span>)}
          </div>
        </div>
      )}
      {entry.note && <div className="bg-slate-50 rounded-lg p-3"><p className="text-sm text-slate-600 italic">"{entry.note}"</p></div>}
    </div>
  );
}

function MoodForm({ entry, moodEntries, habits, onSave, onDelete, onClose, isMobile }) {
  const isEditing = !!entry?.id;
  const [formDate, setFormDate]         = useState(entry?.date || todayISO());
  const [mood, setMood]                 = useState(entry?.mood || 5);
  const [energy, setEnergy]             = useState(entry?.energy || 5);
  const [stress, setStress]             = useState(entry?.stress || 4);
  const [sleep, setSleep]               = useState(entry?.sleep || 5);
  const [note, setNote]                 = useState(entry?.note || "");
  const [completedHabits, setCompletedHabits] = useState(new Set(entry?.completed_habits || []));
  const [tags, setTags]                 = useState(entry?.tags ? [...entry.tags, "","",""].slice(0,3) : ["","",""]);
  const [pillSearch, setPillSearch]     = useState("");

  const tagStats = {};
  moodEntries.forEach(e => { (e.tags||[]).forEach(tag => { if (!tagStats[tag]) tagStats[tag]={total:0,count:0}; tagStats[tag].total+=e.mood; tagStats[tag].count+=1; }); });
  const rankedTags = Object.entries(tagStats).sort((a,b)=>(b[1].total/b[1].count)-(a[1].total/a[1].count)).map(x=>x[0]);
  const allSuggestions = [...new Set([...rankedTags, ...SEED_TAGS])];
  const filtered = pillSearch.trim() ? allSuggestions.filter(t=>t.toLowerCase().includes(pillSearch.toLowerCase())) : allSuggestions.slice(0,15);

  const ScaleInput = ({ label, value, setValue, icon, inverted }) => {
    const displayColor = inverted ? MOOD_COLORS(9-value) : MOOD_COLORS(value);
    return (
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-semibold text-slate-700">{icon} {label}</label>
          <span className={`text-lg font-bold ${displayColor.text}`}>{value}<span className="text-sm text-slate-400 font-normal">/8</span></span>
        </div>
        <div className="flex gap-1.5">
          {[1,2,3,4,5,6,7,8].map(n => {
            const c = inverted ? MOOD_COLORS(9-n) : MOOD_COLORS(n);
            return <button key={n} onClick={() => setValue(n)} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${value===n?`${c.bg} text-white shadow-md scale-105`:"bg-slate-100 text-slate-400 hover:bg-slate-200"}`}>{n}</button>;
          })}
        </div>
      </div>
    );
  };

  const save = async () => {
    const finalTags = tags.map(t=>t.trim()).filter(t=>t.length>0);
    await onSave({ id: entry?.id, date: formDate, mood, energy, stress, sleep, tags: finalTags, note: note.trim(), completedHabits: [...completedHabits] });
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-100 p-6 mb-6">
      <div className="flex justify-between items-center mb-5">
        <h3 className="text-xl font-bold text-slate-800">{isEditing ? "Edit Check-in" : "Daily Check-in"}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
      </div>
      <div className="mb-5">
        <label className="block text-sm font-semibold text-slate-700 mb-1">Date</label>
        <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-base"/>
      </div>
      <ScaleInput label="Mood" value={mood} setValue={setMood} icon=""/>
      <ScaleInput label="Energy Level" value={energy} setValue={setEnergy} icon=""/>
      <ScaleInput label="Stress Level" value={stress} setValue={setStress} icon="" inverted/>
      <ScaleInput label="Sleep Quality" value={sleep} setValue={setSleep} icon=""/>
      <div className="mb-5">
        <label className="block text-sm font-semibold text-slate-700 mb-2">Mood Tags</label>
        <p className="text-xs text-violet-600 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 mb-3">Tap a suggestion to quick-add, or type any custom tag directly in the boxes below.</p>
        <div className="mb-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <input value={pillSearch} onChange={e => setPillSearch(e.target.value)} placeholder="Search tags..." className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:border-violet-400 focus:outline-none mb-2"/>
          <div className="flex flex-wrap gap-1.5">
            {filtered.map(tag => {
              const used = tags.some(t=>t.trim()===tag);
              const avg = tagStats[tag] ? tagStats[tag].total/tagStats[tag].count : null;
              const colors = avg ? MOOD_COLORS(avg) : null;
              return (
                <button key={tag} onClick={() => { if (used) return; const next=[...tags]; const idx=next.findIndex(t=>t.trim()===""); if (idx===-1) return; next[idx]=tag; setTags(next); }}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${used?"bg-violet-100 text-violet-400 border-violet-200 opacity-50 cursor-not-allowed":colors?`${colors.light} ${colors.text} ${colors.border} hover:opacity-80 cursor-pointer`:"bg-white text-slate-500 border-slate-200 hover:bg-violet-50 hover:text-violet-600 cursor-pointer"}`}>
                  {tag}{avg && <span className="ml-1 opacity-60">{avg.toFixed(1)}</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-2">
          {[0,1,2].map(idx => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-xs text-slate-400 w-4">{idx+1}.</span>
              <input value={tags[idx]} onChange={e => { const n=[...tags]; n[idx]=e.target.value; setTags(n); }} placeholder={idx===0?"select above or type...":"optional"} maxLength={20} className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-violet-400 focus:outline-none"/>
              {tags[idx] && <button onClick={() => { const n=[...tags]; n[idx]=""; setTags(n); }} className="text-slate-300 hover:text-slate-500"><X size={14}/></button>}
            </div>
          ))}
        </div>
      </div>
      <div className="mb-5">
        <label className="block text-sm font-semibold text-slate-700 mb-1">Journal Note <span className="text-slate-400 font-normal text-xs">(optional)</span></label>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:border-violet-400 focus:outline-none"/>
      </div>
      {habits.length > 0 && (
        <div className="mb-5">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Habits completed today</label>
          <div className="space-y-2">
            {habits.map(habit => {
              const done = completedHabits.has(habit.id);
              return (
                <button key={habit.id} onClick={() => { const next=new Set(completedHabits); done?next.delete(habit.id):next.add(habit.id); setCompletedHabits(next); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all text-left ${done?"bg-emerald-50 border-emerald-300 text-emerald-800":"bg-slate-50 border-slate-200 text-slate-600 hover:border-violet-300 hover:bg-violet-50"}`}>
                  <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-all ${done?"bg-emerald-500 border-emerald-500":"border-slate-300 bg-white"}`}>
                    {done && <Check size={12} className="text-white" strokeWidth={3}/>}
                  </div>
                  <span className={`text-sm font-medium ${done?"line-through opacity-70":""}`}>{habit.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <button onClick={save} className="w-full py-3 bg-violet-600 text-white rounded-lg hover:bg-violet-700 font-semibold flex items-center justify-center gap-2">
        <Check size={18}/> {isEditing ? "Update Check-in" : "Save Check-in"}
      </button>
      {isEditing && (
        <button onClick={() => onDelete(entry.id)} className="w-full mt-2 py-3 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 font-semibold flex items-center justify-center gap-2">
          <Trash2 size={16}/> Delete Entry
        </button>
      )}
    </div>
  );
}

// 
// TASKS TAB
// 
function TasksTab({ isMobile, dailyTasks, saveDailyTasks, kanbanCards, addKanbanCard, updateKanbanCard, deleteKanbanCard, goals, addGoal, updateGoal, deleteGoal }) {
  const [section, setSection] = useState("daily");
  return (
    <div>
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-5">
        {[{id:"daily",label:"Daily",icon:CheckSquare},{id:"kanban",label:"Kanban",icon:Calendar},{id:"goals",label:"Goals",icon:Flag}].map(({id,label,icon:Icon}) => (
          <button key={id} onClick={() => setSection(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${section===id?"bg-white shadow text-slate-900":"text-slate-500 hover:text-slate-700"}`}>
            <Icon size={15}/>{label}
          </button>
        ))}
      </div>
      {section==="daily"  && <DailySection  isMobile={isMobile} dailyTasks={dailyTasks} saveDailyTasks={saveDailyTasks} goals={goals}/>}
      {section==="kanban" && <KanbanSection isMobile={isMobile} kanbanCards={kanbanCards} addKanbanCard={addKanbanCard} updateKanbanCard={updateKanbanCard} deleteKanbanCard={deleteKanbanCard} goals={goals}/>}
      {section==="goals"  && <GoalsSection  goals={goals} addGoal={addGoal} updateGoal={updateGoal} deleteGoal={deleteGoal} dailyTasks={dailyTasks} kanbanCards={kanbanCards}/>}
    </div>
  );
}

function DailySection({ isMobile, dailyTasks, saveDailyTasks, goals }) {
  const [viewDate, setViewDate]     = useState(todayISO());
  const [newTaskText, setNewTaskText] = useState("");
  const [newTaskGoal, setNewTaskGoal] = useState("");
  const [editingTask, setEditingTask] = useState(null);
  const [editText, setEditText] = useState("");
  const [editGoal, setEditGoal] = useState("");
  const calendarRef = useRef(null);

  const tasks = dailyTasks[viewDate]?.tasks || [];
  const isToday = viewDate === todayISO();
  const isTom   = viewDate === tomorrow();
  const done    = tasks.filter(t=>t.status==="complete").length;
  const skipped = tasks.filter(t=>t.status==="skipped").length;
  const pending = tasks.filter(t=>t.status==="pending").length;

  const days14 = Array.from({length:14}, (_,i) => { const d=new Date(); d.setDate(d.getDate()-7+i); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,"0"); const day=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${day}`; });

  useEffect(() => {
    if (calendarRef.current) {
      const todayEl = calendarRef.current.querySelector("[data-istoday='true']");
      if (todayEl) todayEl.scrollIntoView({ behavior: "instant", block: "nearest", inline: "center" });
    }
  }, []);

  const addTask = () => {
    if (!newTaskText.trim()) return;
    const updated = { ...dailyTasks, [viewDate]: { tasks: [...tasks, { id: Date.now(), text: newTaskText.trim(), status: "pending", goalId: newTaskGoal||null }] } };
    saveDailyTasks(updated); setNewTaskText(""); setNewTaskGoal("");
  };

  const saveTaskEdit = (taskId) => {
    if (!editText.trim()) return;
    const updated = { 
      ...dailyTasks, 
      [viewDate]: { 
        tasks: tasks.map(t => 
          t.id === taskId 
            ? { ...t, text: editText.trim(), goalId: editGoal || null } 
            : t
        ) 
      } 
    };
    saveDailyTasks(updated);
    setEditingTask(null);
  };

  const setStatus = (taskId, status) => {
    const updated = { ...dailyTasks, [viewDate]: { tasks: tasks.map(t => t.id===taskId?{...t,status}:t) } };
    saveDailyTasks(updated);
  };

  const deleteTask = (taskId) => {
    const updated = { ...dailyTasks, [viewDate]: { tasks: tasks.filter(t=>t.id!==taskId) } };
    saveDailyTasks(updated);
  };

  const goalColor = (goalId) => {
    if (!goalId) return null;
    const g = goals.find(g=>g.id===goalId);
    if (!g) return null;
    return GOAL_COLORS.find(c=>c.id===g.color)?.hex || "#666";
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-xs font-medium text-slate-500 mb-3">Jump to date</p>
        <div className="-mx-4 px-4 overflow-x-auto" ref={calendarRef}>
          <div className="flex gap-1 pb-2 min-w-max">
            {days14.map(d => {
              const t = dailyTasks[d]?.tasks || [];
              const allDone = t.length>0 && t.every(x=>x.status==="complete");
              const hasPending = t.some(x=>x.status==="pending");
              const isActive = d===viewDate;
              const isT = d===todayISO();
              return (
                <button key={d} onClick={()=>setViewDate(d)} data-istoday={isT}
                  className={`flex-shrink-0 flex flex-col items-center px-2 py-2 rounded-lg text-xs transition-all min-w-[48px] touch-manipulation border ${isActive?"bg-blue-600 text-white border-blue-600":isT?"border-blue-300 text-blue-600 bg-blue-50":"border-transparent text-slate-500 hover:bg-slate-50"}`}>
                  <span className="text-xs opacity-70">{new Date(d+"T00:00:00").toLocaleDateString("en-US",{weekday:"narrow"})}</span>
                  <span className="font-semibold text-sm">{new Date(d+"T00:00:00").getDate()}</span>
                  <div className={`w-1.5 h-1.5 rounded-full mt-0.5 ${allDone?"bg-emerald-400":hasPending?"bg-amber-400":t.length>0?"bg-red-400":"bg-transparent"}`}/>
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
            {tasks.length>0 && <p className="text-xs text-slate-400 mt-0.5">{done} done  {pending} pending  {skipped} skipped</p>}
          </div>
          {tasks.length>0 && (
            <div className="h-2 w-24 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{width:`${tasks.length?Math.round(done/tasks.length*100):0}%`}}/>
            </div>
          )}
        </div>
        {tasks.length===0 && <p className="text-slate-400 text-sm text-center py-4">No tasks for this day yet.</p>}
        <div className="space-y-2 mb-4">
          {tasks.map(t => {
            const gc = goalColor(t.goalId);
            const g  = goals.find(g=>g.id===t.goalId);
            return (
              <div key={t.id} className={`flex items-center gap-2 px-3 ${isMobile?"py-3":"py-2.5"} rounded-lg border transition-all ${t.status==="complete"?"bg-emerald-50 border-emerald-100 opacity-75":t.status==="skipped"?"bg-slate-50 border-slate-100 opacity-60":"bg-white border-slate-200"}`}>
                {editingTask === t.id ? (
                  // EDIT MODE
                  <>
                    <div className="flex items-center gap-2 flex-1">
                      <input 
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && saveTaskEdit(t.id)}
                        className="flex-1 px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:border-blue-500"
                        autoFocus
                      />
                      {goals.length > 0 && (
                        <select 
                          value={editGoal} 
                          onChange={e => setEditGoal(e.target.value)}
                          className="px-2 py-1 text-xs border border-slate-200 rounded max-w-[110px]"
                        >
                          <option value="">No goal</option>
                          {goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                        </select>
                      )}
                    </div>
                    <button 
                      onClick={() => saveTaskEdit(t.id)}
                      className="text-emerald-600 hover:text-emerald-700 flex-shrink-0"
                      title="Save"
                    >
                      <Check size={14}/>
                    </button>
                    <button 
                      onClick={() => setEditingTask(null)}
                      className="text-slate-400 hover:text-slate-600 flex-shrink-0"
                      title="Cancel"
                    >
                      <X size={14}/>
                    </button>
                  </>
                ) : (
                  // VIEW MODE
                  <>
                    <button onClick={()=>setStatus(t.id,t.status==="complete"?"pending":"complete")}
                      className={`${isMobile?"w-9 h-9":"w-6 h-6"} rounded-full flex items-center justify-center flex-shrink-0 border transition-all touch-manipulation ${t.status==="complete"?"bg-emerald-500 border-emerald-500 text-white":"border-slate-300 text-slate-300 hover:border-emerald-400 hover:text-emerald-500"}`}>
                      <Check size={isMobile?15:12}/>
                    </button>
                    <button onClick={()=>setStatus(t.id,t.status==="skipped"?"pending":"skipped")}
                      className={`${isMobile?"w-9 h-9":"w-6 h-6"} rounded-full flex items-center justify-center flex-shrink-0 border transition-all touch-manipulation ${t.status==="skipped"?"bg-slate-400 border-slate-400 text-white":"border-slate-300 text-slate-300 hover:border-slate-400 hover:text-slate-500"}`}>
                      <X size={isMobile?15:12}/>
                    </button>
                    <span className={`flex-1 text-sm ${t.status==="complete"?"line-through text-slate-400":t.status==="skipped"?"line-through text-slate-400":"text-slate-700"}`}>{t.text}</span>
                    {gc && g && <span className="text-xs px-2 py-0.5 rounded-full text-white font-medium flex-shrink-0" style={{background:gc}}>{g.title}</span>}
                    <button
                      onClick={() => {
                        setEditingTask(t.id);
                        setEditText(t.text);
                        setEditGoal(t.goalId || "");
                      }}
                      className={`${isMobile?"p-2":"p-0.5"} text-slate-300 hover:text-blue-600 flex-shrink-0 touch-manipulation`}
                      title="Edit task"
                    >
                      <Edit2 size={14}/>
                    </button>
                    <button onClick={()=>deleteTask(t.id)} className={`${isMobile?"p-2":"p-0.5"} text-slate-300 hover:text-red-400 flex-shrink-0 touch-manipulation`} title="Delete task"><Trash2 size={14}/></button>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex gap-2">
          <input value={newTaskText} onChange={e=>setNewTaskText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addTask()} placeholder="Add a task" className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"/>
          {goals.length>0 && (
            <select value={newTaskGoal} onChange={e=>setNewTaskGoal(e.target.value)} className="px-2 py-2 border border-slate-200 rounded-lg text-xs text-slate-600 max-w-[110px]">
              <option value="">No goal</option>
              {goals.map(g=><option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          )}
          <button onClick={addTask} className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"><Plus size={16}/></button>
        </div>
      </div>
    </div>
  );
}

function KanbanSection({ isMobile, kanbanCards, addKanbanCard, updateKanbanCard, deleteKanbanCard, goals }) {
  const [kanbanView, setKanbanView]   = useState("board");
  const [showAddCard, setShowAddCard] = useState(false);
  const [newTitle, setNewTitle]       = useState("");
  const [newGoal, setNewGoal]         = useState("");
  const [newDue, setNewDue]           = useState("");
  const [newStatus, setNewStatus]     = useState("todo");
  const [editingCard, setEditingCard] = useState(null);
  const [editCardTitle, setEditCardTitle] = useState("");
  const [editCardGoal, setEditCardGoal] = useState("");
  const [editCardDue, setEditCardDue] = useState("");
  const [calStart, setCalStart]       = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay()); // Sunday of current week
    return d.toISOString().split("T")[0];
  });
  const [calSelectedDay, setCalSelectedDay] = useState(null);

  const calDays14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(calStart + "T00:00:00"); d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });
  const calEnd = calDays14[13];
  const shiftCal = (weeks) => {
    const d = new Date(calStart + "T00:00:00"); d.setDate(d.getDate() + weeks * 7);
    setCalStart(d.toISOString().split("T")[0]); setCalSelectedDay(null);
  };
  const calPeriodCards = kanbanCards.filter(c => c.due_date && c.due_date >= calStart && c.due_date <= calEnd);
  const calDoneCount   = calPeriodCards.filter(c => c.status === "done").length;

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    await addKanbanCard({ title: newTitle.trim(), status: newStatus, goal_id: newGoal||null, due_date: newDue||null });
    setNewTitle(""); setNewGoal(""); setNewDue(""); setNewStatus("todo"); setShowAddCard(false);
  };

  const saveCardEdit = async (cardId) => {
    if (!editCardTitle.trim()) return;
    await updateKanbanCard(cardId, {
      title: editCardTitle.trim(),
      goal_id: editCardGoal || null,
      due_date: editCardDue || null
    });
    setEditingCard(null);
  };

  const goalFor   = (goalId) => goals.find(g=>g.id===goalId);
  const colorFor  = (goalId) => { const g=goalFor(goalId); if (!g) return null; return GOAL_COLORS.find(c=>c.id===g.color)?.hex||"#666"; };

  const dueBadge = (card) => {
    if (!card.due_date) return <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded">No due date</span>;
    const label = isoToLabel(card.due_date);
    if (card.status !== "done" && card.due_date < todayISO()) return <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-medium">Overdue · {label}</span>;
    return <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded">{label}</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
        {[{id:"board",label:"Board"},{id:"calendar",label:"2-Week Calendar"}].map(({id,label}) => (
          <button key={id} onClick={() => setKanbanView(id)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${kanbanView===id?"bg-white shadow text-slate-900":"text-slate-500 hover:text-slate-700"}`}>
            {label}
          </button>
        ))}
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
                {dayCards.map(card => {
                  const gc = colorFor(card.goal_id);
                  const g = goalFor(card.goal_id);
                  return (
                    <div key={card.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${KANBAN_COLORS[card.status]}`}>{KANBAN_LABELS[card.status]}</span>
                      <span className="text-sm text-slate-700 flex-1">{card.title}</span>
                      {gc && g && <span className="text-xs px-2 py-0.5 rounded-full text-white font-medium flex-shrink-0" style={{background:gc}}>{g.title}</span>}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {kanbanView === "board" && <>
      <button onClick={()=>setShowAddCard(!showAddCard)} className="w-full py-2.5 bg-slate-800 text-white rounded-xl hover:bg-slate-900 flex items-center justify-center gap-2 text-sm font-medium">
        <Plus size={16}/> Add Kanban Card
      </button>
      {showAddCard && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-800 mb-4">New Card</h3>
          <div className="space-y-3">
            <input value={newTitle} onChange={e=>setNewTitle(e.target.value)} placeholder="Card title" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"/>
            <div className={`grid ${isMobile?"grid-cols-1":"grid-cols-3"} gap-2`}>
              <select value={newStatus} onChange={e=>setNewStatus(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
                {KANBAN_STATUSES.map(s=><option key={s} value={s}>{KANBAN_LABELS[s]}</option>)}
              </select>
              <select value={newGoal} onChange={e=>setNewGoal(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
                <option value="">No goal</option>
                {goals.map(g=><option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
              <input type="date" value={newDue} onChange={e=>setNewDue(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm"/>
            </div>
            <div className="flex gap-2">
              <button onClick={handleAdd} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">Add Card</button>
              <button onClick={()=>setShowAddCard(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm hover:bg-slate-200">Cancel</button>
            </div>
          </div>
        </div>
      )}
      <div className={`grid ${isMobile?"grid-cols-1":"grid-cols-3"} gap-4`}>
        {KANBAN_STATUSES.map(status => {
          const cards = kanbanCards.filter(c=>c.status===status);
          return (
            <div key={status} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className={`px-4 py-3 flex items-center justify-between ${KANBAN_COLORS[status]}`}>
                <span className="font-semibold text-sm">{KANBAN_LABELS[status]}</span>
                <span className="text-xs font-bold bg-white bg-opacity-60 px-2 py-0.5 rounded-full">{cards.length}</span>
              </div>
              <div className="p-3 space-y-2 min-h-[80px]">
                {cards.length===0 && <p className="text-xs text-slate-400 text-center py-3">No cards</p>}
                {cards.map(card => {
                  const gc = colorFor(card.goal_id);
                  const g  = goalFor(card.goal_id);
                  const nextStatus = status==="todo"?"inprogress":status==="inprogress"?"done":null;
                  const prevStatus = status==="done"?"inprogress":status==="inprogress"?"todo":null;
                  return (
                    <div key={card.id} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                      {editingCard === card.id ? (
                        // EDIT MODE
                        <div className="space-y-2">
                          <input 
                            value={editCardTitle}
                            onChange={e => setEditCardTitle(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && saveCardEdit(card.id)}
                            className="w-full px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:border-blue-500"
                            placeholder="Card title"
                            autoFocus
                          />
                          <select 
                            value={editCardGoal} 
                            onChange={e => setEditCardGoal(e.target.value)}
                            className="w-full px-2 py-1 text-sm border border-slate-200 rounded"
                          >
                            <option value="">No goal</option>
                            {goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                          </select>
                          <input 
                            type="date" 
                            value={editCardDue} 
                            onChange={e => setEditCardDue(e.target.value)}
                            className="w-full px-2 py-1 text-sm border border-slate-200 rounded"
                          />
                          <div className="flex gap-1">
                            <button 
                              onClick={() => saveCardEdit(card.id)}
                              className="flex-1 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 font-medium"
                            >
                              Save
                            </button>
                            <button 
                              onClick={() => setEditingCard(null)}
                              className="flex-1 py-1 text-xs bg-slate-200 text-slate-600 rounded hover:bg-slate-300"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        // VIEW MODE
                        <>
                          <div className="flex items-start justify-between gap-1 mb-2">
                            <span className="text-sm font-medium text-slate-800 leading-tight flex-1">{card.title}</span>
                            <div className="flex gap-0.5 flex-shrink-0">
                              <button
                                onClick={() => {
                                  setEditingCard(card.id);
                                  setEditCardTitle(card.title);
                                  setEditCardGoal(card.goal_id || "");
                                  setEditCardDue(card.due_date || "");
                                }}
                                className={`${isMobile?"p-2":"p-0.5"} text-slate-300 hover:text-blue-600 touch-manipulation`}
                                title="Edit card"
                              >
                                <Edit2 size={14}/>
                              </button>
                              <button
                                onClick={()=>deleteKanbanCard(card.id)}
                                className={`${isMobile?"p-2":"p-0.5"} text-slate-300 hover:text-red-400 touch-manipulation`}
                                title="Delete card"
                              >
                                <Trash2 size={14}/>
                              </button>
                            </div>
                          </div>
                          {gc && g && <div className="mb-2"><span className="text-xs px-2 py-0.5 rounded-full text-white font-medium" style={{background:gc}}>{g.title}</span></div>}
                          {dueBadge(card)}
                          <div className="flex gap-1 mt-2">
                            {prevStatus && <button onClick={()=>updateKanbanCard(card.id,{status:prevStatus})} className={`flex-1 ${isMobile?"py-2":"py-1"} text-xs bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-500 touch-manipulation`}>← Back</button>}
                            {nextStatus && <button onClick={()=>updateKanbanCard(card.id,{status:nextStatus})} className={`flex-1 ${isMobile?"py-2":"py-1"} text-xs bg-white border border-slate-200 rounded hover:bg-blue-50 text-blue-600 font-medium touch-manipulation`}>Move →</button>}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      </>}
    </div>
  );
}

function GoalsSection({ goals, addGoal, updateGoal, deleteGoal, dailyTasks, kanbanCards }) {
  const [showForm, setShowForm]     = useState(false);
  const [editGoal, setEditGoal]     = useState(null);
  const [title, setTitle]           = useState("");
  const [desc, setDesc]             = useState("");
  const [color, setColor]           = useState("blue");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const openNew  = () => { setTitle(""); setDesc(""); setColor("blue"); setEditGoal(null); setShowForm(true); };
  const openEdit = (g) => { setTitle(g.title); setDesc(g.description||""); setColor(g.color); setEditGoal(g); setShowForm(true); };
  const cancel   = () => { setShowForm(false); setEditGoal(null); };

  const save = async () => {
    if (!title.trim()) return;
    if (editGoal) await updateGoal(editGoal.id, { title: title.trim(), description: desc.trim(), color });
    else await addGoal({ title: title.trim(), description: desc.trim(), color });
    cancel();
  };

  const goalStats = (goalId) => {
    const allTasks = Object.values(dailyTasks).flatMap(d => d.tasks||[]).filter(t=>t.goalId===goalId);
    const done     = allTasks.filter(t=>t.status==="complete").length;
    const kanban   = kanbanCards.filter(c=>c.goal_id===goalId);
    const kDone    = kanban.filter(c=>c.status==="done").length;
    return { dailyTotal: allTasks.length, dailyDone: done, kanbanTotal: kanban.length, kanbanDone: kDone };
  };

  return (
    <div className="space-y-4">
      <button onClick={openNew} className="w-full py-2.5 bg-slate-800 text-white rounded-xl hover:bg-slate-900 flex items-center justify-center gap-2 text-sm font-medium">
        <Plus size={16}/> Create Goal
      </button>
      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-800 mb-4">{editGoal?"Edit Goal":"New Goal"}</h3>
          <div className="space-y-3">
            <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Goal title" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"/>
            <textarea value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Description (optional)" rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none"/>
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
        </div>
      )}
      {goals.length===0 && !showForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <Flag size={32} className="text-slate-300 mx-auto mb-3"/>
          <p className="text-slate-500 text-sm">No goals yet. Create one to start tagging tasks.</p>
        </div>
      )}
      {goals.map(g => {
        const gc    = GOAL_COLORS.find(c=>c.id===g.color)?.hex || "#666";
        const stats = goalStats(g.id);
        const dailyPct  = stats.dailyTotal  ? Math.round(stats.dailyDone/stats.dailyTotal*100)  : 0;
        const kanbanPct = stats.kanbanTotal ? Math.round(stats.kanbanDone/stats.kanbanTotal*100) : 0;
        return (
          <div key={g.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="h-1.5" style={{background:gc}}/>
            <div className="p-5">
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{background:gc}}/>
                  <h3 className="font-bold text-slate-800">{g.title}</h3>
                </div>
                <div className="flex gap-1">
                  <button onClick={()=>openEdit(g)} className="text-xs px-2 py-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={13}/></button>
                  {confirmDelete===g.id
                    ? <><button onClick={()=>{ deleteGoal(g.id); setConfirmDelete(null); }} className="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600">Delete</button><button onClick={()=>setConfirmDelete(null)} className="text-xs px-2 py-1 bg-slate-100 rounded">Cancel</button></>
                    : <button onClick={()=>setConfirmDelete(g.id)} className="text-xs px-2 py-1 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded"><Trash2 size={13}/></button>
                  }
                </div>
              </div>
              {g.description && <p className="text-sm text-slate-500 mb-4 ml-5">{g.description}</p>}
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-slate-500 mb-1">Daily Tasks</p>
                  <p className="text-lg font-bold text-slate-800">{stats.dailyDone}<span className="text-sm font-normal text-slate-400">/{stats.dailyTotal}</span></p>
                  <div className="h-1.5 bg-slate-200 rounded-full mt-2 overflow-hidden"><div className="h-full rounded-full transition-all" style={{width:`${dailyPct}%`,background:gc}}/></div>
                  <p className="text-xs text-slate-400 mt-1">{dailyPct}% complete</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-slate-500 mb-1">Kanban Cards</p>
                  <p className="text-lg font-bold text-slate-800">{stats.kanbanDone}<span className="text-sm font-normal text-slate-400">/{stats.kanbanTotal}</span></p>
                  <div className="h-1.5 bg-slate-200 rounded-full mt-2 overflow-hidden"><div className="h-full rounded-full transition-all" style={{width:`${kanbanPct}%`,background:gc}}/></div>
                  <p className="text-xs text-slate-400 mt-1">{kanbanPct}% done</p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

//
// TASK INSIGHTS
//
function TaskInsights({ dailyTasks, kanbanCards, goals }) {
  const [timeRange, setTimeRange] = useState("all");

  const stats = (() => {
    const cutoff = timeRange === "all" ? null : (() => { const d=new Date(); d.setDate(d.getDate()-parseInt(timeRange)); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,"0"); const day=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${day}`; })();

    const allTasks = Object.entries(dailyTasks)
      .filter(([date]) => !cutoff || date >= cutoff)
      .flatMap(([date, {tasks}]) => (tasks || []).map(t => ({...t, date})));
    const completed = allTasks.filter(t => t.status === "complete");
    const skipped   = allTasks.filter(t => t.status === "skipped");
    const pending   = allTasks.filter(t => t.status === "pending");
    const completionRate = allTasks.length > 0 ? Math.round((completed.length / allTasks.length) * 100) : 0;

    // Streak: consecutive days (going back from today) with ≥1 completed task
    let streak = 0;
    const checkDate = new Date();
    for (let i = 0; i < 365; i++) {
      const y=checkDate.getFullYear(); const mo=String(checkDate.getMonth()+1).padStart(2,"0"); const dy=String(checkDate.getDate()).padStart(2,"0");
      const ds = `${y}-${mo}-${dy}`;
      const dayTasks = dailyTasks[ds]?.tasks || [];
      if (dayTasks.some(t => t.status === "complete")) { streak++; checkDate.setDate(checkDate.getDate()-1); }
      else if (i === 0) { checkDate.setDate(checkDate.getDate()-1); } // today hasn't been completed yet
      else break;
    }

    // Last 7 days completion data for bar chart
    const last7 = Array.from({length:7}, (_,i) => {
      const d=new Date(); d.setDate(d.getDate()-(6-i));
      const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,"0"); const day=String(d.getDate()).padStart(2,"0");
      const ds=`${y}-${m}-${day}`;
      const dt=dailyTasks[ds]?.tasks||[];
      const done=dt.filter(t=>t.status==="complete").length;
      return { label: new Date(ds+"T00:00:00").toLocaleDateString("en-US",{weekday:"short"}), done, total: dt.length, rate: dt.length > 0 ? Math.round((done/dt.length)*100) : null };
    });

    const byGoal = goals.map(goal => ({
      goal: goal.title, color: goal.color,
      count: completed.filter(t => t.goalId === goal.id).length
    }));

    const kanbanFiltered = !cutoff ? kanbanCards : kanbanCards.filter(c => !c.updated_at || c.updated_at.slice(0,10) >= cutoff);
    const kanbanDone = kanbanFiltered.filter(c => c.status === "done" && c.due_date);
    let early = 0, ontime = 0, late = 0;
    kanbanDone.forEach(card => {
      const diff = Math.floor((new Date(card.updated_at) - new Date(card.due_date + "T00:00:00")) / 86400000);
      if (diff < 0) early++; else if (diff === 0) ontime++; else late++;
    });

    return { total: allTasks.length, completed: completed.length, skipped: skipped.length, pending: pending.length, completionRate, byGoal, kanban: { early, ontime, late, total: kanbanDone.length }, streak, last7 };
  })();

  if (stats.total === 0 && kanbanCards.length === 0) return null;

  const maxLast7 = Math.max(...stats.last7.map(d => d.total), 1);

  return (
    <div className="space-y-4">
      {/* Time range filter */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
        {[["7","7 days"],["30","30 days"],["all","All time"]].map(([val,label]) => (
          <button key={val} onClick={()=>setTimeRange(val)} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${timeRange===val?"bg-white shadow text-slate-900":"text-slate-500 hover:text-slate-700"}`}>{label}</button>
        ))}
      </div>

      {/* Streak + completion rate hero row */}
      {stats.total > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <div className="text-3xl font-bold text-amber-500">{stats.streak}</div>
            <div className="text-xs text-slate-500 mt-0.5">Day Streak</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <div className="text-3xl font-bold text-emerald-600">{stats.completionRate}%</div>
            <div className="text-xs text-slate-500 mt-0.5">Completion Rate</div>
          </div>
        </div>
      )}

      {/* 7-day bar chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><BarChart3 size={15} className="text-blue-500"/> Last 7 Days</h3>
        <div className="flex items-end gap-2 h-20">
          {stats.last7.map(({label, done, total, rate}, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex flex-col justify-end" style={{height:"56px"}}>
                {total > 0 ? (
                  <div className="w-full rounded-t overflow-hidden" style={{height:`${Math.max((total/maxLast7)*56, 8)}px`, background:"#e2e8f0"}}>
                    <div className="w-full rounded-t bg-emerald-500 transition-all" style={{height:`${rate}%`}}/>
                  </div>
                ) : (
                  <div className="w-full rounded-t" style={{height:"4px", background:"#f1f5f9"}}/>
                )}
              </div>
              <span className="text-xs text-slate-400">{label}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-2 text-center">Green = completed, gray = total tasks</p>
      </div>

      {/* Task breakdown */}
      {stats.total > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 mb-4">Task Breakdown</h3>
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="text-center"><div className="text-2xl font-bold text-slate-800">{stats.total}</div><div className="text-xs text-slate-500">Total</div></div>
            <div className="text-center"><div className="text-2xl font-bold text-emerald-600">{stats.completed}</div><div className="text-xs text-slate-500">Done</div></div>
            <div className="text-center"><div className="text-2xl font-bold text-amber-600">{stats.pending}</div><div className="text-xs text-slate-500">Pending</div></div>
            <div className="text-center"><div className="text-2xl font-bold text-slate-400">{stats.skipped}</div><div className="text-xs text-slate-500">Skipped</div></div>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{width:`${stats.completionRate}%`}}/>
          </div>
        </div>
      )}

      {stats.kanban.total > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 mb-4">Kanban Card Timing</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-50 rounded-lg p-3 text-center"><div className="text-2xl font-bold text-emerald-600">{stats.kanban.early}</div><div className="text-xs text-slate-500">Early</div></div>
            <div className="bg-blue-50 rounded-lg p-3 text-center"><div className="text-2xl font-bold text-blue-600">{stats.kanban.ontime}</div><div className="text-xs text-slate-500">On Time</div></div>
            <div className="bg-rose-50 rounded-lg p-3 text-center"><div className="text-2xl font-bold text-rose-600">{stats.kanban.late}</div><div className="text-xs text-slate-500">Overdue</div></div>
          </div>
        </div>
      )}
      {stats.byGoal.filter(g => g.count > 0).length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 mb-4">Completed Tasks by Goal</h3>
          <div className="space-y-2">
            {stats.byGoal.filter(g => g.count > 0).sort((a,b) => b.count-a.count).map(({goal, color, count}) => {
              const hex = GOAL_COLORS.find(c => c.id === color)?.hex || "#666";
              return (
                <div key={goal} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{background:hex}}/>
                  <span className="flex-1 text-sm text-slate-700">{goal}</span>
                  <span className="text-sm font-bold text-slate-800">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

//
// INSIGHTS TAB
//
function InsightsTab({ session, isMobile, dailyTasks, kanbanCards, goals }) {
  const [moodEntries, setMoodEntries] = useState([]);
  const [timeRange, setTimeRange]     = useState("30");
  const uid = session?.user?.id;

  useEffect(() => {
    supabase.from("mood_entries").select("*").eq("user_id", uid).order("date").then(({ data }) => { if (data) setMoodEntries(data); });
  }, []);

  if (moodEntries.length < 3) return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-10 text-center">
        <Lightbulb className="text-slate-300 mx-auto mb-3" size={48}/>
        <h3 className="text-lg font-bold text-slate-500 mb-2">Mood insights will appear here</h3>
        <p className="text-slate-400 text-sm">Log at least 3 mood check-ins to start seeing patterns.</p>
        <p className="text-slate-400 text-sm mt-1">You have {moodEntries.length} so far.</p>
      </div>
      <TaskInsights dailyTasks={dailyTasks} kanbanCards={kanbanCards} goals={goals}/>
    </div>
  );

  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - parseInt(timeRange));
  const filtered = moodEntries.filter(e => new Date(e.date) >= cutoff);

  const tagStats = {};
  filtered.forEach(e => { (e.tags||[]).forEach(tag => { if (!tagStats[tag]) tagStats[tag]={total:0,count:0}; tagStats[tag].total+=e.mood; tagStats[tag].count+=1; }); });
  const tagList = Object.entries(tagStats).map(([tag,{total,count}]) => ({ tag, avg: total/count, count })).filter(t=>t.count>=1).sort((a,b)=>b.avg-a.avg);

  const avgMood   = filtered.length ? (filtered.reduce((s,e)=>s+e.mood,0)/filtered.length).toFixed(1) : 0;
  const avgEnergy = filtered.length ? (filtered.reduce((s,e)=>s+e.energy,0)/filtered.length).toFixed(1) : 0;
  const avgStress = filtered.length ? (filtered.reduce((s,e)=>s+e.stress,0)/filtered.length).toFixed(1) : 0;
  const avgSleep  = filtered.length ? (filtered.reduce((s,e)=>s+e.sleep,0)/filtered.length).toFixed(1) : 0;

  const timeline  = [...filtered].sort((a,b)=>a.date.localeCompare(b.date)).slice(-14);
  const topTags   = tagList.slice(0,5);
  const bottomTags = [...tagList].sort((a,b)=>a.avg-b.avg).slice(0,5);
  const freqTags  = [...tagList].sort((a,b)=>b.count-a.count).slice(0,10);
  const maxCount  = freqTags[0]?.count || 1;

  return (
    <div className="space-y-5">
      <div className="flex gap-2 bg-white rounded-xl p-1 shadow-sm border border-slate-100 w-fit">
        {[["7","7 days"],["30","30 days"],["90","90 days"],["365","All time"]].map(([val,label]) => (
          <button key={val} onClick={()=>setTimeRange(val)} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${timeRange===val?"bg-indigo-600 text-white shadow":"text-slate-500 hover:text-slate-700"}`}>{label}</button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-3">
        {[{label:"Avg Mood",value:avgMood,icon:"",color:MOOD_COLORS(parseFloat(avgMood))},{label:"Avg Energy",value:avgEnergy,icon:"",color:MOOD_COLORS(parseFloat(avgEnergy))},{label:"Avg Stress",value:avgStress,icon:"",color:MOOD_COLORS(9-parseFloat(avgStress))},{label:"Avg Sleep",value:avgSleep,icon:"",color:MOOD_COLORS(parseFloat(avgSleep))}].map(({label,value,icon,color}) => (
          <div key={label} className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 text-center">
            <div className="text-2xl mb-1">{icon}</div>
            <div className={`text-2xl font-bold ${color.text}`}>{value}</div>
            <div className="text-xs text-slate-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>
      {timeline.length >= 2 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><TrendingUp size={16} className="text-indigo-500"/> Mood Timeline</h3>
          <div className="relative" style={{height:"120px"}}>
            <div className="absolute left-0 top-0 bottom-0 w-8 flex flex-col justify-between text-xs text-slate-300 text-right pr-1"><span>8</span><span>4</span><span>1</span></div>
            <div className="ml-10 h-full relative">
              <svg className="absolute inset-0 w-full h-full" style={{overflow:"visible"}}>
                <polyline points={timeline.map((e,i) => { const x=(i/(timeline.length-1))*100; const y=((8-e.mood)/(8-1))*100; return `${x}%,${y}%`; }).join(" ")} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {timeline.map((e,i) => {
                const x=(i/(timeline.length-1))*100; const y=((8-e.mood)/(8-1))*100; const colors=MOOD_COLORS(e.mood);
                return <div key={i} className={`absolute w-3 h-3 ${colors.bg} rounded-full border-2 border-white shadow`} style={{left:`${x}%`,top:`${y}%`,transform:"translate(-50%,-50%)"}} title={`${fmtDisplay(e.date)}: ${e.mood}/8`}/>;
              })}
            </div>
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-2 ml-10">
            <span>{fmtDisplay(timeline[0].date)}</span>
            <span>{fmtDisplay(timeline[timeline.length-1].date)}</span>
          </div>
        </div>
      )}
      {tagList.length > 0 && (
        <div className={`grid ${isMobile?"grid-cols-1":"grid-cols-2"} gap-4`}>
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><span className="text-emerald-500"></span> Best Mood Tags</h3>
            <div className="space-y-2">
              {topTags.map(({tag,avg,count}) => { const colors=MOOD_COLORS(avg); return (
                <div key={tag} className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${colors.light} ${colors.text} min-w-16 text-center`}>{tag}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2"><div className={`${colors.bg} h-2 rounded-full`} style={{width:`${(avg/8)*100}%`}}/></div>
                  <span className={`text-sm font-bold ${colors.text} w-8 text-right`}>{avg.toFixed(1)}</span>
                  <span className="text-xs text-slate-300 w-10 text-right">{count}x</span>
                </div>
              ); })}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><span className="text-rose-500"></span> Lowest Mood Tags</h3>
            <div className="space-y-2">
              {bottomTags.map(({tag,avg,count}) => { const colors=MOOD_COLORS(avg); return (
                <div key={tag} className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${colors.light} ${colors.text} min-w-16 text-center`}>{tag}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2"><div className={`${colors.bg} h-2 rounded-full`} style={{width:`${(avg/8)*100}%`}}/></div>
                  <span className={`text-sm font-bold ${colors.text} w-8 text-right`}>{avg.toFixed(1)}</span>
                  <span className="text-xs text-slate-300 w-10 text-right">{count}x</span>
                </div>
              ); })}
            </div>
          </div>
        </div>
      )}
      {freqTags.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
          <h3 className="font-bold text-slate-800 mb-4">Tag Frequency</h3>
          <div className="space-y-2">
            {freqTags.map(({tag,count,avg}) => { const colors=MOOD_COLORS(avg); return (
              <div key={tag} className="flex items-center gap-3">
                <span className="text-sm text-slate-600 w-24 truncate font-medium">{tag}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-3"><div className={`${colors.bg} h-3 rounded-full transition-all`} style={{width:`${(count/maxCount)*100}%`}}/></div>
                <span className="text-sm text-slate-500 w-10 text-right">{count}x</span>
              </div>
            ); })}
          </div>
        </div>
      )}
      <TaskInsights dailyTasks={dailyTasks} kanbanCards={kanbanCards} goals={goals}/>
    </div>
  );
}
