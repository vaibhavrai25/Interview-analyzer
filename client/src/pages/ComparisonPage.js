import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, Zap, Award, MessageSquare, Target, Loader2, FileText 
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend 
} from 'recharts';

const API_BASE = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";

const ComparisonPage = () => {
  const { id1, id2 } = useParams();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchComparisonData = async () => {
      try {
        const [res1, res2] = await Promise.all([
          fetch(`${API_BASE}/interviews`),
          fetch(`${API_BASE}/interviews`) // Fetch all and filter to ensure matching IDs
        ]);
        const d1_all = await res1.json();
        const d2_all = await res2.json();
        const s1 = d1_all.data.find(i => i.interview_id === id1);
        const s2 = d2_all.data.find(i => i.interview_id === id2);
        setSessions([s1, s2].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
      } catch (err) { 
        console.error(err); 
      } finally { 
        setLoading(false); 
      }
    };
    fetchComparisonData();
  }, [id1, id2]);

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#050505] text-slate-400 font-sans">
      <Loader2 className="animate-spin text-blue-500 mb-4" size={32} />
      <span className="text-sm font-medium">Loading comparison data...</span>
    </div>
  );

  const prev = sessions[0]?.analysis?.[0]?.analysis || {};
  const recent = sessions[1]?.analysis?.[0]?.analysis || {};

  const calculateDelta = (curr, old) => {
    if (!old || old === 0) return { val: 0, type: 'neutral' };
    const diff = ((curr - old) / old) * 100;
    
    if (diff === 0) return { val: "0.0", type: 'neutral' };
    return { val: diff.toFixed(1), type: diff > 0 ? 'increase' : 'decrease' };
  };

  const metrics = [
    { label: "Overall Score", key: "final_interview_score", icon: <Target size={16}/> },
    { label: "Technical Depth", key: "technical_depth_score", icon: <Zap size={16}/> },
    { label: "Communication", key: "communication_score", icon: <MessageSquare size={16}/> },
    { label: "Confidence", key: "confidence_score", icon: <Award size={16}/> },
  ];

  const chartData = metrics.map(m => ({ 
    name: m.label, 
    Previous: prev[m.key] || 0, 
    Recent: recent[m.key] || 0 
  }));

  return (
    <div className="min-h-screen bg-[#050505] text-slate-200 font-sans p-6 md:p-10 pb-32">
      <div className="max-w-6xl mx-auto">
        
        {/* Navigation */}
        <button 
          onClick={() => navigate(-1)} 
          className="flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-slate-100 mb-8 transition-colors"
        >
          <ArrowLeft size={16} /> Back to Dashboard
        </button>

        {/* Header */}
        <header className="mb-10 border-b border-slate-800 pb-6">
          <h1 className="text-3xl font-bold text-slate-50 tracking-tight">Performance Comparison</h1>
          <p className="text-slate-400 text-sm mt-2">
            Comparing metric variance between two selected sessions.
          </p>
        </header>

        {/* Delta Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {metrics.map((m, i) => {
            const delta = calculateDelta(recent[m.key], prev[m.key]);
            
            return (
              <motion.div 
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ delay: i * 0.1 }} 
                key={m.label} 
                className="p-5 rounded-lg border border-slate-800 bg-slate-900/50 shadow-sm flex flex-col justify-between"
              >
                <div className="flex items-center gap-2 mb-3 text-slate-400">
                  {m.icon} 
                  <span className="text-xs font-semibold uppercase tracking-wider">{m.label}</span>
                </div>
                
                <div className="flex items-end justify-between mt-2">
                  <div className="text-3xl font-bold text-slate-50">
                    {recent[m.key] || 0}
                    <span className="text-sm font-medium text-slate-500">/10</span>
                  </div>
                  
                  <div className={`text-xs font-semibold px-2 py-1 rounded-md border ${
                    delta.type === 'increase' 
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                      : delta.type === 'decrease' 
                      ? 'bg-red-500/10 text-red-400 border-red-500/20'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                    {delta.type === 'increase' ? '+' : ''}{delta.val}%
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Bar Chart Section */}
        <div className="p-6 md:p-8 rounded-lg border border-slate-800 bg-slate-900/40 mb-10">
          <h3 className="font-semibold text-sm text-slate-200 mb-8">Score Variance Visualization</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.4} />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 500 }} 
                  dy={10} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 12 }} 
                  domain={[0, 10]}
                />
                <Tooltip 
                  cursor={{ fill: '#1e293b', opacity: 0.5 }} 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#f8fafc' }} 
                />
                <Legend 
                  iconType="circle" 
                  wrapperStyle={{ paddingTop: '24px', fontSize: '13px', color: '#cbd5e1' }} 
                />
                <Bar dataKey="Previous" fill="#475569" radius={[4, 4, 0, 0]} maxBarSize={60} />
                <Bar dataKey="Recent" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={60} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Feedback Comparison Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[0, 1].map((idx) => (
            <div key={idx} className="p-6 md:p-8 rounded-lg border border-slate-800 bg-slate-900/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-slate-800 pb-4">
                <h4 className="font-semibold text-sm text-slate-200 flex items-center gap-2">
                  <FileText size={16} className="text-slate-400" />
                  {idx === 0 ? "Previous Session" : "Recent Session"}
                </h4>
                <span className="text-xs text-slate-500 font-medium truncate max-w-[200px]">
                  {sessions[idx]?.title || "Untitled Session"}
                </span>
              </div>
              
              <ul className="space-y-4">
                {(idx === 0 ? prev : recent).suggestions?.slice(0, 4).map((s, j) => (
                  <li key={j} className="flex gap-3 text-sm text-slate-300 leading-relaxed">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0" /> 
                    {s}
                  </li>
                )) || (
                  <li className="text-slate-500 text-sm italic">
                    No feedback suggestions recorded for this session.
                  </li>
                )}
              </ul>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
};

export default ComparisonPage;