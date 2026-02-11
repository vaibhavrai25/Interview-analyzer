import { useEffect, useState, useCallback } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { 
  PlayCircle, Calendar, ChevronRight, Loader2, 
  Trash2, Edit3, Pin, PinOff, X, Check, Search,
  TrendingUp, Award, Zap, Cpu, Briefcase, Code, 
  Sparkles, Share2, Clock, FileText, CheckSquare, Square, Diff
} from "lucide-react";
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, 
  Tooltip, ResponsiveContainer, CartesianGrid, Legend 
} from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable'; 

const API_BASE = "http://127.0.0.1:8000";

export default function Dashboard() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState([]); 
  
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

  const sortedData = [...data].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  
  const trendData = sortedData.slice(-10).map((item, index) => ({
    name: `Int. ${index + 1}`,
    score: item.analysis?.[0]?.analysis?.final_interview_score || 0
  }));

  const total = data.length || 1;
  const avgVitals = data.reduce((acc, item) => {
    const node = item.analysis?.[0]?.analysis || {};
    acc.comm += node.communication_score || 0;
    acc.conf += node.confidence_score || 0;
    acc.tech += node.technical_depth_score || 0;
    return acc;
  }, { comm: 0, conf: 0, tech: 0 });

  const stats = [
    { label: "Avg. Communication", value: (avgVitals.comm / total).toFixed(1), icon: <TrendingUp size={20}/>, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Avg. Confidence", value: (avgVitals.conf / total).toFixed(1), icon: <Award size={20}/>, color: "text-indigo-600", bg: "bg-indigo-50" },
    { label: "Avg. Technical", value: (avgVitals.tech / total).toFixed(1), icon: <Zap size={20}/>, color: "text-purple-600", bg: "bg-purple-50" },
  ];

  const techKeywords = ["react", "node", "python", "mongodb", "api", "database", "java", "oops"];

  // 🔥 FIXED: Keyword Counts logic to handle Array and String transcript formats
  const keywordCounts = techKeywords.map(word => {
    const count = data.reduce((acc, item) => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      
      // If transcript is new Array format, join text segments first
      let fullText = "";
      if (Array.isArray(item.transcript)) {
        fullText = item.transcript.map(seg => seg.text).join(" ");
      } else if (typeof item.transcript === "string") {
        fullText = item.transcript;
      }

      return acc + (fullText.match(regex)?.length || 0);
    }, 0);
    return { name: word.toUpperCase(), count };
  }).sort((a, b) => b.count - a.count);

  const filteredData = data.filter((item) =>
    item.title?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleSelect = (e, id) => {
    e.stopPropagation();
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleShare = (e, id) => {
    e.stopPropagation();
    const shareUrl = `${window.location.origin}/analysis/${id}`;
    navigator.clipboard.writeText(shareUrl);
    alert("Shareable link copied to clipboard!");
  };

  const handleCompare = () => {
    if (selectedIds.length !== 2) return;
    navigate(`/compare/${selectedIds[0]}/${selectedIds[1]}`);
  };

  const handleExport = () => {
    const doc = new jsPDF();
    const selectedInterviews = data.filter(item => selectedIds.includes(item.interview_id));
    doc.setFontSize(22);
    doc.text("Interview Preparation Portfolio", 14, 20);
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);

    selectedInterviews.forEach((interview, index) => {
      if (index > 0) doc.addPage();
      const analysis = interview.analysis?.[0]?.analysis || {};
      doc.setFontSize(18);
      doc.setTextColor(0);
      doc.text(`${index + 1}. ${interview.title || "Untitled Session"}`, 14, 45);
      doc.setFontSize(10);
      doc.text(`Type: ${interview.interview_type} | Duration: ${interview.duration}`, 14, 52);

      autoTable(doc, {
        startY: 60,
        head: [['Metric', 'Score / 10']],
        body: [
          ['Overall Score', analysis.final_interview_score || 0],
          ['Communication', analysis.communication_score || 0],
          ['Confidence', analysis.confidence_score || 0],
          ['Technical Depth', analysis.technical_depth_score || 0],
        ],
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235] }
      });

      doc.setFontSize(14);
      doc.text("Key AI Suggestions:", 14, doc.lastAutoTable.finalY + 15);
      const suggestions = analysis.suggestions || ["No suggestions available."];
      let yPos = doc.lastAutoTable.finalY + 22;
      suggestions.slice(0, 5).forEach(s => {
        doc.setFontSize(10);
        const splitText = doc.splitTextToSize(`• ${s}`, 180);
        doc.text(splitText, 14, yPos);
        yPos += (splitText.length * 5);
      });
    });
    doc.save(`Interview_Portfolio_${new Date().getTime()}.pdf`);
    setSelectedIds([]); 
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.length} interviews?`)) return;
    setLoading(true);
    await Promise.all(selectedIds.map(id => fetch(`${API_BASE}/interview/${id}`, { method: "DELETE" })));
    const updated = await fetchInterviews();
    setData(updated);
    setSelectedIds([]);
    setLoading(false);
  };

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
    } catch (err) { console.error("Pinning failed", err); }
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

  useEffect(() => {
    if (location.state?.processing) setIsProcessing(true);
    fetchInterviews().then((itvs) => { 
      setData(itvs); 
      setLoading(false); 
    });
    let interval;
    if (location.state?.processing || isProcessing) {
        interval = setInterval(async () => {
            const latest = await fetchInterviews();
            setData(latest);
            const processingItems = latest.filter(item => item.status && item.status !== "Completed");
            if (processingItems.length === 0 && !location.state?.processing) {
                setIsProcessing(false);
                clearInterval(interval);
            }
        }, 3000);
    }
    return () => clearInterval(interval);
  }, [location.state, fetchInterviews, isProcessing]);

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
      <p className="text-gray-500 font-medium">Loading Dashboard...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-12 pb-32">
      <div className="max-w-7xl mx-auto">
        
        {/* Analytics Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {stats.map((stat, i) => (
            <div key={i} className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 flex items-center gap-4">
              <div className={`p-4 rounded-2xl ${stat.bg} ${stat.color}`}>{stat.icon}</div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{stat.label}</p>
                <p className="text-2xl font-black text-gray-900">{stat.value}<span className="text-sm text-gray-300 ml-1">/10</span></p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
            <h3 className="font-bold text-lg mb-6 flex items-center gap-2 text-slate-800">
              <TrendingUp className="text-blue-500" /> Score Progression
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{fontSize: 12, fill: '#94a3b8'}} />
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                  <Line type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={4} dot={{ r: 6, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
            <h3 className="font-bold text-lg mb-6 flex items-center gap-2 text-slate-800">
              <Cpu className="text-purple-500" /> Technical Focus
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={keywordCounts} layout="vertical" margin={{ left: 20 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 11, fontWeight: 'bold', fill: '#64748b'}} />
                  <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '12px' }} />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[0, 10, 10, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
          <div>
            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Your Interviews</h1>
            <p className="text-gray-500 mt-2 font-medium">Review and manage your AI performance reports.</p>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input type="text" placeholder="Search interviews..." className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm transition-all" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <Link to="/" className="bg-blue-600 text-white px-8 py-2.5 rounded-full font-bold shadow-lg hover:bg-blue-700 transition w-full md:w-auto text-center">+ New Interview</Link>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredData.map((item) => (
            <div key={item._id} className={`group bg-white rounded-3xl shadow-sm overflow-hidden border-2 transition-all duration-300 relative ${item.is_pinned ? 'border-blue-500 shadow-md' : 'border-transparent hover:border-gray-200'} ${selectedIds.includes(item.interview_id) ? 'ring-4 ring-blue-600/20 border-blue-600' : ''}`}>
              {item.status && item.status !== "Completed" && (
                <div className="absolute inset-0 bg-white/95 backdrop-blur-sm z-[70] flex flex-col items-center justify-center p-8 text-center">
                  <Loader2 className="animate-spin text-blue-600 mb-4" size={32} />
                  <p className="font-black text-slate-800 text-lg">{item.status}</p>
                </div>
              )}
              <div className="absolute top-3 left-3 z-[60] flex gap-2">
                <button onClick={(e) => toggleSelect(e, item.interview_id)} className={`p-2 rounded-full shadow-lg backdrop-blur-md transition-all ${selectedIds.includes(item.interview_id) ? 'bg-blue-600 text-white' : 'bg-white/90 text-gray-500 hover:bg-white border border-gray-100'}`}>
                  {selectedIds.includes(item.interview_id) ? <CheckSquare size={18} /> : <Square size={18} />}
                </button>
              </div>
              <div className="absolute top-3 right-3 z-[60] flex gap-2">
                <button onClick={(e) => handleShare(e, item.interview_id)} className="p-2 rounded-full bg-white/90 text-gray-500 hover:text-blue-600 shadow-sm transition-all border border-gray-100"><Share2 size={18} /></button>
                <button onClick={(e) => togglePin(e, item.interview_id, item.is_pinned)} className={`p-2 rounded-full shadow-sm backdrop-blur-md transition-all border border-gray-100 ${item.is_pinned ? 'bg-blue-600 text-white' : 'bg-white/90 text-gray-500 hover:bg-white'}`}>{item.is_pinned ? <PinOff size={18} /> : <Pin size={18} />}</button>
              </div>
              <div className="relative aspect-video bg-slate-900 overflow-hidden">
                <div className="absolute bottom-3 left-3 z-40 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full flex items-center gap-2 border border-white/20">
                  {item.interview_type === "Technical" ? <Code size={14} className="text-blue-400" /> : <Briefcase size={14} className="text-amber-400" />}
                  <span className="text-[10px] font-bold text-white uppercase tracking-widest">{item.interview_type || "General"}</span>
                </div>
                <div className="absolute bottom-3 right-3 z-40 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg flex items-center gap-1.5 border border-white/10">
                  <Clock size={12} className="text-white/70" /><span className="text-[10px] font-bold text-white tracking-tighter">{item.duration || "0:00"}</span>
                </div>
                <video src={`${API_BASE}/${item.video_path}#t=0.5`} className="w-full h-full object-cover opacity-80" preload="metadata" muted />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><PlayCircle className="text-white/40 group-hover:text-white transition-colors" size={48} /></div>
              </div>
              <div className="p-6">
                <div className="flex items-center text-gray-400 text-xs mb-3 gap-2"><Calendar size={14} />{new Date(item.created_at).toLocaleDateString()}<button onClick={(e) => handleDelete(e, item.interview_id)} className="ml-auto p-1.5 hover:text-red-500 transition-colors"><Trash2 size={16} /></button></div>
                <div className="mb-4">
                  {editingId === item.interview_id ? (
                    <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-lg border border-blue-200">
                      <input className="bg-transparent px-2 py-1 text-sm w-full focus:outline-none font-medium" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} autoFocus />
                      <button onClick={(e) => handleEditTitle(e, item.interview_id)} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check size={18}/></button>
                    </div>
                  ) : (
                    <h3 className="text-xl font-bold text-gray-800 truncate flex items-center justify-between">
                      {item.title || "Untitled Session"}
                      <Edit3 size={16} className="cursor-pointer text-gray-300 hover:text-blue-500 transition-colors" onClick={(e) => { e.stopPropagation(); setEditingId(item.interview_id); setNewTitle(item.title); }} />
                    </h3>
                  )}
                </div>
                <div className="mb-6 flex items-start gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <Sparkles size={14} className="text-purple-500 mt-1 shrink-0" />
                  <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2 italic">{item.analysis?.[0]?.analysis?.suggestions?.[0] || "Review the full report for targeted AI feedback."}</p>
                </div>
                <button onClick={() => navigate(`/analysis/${item.interview_id}`, { state: { analysis: item, videoUrl: `${API_BASE}/${item.video_path}` } })} className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white py-3.5 rounded-2xl hover:bg-blue-600 transition-all font-bold shadow-sm">View Full Report <ChevronRight size={18} /></button>
              </div>
            </div>
          ))}
        </div>

        {/* --- DYNAMIC FLOATING TOOLBAR --- */}
        {selectedIds.length > 0 && (
          <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-8 py-5 rounded-[2.5rem] shadow-2xl z-[100] flex items-center gap-8 border border-white/10 animate-in fade-in slide-in-from-bottom-5">
            <div className="flex flex-col">
              <span className="font-black text-lg leading-none">{selectedIds.length}</span>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Selected</span>
            </div>
            <div className="h-8 w-px bg-white/10" />
            
            {selectedIds.length === 2 && (
              <button onClick={handleCompare} className="bg-indigo-600 hover:bg-indigo-500 px-6 py-2.5 rounded-2xl flex items-center gap-2 font-bold text-sm transition-all shadow-lg shadow-indigo-500/20">
                <Diff size={18}/> Compare Sessions
              </button>
            )}

            <button onClick={handleExport} className="hover:text-blue-400 flex items-center gap-2 font-bold text-sm transition-colors">
              <FileText size={18}/> Export
            </button>

            <button onClick={handleBulkDelete} className="text-rose-400 hover:text-rose-300 flex items-center gap-2 font-bold text-sm transition-colors">
              <Trash2 size={18}/> Delete
            </button>
            
            <button onClick={() => setSelectedIds([])} className="text-slate-400 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}