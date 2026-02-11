import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, TrendingUp, TrendingDown, Minus, 
  Zap, Award, MessageSquare, Target 
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend 
} from 'recharts';

const API_BASE = "http://127.0.0.1:8000";

const ComparisonPage = () => {
  const { id1, id2 } = useParams();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchComparisonData = async () => {
      try {
        const [res1, res2] = await Promise.all([
          fetch(`${API_BASE}/interview/${id1}`),
          fetch(`${API_BASE}/interview/${id2}`)
        ]);
        const data1 = await res1.json();
        const data2 = await res2.json();
        
        // Sort by date so "Recent" is always compared against "Previous"
        const sorted = [data1.data, data2.data].sort(
          (a, b) => new Date(a.created_at) - new Date(b.created_at)
        );
        setSessions(sorted);
      } catch (err) {
        console.error("Comparison fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchComparisonData();
  }, [id1, id2]);

  if (loading) return <div className="p-20 text-center font-bold text-slate-500">Calculating Delta Metrics...</div>;

  // 🔥 FIX 1: Accessing the nested analysis object correctly based on your DB schema
  const prev = sessions[0]?.analysis?.[0]?.analysis || {};
  const recent = sessions[1]?.analysis?.[0]?.analysis || {};

  // 🔥 Delta Calculation Logic
  const calculateDelta = (curr, old) => {
    if (!old || old === 0) return { val: 0, type: 'neutral' };
    const diff = ((curr - old) / old) * 100;
    return {
      val: diff.toFixed(1),
      type: diff > 0 ? 'increase' : diff < 0 ? 'decrease' : 'neutral'
    };
  };

  const metrics = [
    { label: "Overall Score", key: "final_interview_score", icon: <Target size={20}/> },
    { label: "Technical Depth", key: "technical_depth_score", icon: <Zap size={20}/> },
    { label: "Communication", key: "communication_score", icon: <MessageSquare size={20}/> },
    { label: "Confidence", key: "confidence_score", icon: <Award size={20}/> },
  ];

  // 🔥 FIX 2: Explicitly mapping chart data to ensure key consistency for Recharts
  const chartData = metrics.map(m => ({
    name: m.label,
    Previous: prev[m.key] || 0,
    Recent: recent[m.key] || 0
  }));

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12">
      <div className="max-w-6xl mx-auto">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-8 font-bold transition-colors"
        >
          <ArrowLeft size={20} /> Back to Dashboard
        </button>

        <header className="mb-12">
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Performance Comparison</h1>
          <p className="text-slate-500 font-medium mt-2">
            Comparing: <span className="text-slate-900 font-bold">{sessions[0]?.title || "Session A"}</span> vs <span className="text-slate-900 font-bold">{sessions[1]?.title || "Session B"}</span>
          </p>
        </header>

        {/* 📈 Comparison Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {metrics.map((m) => {
            const delta = calculateDelta(recent[m.key], prev[m.key]);
            return (
              <div key={m.label} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
                <div className="flex items-center gap-3 mb-4 text-slate-400">
                  {m.icon} <span className="text-xs font-bold uppercase tracking-widest">{m.label}</span>
                </div>
                <div className="flex items-end justify-between">
                  <div className="text-3xl font-black text-slate-900">
                    {recent[m.key] || 0}<span className="text-sm text-slate-300">/10</span>
                  </div>
                  <div className={`flex items-center gap-1 text-sm font-bold px-3 py-1 rounded-full ${
                    delta.type === 'increase' ? 'bg-emerald-50 text-emerald-600' : 
                    delta.type === 'decrease' ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-500'
                  }`}>
                    {delta.type === 'increase' ? <TrendingUp size={14}/> : delta.type === 'decrease' ? <TrendingDown size={14}/> : <Minus size={14}/>}
                    {delta.val}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 📊 Visual Chart */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 mb-12">
          <h3 className="font-bold text-lg mb-8 text-slate-800">Score Variance Chart</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12, fontWeight: 600}} />
                <YAxis hide domain={[0, 10]} />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                {/* 🔥 FIX 3: dataKey must match the map keys exactly */}
                <Bar dataKey="Previous" fill="#cbd5e1" radius={[10, 10, 0, 0]} barSize={40} />
                <Bar dataKey="Recent" fill="#2563eb" radius={[10, 10, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 📝 Side-by-Side Suggestions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {[prev, recent].map((ana, i) => (
            <div key={i} className="bg-slate-900 text-white p-8 rounded-[2.5rem] shadow-xl">
              <h4 className="font-bold text-indigo-400 mb-4 uppercase tracking-widest text-xs">
                {i === 0 ? `Feedback: ${sessions[0]?.title}` : `Feedback: ${sessions[1]?.title}`}
              </h4>
              <ul className="space-y-4">
                {ana.suggestions && ana.suggestions.length > 0 ? (
                  ana.suggestions.slice(0, 3).map((s, j) => (
                    <li key={j} className="flex gap-3 text-sm text-slate-300 leading-relaxed">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0" />
                      {s}
                    </li>
                  ))
                ) : (
                  <li className="text-slate-500 italic text-sm">No specific feedback recorded for this session.</li>
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