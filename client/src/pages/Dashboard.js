import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  ChevronRight,
  Loader2,
  Trash2,
  X,
  Search,
  TrendingUp,
  Award,
  Zap,
  CheckSquare,
  Square,
  Diff,
  Activity,
  Wallet,
  ShieldCheck,
  Plus,
  RefreshCw,
  AlertCircle,
  SlidersHorizontal,
  Video,
  ArrowUpDown,
  Filter,
  List,
  Grid3X3,
  CircleDot,
  Code2,
  Sparkles,
  BadgeCheck,
  MoreVertical
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const API_BASE = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";

const getStoredUser = () => {
  try {
    const keys = ["user", "jarvis_user", "currentUser", "auth_user"];
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed?.email) return parsed;
      if (parsed?.user?.email) return parsed.user;
    }
  } catch (_) {}
  return {};
};

const getToken = () => {
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    localStorage.getItem("jarvis_token") ||
    ""
  );
};

const buildHeaders = () => {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const formatDate = (value) => {
  if (!value) return "N/A";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "N/A";
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch (_) {
    return "N/A";
  }
};

const formatTime = (value) => {
  if (!value) return "";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (_) {
    return "";
  }
};

const parseDurationToMinutes = (value) => {
  if (!value) return 0;
  const raw = String(value);
  if (raw.includes(":")) {
    const [min, sec] = raw.split(":").map((x) => Number(x) || 0);
    return min + sec / 60;
  }
  const num = Number(raw.replace(/[^\d.]/g, ""));
  return Number.isFinite(num) ? num : 0;
};

const isProcessingStatus = (status = "") => {
  const lower = String(status || "").toLowerCase();
  return (
    lower.includes("process") ||
    lower.includes("analyzing") ||
    lower.includes("syncing") ||
    lower.includes("progress") ||
    lower.includes("compressing") ||
    lower.includes("uploading") ||
    lower.includes("auditing") ||
    lower.includes("transcribing")
  );
};

const getScoreNode = (item) => {
  return (
    item?.analysis?.[0]?.analysis ||
    item?.qa_analysis?.[0]?.analysis ||
    item?.analysis?.analysis ||
    {}
  );
};

const getScore = (item) => {
  const node = getScoreNode(item);
  return Number(node.final_interview_score || 0);
};

const hasValidAnalysis = (item) => {
  const node = getScoreNode(item);
  return Boolean(
    node?.final_interview_score ||
      node?.communication_score ||
      node?.confidence_score ||
      node?.technical_depth_score ||
      item?.qa_analysis?.length ||
      item?.analysis?.length
  );
};

const isJunkGeminiRecord = (item) => {
  const sessionType = String(item.session_type || "").toLowerCase();
  const status = String(item.status || "").toLowerCase();

  const isGemini =
    sessionType.includes("gemini") ||
    String(item.interview_type || "").toLowerCase().includes("gemini");

  if (!isGemini) return false;

  const hasVideo =
    Boolean(item.video_path) ||
    Boolean(item.video_url) ||
    Boolean(item.cloudinary_url);

  const hasAnalysis = hasValidAnalysis(item);
  const isTemporary =
    item.is_temp_session === true ||
    sessionType.includes("temp") ||
    status.includes("in progress");

  if (isTemporary && !hasVideo && !hasAnalysis) return true;
  if (!hasVideo && !hasAnalysis) return true;
  if (status.includes("completed") && !hasVideo && !hasAnalysis) return true;

  return false;
};

const dedupeByInterviewId = (items) => {
  const map = new Map();
  for (const item of items || []) {
    const id = item.interview_id || item._id;
    if (!id) continue;

    const existing = map.get(id);
    if (!existing) {
      map.set(id, item);
      continue;
    }

    const existingHasVideo = Boolean(existing.video_path || existing.video_url || existing.cloudinary_url);
    const currentHasVideo = Boolean(item.video_path || item.video_url || item.cloudinary_url);

    if (currentHasVideo && !existingHasVideo) {
      map.set(id, item);
      continue;
    }

    const existingDate = new Date(existing.updated_at || existing.created_at || 0).getTime();
    const currentDate = new Date(item.updated_at || item.created_at || 0).getTime();

    if (currentDate >= existingDate) {
      map.set(id, item);
    }
  }
  return Array.from(map.values());
};

const getCreditExpiry = (wallet) => {
  if (!wallet) return "N/A";
  const possible =
    wallet.expiry_date ||
    wallet.expires_at ||
    wallet.credit_expiry ||
    wallet.valid_until ||
    wallet.wallet?.expiry_date ||
    wallet.wallet?.expires_at;
  return formatDate(possible);
};

const normalizeWallet = (payload) => {
  const raw = payload?.wallet || payload?.data || payload || {};
  const credits = raw.credits ?? raw.credit_balance ?? raw.balance ?? raw.remaining_credits ?? raw.wallet?.credits ?? 0;
  const totalPurchased = raw.total_purchased ?? raw.total_credits_purchased ?? raw.purchased_credits ?? raw.wallet?.total_purchased ?? 0;
  const used = raw.used ?? raw.used_credits ?? raw.credits_used ?? raw.wallet?.used ?? 0;
  const isDevMode = raw.dev_mode === true || raw.dev_unlimited === true || raw.mode === "dev_unlimited" || raw.credit_mode === "dev_unlimited" || payload?.mode === "dev_unlimited";

  return {
    credits: Number(credits || 0),
    totalPurchased: Number(totalPurchased || 0),
    used: Number(used || 0),
    expiry: isDevMode ? "Unlimited" : getCreditExpiry(raw),
    isDevMode,
    raw,
  };
};

const getEngine = (item) => {
  const sessionType = String(item.session_type || "").toLowerCase();
  const interviewType = String(item.interview_type || "").toLowerCase();

  if (sessionType.includes("gemini") || interviewType.includes("gemini")) return "gemini";
  if (sessionType.includes("realtime") || interviewType.includes("realtime")) return "realtime";
  if (sessionType === "live" || interviewType.includes("simulation")) return "simulation";
  if (sessionType === "upload" || sessionType === "uploaded") return "upload";
  return "other";
};

const buildBadge = (item) => {
  const engine = getEngine(item);
  if (engine === "gemini") return "Live Session";
  if (engine === "realtime") return "Realtime";
  if (engine === "simulation") return "Mock Interview";
  if (engine === "upload") return "Uploaded Video";
  return item.interview_type || "Interview";
};

const getStatusTone = (status) => {
  const lower = String(status || "").toLowerCase();
  if (isProcessingStatus(status)) return "text-blue-400 bg-blue-500/10 border-blue-500/20";
  if (lower.includes("error") || lower.includes("failed")) return "text-red-400 bg-red-500/10 border-red-500/20";
  if (lower.includes("completed")) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  return "text-slate-400 bg-slate-800 border-slate-700";
};

const getEngineIcon = (engine) => {
  if (engine === "gemini") return <Sparkles size={14} />;
  if (engine === "realtime") return <Activity size={14} />;
  if (engine === "simulation") return <Code2 size={14} />;
  if (engine === "upload") return <Video size={14} />;
  return <CircleDot size={14} />;
};

export default function Dashboard() {
  const [data, setData] = useState([]);
  const [wallet, setWallet] = useState({
    credits: 0,
    totalPurchased: 0,
    used: 0,
    expiry: "N/A",
    isDevMode: false,
  });

  const [walletLoading, setWalletLoading] = useState(true);
  const [walletError, setWalletError] = useState("");
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [engineFilter, setEngineFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [density, setDensity] = useState("comfortable");

  const [selectedIds, setSelectedIds] = useState([]);

  const navigate = useNavigate();
  const location = useLocation();
  const pollTimer = useRef(null);
  const user = getStoredUser();

  const fetchWallet = useCallback(async () => {
    if (!user.email) {
      setWalletLoading(false);
      return;
    }
    setWalletError("");
    try {
      const endpoints = [
        `${API_BASE}/credits/balance?email=${encodeURIComponent(user.email)}`,
        `${API_BASE}/credits/wallet?email=${encodeURIComponent(user.email)}`,
        `${API_BASE}/user/credits?email=${encodeURIComponent(user.email)}`,
      ];
      let lastError = "";
      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint, { method: "GET", headers: buildHeaders() });
          if (!res.ok) {
            lastError = `Wallet endpoint failed: ${res.status}`;
            continue;
          }
          const payload = await res.json();
          setWallet(normalizeWallet(payload));
          setWalletLoading(false);
          return;
        } catch (err) {
          lastError = err?.message || "Wallet fetch failed";
        }
      }
      setWalletError(lastError || "Billing unavailable.");
      setWalletLoading(false);
    } catch (err) {
      setWalletError(err?.message || "Failed to fetch allocation.");
      setWalletLoading(false);
    }
  }, [user.email]);

  const fetchInterviews = useCallback(async () => {
    try {
      const emailQuery = user.email ? `?email=${encodeURIComponent(user.email)}` : "";
      const res = await fetch(`${API_BASE}/interviews${emailQuery}`, {
        method: "GET",
        headers: buildHeaders(),
      });
      const result = await res.json();
      const rawData = result.data || [];
      return dedupeByInterviewId(rawData).filter((item) => !isJunkGeminiRecord(item));
    } catch (err) {
      console.error("Fetch interviews failed:", err);
      return [];
    }
  }, [user.email]);

  const startPolling = useCallback(() => {
    if (pollTimer.current) return;
    pollTimer.current = setInterval(async () => {
      const freshData = await fetchInterviews();
      setData(freshData);
      if (!freshData.some((itv) => isProcessingStatus(itv.status))) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    }, 5000);
  }, [fetchInterviews]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    const [itvs] = await Promise.all([fetchInterviews(), fetchWallet()]);
    setData(itvs || []);
    setLoading(false);
    if ((itvs || []).some((itv) => isProcessingStatus(itv.status))) {
      startPolling();
    }
  }, [fetchInterviews, fetchWallet, startPolling]);

  useEffect(() => {
    refreshAll();
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, [refreshAll, location.key]);

  const processedData = data.filter((itv) => hasValidAnalysis(itv));
  const sortedTrendData = [...processedData].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  const trendData = sortedTrendData.map((item, index) => ({ name: `S${index + 1}`, score: getScore(item) }));
  const totalCount = processedData.length || 1;

  const avgVitals = processedData.reduce((acc, item) => {
    const node = getScoreNode(item);
    acc.comm += node.communication_score || 0;
    acc.conf += node.confidence_score || 0;
    acc.tech += node.technical_depth_score || 0;
    return acc;
  }, { comm: 0, conf: 0, tech: 0 });

  const stats = [
    { label: "Communication", value: (avgVitals.comm / totalCount).toFixed(1), icon: <Activity size={18} />, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "Confidence", value: (avgVitals.conf / totalCount).toFixed(1), icon: <Award size={18} />, color: "text-indigo-400", bg: "bg-indigo-500/10" },
    { label: "Technical", value: (avgVitals.tech / totalCount).toFixed(1), icon: <Code2 size={18} />, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  ];

  const filteredData = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    let result = data.filter((item) => {
      const title = String(item.title || "").toLowerCase();
      const type = String(item.interview_type || "").toLowerCase();
      const status = String(item.status || "").toLowerCase();
      const session = String(item.session_type || "").toLowerCase();
      const engine = getEngine(item);
      const createdAt = item.created_at ? new Date(item.created_at) : null;
      const now = new Date();

      const matchesSearch = !query || title.includes(query) || type.includes(query) || status.includes(query) || session.includes(query);
      const matchesEngine = engineFilter === "all" || engine === engineFilter;
      const itemStatus = isProcessingStatus(item.status) ? "processing" : status.includes("completed") ? "completed" : status.includes("error") || status.includes("failed") ? "failed" : "other";
      const matchesStatus = statusFilter === "all" || itemStatus === statusFilter;

      let matchesDate = true;
      if (dateFilter !== "all" && createdAt && !Number.isNaN(createdAt.getTime())) {
        const ageDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
        if (dateFilter === "today") matchesDate = ageDays < 1;
        if (dateFilter === "week") matchesDate = ageDays <= 7;
        if (dateFilter === "month") matchesDate = ageDays <= 30;
      }
      return matchesSearch && matchesEngine && matchesStatus && matchesDate;
    });

    result.sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
      const dateB = new Date(b.updated_at || b.created_at || 0).getTime();
      if (sortBy === "newest") return dateB - dateA;
      if (sortBy === "oldest") return dateA - dateB;
      if (sortBy === "name_az") return String(a.title || "").localeCompare(String(b.title || ""));
      if (sortBy === "name_za") return String(b.title || "").localeCompare(String(a.title || ""));
      if (sortBy === "score_high") return getScore(b) - getScore(a);
      if (sortBy === "score_low") return getScore(a) - getScore(b);
      if (sortBy === "duration_high") return parseDurationToMinutes(b.duration || b.interview_duration) - parseDurationToMinutes(a.duration || a.interview_duration);
      if (sortBy === "duration_low") return parseDurationToMinutes(a.duration || a.interview_duration) - parseDurationToMinutes(b.duration || b.interview_duration);
      return dateB - dateA;
    });

    return result;
  }, [data, searchTerm, engineFilter, statusFilter, dateFilter, sortBy]);

  const toggleSelect = (e, id) => {
    e.stopPropagation();
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  };

  const handleBulkDelete = async () => {
    if (!window.confirm("Permanently delete selected records? This action cannot be undone.")) return;
    setLoading(true);
    await Promise.all(selectedIds.map((id) => fetch(`${API_BASE}/interview/${id}`, { method: "DELETE", headers: buildHeaders() })));
    const freshData = await fetchInterviews();
    setData(freshData);
    setSelectedIds([]);
    setLoading(false);
  };

  const buildVideoSource = (item) => {
    const path = item.video_path || item.video_url || item.cloudinary_url || "";
    if (!path) return "";
    if (String(path).startsWith("http")) return path;
    const cleanPath = String(path).replace(/\\/g, "/");
    if (cleanPath.startsWith("videos/")) {
      const videoName = cleanPath.split("/").pop();
      return `${API_BASE}/videos/${encodeURIComponent(videoName)}?email=${encodeURIComponent(user.email || "")}#t=0.5`;
    }
    return `${API_BASE}/${cleanPath}?email=${encodeURIComponent(user.email || "")}#t=0.5`;
  };

  const clearFilters = () => {
    setSearchTerm("");
    setEngineFilter("all");
    setStatusFilter("all");
    setDateFilter("all");
    setSortBy("newest");
  };

  const hasFilters = searchTerm || engineFilter !== "all" || statusFilter !== "all" || dateFilter !== "all" || sortBy !== "newest";

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#050505]">
        <Loader2 className="animate-spin text-blue-500 mb-4" size={32} />
        <p className="text-slate-400 font-medium text-sm">Synchronizing workspace...</p>
      </div>
    );
  }

  return (
    <div className="relative px-6 py-10 bg-[#050505] min-h-screen font-sans text-slate-200">
      <div className="max-w-7xl mx-auto">
        
        {/* Header Section */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-50 tracking-tight">Overview</h1>
            <p className="text-sm text-slate-400 mt-1">
              Welcome back, {user.name || "Candidate"}. You have {data.length} recorded sessions.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={refreshAll}
              className="px-4 py-2 rounded-md bg-slate-900 border border-slate-700 text-slate-300 hover:text-slate-50 hover:bg-slate-800 text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
            >
              <RefreshCw size={14} /> Refresh
            </button>
            <Link
              to="/"
              className="bg-blue-600 text-white px-5 py-2 rounded-md text-sm font-semibold hover:bg-blue-500 transition-colors flex items-center gap-2 shadow-sm shadow-blue-900/20"
            >
              <Plus size={16} /> New Session
            </Link>
          </div>
        </header>

        {/* Metrics Overview Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {/* Wallet Card */}
          <div className="p-5 border border-slate-800 bg-slate-900/50 rounded-xl flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Available Allocation</p>
                <div className="flex items-end gap-2 mt-1">
                  <h2 className="text-3xl font-bold text-slate-50">
                    {walletLoading ? <Loader2 className="animate-spin text-blue-500" size={24} /> : wallet.isDevMode ? "∞" : wallet.credits}
                  </h2>
                  <span className="text-xs text-slate-500 mb-1 font-medium">{wallet.isDevMode ? "dev mode" : "credits"}</span>
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400">
                <Wallet size={20} />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
              <span>{wallet.isDevMode ? "Unlimited minutes" : `${wallet.credits * 15} minutes`}</span>
              <Link to="/payments" className="text-blue-400 hover:text-blue-300 font-medium">Manage Billing</Link>
            </div>
          </div>

          {/* Stat Cards */}
          {stats.map((stat, i) => (
            <div key={i} className="p-5 border border-slate-800 bg-slate-900/50 rounded-xl flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{stat.label} Avg</p>
                <div className={`p-2 rounded-lg ${stat.bg} ${stat.color}`}>
                  {stat.icon}
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <p className="text-3xl font-bold text-slate-50">{stat.value}</p>
                <span className="text-sm text-slate-500 font-medium">/ 10</span>
              </div>
            </div>
          ))}
        </section>

        {/* Trend Chart (Hidden if not enough data) */}
        {processedData.length > 1 && (
          <section className="mb-10 p-6 border border-slate-800 bg-slate-900/30 rounded-xl">
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp className="text-blue-400" size={18} />
              <h3 className="font-semibold text-sm text-slate-200">Overall Performance Trend</h3>
            </div>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} dy={10} />
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px", color: "#f8fafc", fontSize: "12px" }}
                    itemStyle={{ color: "#60a5fa" }}
                  />
                  <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4, fill: "#0f172a", stroke: "#3b82f6", strokeWidth: 2 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* List Section */}
        <section className="border border-slate-800 bg-slate-900/40 rounded-xl overflow-hidden shadow-sm">
          {/* List Header & Filters */}
          <div className="p-5 border-b border-slate-800 bg-slate-900/80">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
              <h2 className="text-lg font-semibold text-slate-100">Session History</h2>
              <div className="flex items-center gap-3">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input
                    type="text"
                    placeholder="Search sessions..."
                    className="w-full pl-9 pr-4 py-2 rounded-md bg-slate-950 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-shadow placeholder:text-slate-600"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <button
                  onClick={() => setDensity((prev) => prev === "comfortable" ? "compact" : "comfortable")}
                  className="px-3 py-2 rounded-md bg-slate-950 border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
                  title="Toggle Density"
                >
                  {density === "comfortable" ? <List size={16} /> : <Grid3X3 size={16} />}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <FilterSelect icon={<Filter size={14} />} value={engineFilter} onChange={setEngineFilter} options={[
                ["all", "All Engines"], ["gemini", "Live Sessions"], ["realtime", "Realtime"], ["simulation", "Mocks"], ["upload", "Uploads"]
              ]} />
              <FilterSelect icon={<CircleDot size={14} />} value={statusFilter} onChange={setStatusFilter} options={[
                ["all", "All Statuses"], ["completed", "Completed"], ["processing", "Processing"], ["failed", "Failed"]
              ]} />
              <FilterSelect icon={<Calendar size={14} />} value={dateFilter} onChange={setDateFilter} options={[
                ["all", "All Time"], ["today", "Today"], ["week", "Last 7 Days"], ["month", "Last 30 Days"]
              ]} />
              <FilterSelect icon={<ArrowUpDown size={14} />} value={sortBy} onChange={setSortBy} options={[
                ["newest", "Newest First"], ["oldest", "Oldest First"], ["score_high", "Highest Score"], ["score_low", "Lowest Score"], ["duration_high", "Longest Duration"]
              ]} />
              
              {hasFilters && (
                <button onClick={clearFilters} className="px-3 py-2 rounded-md text-slate-400 hover:text-slate-200 text-sm font-medium transition-colors flex items-center gap-1.5 ml-auto">
                  <X size={14} /> Clear
                </button>
              )}
            </div>
          </div>

          {/* List Content */}
          {filteredData.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="text-slate-500" size={20} />
              </div>
              <h3 className="text-slate-200 font-semibold mb-1">No sessions found</h3>
              <p className="text-slate-500 text-sm mb-6 max-w-sm mx-auto">
                {hasFilters ? "Try adjusting your search or filters to find what you're looking for." : "You haven't recorded any mock interviews yet."}
              </p>
              {!hasFilters && (
                <Link to="/" className="inline-flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-md font-medium text-sm hover:bg-blue-500 transition-colors">
                  <Plus size={16} /> Start Your First Session
                </Link>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {filteredData.map((item) => {
                const isProcessing = isProcessingStatus(item.status);
                const isSelected = selectedIds.includes(item.interview_id);
                const videoSource = buildVideoSource(item);
                const badge = buildBadge(item);
                const score = getScore(item);
                const statusTone = getStatusTone(item.status);
                
                return (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    key={item.interview_id || item._id}
                    className={`transition-colors hover:bg-slate-800/30 ${density === "compact" ? "p-3" : "p-5"} ${isSelected ? "bg-blue-900/10" : ""}`}
                  >
                    <div className="flex items-center gap-4">
                      <button onClick={(e) => toggleSelect(e, item.interview_id)} className={`shrink-0 p-1.5 rounded transition-colors ${isSelected ? "text-blue-500" : "text-slate-600 hover:text-slate-400"}`}>
                        {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                      </button>

                      {/* Video Thumbnail */}
                      <div className={`shrink-0 relative rounded-md overflow-hidden bg-slate-900 border border-slate-800 ${density === "compact" ? "w-16 h-10" : "w-24 h-16"}`}>
                        {isProcessing ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
                            <Loader2 className="animate-spin text-blue-500" size={16} />
                          </div>
                        ) : videoSource ? (
                          <video src={videoSource} className="w-full h-full object-cover opacity-80" muted preload="metadata" />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
                            <Video size={16} className="text-slate-700" />
                          </div>
                        )}
                      </div>

                      {/* Core Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1.5">
                          <h3 className="text-sm font-semibold text-slate-100 truncate">
                            {item.title || "Standard Interview"}
                          </h3>
                          <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-medium border ${statusTone} capitalize`}>
                            {item.status || "Unknown"}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-medium">
                          <span className="flex items-center gap-1">
                            <Calendar size={12} /> {formatDate(item.created_at)}
                          </span>
                          <span className="flex items-center gap-1">
                            {getEngineIcon(getEngine(item))} {badge}
                          </span>
                          <span>Duration: {item.duration || item.interview_duration || "0:00"}</span>
                        </div>
                      </div>

                      {/* Score Indicator */}
                      <div className="hidden sm:flex shrink-0 w-24 flex-col items-end">
                        <span className="text-xs font-semibold text-slate-400 mb-1 block">Score</span>
                        <div className="flex items-center gap-2 w-full">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                            <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(score || 0, 100)}%` }} />
                          </div>
                          <span className="text-sm font-bold text-slate-200 w-6 text-right">{score || "--"}</span>
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className="shrink-0 pl-2">
                        <button
                          disabled={isProcessing}
                          onClick={() => navigate(`/analysis/${item.interview_id}`)}
                          className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
                            isProcessing 
                              ? "bg-slate-800 text-slate-500 cursor-not-allowed" 
                              : "bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700"
                          }`}
                        >
                          View Report
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>

        {/* Floating Bulk Action Bar */}
        <AnimatePresence>
          {selectedIds.length > 0 && (
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 border border-slate-700 shadow-2xl rounded-lg px-4 py-3 flex items-center gap-4 z-50"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <span className="flex items-center justify-center w-6 h-6 rounded bg-blue-600 text-white text-xs">
                  {selectedIds.length}
                </span>
                Selected
              </div>
              <div className="w-px h-6 bg-slate-700" />
              {selectedIds.length === 2 && (
                <button
                  onClick={() => navigate(`/compare/${selectedIds[0]}/${selectedIds[1]}`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded hover:bg-slate-800 text-sm font-medium text-slate-300 transition-colors"
                >
                  <Diff size={16} /> Compare
                </button>
              )}
              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded hover:bg-red-500/10 text-sm font-medium text-red-400 transition-colors"
              >
                <Trash2 size={16} /> Delete
              </button>
              <div className="w-px h-6 bg-slate-700" />
              <button
                onClick={() => setSelectedIds([])}
                className="p-1.5 rounded hover:bg-slate-800 text-slate-400 transition-colors"
              >
                <X size={18} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function FilterSelect({ icon, value, onChange, options }) {
  return (
    <div className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
        {icon}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full sm:w-auto pl-9 pr-8 py-2 rounded-md bg-slate-950 border border-slate-700 text-xs font-medium text-slate-300 focus:outline-none focus:border-blue-500 appearance-none hover:border-slate-600 transition-colors cursor-pointer"
      >
        {options.map(([optVal, optLabel]) => (
          <option key={optVal} value={optVal}>{optLabel}</option>
        ))}
      </select>
      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-600">
        <MoreVertical size={14} className="opacity-50" />
      </div>
    </div>
  );
}