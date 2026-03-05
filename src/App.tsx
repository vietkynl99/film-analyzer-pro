import React, { useState, useEffect, useRef } from "react";
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
  Copy,
  Eye,
  EyeOff
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { translateToVietnamese, extractOriginalTitleFromPoster, generateYoutubeTitles, generateYoutubeSeoMeta } from "./services/gemini";
import { STATUS_COLORS, STATUS_LABELS, STATUS_OPTIONS } from "./constants";
import {
  getStoredFirebaseConfig,
  getStoredFirebaseConfigRaw,
  getStoredGeminiApiKey,
  isFirebaseConfigComplete,
  parseFirebaseConfigInput,
  setStoredFirebaseConfigRaw,
  setStoredGeminiApiKey,
} from "./lib/appConfig";

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

const FIREBASE_CONFIG_SAMPLE = `{
  "apiKey": "",
  "authDomain": "",
  "databaseURL": "",
  "projectId": "",
  "storageBucket": "",
  "messagingSenderId": "",
  "appId": "",
  "measurementId": ""
}`;

const extractAndNormalizeVideoUrl = (input: string): string => {
  const raw = String(input || "").trim();
  if (!raw) return "";

  const candidates = raw.match(/https?:\/\/[^\s]+/gi) || [];
  const preferred =
    candidates.find(url => /douyin\.com/i.test(url)) ||
    candidates[0] ||
    raw;

  let cleaned = preferred.trim();
  cleaned = cleaned.replace(/[),.!?;:'"<>]+$/g, "");

  try {
    const parsed = new URL(cleaned);
    if (parsed.pathname !== "/") {
      parsed.pathname = parsed.pathname.replace(/\/+$/g, "");
    }
    return parsed.toString();
  } catch {
    return cleaned.replace(/\/+$/g, "");
  }
};

const toClickableUrl = (input: string): string | null => {
  const value = String(input || "").trim();
  if (!/^https?:\/\//i.test(value)) return null;
  return value;
};

// --- Main App ---

export default function App() {
  const [view, setView] = useState<"dashboard" | "films" | "settings">("dashboard");
  const [films, setFilms] = useState<Film[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFilm, setEditingFilm] = useState<Partial<Film> | null>(null);
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [filterCollections, setFilterCollections] = useState<string[]>([]);
  const [isFilterCollectionsOpen, setIsFilterCollectionsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Film | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [sortField, setSortField] = useState<"updated" | "score">("updated");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  
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

  // Inline picker "Lưu vào..." cho Collections (chọn nhiều + tạo mới)
  const [collectionPicker, setCollectionPicker] = useState<{
    filmId: string;
    selected: string[];
    newName: string;
  } | null>(null);
  // Input tạm cho phần chỉnh sửa collections trong Edit Film modal
  const [editingCollectionsInput, setEditingCollectionsInput] = useState<string>("");
  const filterCollectionsRef = useRef<HTMLDivElement | null>(null);
  const statusFilterRef = useRef<HTMLDivElement | null>(null);
  const [isStatusFilterOpen, setIsStatusFilterOpen] = useState(false);

  const [isFirebaseConfigured, setIsFirebaseConfigured] = useState(true);
  const [settingsGeminiApiKey, setSettingsGeminiApiKey] = useState<string>("");
  const [showGeminiApiKey, setShowGeminiApiKey] = useState(false);
  const [settingsFirebaseConfig, setSettingsFirebaseConfig] = useState<string>("");
  const [showFirebaseConfig, setShowFirebaseConfig] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [firebaseConfigVersion, setFirebaseConfigVersion] = useState(0);
  const [isVideoUrlEditing, setIsVideoUrlEditing] = useState(true);
  const settingsHydratedRef = useRef(false);
  const lastSavedGeminiApiKeyRef = useRef("");
  const lastSavedFirebaseRawRef = useRef("");
  const firebaseConfigTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const videoUrlInputRef = useRef<HTMLInputElement | null>(null);

  const allCollections = React.useMemo(
    () =>
      Array.from(
        new Set(
          films.flatMap(f => (f.collections && Array.isArray(f.collections) ? f.collections : []))
        )
      ).sort((a, b) => String(a).localeCompare(String(b))),
    [films]
  );

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
    if (!isModalOpen || !isVideoUrlEditing) return;
    const id = window.setTimeout(() => {
      videoUrlInputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [isModalOpen, isVideoUrlEditing]);

  useEffect(() => {
    if (!settingsMessage) return;
    const timer = setTimeout(() => setSettingsMessage(null), 2500);
    return () => clearTimeout(timer);
  }, [settingsMessage]);

  useEffect(() => {
    const savedGeminiApiKey = getStoredGeminiApiKey();
    const savedFirebaseRaw = getStoredFirebaseConfigRaw();

    setSettingsGeminiApiKey(savedGeminiApiKey);
    setSettingsFirebaseConfig(savedFirebaseRaw || FIREBASE_CONFIG_SAMPLE);

    lastSavedGeminiApiKeyRef.current = savedGeminiApiKey;
    lastSavedFirebaseRawRef.current = savedFirebaseRaw;
    settingsHydratedRef.current = true;
  }, []);

  useEffect(() => {
    const firebaseConfig = getStoredFirebaseConfig();
    const isConfigured = isFirebaseConfigComplete(firebaseConfig);
    setIsFirebaseConfigured(isConfigured);

    if (!isConfigured) {
      setConnectionStatus("disconnected");
      setIsLoading(false);
      setFilms([]);
      return;
    }

    setIsLoading(true);
    setConnectionStatus("connecting");

    const unsubscribe = api.subscribeToFilms(
      (data) => {
        console.log("Received films update from Firestore:", data.length);
        setFilms(data);
        setIsLoading(false);
        setConnectionStatus("connected");
        setLastSyncTime(new Date().toLocaleTimeString());
      },
      (error) => {
        console.error("Failed to subscribe to films:", error);
        setConnectionStatus("disconnected");
        setSyncError("Connection failed: " + error.message);
        setAppError("Khong ket noi duoc Firebase. Vui long kiem tra cau hinh va mang roi thu lai.");
        setIsLoading(false);
      }
    );

    // Simple online/offline listeners as a proxy for connection status
    const handleOnline = () => {
      console.log("Browser is online");
      setConnectionStatus((prev) => (prev === "disconnected" ? "connecting" : prev));
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
  }, [firebaseConfigVersion]);

  useEffect(() => {
    if (!settingsHydratedRef.current) return;

    const timer = setTimeout(() => {
      const currentGeminiApiKey = settingsGeminiApiKey.trim();
      if (currentGeminiApiKey !== lastSavedGeminiApiKeyRef.current) {
        setStoredGeminiApiKey(currentGeminiApiKey);
        lastSavedGeminiApiKeyRef.current = currentGeminiApiKey;
      }

      const rawFirebaseInput = settingsFirebaseConfig.trim();
      const currentStoredRaw = lastSavedFirebaseRawRef.current;

      if (!rawFirebaseInput) {
        if (currentStoredRaw !== "") {
          setStoredFirebaseConfigRaw("");
          lastSavedFirebaseRawRef.current = "";
          setSettingsMessage("Auto-saved.");
          setFirebaseConfigVersion((prev) => prev + 1);
        }
        return;
      }

      try {
        parseFirebaseConfigInput(settingsFirebaseConfig);
        if (rawFirebaseInput !== currentStoredRaw.trim()) {
          setStoredFirebaseConfigRaw(settingsFirebaseConfig);
          lastSavedFirebaseRawRef.current = settingsFirebaseConfig;
          setSettingsMessage("Auto-saved.");
          setFirebaseConfigVersion((prev) => prev + 1);
        }
      } catch {
        setSettingsMessage("Firebase JSON invalid, not saved.");
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [settingsGeminiApiKey, settingsFirebaseConfig]);

  useEffect(() => {
    if (view !== "settings") return;
    // Let layout settle before measuring scrollHeight.
    const id = window.requestAnimationFrame(() => {
      const el = firebaseConfigTextareaRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    });
    return () => window.cancelAnimationFrame(id);
  }, [settingsFirebaseConfig, showFirebaseConfig, view]);

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

  const maskedFirebaseConfig = settingsFirebaseConfig.replace(/[^\s]/g, "•");

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
    const videoUrl = cleanStr(editingFilm?.videoUrl);
    const summary_original_raw = cleanStr(editingFilm?.summary_original);
    const summary_vi_raw = cleanStr(editingFilm?.summary_vi);
    const originalPoster = editingFilm?.originalPoster || null;
    const editedPoster = editingFilm?.editedPoster || null;

    // Minimum Creation Rule: At least one of the 6 fields must have a value
    const hasValue = videoUrl || originalTitle || translatedTitle || summary_original_raw || summary_vi_raw || originalPoster || editedPoster;

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
        videoUrl,
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
      videoUrl: "",
      originalTitle: "",
      translatedTitle: "",
      score: 1,
      status: ProductionStatus.IN_ANALYSIS,
      summary_original: "",
      summary_vi: "",
      youtubeDescription: "",
      youtubeTags: "",
      collections: [],
    });
    setIsVideoUrlEditing(!(film?.videoUrl && toClickableUrl(film.videoUrl)));
    setEditingCollectionsInput("");
    setIsModalOpen(true);
  };

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredFilms = films.filter(f => {
    if (filterStatuses.length > 0 && !filterStatuses.includes(f.status as any)) return false;

    if (filterCollections.length > 0) {
      const cols = Array.isArray(f.collections) ? f.collections : [];
      const hasAny = filterCollections.some(c => cols.includes(c));
      if (!hasAny) return false;
    }

    if (!normalizedSearch) return true;
    const haystack = `${f.translatedTitle || ""} ${f.title || ""} ${f.originalTitle || ""}`.toLowerCase();
    return haystack.includes(normalizedSearch);
  });

  const FILMS_PER_PAGE = 10;

  const paginatedBase = [...filteredFilms].sort((a, b) => {
    let aVal = 0;
    let bVal = 0;

    if (sortField === "updated") {
      const aTime = (a as any).updatedAt || (a as any).createdAt || "";
      const bTime = (b as any).updatedAt || (b as any).createdAt || "";
      aVal = aTime ? new Date(aTime).getTime() || 0 : 0;
      bVal = bTime ? new Date(bTime).getTime() || 0 : 0;
    } else if (sortField === "score") {
      aVal = typeof a.score === "number" ? a.score : 0;
      bVal = typeof b.score === "number" ? b.score : 0;
    }

    if (sortDirection === "asc") {
      return aVal - bVal;
    }
    return bVal - aVal;
  });

  const totalPages = Math.max(1, Math.ceil(paginatedBase.length / FILMS_PER_PAGE));
  const paginatedFilms = paginatedBase.slice(
    (currentPage - 1) * FILMS_PER_PAGE,
    currentPage * FILMS_PER_PAGE
  );

  // Reset hoặc clamp lại currentPage khi filter/search thay đổi hoặc số lượng films thay đổi
  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatuses, filterCollections, normalizedSearch, sortField, sortDirection]);

  useEffect(() => {
    const newTotalPages = Math.max(1, Math.ceil(paginatedBase.length / FILMS_PER_PAGE));
    if (currentPage > newTotalPages) {
      setCurrentPage(newTotalPages);
    }
  }, [paginatedBase.length, currentPage]);

  // Đóng dropdown filters khi click ra ngoài
  useEffect(() => {
    if (!isFilterCollectionsOpen && !isStatusFilterOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const targetNode = event.target as Node;

      if (
        filterCollectionsRef.current &&
        !filterCollectionsRef.current.contains(targetNode)
      ) {
        setIsFilterCollectionsOpen(false);
      }

      if (statusFilterRef.current && !statusFilterRef.current.contains(targetNode)) {
        setIsStatusFilterOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isFilterCollectionsOpen, isStatusFilterOpen]);

  // Stats
  const totalFilms = films.length;
  const inProduction = films.filter(f => f.status === ProductionStatus.IN_ANALYSIS).length;
  const released = films.filter(f => f.status === ProductionStatus.RELEASED).length;
  const missingPoster = films.filter(f => !f.originalPoster).length;
  const missingSynopsis = films.filter(f => !f.summary_vi || f.summary_vi.length < 10).length;

  return (
    <div className="min-h-screen flex bg-app-bg text-app-text-primary">
      {/* Sidebar */}
      <aside className="w-64 border-r border-app-border bg-app-surface flex flex-col">
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
                placeholder="Search films by title..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 bg-app-surface-hover border border-app-border rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-app-accent/20 w-64 text-app-text-primary placeholder:text-app-text-secondary/50"
              />
              {normalizedSearch && (
                <div className="absolute mt-2 left-0 w-80 max-h-80 overflow-y-auto bg-app-surface border border-app-border rounded-2xl shadow-xl z-20">
                  {filteredFilms.slice(0, 8).length > 0 ? (
                    filteredFilms.slice(0, 8).map(film => (
                      <button
                        key={`search-${film.id}`}
                        type="button"
                        onClick={() => {
                          openEditModal(film);
                          setSearchQuery("");
                        }}
                        className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-app-surface-hover transition-colors"
                      >
                        <div className="w-8 h-10 bg-app-surface-hover rounded-md overflow-hidden flex-shrink-0 border border-app-border">
                          {film.originalPoster ? (
                            <img
                              src={film.originalPoster}
                              alt={film.title}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-app-text-secondary/30">
                              <FilmIcon className="w-4 h-4" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-app-text-primary truncate">
                            {film.translatedTitle || film.title}
                          </div>
                          {film.originalTitle && (
                            <div className="text-[11px] text-app-text-secondary/80 italic truncate">
                              {film.originalTitle}
                            </div>
                          )}
                          <div className="text-[11px] text-app-text-secondary mt-0.5">
                            Score: <span className="font-mono">{film.score || "—"}/10</span>
                          </div>
                        </div>
                        <StatusBadge status={film.status} />
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-[12px] text-app-text-secondary">
                      Không tìm thấy phim phù hợp.
                    </div>
                  )}
                </div>
              )}
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
                <StatCard title="Total Films" value={totalFilms} icon={FilmIcon} />
                <StatCard title="In Analysis" value={inProduction} icon={TrendingUp} />
                <StatCard title="Released" value={released} icon={CheckCircle2} />
                <StatCard
                  title="Avg. Score"
                  value={(
                    films.reduce((acc, f) => acc + (f.score || 0), 0) /
                    (films.length || 1)
                  ).toFixed(1)}
                  icon={Clock}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Recent Activity */}
                <div className="lg:col-span-3 space-y-6">
                  <div className="glass-card rounded-2xl overflow-hidden">
                    <div className="p-6 border-b border-app-border flex justify-between items-center">
                      <h3 className="font-bold text-app-text-primary">Recent Activities</h3>
                      <button onClick={() => setView("films")} className="text-sm text-app-text-secondary hover:text-app-text-primary flex items-center gap-1">
                        View All <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="divide-y divide-app-border">
                      {filteredFilms.slice(0, 5).map(film => (
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
              </div>
            </div>
          ) : view === "films" ? (
            <div className="space-y-4">
              {/* Filters + Pagination */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Status filter (dropdown) */}
                    <div
                      className="relative flex items-center gap-2 text-xs"
                      ref={statusFilterRef}
                    >
                      <Filter className="w-4 h-4 text-slate-400" />
                      <button
                        type="button"
                        onClick={() => setIsStatusFilterOpen(open => !open)}
                        className="px-3 py-1.5 bg-app-surface-hover border border-app-border rounded-full text-[11px] text-app-text-primary flex items-center gap-2 hover:border-app-accent/60 hover:text-app-accent"
                      >
                        <span className="truncate max-w-[120px]">
                          {filterStatuses.length === 0
                            ? "All status"
                            : `${filterStatuses.length} status`}
                        </span>
                        <ChevronRight
                          className={`w-3 h-3 transition-transform ${
                            isStatusFilterOpen ? "rotate-90" : "rotate-0"
                          }`}
                        />
                      </button>

                      {isStatusFilterOpen && (
                        <div className="absolute z-30 top-full mt-2 left-0 w-56 bg-app-surface border border-app-border rounded-2xl shadow-xl p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-app-text-primary">
                              Status
                            </span>
                            {filterStatuses.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setFilterStatuses([]);
                                  setIsStatusFilterOpen(false);
                                }}
                                className="text-[11px] text-app-text-secondary hover:text-app-accent"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                          <div className="space-y-1 text-[11px] text-app-text-primary max-h-48 overflow-y-auto">
                            {STATUS_OPTIONS.map(status => {
                              const checked = filterStatuses.includes(status);
                              return (
                                <label
                                  key={`status-filter-${status}`}
                                  className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-app-surface-hover cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={e => {
                                      const isChecked = e.target.checked;
                                      setFilterStatuses(prev => {
                                        if (isChecked) {
                                          if (prev.includes(status)) return prev;
                                          return [...prev, status];
                                        }
                                        return prev.filter(s => s !== status);
                                      });
                                    }}
                                    className="w-3 h-3 rounded border-app-border bg-app-surface-hover text-app-accent"
                                  />
                                  <span className="truncate">
                                    {STATUS_LABELS[status as ProductionStatus]}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Collections filter (multi-select dropdown) */}
                    <div
                      className="relative flex items-center gap-2 text-xs"
                      ref={filterCollectionsRef}
                    >
                      <span className="text-app-text-secondary">Collections</span>
                      <button
                        type="button"
                        onClick={() => setIsFilterCollectionsOpen(open => !open)}
                        className="px-3 py-1.5 bg-app-surface-hover border border-app-border rounded-full text-[11px] text-app-text-primary flex items-center gap-2 hover:border-app-accent/60 hover:text-app-accent"
                      >
                        <span className="truncate max-w-[120px]">
                          {filterCollections.length === 0
                            ? "All"
                            : `${filterCollections.length} selected`}
                        </span>
                        <ChevronRight
                          className={`w-3 h-3 transition-transform ${
                            isFilterCollectionsOpen ? "rotate-90" : "rotate-0"
                          }`}
                        />
                      </button>

                      {isFilterCollectionsOpen && (
                        <div
                          className="absolute z-30 top-full mt-2 right-0 w-56 bg-app-surface border border-app-border rounded-2xl shadow-xl p-3"
                          onClick={e => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-semibold text-app-text-primary">
                              Collections
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setFilterCollections([]);
                                setIsFilterCollectionsOpen(false);
                              }}
                              className="text-[11px] text-app-text-secondary hover:text-app-accent"
                            >
                              Clear
                            </button>
                          </div>
                          <div className="max-h-48 overflow-y-auto space-y-1">
                            {allCollections.length === 0 && (
                              <div className="text-[11px] text-app-text-secondary">
                                Chưa có collection nào.
                              </div>
                            )}
                            {allCollections.map(name => {
                              const checked = filterCollections.includes(name);
                              return (
                                <label
                                  key={`filter-collection-${name}`}
                                  className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-app-surface-hover cursor-pointer text-[11px] text-app-text-primary"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={e => {
                                      const isChecked = e.target.checked;
                                      setFilterCollections(prev => {
                                        if (isChecked) {
                                          if (prev.includes(name)) return prev;
                                          return [...prev, name];
                                        }
                                        return prev.filter(c => c !== name);
                                      });
                                    }}
                                    className="w-3 h-3 rounded border-app-border bg-app-surface-hover text-app-accent"
                                  />
                                  <span className="truncate">{name}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* (Score filter removed) */}
                  </div>

                  {filteredFilms.length > 0 && (
                    <div className="flex items-center gap-4 text-xs text-app-text-secondary">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-app-text-secondary whitespace-nowrap">
                          Sort
                        </span>
                        <select
                          value={sortField}
                          onChange={e =>
                            setSortField(e.target.value as "updated" | "score")
                          }
                          className="px-2 py-1.5 bg-app-surface-hover border border-app-border rounded-full text-[11px] text-app-text-primary focus:outline-none focus:ring-1 focus:ring-app-accent/60"
                        >
                          <option value="updated">Updated time</option>
                          <option value="score">Score</option>
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            setSortDirection(prev => (prev === "asc" ? "desc" : "asc"))
                          }
                          className="px-2 py-1.5 bg-app-surface-hover border border-app-border rounded-full text-[11px] text-app-text-primary hover:border-app-accent/60 hover:text-app-accent"
                        >
                          {sortDirection === "asc" ? "↑" : "↓"}
                        </button>
                      </div>
                      <span>
                        Page{" "}
                        <span className="font-semibold text-app-text-primary">{currentPage}</span>{" "}
                        of{" "}
                        <span className="font-semibold text-app-text-primary">{totalPages}</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={currentPage === 1}
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          className={`px-3 py-1.5 rounded-full border text-[11px] font-medium transition-colors ${
                            currentPage === 1
                              ? "border-app-border text-app-text-secondary/50 cursor-not-allowed bg-app-surface"
                              : "border-app-border text-app-text-primary bg-app-surface-hover hover:border-app-accent/60 hover:text-app-accent"
                          }`}
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          disabled={currentPage === totalPages}
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          className={`px-3 py-1.5 rounded-full border text-[11px] font-medium transition-colors ${
                            currentPage === totalPages
                              ? "border-app-border text-app-text-secondary/50 cursor-not-allowed bg-app-surface"
                              : "border-app-border text-app-text-primary bg-app-surface-hover hover:border-app-accent/60 hover:text-app-accent"
                          }`}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Table */}
              <div className="glass-card rounded-2xl">
                <div>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-app-surface-hover/50 border-b border-app-border">
                        <th className="px-4 py-4 text-xs font-semibold text-app-text-secondary uppercase tracking-wider w-[52px]">
                          #
                        </th>
                        <th className="px-4 py-4 text-xs font-semibold text-app-text-secondary uppercase tracking-wider w-[72px]">
                          Poster
                        </th>
                        <th className="px-4 py-4 text-xs font-semibold text-app-text-secondary uppercase tracking-wider">
                          Title
                        </th>
                        <th className="px-4 py-4 text-xs font-semibold text-app-text-secondary uppercase tracking-wider text-center w-[96px]">
                          Score
                        </th>
                        <th className="px-4 py-4 text-xs font-semibold text-app-text-secondary uppercase tracking-wider w-[140px]">
                          Status
                        </th>
                        <th className="px-4 py-4 text-xs font-semibold text-app-text-secondary uppercase tracking-wider w-[220px]">
                          Collections
                        </th>
                        <th className="px-4 py-4 text-xs font-semibold text-app-text-secondary uppercase tracking-wider w-[120px]">
                          Updated
                        </th>
                        <th className="px-4 py-4 text-xs font-semibold text-app-text-secondary uppercase tracking-wider text-right w-[96px]">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-app-border">
                      {paginatedFilms.map((film, index) => {
                        const filmCollections = (film.collections && Array.isArray(film.collections)) ? film.collections : [];
                        const visibleCollections = filmCollections.slice(0, 2);
                        const hiddenCount = filmCollections.length - visibleCollections.length;
                        const updatedSource = (film as any).updatedAt || (film as any).createdAt || null;
                        const updatedLabel = updatedSource
                          ? new Date(updatedSource).toLocaleDateString()
                          : "—";

                        return (
                          <tr 
                            key={film.id} 
                            onClick={() => openEditModal(film)}
                            className="hover:bg-app-surface-hover/50 transition-colors group cursor-pointer"
                            title={`${film.translatedTitle || film.title}${
                              film.originalTitle ? ` • ${film.originalTitle}` : ""
                            } • ${STATUS_LABELS[film.status]} • Score: ${film.score || "—"}/10`}
                          >
                            {/* Index in current page */}
                            <td className="px-4 py-4 text-xs text-app-text-secondary align-middle">
                              {((currentPage - 1) * FILMS_PER_PAGE + index + 1).toString().padStart(2, "0")}
                            </td>

                            {/* Poster */}
                            <td className="px-4 py-4">
                              <div className="w-11 h-16 bg-app-surface-hover rounded-md overflow-hidden flex-shrink-0 border border-app-border shadow-sm shadow-black/40">
                                {film.originalPoster ? (
                                  <img
                                    src={film.originalPoster}
                                    alt={film.title}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-app-text-secondary/30">
                                    <FilmIcon className="w-5 h-5" />
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Title */}
                            <td className="px-4 py-4 align-top">
                              <div className="space-y-1">
                                <div className="font-semibold text-app-text-primary line-clamp-1">
                                  {film.translatedTitle || film.title}
                                </div>
                                {film.originalTitle && (
                                  <div className="text-[11px] text-app-text-secondary/80 italic line-clamp-1">
                                    {film.originalTitle}
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Score */}
                            <td className="px-4 py-4 text-center align-middle">
                              <span className="inline-flex items-center justify-center px-2 py-1 rounded-full bg-app-surface-hover border border-app-border font-mono text-xs text-app-text-primary">
                                {film.score || "—"}/10
                              </span>
                            </td>

                            {/* Status */}
                            <td className="px-4 py-4 align-middle">
                              <StatusBadge status={film.status} />
                            </td>

                            {/* Collections */}
                            <td className="px-4 py-4 align-middle">
                              <div className="relative flex items-center gap-2 flex-wrap">
                                {visibleCollections.map(collection => (
                                  <span
                                    key={collection}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-app-surface-hover border border-app-border text-[11px] text-app-text-secondary"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <span className="max-w-[120px] truncate">{collection}</span>
                                    <button
                                      type="button"
                                      onClick={e => {
                                        e.stopPropagation();
                                        const next = filmCollections.filter(c => c !== collection);
                                        api.updateFilm(film.id, { collections: next });
                                      }}
                                      className="ml-0.5 text-[10px] text-app-text-secondary/70 hover:text-red-400"
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}

                                {hiddenCount > 0 && (
                                  <div
                                    className="relative group"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-app-surface-hover border border-dashed border-app-border text-[11px] text-app-text-secondary cursor-default">
                                      +{hiddenCount}
                                    </span>
                                    <div className="absolute z-20 mt-2 right-0 hidden group-hover:block">
                                      <div className="min-w-[180px] max-w-xs bg-app-surface border border-app-border rounded-xl shadow-xl p-3">
                                        <p className="text-[11px] font-semibold text-app-text-secondary mb-1">
                                          Collections
                                        </p>
                                        <ul className="space-y-1 max-h-40 overflow-y-auto text-[11px] text-app-text-secondary">
                                          {filmCollections.map(c => (
                                            <li key={`full-${film.id}-${c}`} className="truncate">
                                              {c}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    // Nếu đang mở cho phim này thì toggle đóng lại
                                    if (collectionPicker?.filmId === film.id) {
                                      setCollectionPicker(null);
                                      return;
                                    }

                                    const current =
                                      filmCollections && Array.isArray(filmCollections)
                                        ? filmCollections
                                        : [];

                                    setCollectionPicker({
                                      filmId: film.id,
                                      selected: current,
                                      newName: "",
                                    });
                                  }}
                                  className="inline-flex items-center px-2 py-0.5 rounded-full border border-dashed border-app-border text-[11px] text-app-text-secondary hover:border-app-accent/50 hover:text-app-accent hover:bg-app-surface-hover transition-colors"
                                >
                                  + Add
                                </button>

                                {collectionPicker?.filmId === film.id && (
                                  <div
                                    className="absolute z-30 top-full mt-2 left-0 w-64 bg-app-surface border border-app-border rounded-2xl shadow-xl p-3"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <div className="mb-2">
                                      <p className="text-xs font-semibold text-app-text-primary">
                                        Lưu vào...
                                      </p>
                                    </div>

                                    <div className="max-h-40 overflow-y-auto space-y-1 mb-3">
                                      {allCollections.map(name => {
                                        const isChecked = collectionPicker.selected.includes(name);
                                        return (
                                          <label
                                            key={`${film.id}-${name}`}
                                            className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-app-surface-hover cursor-pointer text-[11px] text-app-text-primary"
                                          >
                                            <input
                                              type="checkbox"
                                              checked={isChecked}
                                              onChange={e => {
                                                const checked = e.target.checked;
                                                setCollectionPicker(prev => {
                                                  if (!prev || prev.filmId !== film.id) return prev;
                                                  if (checked) {
                                                    if (prev.selected.includes(name)) return prev;
                                                    return {
                                                      ...prev,
                                                      selected: [...prev.selected, name],
                                                    };
                                                  }
                                                  return {
                                                    ...prev,
                                                    selected: prev.selected.filter(c => c !== name),
                                                  };
                                                });
                                              }}
                                              className="w-3 h-3 rounded border-app-border bg-app-surface-hover text-app-accent"
                                            />
                                            <span className="truncate">{name}</span>
                                          </label>
                                        );
                                      })}
                                    </div>

                                    <div className="space-y-2">
                                      <div className="space-y-1">
                                        <span className="text-[11px] text-app-text-secondary">
                                          + Danh sách mới
                                        </span>
                                        <input
                                          type="text"
                                          placeholder="Tên collection mới..."
                                          value={collectionPicker.newName}
                                          onChange={e =>
                                            setCollectionPicker(prev =>
                                              prev && prev.filmId === film.id
                                                ? { ...prev, newName: e.target.value }
                                                : prev
                                            )
                                          }
                                          onKeyDown={async e => {
                                            if (e.key !== "Enter") return;
                                            e.preventDefault();
                                            const picker = collectionPicker;
                                            if (!picker || picker.filmId !== film.id) return;

                                            const trimmedNew = picker.newName.trim();

                                            const baseSet = new Set(
                                              filmCollections && Array.isArray(filmCollections)
                                                ? filmCollections
                                                : []
                                            );

                                            picker.selected.forEach(c => baseSet.add(c));
                                            if (trimmedNew) baseSet.add(trimmedNew);

                                            const next = Array.from(baseSet);

                                            const originalSet = new Set(filmCollections);
                                            const noNewName = !trimmedNew;
                                            const sameSize = baseSet.size === originalSet.size;
                                            const sameItems =
                                              sameSize &&
                                              Array.from(baseSet).every(c => originalSet.has(c));

                                            if (noNewName && sameItems) {
                                              setCollectionPicker(null);
                                              return;
                                            }

                                            try {
                                              await api.updateFilm(film.id, { collections: next });
                                            } catch (error: any) {
                                              console.error("Failed to update collections (enter)", error);
                                              setAppError(
                                                error?.message ||
                                                  "Cập nhật collection cho phim thất bại. Vui lòng thử lại."
                                              );
                                            } finally {
                                              setCollectionPicker(null);
                                            }
                                          }}
                                          className="w-full px-3 py-2 rounded-lg bg-app-surface-hover border border-app-border text-[11px] text-app-text-primary placeholder:text-app-text-secondary/60 focus:outline-none focus:ring-1 focus:ring-app-accent/60"
                                        />
                                      </div>
                                      <div className="flex justify-end gap-2 pt-1">
                                        <button
                                          type="button"
                                          onClick={e => {
                                            e.stopPropagation();
                                            setCollectionPicker(null);
                                          }}
                                          className="px-2 py-0.5 rounded-full border border-app-border text-[11px] text-app-text-secondary hover:bg-app-surface-hover transition-colors"
                                        >
                                          Hủy
                                        </button>
                                        <button
                                          type="button"
                                          onClick={async e => {
                                            e.stopPropagation();
                                            const picker = collectionPicker;
                                            if (!picker || picker.filmId !== film.id) return;

                                            const trimmedNew = picker.newName.trim();

                                            const baseSet = new Set(
                                              filmCollections && Array.isArray(filmCollections)
                                                ? filmCollections
                                                : []
                                            );

                                            picker.selected.forEach(c => baseSet.add(c));
                                            if (trimmedNew) baseSet.add(trimmedNew);

                                            const next = Array.from(baseSet);

                                            // Nếu không có thay đổi gì thì chỉ đóng popup
                                            const originalSet = new Set(filmCollections);
                                            const noNewName = !trimmedNew;
                                            const sameSize = baseSet.size === originalSet.size;
                                            const sameItems =
                                              sameSize &&
                                              Array.from(baseSet).every(c => originalSet.has(c));

                                            if (noNewName && sameItems) {
                                              setCollectionPicker(null);
                                              return;
                                            }

                                            try {
                                              await api.updateFilm(film.id, { collections: next });
                                            } catch (error: any) {
                                              console.error("Failed to update collections", error);
                                              setAppError(
                                                error?.message ||
                                                  "Cập nhật collection cho phim thất bại. Vui lòng thử lại."
                                              );
                                            } finally {
                                              setCollectionPicker(null);
                                            }
                                          }}
                                          className="px-3 py-0.5 rounded-full bg-app-accent text-white text-[11px] font-medium hover:opacity-90 transition-opacity"
                                        >
                                          Lưu
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Updated */}
                            <td className="px-4 py-4 align-middle text-xs text-app-text-secondary whitespace-nowrap">
                              {updatedLabel}
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-4 text-right align-middle">
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
                        );
                      })}
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
            <div className="w-full max-w-5xl mx-auto space-y-8">
              <div className="glass-card rounded-2xl p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="p-3 bg-app-accent/10 rounded-2xl">
                    <SettingsIcon className="w-6 h-6 text-app-accent" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-app-text-primary">Configuration</h3>
                    <p className="text-sm text-app-text-secondary">The data is stored locally in your browser (localStorage).</p>
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-bold text-app-text-secondary uppercase tracking-wider mb-2">
                      Gemini API key
                    </label>
                    <div className="relative">
                      <input
                        type={showGeminiApiKey ? "text" : "password"}
                        value={settingsGeminiApiKey}
                        onChange={(e) => setSettingsGeminiApiKey(e.target.value)}
                        placeholder="AI KEY"
                        className="w-full pr-12 px-4 py-3 bg-app-surface-hover border border-app-border rounded-xl focus:outline-none focus:ring-2 focus:ring-app-accent/20 transition-all text-sm text-app-text-primary placeholder:text-app-text-secondary/50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGeminiApiKey((prev) => !prev)}
                        className="absolute top-1/2 right-3 -translate-y-1/2 p-1 text-app-text-secondary hover:text-app-text-primary"
                        title={showGeminiApiKey ? "Hide API key" : "Show API key"}
                      >
                        {showGeminiApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-app-text-secondary uppercase tracking-wider mb-2">
                      Firebase database config (JSON)
                    </label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowFirebaseConfig((prev) => !prev)}
                        className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-app-surface border border-app-border text-xs text-app-text-secondary hover:text-app-text-primary"
                        title={showFirebaseConfig ? "Hide Firebase config" : "Show Firebase config"}
                      >
                        {showFirebaseConfig ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      {showFirebaseConfig ? (
                        <textarea
                          ref={firebaseConfigTextareaRef}
                          value={settingsFirebaseConfig}
                          onChange={(e) => {
                            setSettingsFirebaseConfig(e.target.value);
                            const el = e.currentTarget;
                            el.style.height = "auto";
                            el.style.height = `${el.scrollHeight}px`;
                          }}
                          rows={1}
                          placeholder={FIREBASE_CONFIG_SAMPLE}
                          className="w-full pr-24 px-4 py-3 bg-app-surface-hover border border-app-border rounded-xl focus:outline-none focus:ring-2 focus:ring-app-accent/20 transition-all resize-none overflow-hidden text-sm text-app-text-primary placeholder:text-app-text-secondary/50"
                        />
                      ) : (
                        <textarea
                          ref={firebaseConfigTextareaRef}
                          value={maskedFirebaseConfig}
                          readOnly
                          rows={1}
                          className="w-full pr-24 px-4 py-3 bg-app-surface-hover border border-app-border rounded-xl transition-all resize-none overflow-hidden text-sm text-app-text-secondary"
                        />
                      )}
                    </div>
                  </div>

                  {settingsMessage && (
                    <div className="text-xs text-emerald-400 font-medium">{settingsMessage}</div>
                  )}

                  {!isFirebaseConfigured && (
                    <div className="p-4 bg-red-900/20 border border-red-800/50 rounded-xl text-sm text-red-200/80">
                      Firebase chua du key can thiet. Vui long nhap du `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`.
                    </div>
                  )}
                </div>
              </div>

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
                    <div>
                      <label className="block text-[11px] font-semibold text-app-text-secondary uppercase tracking-wider mb-2">
                        Video Link
                      </label>
                      {toClickableUrl(editingFilm?.videoUrl || "") && !isVideoUrlEditing ? (
                        <div
                          onClick={e => {
                            if (e.target !== e.currentTarget) return;
                            setIsVideoUrlEditing(true);
                          }}
                          className="w-full px-4 py-3 bg-app-surface-hover border border-app-border rounded-xl transition-all cursor-text"
                          title="Click to edit"
                        >
                          <a
                            href={toClickableUrl(editingFilm?.videoUrl || "") || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-app-accent hover:underline break-all"
                            title="Ctrl+Click to open"
                          >
                            {editingFilm?.videoUrl}
                          </a>
                        </div>
                      ) : (
                        <input
                          ref={videoUrlInputRef}
                          type="text"
                          value={editingFilm?.videoUrl || ""}
                          onChange={e =>
                            setEditingFilm(prev =>
                              prev
                                ? {
                                    ...prev,
                                    videoUrl: extractAndNormalizeVideoUrl(e.target.value),
                                  }
                                : prev
                            )
                          }
                          onBlur={() => {
                            if (toClickableUrl(editingFilm?.videoUrl || "")) {
                              setIsVideoUrlEditing(false);
                            }
                          }}
                          placeholder="Paste raw text or link (e.g. Douyin share text)"
                          className="w-full px-4 py-3 bg-app-surface-hover border border-app-border rounded-xl focus:outline-none focus:ring-2 focus:ring-app-accent/20 transition-all text-app-text-primary placeholder:text-app-text-secondary/50"
                        />
                      )}
                    </div>

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
                                <span>✨ Tạo tiêu đề</span>
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

                    {/* Collections editor inside Edit Film modal */}
                    <div className="mt-4 space-y-2">
                      <label className="block text-xs font-bold text-app-text-secondary uppercase tracking-wider">
                        Collections
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {allCollections.length === 0 && !((editingFilm?.collections || []).length) && (
                          <span className="text-[11px] text-app-text-secondary">
                            Chưa có collection nào. Tạo mới bên dưới.
                          </span>
                        )}
                        {allCollections.map(name => {
                          const current =
                            editingFilm?.collections && Array.isArray(editingFilm.collections)
                              ? editingFilm.collections
                              : [];
                          const isSelected = current.includes(name);
                          return (
                            <button
                              key={`edit-modal-collection-${name}`}
                              type="button"
                              onClick={() => {
                                setEditingFilm(prev => {
                                  if (!prev) return prev;
                                  const existing =
                                    prev.collections && Array.isArray(prev.collections)
                                      ? prev.collections
                                      : [];
                                  if (isSelected) {
                                    return {
                                      ...prev,
                                      collections: existing.filter(c => c !== name),
                                    };
                                  }
                                  return {
                                    ...prev,
                                    collections: [...existing, name],
                                  };
                                });
                              }}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] transition-colors ${
                                isSelected
                                  ? "bg-app-accent/20 border-app-accent text-app-accent"
                                  : "bg-app-surface-hover border-app-border text-app-text-secondary hover:border-app-accent/50 hover:text-app-accent"
                              }`}
                            >
                              <span className="truncate max-w-[120px]">{name}</span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] text-app-text-secondary">
                          + Danh sách mới
                        </span>
                        <input
                          type="text"
                          placeholder="Tên collection mới..."
                          value={editingCollectionsInput}
                          onChange={e => setEditingCollectionsInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            const name = editingCollectionsInput.trim();
                            if (!name) return;
                            setEditingFilm(prev => {
                              if (!prev) return prev;
                              const existing =
                                prev.collections && Array.isArray(prev.collections)
                                  ? prev.collections
                                  : [];
                              if (existing.includes(name)) return prev;
                              return {
                                ...prev,
                                collections: [...existing, name],
                              };
                            });
                            setEditingCollectionsInput("");
                          }}
                          className="flex-1 min-w-[160px] px-3 py-2 rounded-lg bg-app-surface-hover border border-app-border text-[11px] text-app-text-primary placeholder:text-app-text-secondary/60 focus:outline-none focus:ring-1 focus:ring-app-accent/60"
                        />
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

                        {/* Final Poster */}
                        <div>
                          <label className="block text-[11px] font-semibold text-app-text-secondary uppercase tracking-wider mb-2">
                            Final Poster
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
