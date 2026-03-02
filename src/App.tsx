import React, { useState, useEffect } from "react";
import { Film, ProductionStatus } from "./types";
import { api } from "./services/api";
import { 
  LayoutDashboard, 
  Film as FilmIcon, 
  Plus, 
  Search, 
  Filter, 
  MoreHorizontal,
  TrendingUp,
  Clock,
  AlertCircle,
  ChevronRight,
  X,
  Upload,
  Trash2,
  CheckCircle2,
  Settings as SettingsIcon,
  Database,
  Wifi,
  WifiOff,
  RefreshCw,
  Check
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { translateToVietnamese, isChinese } from "./services/gemini";
import { STATUS_COLORS, STATUS_LABELS, STATUS_OPTIONS } from "./constants";

// --- Components ---

const StatCard = ({ title, value, icon: Icon, trend }: any) => (
  <div className="glass-card p-6 rounded-2xl">
    <div className="flex justify-between items-start mb-4">
      <div className="p-2 bg-app-surface-hover rounded-lg">
        <Icon className="w-5 h-5 text-app-text-secondary" />
      </div>
      {trend && (
        <span className="text-xs font-medium text-emerald-400 bg-emerald-900/30 px-2 py-1 rounded-full border border-emerald-800/50">
          {trend}
        </span>
      )}
    </div>
    <h3 className="text-app-text-secondary text-sm font-medium">{title}</h3>
    <p className="text-2xl font-bold mt-1 text-app-text-primary">{value}</p>
  </div>
);

const StatusBadge = ({ status }: { status: ProductionStatus }) => (
  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[status]}`}>
    {STATUS_LABELS[status]}
  </span>
);

// --- Main App ---

export default function App() {
  const [view, setView] = useState<"dashboard" | "films" | "settings">("dashboard");
  const [films, setFilms] = useState<Film[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFilm, setEditingFilm] = useState<Partial<Film> | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [deleteTarget, setDeleteTarget] = useState<Film | null>(null);
  
  // New states for Settings and Sync
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "connecting">("connecting");
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState(false);

  const [isFirebaseConfigured, setIsFirebaseConfigured] = useState(true);

  useEffect(() => {
    // Check if critical Firebase keys are present and not placeholders
    const isPlaceholder = (val: string | undefined) => !val || val.includes("YOUR_") || val === "undefined";
    
    const isConfigured = !(
      isPlaceholder(import.meta.env.VITE_FIREBASE_API_KEY) ||
      isPlaceholder(import.meta.env.VITE_FIREBASE_PROJECT_ID) ||
      isPlaceholder(import.meta.env.VITE_FIREBASE_APP_ID)
    );
    setIsFirebaseConfigured(isConfigured);
    
    setIsLoading(true);
    setConnectionStatus("connecting");
    
    const unsubscribe = api.subscribeToFilms((data) => {
      console.log("Received films update from Firestore:", data.length);
      setFilms(data);
      setIsLoading(false);
      setConnectionStatus("connected");
      setLastSyncTime(new Date().toLocaleTimeString());
    }, (error) => {
      console.error("Failed to subscribe to films:", error);
      setConnectionStatus("disconnected");
      setSyncError("Connection failed: " + error.message);
      setIsLoading(false);
    });

    // Simple online/offline listeners as a proxy for connection status
    const handleOnline = () => {
      console.log("Browser is online");
      setConnectionStatus("connected");
    };
    const handleOffline = () => {
      console.log("Browser is offline");
      setConnectionStatus("disconnected");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      unsubscribe();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const loadFilms = async () => {
    // No longer needed for manual refresh as we have real-time subscription
    // but keeping it as a no-op to avoid breaking other calls if any
  };

  const handleSaveFilm = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Submission lock
    if (isSyncing) return;

    if (!isFirebaseConfigured) {
      setSyncError("Firebase is not configured. Please add credentials in Settings.");
      return;
    }

    // Data Cleaning & Validation
    const cleanStr = (str: any) => {
      if (typeof str !== 'string') return null;
      const trimmed = str.trim();
      return trimmed === "" ? null : trimmed;
    };

    const originalTitle = cleanStr(editingFilm?.originalTitle);
    const translatedTitle = cleanStr(editingFilm?.translatedTitle);
    const summary_original_raw = cleanStr(editingFilm?.summary_original);
    const summary_vi_raw = cleanStr(editingFilm?.summary_vi);
    const originalPoster = editingFilm?.originalPoster || null;
    const editedPoster = editingFilm?.editedPoster || null;

    // Minimum Creation Rule: At least one of the 6 fields must have a value
    const hasValue = originalTitle || translatedTitle || summary_original_raw || summary_vi_raw || originalPoster || editedPoster;

    if (!hasValue) {
      setSyncError("Please provide at least one piece of information (title, summary, or poster).");
      return;
    }

    setIsSyncing(true);
    setSyncError(null);
    setSyncSuccess(false);

    try {
      let summary_original = summary_original_raw;
      let summary_vi = summary_vi_raw;

      // If summary_original is empty but summary_vi has content, and it's Chinese
      // This handles the case where the user typed into the single field
      const currentSummary = summary_original || summary_vi;
      
      if (currentSummary && isChinese(currentSummary)) {
        summary_original = currentSummary;
        // Only translate if summary_vi is empty or different
        if (!summary_vi || summary_vi === summary_original) {
          summary_vi = await translateToVietnamese(summary_original);
        }
      } else if (currentSummary) {
        summary_vi = currentSummary;
        summary_original = (summary_original === summary_vi) ? null : summary_original;
      }

      // Ensure title is set to translatedTitle for display consistency
      const filmToSave = {
        ...editingFilm,
        originalTitle,
        translatedTitle,
        score: Math.floor(editingFilm?.score || 1),
        summary_original,
        summary_vi: summary_vi || "",
        originalPoster,
        editedPoster,
        title: translatedTitle || originalTitle || "Untitled Film"
      };

      if (editingFilm?.id) {
        await api.updateFilm(editingFilm.id, filmToSave);
      } else {
        await api.createFilm(filmToSave);
      }
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 3000);
      setIsModalOpen(false);
      setEditingFilm(null);
    } catch (error: any) {
      console.error("Failed to save film", error);
      setSyncError(error.message || "Failed to sync with database");
    } finally {
      setIsSyncing(false);
    }
  };

  const performDeleteFilm = async (id: string) => {
    setIsSyncing(true);
    try {
      await api.deleteFilm(id);
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 3000);
    } catch (error: any) {
      console.error("Failed to delete film", error);
      setSyncError(error.message || "Failed to delete from database");
    } finally {
      setIsSyncing(false);
    }
  };

  const openEditModal = (film: Film | null = null) => {
    setEditingFilm(film || { 
      title: "", 
      originalTitle: "",
      translatedTitle: "",
      score: 1,
      status: ProductionStatus.IN_ANALYSIS,
      summary_original: "",
      summary_vi: "",
    });
    setIsModalOpen(true);
  };

  const filteredFilms = filterStatus === "All" 
    ? films 
    : films.filter(f => f.status === filterStatus);

  // Stats
  const totalFilms = films.length;
  const inProduction = films.filter(f => f.status === ProductionStatus.IN_ANALYSIS).length;
  const released = films.filter(f => f.status === ProductionStatus.RELEASED).length;
  const missingPoster = films.filter(f => !f.originalPoster).length;
  const missingSynopsis = films.filter(f => !f.summary_vi || f.summary_vi.length < 10).length;

  return (
    <div className="min-h-screen flex bg-app-bg text-app-text-primary">
      {/* Sidebar */}
      <aside className="w-64 border-r border-app-border bg-app-surface flex flex-col sticky top-0 h-screen">
        <div className="p-6 border-b border-app-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-app-accent rounded-lg flex items-center justify-center">
              <FilmIcon className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-bold text-lg tracking-tight text-app-text-primary">FilmAnalyzer</h1>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              connectionStatus === "connected" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : 
              connectionStatus === "connecting" ? "bg-amber-500 animate-pulse" : "bg-red-500"
            }`} />
            <span className="text-[10px] font-semibold text-app-text-secondary uppercase tracking-widest">
              {connectionStatus}
            </span>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          <button 
            onClick={() => setView("dashboard")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${view === "dashboard" ? "bg-app-accent text-white" : "text-app-text-secondary hover:bg-app-surface-hover hover:text-app-text-primary"}`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </button>
          <button 
            onClick={() => setView("films")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${view === "films" ? "bg-app-accent text-white" : "text-app-text-secondary hover:bg-app-surface-hover hover:text-app-text-primary"}`}
          >
            <FilmIcon className="w-4 h-4" />
            All Films
          </button>
          <button 
            onClick={() => setView("settings")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${view === "settings" ? "bg-app-accent text-white" : "text-app-text-secondary hover:bg-app-surface-hover hover:text-app-text-primary"}`}
          >
            <SettingsIcon className="w-4 h-4" />
            Settings
          </button>
        </nav>

        <div className="p-4 border-t border-app-border">
          <div className="bg-app-surface-hover rounded-xl p-4">
            <p className="text-xs font-semibold text-app-text-secondary uppercase tracking-wider mb-2">Storage</p>
            <div className="w-full bg-app-border h-1.5 rounded-full overflow-hidden">
              <div className="bg-app-accent h-full w-1/3"></div>
            </div>
            <p className="text-[10px] text-app-text-secondary mt-2">1.2GB of 10GB used</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        {/* Header */}
        <header className="h-16 border-b border-app-border bg-app-surface/80 backdrop-blur-md sticky top-0 z-10 px-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold capitalize text-app-text-primary">{view}</h2>
            {isSyncing && (
              <div className="flex items-center gap-2 px-3 py-1 bg-app-accent/10 border border-app-accent/20 rounded-full">
                <RefreshCw className="w-3 h-3 text-app-accent animate-spin" />
                <span className="text-[10px] font-medium text-app-accent uppercase tracking-wider">Syncing...</span>
              </div>
            )}
            {syncSuccess && (
              <div className="flex items-center gap-2 px-3 py-1 bg-emerald-900/20 border border-emerald-800/50 rounded-full">
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-[10px] font-medium text-emerald-400 uppercase tracking-wider">Saved</span>
              </div>
            )}
            {syncError && (
              <div className="flex items-center gap-2 px-3 py-1 bg-red-900/20 border border-red-800/50 rounded-full">
                <AlertCircle className="w-3 h-3 text-red-400" />
                <span className="text-[10px] font-medium text-red-400 uppercase tracking-wider">Sync Error</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-app-text-secondary" />
              <input 
                type="text" 
                placeholder="Search projects..." 
                className="pl-10 pr-4 py-2 bg-app-surface-hover border border-app-border rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-app-accent/20 w-64 text-app-text-primary placeholder:text-app-text-secondary/50"
              />
            </div>
            <button 
              onClick={() => openEditModal()}
              className="bg-app-accent text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              New Film
            </button>
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto w-full">
          {view === "dashboard" ? (
            <div className="space-y-8">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Total Films" value={totalFilms} icon={FilmIcon} trend="+12%" />
                <StatCard title="In Production" value={inProduction} icon={TrendingUp} />
                <StatCard title="Released" value={released} icon={CheckCircle2} />
                <StatCard title="Avg. Score" value={(films.reduce((acc, f) => acc + (f.score || 0), 0) / (films.length || 1)).toFixed(1)} icon={Clock} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Recent Activity */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="glass-card rounded-2xl overflow-hidden">
                    <div className="p-6 border-b border-app-border flex justify-between items-center">
                      <h3 className="font-bold text-app-text-primary">Recent Projects</h3>
                      <button onClick={() => setView("films")} className="text-sm text-app-text-secondary hover:text-app-text-primary flex items-center gap-1">
                        View All <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="divide-y divide-app-border">
                      {films.slice(0, 5).map(film => (
                        <div key={film.id} className="p-4 hover:bg-app-surface-hover transition-colors flex items-center justify-between group">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-16 bg-app-surface-hover rounded-lg overflow-hidden flex-shrink-0 border border-app-border">
                              {film.originalPoster ? (
                                <img src={film.originalPoster} alt={film.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-app-text-secondary/30">
                                  <FilmIcon className="w-6 h-6" />
                                </div>
                              )}
                            </div>
                            <div>
                              <h4 className="font-semibold text-sm text-app-text-primary group-hover:text-app-accent transition-colors">{film.title}</h4>
                              <p className="text-xs text-app-text-secondary mt-1">{film.director || "No director assigned"}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <StatusBadge status={film.status} />
                            <button onClick={() => openEditModal(film)} className="p-2 text-app-text-secondary hover:text-app-text-primary opacity-0 group-hover:opacity-100 transition-all">
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {films.length === 0 && (
                        <div className="p-12 text-center text-app-text-secondary">
                          No films found. Create your first project to get started.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quality Control */}
                <div className="space-y-6">
                  <div className="glass-card rounded-2xl p-6">
                    <h3 className="font-bold mb-4 flex items-center gap-2 text-app-text-primary">
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                      Quality Control
                    </h3>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center p-3 bg-amber-900/20 rounded-xl border border-amber-800/50">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-app-surface rounded-lg">
                            <FilmIcon className="w-4 h-4 text-amber-500" />
                          </div>
                          <span className="text-sm font-medium text-amber-200">Missing Posters</span>
                        </div>
                        <span className="text-lg font-bold text-amber-500">{missingPoster}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-app-surface-hover rounded-xl border border-app-border">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-app-surface rounded-lg">
                            <Clock className="w-4 h-4 text-app-text-secondary" />
                          </div>
                          <span className="text-sm font-medium text-app-text-primary">Low Detail</span>
                        </div>
                        <span className="text-lg font-bold text-app-text-secondary">{missingSynopsis}</span>
                      </div>
                    </div>
                    <button className="w-full mt-6 py-2 text-sm font-medium text-app-text-secondary hover:text-app-text-primary border border-app-border rounded-xl hover:bg-app-surface-hover transition-all">
                      Run Full Audit
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : view === "films" ? (
            <div className="space-y-6">
              {/* Filters */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <div className="flex gap-1">
                    {["All", ...STATUS_OPTIONS].map(status => (
                      <button 
                        key={status}
                        onClick={() => setFilterStatus(status)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${filterStatus === status ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300"}`}
                      >
                        {status === "All" ? "All" : STATUS_LABELS[status as ProductionStatus]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="glass-card rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-app-surface-hover/50 border-b border-app-border">
                        <th className="px-6 py-4 text-xs font-semibold text-app-text-secondary uppercase tracking-wider">Film</th>
                        <th className="px-6 py-4 text-xs font-semibold text-app-text-secondary uppercase tracking-wider">Status</th>
                        <th className="px-6 py-4 text-xs font-semibold text-app-text-secondary uppercase tracking-wider">Director</th>
                        <th className="px-6 py-4 text-xs font-semibold text-app-text-secondary uppercase tracking-wider">Score</th>
                        <th className="px-6 py-4 text-xs font-semibold text-app-text-secondary uppercase tracking-wider text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-app-border">
                      {filteredFilms.map(film => (
                        <tr key={film.id} className="hover:bg-app-surface-hover/50 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-14 bg-app-surface-hover rounded-md overflow-hidden flex-shrink-0 border border-app-border">
                                {film.originalPoster ? (
                                  <img src={film.originalPoster} alt={film.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-app-text-secondary/30">
                                    <FilmIcon className="w-5 h-5" />
                                  </div>
                                )}
                              </div>
                              <div>
                                <div className="font-semibold text-app-text-primary">{film.translatedTitle || film.title}</div>
                                <div className="text-[10px] text-app-text-secondary opacity-70 italic">{film.originalTitle}</div>
                                <div className="text-[10px] text-app-text-secondary mt-0.5">{film.genre || "Uncategorized"}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <StatusBadge status={film.status} />
                          </td>
                          <td className="px-6 py-4 text-sm text-app-text-secondary">
                            {film.director || "—"}
                          </td>
                          <td className="px-6 py-4 text-sm font-mono text-app-text-secondary">
                            {film.score || "—"}/10
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button 
                                onClick={() => openEditModal(film)}
                                className="p-2 text-app-text-secondary hover:text-app-text-primary hover:bg-app-surface rounded-lg border border-transparent hover:border-app-border transition-all"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => setDeleteTarget(film)}
                                className="p-2 text-app-text-secondary hover:text-red-400 hover:bg-red-900/20 rounded-lg border border-transparent hover:border-red-900/50 transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredFilms.length === 0 && (
                    <div className="p-12 text-center text-app-text-secondary">
                      No films match the current filter.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl space-y-8">
              {!isFirebaseConfigured && (
                <div className="p-6 bg-red-900/20 border border-red-800/50 rounded-2xl flex items-start gap-4">
                  <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0" />
                  <div>
                    <h4 className="font-bold text-red-500">Firebase Not Configured</h4>
                    <p className="text-sm text-red-200/70 mt-1">
                      Critical environment variables are missing. Please add your Firebase credentials to the 
                      <strong> Secrets</strong> panel in AI Studio to enable persistent storage.
                    </p>
                  </div>
                </div>
              )}
              <div className="glass-card rounded-2xl p-8">
                <div className="flex items-center gap-4 mb-8">
                  <div className="p-3 bg-app-accent/10 rounded-2xl">
                    <Database className="w-6 h-6 text-app-accent" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-app-text-primary">Database Status</h3>
                    <p className="text-sm text-app-text-secondary">Monitor your Firebase connection and sync health.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-6 bg-app-surface-hover rounded-2xl border border-app-border">
                    <div className="flex justify-between items-start mb-4">
                      <span className="text-xs font-bold text-app-text-secondary uppercase tracking-wider">Connection</span>
                      {connectionStatus === "connected" ? (
                        <Wifi className="w-4 h-4 text-emerald-500" />
                      ) : connectionStatus === "connecting" ? (
                        <RefreshCw className="w-4 h-4 text-amber-500 animate-spin" />
                      ) : (
                        <WifiOff className="w-4 h-4 text-red-500" />
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${
                        connectionStatus === "connected" ? "bg-emerald-500" : 
                        connectionStatus === "connecting" ? "bg-amber-500" : "bg-red-500"
                      }`} />
                      <span className="text-lg font-bold capitalize text-app-text-primary">{connectionStatus}</span>
                    </div>
                    <p className="text-xs text-app-text-secondary mt-2">
                      {connectionStatus === "connected" ? "System is online and syncing." : "Attempting to reach Firebase..."}
                    </p>
                  </div>

                  <div className="p-6 bg-app-surface-hover rounded-2xl border border-app-border">
                    <div className="flex justify-between items-start mb-4">
                      <span className="text-xs font-bold text-app-text-secondary uppercase tracking-wider">Last Sync</span>
                      <Clock className="w-4 h-4 text-app-text-secondary" />
                    </div>
                    <div className="text-lg font-bold text-app-text-primary">{lastSyncTime || "Never"}</div>
                    <p className="text-xs text-app-text-secondary mt-2">Time of last successful data fetch.</p>
                  </div>

                  <div className="p-6 bg-app-surface-hover rounded-2xl border border-app-border">
                    <div className="flex justify-between items-start mb-4">
                      <span className="text-xs font-bold text-app-text-secondary uppercase tracking-wider">Environment</span>
                      <AlertCircle className="w-4 h-4 text-app-text-secondary" />
                    </div>
                    <div className="text-lg font-bold text-app-text-primary">Production</div>
                    <p className="text-xs text-app-text-secondary mt-2">Current application deployment tier.</p>
                  </div>

                  <div className="p-6 bg-app-surface-hover rounded-2xl border border-app-border">
                    <div className="flex justify-between items-start mb-4">
                      <span className="text-xs font-bold text-app-text-secondary uppercase tracking-wider">Health Check</span>
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    </div>
                    <button 
                      onClick={async () => {
                        setIsSyncing(true);
                        try {
                          await api.getFilms();
                          setSyncSuccess(true);
                          setTimeout(() => setSyncSuccess(false), 2000);
                        } catch (e) {
                          setSyncError("Health check failed");
                        } finally {
                          setIsSyncing(false);
                        }
                      }}
                      className="text-sm font-bold text-app-accent hover:underline flex items-center gap-2"
                    >
                      Run Manual Check
                    </button>
                    <p className="text-xs text-app-text-secondary mt-2">Verify database responsiveness.</p>
                  </div>
                </div>
              </div>

              <div className="glass-card rounded-2xl p-8">
                <h3 className="text-lg font-bold text-app-text-primary mb-4">System Information</h3>
                <div className="space-y-4">
                  <div className="flex justify-between py-3 border-b border-app-border">
                    <span className="text-sm text-app-text-secondary">Platform</span>
                    <span className="text-sm font-medium text-app-text-primary">Firebase Firestore</span>
                  </div>
                  <div className="flex justify-between py-3 border-b border-app-border">
                    <span className="text-sm text-app-text-secondary">Region</span>
                    <span className="text-sm font-medium text-app-text-primary">Global (Multi-region)</span>
                  </div>
                  <div className="flex justify-between py-3">
                    <span className="text-sm text-app-text-secondary">Version</span>
                    <span className="text-sm font-medium text-app-text-primary">v1.2.0-stable</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-app-surface rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col relative z-10 border border-app-border"
            >
              <div className="p-6 border-b border-app-border flex justify-between items-center">
                <h3 className="text-xl font-bold text-app-text-primary">{editingFilm?.id ? "Edit Film" : "New Film"}</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-app-surface-hover rounded-full transition-colors text-app-text-secondary hover:text-app-text-primary">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveFilm} className="flex-1 overflow-y-auto p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Left Column: Info */}
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 gap-5">
                      <div>
                        <label className="block text-xs font-bold text-app-text-secondary uppercase tracking-wider mb-2">Original Title (Chinese)</label>
                        <input 
                          type="text" 
                          value={editingFilm?.originalTitle || ""}
                          onChange={e => setEditingFilm({ ...editingFilm, originalTitle: e.target.value })}
                          placeholder="中文剧名"
                          className="w-full px-4 py-3 bg-app-surface-hover border border-app-border rounded-xl focus:outline-none focus:ring-2 focus:ring-app-accent/20 transition-all text-app-text-primary placeholder:text-app-text-secondary/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-app-text-secondary uppercase tracking-wider mb-2">Translated Title (Vietnamese – YouTube)</label>
                        <input 
                          type="text" 
                          value={editingFilm?.translatedTitle || ""}
                          onChange={e => setEditingFilm({ ...editingFilm, translatedTitle: e.target.value, title: e.target.value })}
                          placeholder="Tên phim tiếng Việt"
                          className="w-full px-4 py-3 bg-app-surface-hover border border-app-border rounded-xl focus:outline-none focus:ring-2 focus:ring-app-accent/20 transition-all text-app-text-primary placeholder:text-app-text-secondary/50"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-app-text-secondary uppercase tracking-wider mb-2">Score (1–10)</label>
                        <input 
                          required
                          type="number" 
                          step="1"
                          min="1"
                          max="10"
                          value={editingFilm?.score || 1}
                          onChange={e => setEditingFilm({ ...editingFilm, score: parseInt(e.target.value) || 1 })}
                          className="w-full px-4 py-3 bg-app-surface-hover border border-app-border rounded-xl focus:outline-none focus:ring-2 focus:ring-app-accent/20 transition-all font-mono text-app-text-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-app-text-secondary uppercase tracking-wider mb-2">Production Status</label>
                        <select 
                          required
                          value={editingFilm?.status || ProductionStatus.IN_ANALYSIS}
                          onChange={e => setEditingFilm({ ...editingFilm, status: e.target.value as ProductionStatus })}
                          className="w-full px-4 py-3 bg-app-surface-hover border border-app-border rounded-xl focus:outline-none focus:ring-2 focus:ring-app-accent/20 transition-all appearance-none text-app-text-primary"
                        >
                          {STATUS_OPTIONS.map(status => (
                            <option key={status} value={status} className="bg-app-surface">{STATUS_LABELS[status as ProductionStatus]}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-app-text-secondary uppercase tracking-wider mb-2">Summary (Chinese or Vietnamese)</label>
                      <textarea 
                        rows={6}
                        value={editingFilm?.summary_original || editingFilm?.summary_vi || ""}
                        onChange={e => {
                          const val = e.target.value;
                          if (isChinese(val)) {
                            setEditingFilm({ ...editingFilm, summary_original: val, summary_vi: "" });
                          } else {
                            setEditingFilm({ ...editingFilm, summary_vi: val, summary_original: null });
                          }
                        }}
                        placeholder="Provide a detailed plot summary..."
                        className="w-full px-4 py-3 bg-app-surface-hover border border-app-border rounded-xl focus:outline-none focus:ring-2 focus:ring-app-accent/20 transition-all resize-none text-app-text-primary placeholder:text-app-text-secondary/50"
                      />
                    </div>
                  </div>

                  {/* Right Column: Assets */}
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      {/* Original Poster */}
                      <div>
                        <label className="block text-xs font-bold text-app-text-secondary uppercase tracking-wider mb-3">Original Poster</label>
                        <div className="relative group aspect-[3/4] w-full bg-app-surface-hover border-2 border-dashed border-app-border rounded-xl overflow-hidden flex flex-col items-center justify-center transition-all hover:border-app-accent/50">
                          {editingFilm?.originalPoster ? (
                            <>
                              <img src={editingFilm.originalPoster} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <button 
                                  type="button"
                                  onClick={() => setEditingFilm({ ...editingFilm, originalPoster: undefined })}
                                  className="p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </>
                          ) : (
                            <label className="cursor-pointer flex flex-col items-center p-4 text-center">
                              <Upload className="w-6 h-6 text-app-text-secondary/30 mb-2" />
                              <span className="text-xs font-medium text-app-text-secondary">Upload</span>
                              <input 
                                type="file" 
                                className="hidden" 
                                accept="image/*"
                                onChange={async e => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onloadend = () => {
                                      setEditingFilm({ ...editingFilm, originalPoster: reader.result as string });
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                            </label>
                          )}
                        </div>
                      </div>

                      {/* Edited Poster */}
                      <div>
                        <label className="block text-xs font-bold text-app-text-secondary uppercase tracking-wider mb-3">Edited Poster</label>
                        <div className="relative group aspect-[3/4] w-full bg-app-surface-hover border-2 border-dashed border-app-border rounded-xl overflow-hidden flex flex-col items-center justify-center transition-all hover:border-app-accent/50">
                          {editingFilm?.editedPoster ? (
                            <>
                              <img src={editingFilm.editedPoster} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <button 
                                  type="button"
                                  onClick={() => setEditingFilm({ ...editingFilm, editedPoster: undefined })}
                                  className="p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </>
                          ) : (
                            <label className="cursor-pointer flex flex-col items-center p-4 text-center">
                              <Upload className="w-6 h-6 text-app-text-secondary/30 mb-2" />
                              <span className="text-xs font-medium text-app-text-secondary">Upload</span>
                              <input 
                                type="file" 
                                className="hidden" 
                                accept="image/*"
                                onChange={async e => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onloadend = () => {
                                      setEditingFilm({ ...editingFilm, editedPoster: reader.result as string });
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-app-border flex justify-end gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2.5 text-sm font-medium text-app-text-secondary hover:text-app-text-primary transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isSyncing}
                    className={`px-8 py-2.5 bg-app-accent text-white rounded-full text-sm font-medium transition-all shadow-lg shadow-app-accent/10 flex items-center gap-2 ${isSyncing ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90'}`}
                  >
                    {isSyncing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteTarget(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-app-surface rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col relative z-10 border border-app-border"
            >
              <div className="p-6 border-b border-app-border flex items-center gap-3">
                <div className="p-2 rounded-full bg-red-900/30 border border-red-800/60">
                  <Trash2 className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-app-text-primary">Delete film?</h3>
                  <p className="text-xs text-app-text-secondary mt-1">
                    This action cannot be undone. The film will be permanently removed from your library.
                  </p>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-app-surface-hover border border-app-border rounded-2xl p-4 flex gap-3 items-start">
                  <div className="w-9 h-12 bg-app-surface rounded-md overflow-hidden flex-shrink-0 border border-app-border">
                    {deleteTarget.originalPoster ? (
                      <img
                        src={deleteTarget.originalPoster}
                        alt={deleteTarget.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-app-text-secondary/30">
                        <FilmIcon className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-app-text-primary">
                      {deleteTarget.translatedTitle || deleteTarget.title}
                    </div>
                    {deleteTarget.originalTitle && (
                      <div className="text-[11px] text-app-text-secondary/70 italic mt-0.5">
                        {deleteTarget.originalTitle}
                      </div>
                    )}
                    <div className="text-[11px] text-app-text-secondary mt-2">
                      Are you sure you want to permanently delete this film?
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(null)}
                    className="px-5 py-2.5 text-sm font-medium text-app-text-secondary hover:text-app-text-primary rounded-full hover:bg-app-surface-hover transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSyncing}
                    onClick={async () => {
                      if (!deleteTarget?.id) {
                        setDeleteTarget(null);
                        return;
                      }
                      await performDeleteFilm(deleteTarget.id);
                      setDeleteTarget(null);
                    }}
                    className={`px-5 py-2.5 rounded-full text-sm font-medium flex items-center gap-2 border transition-all ${
                      isSyncing
                        ? "bg-red-600/70 border-red-700/80 text-white cursor-not-allowed opacity-80"
                        : "bg-red-600 hover:bg-red-500 border-red-700 text-white shadow-lg shadow-red-900/40"
                    }`}
                  >
                    {isSyncing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
