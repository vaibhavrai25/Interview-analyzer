import { useEffect, useState, useCallback } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { 
  PlayCircle, Calendar, ChevronRight, Loader2, 
  Trash2, Edit3, Pin, PinOff, X, Check, Search
} from "lucide-react";

const API_BASE = "http://127.0.0.1:8000";

export default function Dashboard() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [searchTerm, setSearchTerm] = useState(""); // 🔍 Search state
  
  const navigate = useNavigate();
  const location = useLocation();

  const fetchInterviews = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/interviews`);
      const result = await res.json();
      return result.data || [];
    } catch (err) { 
      console.error("Fetch error:", err);
      return []; 
    }
  }, []);

  // --- Filtering Logic ---
  const filteredData = data.filter((item) =>
    item.title?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // --- Actions ---
  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("Delete this interview?")) return;
    await fetch(`${API_BASE}/interview/${id}`, { method: "DELETE" });
    setData(prev => prev.filter(i => i.interview_id !== id));
  };

  const togglePin = async (e, id, currentStatus) => {
    e.stopPropagation();
    try {
      const response = await fetch(`${API_BASE}/interview/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_pinned: !currentStatus }),
      });

      if (response.ok) {
        const updatedData = await fetchInterviews();
        setData(updatedData);
      }
    } catch (err) {
      console.error("Pinning failed", err);
    }
  };

  const handleEditTitle = async (e, id) => {
    e.stopPropagation();
    await fetch(`${API_BASE}/interview/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle }),
    });
    setEditingId(null);
    const updatedData = await fetchInterviews();
    setData(updatedData);
  };

  // Initial Load & Background Polling
  useEffect(() => {
    if (location.state?.processing) setIsProcessing(true);
    
    fetchInterviews().then((itvs) => { 
      setData(itvs); 
      setLoading(false); 
    });

    // Poll for new data if a video is being processed
    let interval;
    if (location.state?.processing || isProcessing) {
        interval = setInterval(async () => {
            const latest = await fetchInterviews();
            if (latest.length > data.length) {
                setData(latest);
                setIsProcessing(false);
                clearInterval(interval);
            }
        }, 5000);
    }
    return () => clearInterval(interval);
  }, [location.state, fetchInterviews, data.length, isProcessing]);

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
      <p className="text-gray-500 font-medium">Loading Dashboard...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-12">
      <div className="max-w-6xl mx-auto">
        
        {/* --- Header with Search --- */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
          <div>
            <h1 className="text-4xl font-extrabold text-gray-900">Your Interviews</h1>
            <p className="text-gray-500 mt-2">Manage and review your AI performance reports.</p>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
            {/* 🔍 Search Input */}
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search by title..."
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <Link to="/" className="bg-blue-600 text-white px-8 py-2.5 rounded-full font-bold shadow-lg hover:bg-blue-700 transition w-full md:w-auto text-center">
              + New Interview
            </Link>
          </div>
        </header>

        {isProcessing && (
          <div className="mb-10 p-6 bg-blue-50 border-2 border-blue-100 rounded-3xl flex items-center gap-4 shadow-sm animate-pulse">
            <Loader2 className="animate-spin text-blue-600" size={24} />
            <p className="font-bold text-blue-800">AI is analyzing your video... It will appear here shortly.</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredData.length > 0 ? (
            filteredData.map((item) => (
              <div 
                key={item._id} 
                className={`group bg-white rounded-3xl shadow-sm overflow-hidden border-2 transition-all duration-300 relative ${item.is_pinned ? 'border-blue-500 shadow-md' : 'border-transparent hover:border-gray-200'}`}
              >
                {/* ACTIONS BAR */}
                <div className="absolute top-3 right-3 z-20 flex gap-2">
                  <button 
                    onClick={(e) => togglePin(e, item.interview_id, item.is_pinned)}
                    className={`p-2 rounded-full shadow-sm backdrop-blur-md transition-all ${item.is_pinned ? 'bg-blue-600 text-white' : 'bg-white/90 text-gray-500 hover:bg-white'}`}
                  >
                    {item.is_pinned ? <PinOff size={18} /> : <Pin size={18} />}
                  </button>
                  <button 
                    onClick={(e) => handleDelete(e, item.interview_id)}
                    className="p-2 rounded-full bg-white/90 text-gray-500 hover:bg-red-500 hover:text-white shadow-sm transition-all"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>

                {/* VIDEO PREVIEW */}
                <div className="relative aspect-video bg-slate-900">
                  <video 
                    src={`${API_BASE}/${item.video_path}#t=0.5`} 
                    poster={`${API_BASE}/${item.video_path.replace(/\.[^/.]+$/, "")}_thumb.jpg`}
                    className="w-full h-full object-cover opacity-80" 
                    preload="metadata"
                    muted
                    playsInline
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <PlayCircle className="text-white/50 group-hover:text-white transition-colors" size={48} />
                  </div>
                </div>

                {/* CONTENT */}
                <div className="p-6">
                  <div className="flex items-center text-gray-400 text-xs mb-3 gap-2">
                    <Calendar size={14} />
                    {new Date(item.created_at).toLocaleDateString()}
                    {item.is_pinned && <span className="text-blue-500 font-bold ml-auto flex items-center gap-1"><Pin size={12} fill="currentColor"/> Pinned</span>}
                  </div>
                  
                  <div className="mb-6">
                    {editingId === item.interview_id ? (
                      <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-lg border border-blue-200">
                        <input 
                          className="bg-transparent px-2 py-1 text-sm w-full focus:outline-none font-medium"
                          value={newTitle} 
                          onChange={(e) => setNewTitle(e.target.value)}
                          autoFocus
                        />
                        <button onClick={(e) => handleEditTitle(e, item.interview_id)} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check size={18}/></button>
                        <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="p-1 text-red-400 hover:bg-red-50 rounded"><X size={18}/></button>
                      </div>
                    ) : (
                      <h3 className="text-xl font-bold text-gray-800 truncate flex items-center justify-between group/title">
                        {item.title || "Untitled Interview"}
                        <Edit3 
                          size={16} 
                          className="cursor-pointer text-gray-300 hover:text-blue-500 transition-colors" 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setEditingId(item.interview_id); 
                            setNewTitle(item.title); 
                          }} 
                        />
                      </h3>
                    )}
                  </div>
                  
                  <button
                    onClick={() => navigate(`/analysis/${item.interview_id}`, { state: { analysis: item, videoUrl: `${API_BASE}/${item.video_path}` } })}
                    className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white py-3.5 rounded-2xl hover:bg-blue-600 transition-all font-bold shadow-sm"
                  >
                    View Full Report <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full text-center py-20 bg-white rounded-3xl border border-dashed border-gray-300">
                <Search className="mx-auto text-gray-300 mb-4" size={48} />
                <p className="text-gray-400 text-lg">No interviews match "{searchTerm}"</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}