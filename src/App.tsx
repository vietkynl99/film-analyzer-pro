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
  Check,
  Copy
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { translateToVietnamese, extractOriginalTitleFromPoster, generateYoutubeTitles, generateYoutubeSeoMeta } from "./services/gemini";
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

  const [isTranslating, setIsTranslating] = useState(false);
  const [isExtractingTitle, setIsExtractingTitle] = useState(false);
  const [isGeneratingTitles, setIsGeneratingTitles] = useState(false);
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  // Luôn dùng phong cách kịch tính/gây tò mò mạnh cho tiêu đề YouTube
  const titleStyle: "dramatic" = "dramatic";

  const [isGeneratingSeo, setIsGeneratingSeo] = useState(false);
  const [seoError, setSeoError] = useState<string | null>(null);

  // Global toast error for AI + Firebase operations
  const [appError, setAppError] = useState<string | null>(null);
  // UI state: field that was recently copied (for copy icon -> check icon)
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [isFirebaseConfigured, setIsFirebaseConfigured] = useState(true);

  // Auto-hide global error toast after 3s
  useEffect(() => {
    if (!appError) return;
    const timer = setTimeout(() => setAppError(null), 3000);
    return () => clearTimeout(timer);
  }, [appError]);

  // Auto-hide YouTube SEO error toast sau 3 giây
  useEffect(() => {
    if (!seoError) return;
    const timer = setTimeout(() => {
      setSeoError(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [seoError]);

  // Reset copied icon state after short delay
  useEffect(() => {
    if (!copiedField) return;
    const timer = setTimeout(() => setCopiedField(null), 1500);
    return () => clearTimeout(timer);
  }, [copiedField]);

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
      setAppError("Không kết nối được Firebase. Vui lòng kiểm tra cấu hình và mạng rồi thử lại.");
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

  // Helper: load poster file (original / edited) from input or drag & drop
  const handlePosterFile = (file: File, field: "originalPoster" | "editedPoster") => {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setEditingFilm(prev =>
        prev ? { ...prev, [field]: reader.result as string } as any : prev
      );
    };
    reader.readAsDataURL(file);
  };

  // Helper: copy text to clipboard and toggle copied icon
  const handleCopyToClipboard = async (text: string, fieldId: string, errorMessage: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
    } catch (err) {
      console.error("Clipboard copy failed:", err);
      setAppError(errorMessage);
    }
  };

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
      setAppError("Firebase chưa được cấu hình. Vui lòng vào Settings để thêm credentials trước khi lưu.");
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
      setAppError("Cần nhập ít nhất một thông tin (tiêu đề, tóm tắt hoặc poster) trước khi lưu.");
      return;
    }

    setIsSyncing(true);
    setSyncError(null);
    setSyncSuccess(false);

    try {
      const summary_original = summary_original_raw;
      const summary_vi = summary_vi_raw;

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
        youtubeDescription: editingFilm?.youtubeDescription || "",
        youtubeTags: editingFilm?.youtubeTags || "",
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
      setAppError("Lưu dữ liệu lên Firebase thất bại. Vui lòng thử lại.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleTranslateAndAnalyze = async () => {
    if (!editingFilm || isTranslating) return;

    const sourceSummary = editingFilm.summary_original?.toString().trim();
    if (!sourceSummary) return;

    setIsTranslating(true);
    setSyncError(null);

    try {
      const translatedSummary = await translateToVietnamese(sourceSummary);

      setEditingFilm(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          summary_vi: translatedSummary ?? prev.summary_vi
        };
      });
    } catch (error: any) {
      console.error("Failed to translate content", error);
      setSyncError(error.message || "Failed to translate content");
      setAppError("Dịch summary sang tiếng Việt bằng AI bị lỗi. Vui lòng thử lại.");
    } finally {
      setIsTranslating(false);
    }
  };

  const handleGenerateYoutubeTitles = async () => {
    if (!editingFilm || isGeneratingTitles) return;

    const originalTitle = editingFilm.originalTitle?.toString().trim();
    const cnSummary = editingFilm.summary_original?.toString().trim();

    if (!originalTitle && !cnSummary) {
      setSyncError("Cần ít nhất Original Title hoặc Summary (Chinese) để tạo tiêu đề YouTube.");
      return;
    }

    setIsGeneratingTitles(true);
    setSyncError(null);

    try {
      const sourcePieces = [originalTitle, cnSummary].filter(Boolean).join("\n\n");
      const suggestions = await generateYoutubeTitles(titleStyle, sourcePieces);
      setTitleSuggestions(suggestions);
    } catch (error: any) {
      console.error("Failed to generate YouTube titles", error);
      setSyncError(error.message || "Failed to generate YouTube titles");
      setAppError("Tạo gợi ý tiêu đề YouTube bằng AI bị lỗi. Vui lòng thử lại.");
    } finally {
      setIsGeneratingTitles(false);
    }
  };

  const handleGenerateYoutubeSeo = async () => {
    if (!editingFilm || isGeneratingSeo) return;

    const vietnameseTitle = editingFilm.translatedTitle?.toString().trim();
    const summaryText = (editingFilm.summary_vi || editingFilm.summary_original || "").toString().trim();

    if (!vietnameseTitle) {
      setSyncError("Cần tiêu đề tiếng Việt (Final Title) để tạo mô tả YouTube.");
      return;
    }

    setIsGeneratingSeo(true);
    setSeoError(null);

    try {
      const result = await generateYoutubeSeoMeta(vietnameseTitle, summaryText);

      // Nếu AI trả về rỗng (hoặc chỉ toàn khoảng trắng) thì coi như lỗi để báo lên UI
      if (!result || !result.trim()) {
        const msg = "Không tạo được mô tả YouTube. Vui lòng kiểm tra cấu hình Gemini API rồi thử lại.";
        setSeoError(msg);
        setAppError(msg);
        return;
      }

      const parts = result.split(/TAGS:/i);
      const descriptionBlock = parts[0] || "";
      const tagsBlock = parts[1] || "";

      const youtubeDescription = descriptionBlock.replace(/MÔ TẢ VIDEO:\s*/i, "").trim();
      const youtubeTags = tagsBlock.trim();

      if (!youtubeDescription || !youtubeTags) {
        const msg = "Kết quả mô tả/tags không hợp lệ. Vui lòng thử tạo lại mô tả YouTube.";
        setSeoError(msg);
        setAppError(msg);
        return;
      }

      setEditingFilm(prev =>
        prev
          ? {
              ...prev,
              youtubeDescription,
              youtubeTags,
            }
          : prev
      );
    } catch (error: any) {
      console.error("Failed to generate YouTube SEO meta", error);

      let msg = "Không tạo được mô tả YouTube. Vui lòng kiểm tra Gemini API và thử lại.";

      const rawMessage = String(error?.message || "");
      if (rawMessage.includes("You exceeded your current quota") || rawMessage.includes("RESOURCE_EXHAUSTED")) {
        msg =
          "Đã vượt giới hạn quota miễn phí của Gemini API cho hôm nay. Vui lòng đợi hoặc nâng gói/quota rồi thử lại.";
      }

      setSeoError(msg);
      setAppError(msg);
    } finally {
      setIsGeneratingSeo(false);
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
       setAppError("Xoá dữ liệu trên Firebase thất bại. Vui lòng thử lại.");
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
      youtubeDescription: "",
      youtubeTags: "",
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

        {/* Floating global error toast for AI + Firebase operations */}
        {appError && (
          <div className="fixed top-6 right-6 z-[60]">
            <div className="max-w-sm bg-red-900/90 border border-red-700 rounded-2xl px-4 py-3 shadow-xl shadow-red-900/40">
              <p className="text-xs font-semibold text-red-100 mb-1">Thông báo lỗi</p>
              <p className="text-xs text-red-100/90">{appError}</p>
            </div>
          </div>
        )}

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
                      <h3 className="font-bold text-app-text-primary">Recent Activities</h3>
                      <button onClick={() => setView("films")} className="text-sm text-app-text-secondary hover:text-app-text-primary flex items-center gap-1">
                        View All <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="divide-y divide-app-border">
                      {films.slice(0, 5).map(film => (
                        <div 
                          key={film.id} 
                          onClick={() => openEditModal(film)}
                          className="p-4 hover:bg-app-surface-hover transition-colors flex items-center justify-between group cursor-pointer"
                          title={`${film.translatedTitle || film.title}${
                            film.originalTitle ? ` • ${film.originalTitle}` : ""
                          } • ${STATUS_LABELS[film.status]} • Score: ${film.score || "—"}/10`}
                        >
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
                              <h4 className="font-semibold text-sm text-app-text-primary group-hover:text-app-accent transition-colors">
                                {film.translatedTitle || film.title}
                              </h4>
                              {film.originalTitle && (
                                <p className="text-[11px] text-app-text-secondary/80 italic mt-0.5">
                                  {film.originalTitle}
                                </p>
                              )}
                              <p className="text-[11px] text-app-text-secondary mt-0.5">
                                Score: <span className="font-mono">{film.score || "—"}/10</span>
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <StatusBadge status={film.status} />
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
                        <th className="px-6 py-4 text-xs font-semibold text-app-text-secondary uppercase tracking-wider">Score</th>
                        <th className="px-6 py-4 text-xs font-semibold text-app-text-secondary uppercase tracking-wider text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-app-border">
                      {filteredFilms.map(film => (
                        <tr 
                          key={film.id} 
                          onClick={() => openEditModal(film)}
                          className="hover:bg-app-surface-hover/50 transition-colors group cursor-pointer"
                          title={`${film.translatedTitle || film.title}${
                            film.originalTitle ? ` • ${film.originalTitle}` : ""
                          } • ${STATUS_LABELS[film.status]} • Score: ${film.score || "—"}/10`}
                        >
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
                          <td className="px-6 py-4 text-sm font-mono text-app-text-secondary">
                            {film.score || "—"}/10
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
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
                          setAppError("Health check Firebase thất bại. Vui lòng kiểm tra cấu hình và thử lại.");
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
              className="bg-app-surface rounded-3xl shadow-2xl w-full max-w-7xl max-h-[90vh] overflow-hidden flex flex-col relative z-10 border border-app-border"
            >
              <div className="p-6 border-b border-app-border flex justify-between items-center">
                <h3 className="text-xl font-bold text-app-text-primary">
                  {editingFilm?.id ? "Edit Film" : "New Film"}
                </h3>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2.5 text-xs font-medium text-app-text-secondary hover:text-app-text-primary rounded-full hover:bg-app-surface-hover transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="edit-film-form"
                    disabled={isSyncing}
                    className={`px-6 py-2.5 bg-app-accent text-white rounded-full text-xs font-medium transition-all shadow-lg shadow-app-accent/10 flex items-center gap-2 ${
                      isSyncing ? "opacity-70 cursor-not-allowed" : "hover:opacity-90"
                    }`}
                  >
                    {isSyncing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save"
                    )}
                  </button>
                </div>
              </div>

              <form
                id="edit-film-form"
                onSubmit={handleSaveFilm}
                className="flex-1 overflow-y-auto p-8 space-y-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-[4fr_2fr] lg:grid-cols-[8fr_2fr] gap-8">
                  {/* Left Column: Bilingual Content + Metadata */}
                  <div className="space-y-6">
                    {/* Titles - Aligned by Language Columns */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <label className="block text-[11px] font-semibold text-app-text-secondary uppercase tracking-wider">
                            Original Title
                          </label>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={isExtractingTitle || !editingFilm?.originalPoster}
                              onClick={async () => {
                                if (!editingFilm?.originalPoster || isExtractingTitle) return;
                                setIsExtractingTitle(true);
                                setSyncError(null);
                                try {
                                  const title = await extractOriginalTitleFromPoster(editingFilm.originalPoster);
                                  if (!title) {
                                    const msg = "AI không đọc được tiêu đề từ poster. Vui lòng thử lại hoặc nhập tay.";
                                    setAppError(msg);
                                    return;
                                  }
                                  const viTitle = await translateToVietnamese(title);
                                  const combined = viTitle ? `${title} (${viTitle})` : title;
                                  setEditingFilm(prev => (prev ? { ...prev, originalTitle: combined } : prev));
                                } catch (error: any) {
                                  console.error("Failed to extract title from poster", error);
                                  let msg = "AI không đọc được tiêu đề từ poster. Vui lòng thử lại hoặc nhập tay.";
                                  const rawMessage = String(error?.message || "");
                                  if (rawMessage.includes("You exceeded your current quota") || rawMessage.includes("RESOURCE_EXHAUSTED")) {
                                    msg =
                                      "Đã vượt giới hạn quota miễn phí của Gemini API cho hôm nay. Lấy tiêu đề từ poster tạm thời không dùng được.";
                                  }
                                  setSyncError(error.message || "Failed to extract title from poster");
                                  setAppError(msg);
                                } finally {
                                  setIsExtractingTitle(false);
                                }
                              }}
                              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-medium tracking-wide transition-all ${
                                isExtractingTitle || !editingFilm?.originalPoster
                                  ? "border-app-border text-app-text-secondary/60 bg-app-surface-hover cursor-not-allowed"
                                  : "border-app-accent/60 text-app-accent bg-app-accent/10 hover:bg-app-accent/20"
                              }`}
                            >
                              {isExtractingTitle ? (
                                <>
                                  <span className="w-3 h-3 border-2 border-app-accent/40 border-t-app-accent rounded-full animate-spin" />
                                  Analyzing...
                                </>
                              ) : (
                                <>
                                  <span>✨ Lấy từ poster</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                        <input
                          type="text"
                          value={editingFilm?.originalTitle || ""}
                          onChange={e => setEditingFilm({ ...editingFilm, originalTitle: e.target.value })}
                          placeholder="中文剧名"
                          className="w-full px-4 py-3 bg-app-surface-hover border border-app-border rounded-xl focus:outline-none focus:ring-2 focus:ring-app-accent/20 transition-all text-app-text-primary placeholder:text-app-text-secondary/50"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-[11px] font-semibold text-app-text-secondary uppercase tracking-wider">
                            Final Title
                          </label>
                          <button
                            type="button"
                            disabled={isGeneratingTitles || (!editingFilm?.originalTitle && !editingFilm?.summary_original)}
                            onClick={handleGenerateYoutubeTitles}
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-medium tracking-wide transition-all ${
                              isGeneratingTitles || (!editingFilm?.originalTitle && !editingFilm?.summary_original)
                                ? "border-app-border text-app-text-secondary/60 bg-app-surface-hover cursor-not-allowed"
                                : "border-app-accent/60 text-app-accent bg-app-accent/10 hover:bg-app-accent/20"
                            }`}
                          >
                            {isGeneratingTitles ? (
                              <>
                                <span className="w-3 h-3 border-2 border-amber-400/40 border-t-amber-300 rounded-full animate-spin" />
                                Đang tạo...
                              </>
                            ) : (
                              <>
                                <span>✨ Tạo tiêu đề YouTube</span>
                              </>
                            )}
                          </button>
                        </div>
                        <input
                          type="text"
                          value={editingFilm?.translatedTitle || ""}
                          onChange={e => setEditingFilm({ ...editingFilm, translatedTitle: e.target.value, title: e.target.value })}
                          placeholder="Tiêu đề YouTube tiếng Việt"
                          className="w-full px-4 py-3 bg-app-surface-hover border border-app-border rounded-xl focus:outline-none focus:ring-2 focus:ring-app-accent/20 transition-all text-app-text-primary placeholder:text-app-text-secondary/50"
                        />
                      </div>
                    </div>

                    {/* Metadata under Titles */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-app-text-secondary uppercase tracking-wider mb-2">
                          Score
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            required
                            type="range"
                            min="1"
                            max="10"
                            step="1"
                            value={editingFilm?.score || 1}
                            onChange={e =>
                              setEditingFilm({ ...editingFilm, score: parseInt(e.target.value) || 1 })
                            }
                            className="flex-1 accent-app-accent"
                          />
                          <span className="w-10 text-xs font-mono text-app-text-primary text-right">
                            {editingFilm?.score || 1}
                          </span>
                        </div>
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
                            <option key={status} value={status} className="bg-app-surface">
                              {STATUS_LABELS[status as ProductionStatus]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* YouTube Title Suggestions */}
                    {(isGeneratingTitles || titleSuggestions.length > 0) && (
                      <div className="glass-card bg-app-surface-hover/40 border border-app-border rounded-2xl p-4 space-y-3">
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {isGeneratingTitles && titleSuggestions.length === 0 && (
                            <div className="text-[12px] text-app-text-secondary">
                              Đang tạo 3–5 tiêu đề đề xuất...
                            </div>
                          )}
                          {titleSuggestions.map((suggestion, index) => (
                            <div
                              key={`${suggestion}-${index}`}
                              className="p-3 rounded-xl border border-app-border bg-app-surface hover:border-app-accent/40 hover:bg-app-surface-hover/60 transition-colors"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="text-sm font-medium text-app-text-primary">
                                  {suggestion}
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingFilm(prev =>
                                      prev
                                        ? { ...prev, translatedTitle: suggestion, title: suggestion }
                                        : prev
                                    )
                                  }
                                  className="ml-2 px-2.5 py-1 rounded-full text-[10px] font-medium border border-app-accent text-app-accent bg-app-accent/10 hover:bg-app-accent/20 transition-all whitespace-nowrap"
                                >
                                  Chọn làm tiêu đề
                                </button>
                              </div>
                            </div>
                          ))}
                          {!isGeneratingTitles && titleSuggestions.length === 0 && (
                            <div className="text-[12px] text-app-text-secondary">
                              Không tạo được gợi ý nào. Thử kiểm tra lại Original Title hoặc Summary (Chinese).
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Summary - Side by Side, Matched Height */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-semibold text-app-text-secondary uppercase tracking-wider mb-2">
                          Summary (Chinese)
                        </label>
                        <div className="relative">
                          <textarea
                            rows={10}
                            value={editingFilm?.summary_original || ""}
                            onChange={e => setEditingFilm({ ...editingFilm, summary_original: e.target.value })}
                            placeholder="中文剧情简介"
                            className="w-full pr-14 px-4 py-3 bg-app-surface-hover border border-app-border rounded-xl focus:outline-none focus:ring-2 focus:ring-app-accent/20 transition-all resize-none text-sm text-app-text-primary placeholder:text-app-text-secondary/50 h-64 overflow-y-auto"
                          />
                          <button
                            type="button"
                            disabled={!editingFilm?.summary_original}
                            onClick={() =>
                              handleCopyToClipboard(
                                editingFilm?.summary_original || "",
                                "summary_cn",
                                "Không copy được Summary (Chinese) vào clipboard."
                              )
                            }
                            className={`absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-md border transition-all text-[11px] ${
                              !editingFilm?.summary_original
                                ? "border-app-border text-app-text-secondary/60 bg-app-surface cursor-not-allowed"
                                : "border-app-border text-app-text-primary bg-app-surface hover:bg-app-surface-hover"
                            }`}
                            title="Copy"
                          >
                            {copiedField === "summary_cn" ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2 gap-2">
                          <label className="block text-[11px] font-semibold text-app-text-secondary uppercase tracking-wider">
                            Summary (Vietnamese)
                          </label>
                          <button
                            type="button"
                            disabled={isTranslating || !editingFilm?.summary_original}
                            onClick={handleTranslateAndAnalyze}
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-medium tracking-wide transition-all ${
                              isTranslating || !editingFilm?.summary_original
                                ? "border-app-border text-app-text-secondary/60 bg-app-surface-hover cursor-not-allowed"
                                : "border-app-accent/60 text-app-accent bg-app-accent/10 hover:bg-app-accent/20"
                            }`}
                          >
                            {isTranslating ? (
                              <>
                                <span className="w-3 h-3 border-2 border-app-accent/40 border-t-app-accent rounded-full animate-spin" />
                                Translating...
                              </>
                            ) : (
                              <>
                                <span>✨Dịch</span>
                              </>
                            )}
                          </button>
                        </div>
                        <div className="relative">
                          <textarea
                            rows={10}
                            value={editingFilm?.summary_vi || ""}
                            onChange={e => setEditingFilm({ ...editingFilm, summary_vi: e.target.value })}
                            placeholder="Tóm tắt nội dung tiếng Việt"
                            className="w-full pr-14 px-4 py-3 bg-app-surface-hover border border-app-border rounded-xl focus:outline-none focus:ring-2 focus:ring-app-accent/20 transition-all resize-none text-sm text-app-text-primary placeholder:text-app-text-secondary/50 h-64 overflow-y-auto"
                          />
                          <button
                            type="button"
                            disabled={!editingFilm?.summary_vi}
                            onClick={() =>
                              handleCopyToClipboard(
                                editingFilm?.summary_vi || "",
                                "summary_vi",
                                "Không copy được Summary (Vietnamese) vào clipboard."
                              )
                            }
                            className={`absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-md border transition-all text-[11px] ${
                              !editingFilm?.summary_vi
                                ? "border-app-border text-app-text-secondary/60 bg-app-surface cursor-not-allowed"
                                : "border-app-border text-app-text-primary bg-app-surface hover:bg-app-surface-hover"
                            }`}
                            title="Copy"
                          >
                            {copiedField === "summary_vi" ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* YouTube SEO Description & Tags (UI giống Summary) */}
                    {seoError && !isGeneratingSeo && (
                      <div className="text-[12px] text-red-300 bg-red-900/30 border border-red-800/60 rounded-xl px-3 py-2 mt-4">
                        {seoError}
                      </div>
                    )}
                    {isGeneratingSeo && !editingFilm?.youtubeDescription && !editingFilm?.youtubeTags && (
                      <div className="text-[12px] text-app-text-secondary mt-2">
                        Đang tạo mô tả và tags YouTube...
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      <div>
                        <div className="flex items-center justify-between mb-2 gap-2">
                          <label className="block text-[11px] font-semibold text-app-text-secondary uppercase tracking-wider">
                            Mô tả video YouTube
                          </label>
                          <button
                            type="button"
                            disabled={isGeneratingSeo || !editingFilm?.translatedTitle}
                            onClick={handleGenerateYoutubeSeo}
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-medium tracking-wide transition-all ${
                              isGeneratingSeo || !editingFilm?.translatedTitle
                                ? "border-app-border text-app-text-secondary/60 bg-app-surface-hover cursor-not-allowed"
                                : "border-app-accent/60 text-app-accent bg-app-accent/10 hover:bg-app-accent/20"
                            }`}
                          >
                            {isGeneratingSeo ? (
                              <>
                                <span className="w-3 h-3 border-2 border-emerald-400/40 border-t-emerald-300 rounded-full animate-spin" />
                                Đang tạo mô tả...
                              </>
                            ) : (
                              <>
                                <span>✨ Tạo mô tả & tags</span>
                              </>
                            )}
                          </button>
                        </div>
                        <div className="relative">
                          <textarea
                            rows={10}
                            value={editingFilm?.youtubeDescription || ""}
                            onChange={e =>
                              setEditingFilm(prev =>
                                prev ? { ...prev, youtubeDescription: e.target.value } : prev
                              )
                            }
                            placeholder="Mô tả YouTube tối ưu SEO cho cả series..."
                            className="w-full pr-14 pl-4 py-3 bg-app-surface-hover border border-app-border rounded-xl focus:outline-none focus:ring-2 focus:ring-app-accent/20 transition-all resize-none text-sm text-app-text-primary placeholder:text-app-text-secondary/50 h-64 overflow-y-auto"
                          />
                          <button
                            type="button"
                            disabled={!editingFilm?.youtubeDescription}
                            onClick={() =>
                              handleCopyToClipboard(
                                editingFilm?.youtubeDescription || "",
                                "youtube_description",
                                "Không copy được mô tả YouTube vào clipboard."
                              )
                            }
                            className={`absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-md border transition-all ${
                              !editingFilm?.youtubeDescription
                                ? "border-app-border text-app-text-secondary/60 bg-app-surface cursor-not-allowed"
                                : "border-app-border text-app-text-primary bg-app-surface hover:bg-app-surface-hover"
                            }`}
                            title="Copy"
                          >
                            {copiedField === "youtube_description" ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-app-text-secondary uppercase tracking-wider mb-2">
                          Tags YouTube
                        </label>
                        <div className="relative">
                          <textarea
                            rows={10}
                            value={editingFilm?.youtubeTags || ""}
                            onChange={e =>
                              setEditingFilm(prev =>
                                prev ? { ...prev, youtubeTags: e.target.value } : prev
                              )
                            }
                            placeholder="tag1, tag2, tag3, ..."
                            className="w-full pr-14 px-4 py-3 bg-app-surface-hover border border-app-border rounded-xl focus:outline-none focus:ring-2 focus:ring-app-accent/20 transition-all resize-none text-sm text-app-text-primary placeholder:text-app-text-secondary/50 h-64 overflow-y-auto"
                          />
                          <button
                            type="button"
                            disabled={!editingFilm?.youtubeTags}
                            onClick={() =>
                              handleCopyToClipboard(
                                editingFilm?.youtubeTags || "",
                                "youtube_tags",
                                "Không copy được Tags YouTube vào clipboard."
                              )
                            }
                            className={`absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-md border transition-all text-[11px] ${
                              !editingFilm?.youtubeTags
                                ? "border-app-border text-app-text-secondary/60 bg-app-surface cursor-not-allowed"
                                : "border-app-border text-app-text-primary bg-app-surface hover:bg-app-surface-hover"
                            }`}
                            title="Copy"
                          >
                            {copiedField === "youtube_tags" ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Assets (Posters) */}
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-app-text-secondary uppercase tracking-wider">
                          Visual Reference
                        </span>
                      </div>
                      <div className="space-y-4">
                        {/* Original Poster */}
                        <div>
                          <label className="block text-[11px] font-semibold text-app-text-secondary uppercase tracking-wider mb-2">
                            Original Poster
                          </label>
                          <div
                            className="relative group aspect-[3/4] max-h-64 bg-app-surface-hover border-2 border-dashed border-app-border rounded-xl overflow-hidden flex flex-col items-center justify-center transition-all hover:border-app-accent/50"
                            onDragOver={e => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "copy";
                            }}
                            onDrop={e => {
                              e.preventDefault();
                              const file = e.dataTransfer.files?.[0];
                              if (file) handlePosterFile(file, "originalPoster");
                            }}
                          >
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
                                  <label className="cursor-pointer p-1.5 bg-app-surface text-app-text-secondary rounded-full hover:bg-app-surface-hover transition-colors">
                                    <Upload className="w-3.5 h-3.5" />
                                    <input 
                                      type="file" 
                                      className="hidden" 
                                      accept="image/*"
                                      onChange={async e => {
                                        const file = e.target.files?.[0];
                                        if (file) handlePosterFile(file, "originalPoster");
                                      }}
                                    />
                                  </label>
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
                                    if (file) handlePosterFile(file, "originalPoster");
                                  }}
                                />
                              </label>
                            )}
                          </div>
                        </div>

                        {/* Edited Poster */}
                        <div>
                          <label className="block text-[11px] font-semibold text-app-text-secondary uppercase tracking-wider mb-2">
                            Edited Poster
                          </label>
                          <div
                            className="relative group aspect-[3/4] max-h-64 bg-app-surface-hover border-2 border-dashed border-app-border rounded-xl overflow-hidden flex flex-col items-center justify-center transition-all hover:border-app-accent/50"
                            onDragOver={e => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "copy";
                            }}
                            onDrop={e => {
                              e.preventDefault();
                              const file = e.dataTransfer.files?.[0];
                              if (file) handlePosterFile(file, "editedPoster");
                            }}
                          >
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
                                  <label className="cursor-pointer p-1.5 bg-app-surface text-app-text-secondary rounded-full hover:bg-app-surface-hover transition-colors">
                                    <Upload className="w-3.5 h-3.5" />
                                    <input 
                                      type="file" 
                                      className="hidden" 
                                      accept="image/*"
                                      onChange={async e => {
                                        const file = e.target.files?.[0];
                                        if (file) handlePosterFile(file, "editedPoster");
                                      }}
                                    />
                                  </label>
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
                                    if (file) handlePosterFile(file, "editedPoster");
                                  }}
                                />
                              </label>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer actions moved to header for easier access */}
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
