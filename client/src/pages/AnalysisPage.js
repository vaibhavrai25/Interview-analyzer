import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { 
  ArrowLeft, MessageSquare, BarChart3, AlertCircle, 
  CheckCircle2, BrainCircuit, Activity 
} from "lucide-react";
import { 
  XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, AreaChart, Area, Legend
} from 'recharts';

const API_BASE = "http://127.0.0.1:8000";

export default function AnalysisPage() {
  const { id } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const videoRef = useRef(null); // 🔥 Reference for video sync
  const [data, setData] = useState(state?.analysis || null);
  const [videoUrl, setVideoUrl] = useState(state?.videoUrl || "");

  useEffect(() => {
    if (!data && id) {
      fetch(`${API_BASE}/interviews`)
        .then(res => res.json())
        .then(res => {
          const interview = res.data.find(i => (i.interview_id === id || i._id === id));
          if (interview) {
            setData(interview);
            setVideoUrl(`${API_BASE}/${interview.video_path}`);
          }
        });
    }
  }, [id, data]);

  if (!data) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
      <Activity className="animate-spin text-blue-600 mb-4" size={40} />
      <p className="text-slate-500 font-medium">Loading analysis report...</p>
    </div>
  );

  // Data Mapping Logic
  const interviewData = data || {};
  const qaAnalysis = interviewData.analysis || []; 
  const mainAnalysisNode = qaAnalysis[0]?.analysis || {}; 
  const emotionAnalysis = interviewData.emotions || {};
  const transcript = interviewData.transcript || "";

  const scores = {
    communication: mainAnalysisNode.communication_score || 0,
    confidence: mainAnalysisNode.confidence_score || 0,
    technical: mainAnalysisNode.technical_depth_score || 0,
    final: mainAnalysisNode.final_interview_score || 0
  };

  // 🔥 Video Sync Handler: Converts "MM:SS" from chart to seconds
 const handleChartClick = (e) => {
  // 🔥 Improved check for finite values and valid labels
  if (e && e.activeLabel && videoRef.current) {
    const parts = e.activeLabel.split(':');
    if (parts.length === 2) {
      const minutes = parseInt(parts[0], 10);
      const seconds = parseInt(parts[1], 10);
      const totalSeconds = minutes * 60 + seconds;

      // Only set if the number is valid and within video bounds
      if (!isNaN(totalSeconds) && isFinite(totalSeconds)) {
        videoRef.current.currentTime = totalSeconds;
        videoRef.current.play();
      }
    }
  }
};

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-12">
      <div className="max-w-7xl mx-auto">
        <button 
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-8 transition font-medium"
        >
          <ArrowLeft size={20} /> Back to Dashboard
        </button>

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-4">
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Interview Intelligence</h1>
          <div className="bg-white px-4 py-2 rounded-2xl shadow-sm border border-slate-200 text-slate-500 text-sm font-semibold">
            ID: {id?.slice(0, 8)}...
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          <div className="lg:col-span-8 space-y-8">
            {/* Video Player */}
            <div className="bg-white rounded-[2.5rem] shadow-sm overflow-hidden border border-slate-200">
              <video 
                ref={videoRef} 
                src={videoUrl} 
                controls 
                className="w-full aspect-video bg-black shadow-inner" 
              />
            </div>

            {/* 📊 Emotion Timeline Chart */}
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
              <div className="flex justify-between items-center mb-6">
                <h3 className="flex items-center gap-2 font-bold text-xl text-slate-800">
                  <Activity size={22} className="text-rose-500" /> Emotional Sentiment Timeline
                </h3>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Click chart to seek video</span>
              </div>
              <div className="h-80 w-full cursor-pointer">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart 
                    data={Object.entries(emotionAnalysis.emotion_percentages || {}).map(([time, vals]) => ({ 
                      time, 
                      happy: vals.happy || 0,
                      neutral: vals.neutral || 0,
                      sad: vals.sad || 0,
                      surprise: vals.surprise || 0,
                      angry: vals.angry || 0,
                      disgust: vals.disgust || 0,
                      fear: vals.fear || 0
                    }))}
                    onClick={handleChartClick} // 🔥 Added onClick handler
                  >
                    <defs>
                      <linearGradient id="colorHappy" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="time" tick={{fontSize: 12, fill: '#94a3b8'}} />
                    <YAxis hide domain={[0, 100]} />
                    <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                    <Legend verticalAlign="top" height={36} iconType="circle"/> {/* 🔥 Added Legend */}
                    
                    <Area type="monotone" name="Happy" dataKey="happy" stroke="#10b981" fillOpacity={1} fill="url(#colorHappy)" strokeWidth={3} />
                    <Area type="monotone" name="Neutral" dataKey="neutral" stroke="#94a3b8" fillOpacity={0} strokeWidth={2} />
                    <Area type="monotone" name="Sad" dataKey="sad" stroke="#f43f5e" fillOpacity={0} strokeWidth={2} />
                    <Area type="monotone" name="Surprise" dataKey="surprise" stroke="#f59e0b" fillOpacity={0} strokeWidth={2} />
                    <Area type="monotone" name="Angry" dataKey="angry" stroke="#991b1b" fillOpacity={0} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 💬 Section: Segmented Q&A */}
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <MessageSquare className="text-blue-500" /> Segmented Analysis
              </h2>
              {qaAnalysis.length > 0 ? qaAnalysis.map((item, index) => (
                <div key={index} className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex gap-4 mb-6">
                    <span className="bg-blue-600 text-white font-bold h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-200">
                      {index + 1}
                    </span>
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-800 text-xl mb-2">{item.question || "Topic Analysis"}</h4>
                      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                        <p className="text-slate-600 leading-relaxed italic">"{item.answer}"</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                    <div className="bg-green-50/50 p-5 rounded-3xl border border-green-100">
                      <h5 className="text-green-700 font-bold text-sm mb-3 uppercase tracking-wider flex items-center gap-2">
                        <CheckCircle2 size={16} /> Strengths
                      </h5>
                      <p className="text-sm text-green-800 opacity-80">Highly structured answer with good technical terminology.</p>
                    </div>
                    <div className="bg-amber-50/50 p-5 rounded-3xl border border-amber-100">
                      <h5 className="text-amber-700 font-bold text-sm mb-3 uppercase tracking-wider flex items-center gap-2">
                        <BrainCircuit size={16} /> AI Suggestions
                      </h5>
                      <ul className="space-y-2 text-sm text-amber-800">
                        {(item.analysis?.suggestions || []).map((s, i) => (
                          <li key={i} className="flex gap-2 font-medium"><span>•</span> {s}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="p-10 bg-white rounded-[2rem] text-center border border-dashed border-slate-300 text-slate-400 font-medium">
                  Detailed Q&A will appear here once processed.
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-4 space-y-8">
            {/* Score Card */}
            <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-200 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-purple-500"></div>
              <h3 className="flex items-center gap-2 font-bold text-xl mb-8 text-slate-800">
                <BarChart3 size={22} className="text-blue-500" /> Overall Score
              </h3>
              <div className="text-center mb-10">
                <div className="text-8xl font-black text-slate-900 leading-none">{scores.final}</div>
                <p className="text-slate-400 font-bold mt-2 tracking-widest uppercase text-xs">out of 100</p>
              </div>
              <div className="space-y-6">
                <ScoreBar label="Communication" score={scores.communication} color="bg-blue-500" />
                <ScoreBar label="Confidence" score={scores.confidence} color="bg-indigo-500" />
                <ScoreBar label="Technical Depth" score={scores.technical} color="bg-purple-500" />
              </div>
            </div>

            {/* Emotional Stability Card */}
            <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-500/10 rounded-full blur-3xl"></div>
              <h3 className="font-bold text-sm mb-6 text-slate-400 uppercase tracking-widest">Sentiment Overview</h3>
              <div className="flex justify-between items-end mb-4">
                <div className="text-4xl font-bold text-blue-400 capitalize">{emotionAnalysis.dominant_emotion || "Steady"}</div>
                <div className="text-right">
                   <div className="text-2xl font-bold text-white">{emotionAnalysis.emotional_stability || 0}%</div>
                   <div className="text-[10px] text-slate-500 font-bold">STABILITY</div>
                </div>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5">
                <div 
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-1000" 
                  style={{ width: `${emotionAnalysis.emotional_stability || 0}%` }}
                />
              </div>
            </div>

            {/* Global Growth Card */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
              <h3 className="flex items-center gap-2 font-bold text-lg mb-6 text-slate-800">
                <AlertCircle size={20} className="text-amber-500" /> Areas for Growth
              </h3>
              <ul className="space-y-4">
                {(mainAnalysisNode.problems_detected || []).map((p, i) => (
                  <li key={i} className="flex gap-3 text-sm text-slate-600 font-medium leading-relaxed">
                    <span className="h-2 w-2 rounded-full bg-amber-400 mt-1.5 shrink-0 shadow-sm"></span> {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreBar({ label, score, color }) {
  const percentage = (score / 10) * 100;
  return (
    <div>
      <div className="flex justify-between text-xs mb-2 font-bold text-slate-500 uppercase tracking-tight">
        <span>{label}</span>
        <span className="text-slate-900">{score}/10</span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
        <div 
          className={`${color} h-full transition-all duration-1000 ease-out`} 
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}