import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { 
  ArrowLeft, MessageSquare, BarChart3, AlertCircle, 
  CheckCircle2, BrainCircuit, Activity, Sparkles, Clock, ChevronRight, Send
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
  const videoRef = useRef(null);
  const transcriptContainerRef = useRef(null);
  const chatEndRef = useRef(null); // 🔥 For auto-scrolling chat
  
  const [data, setData] = useState(state?.analysis || null);
  const [videoUrl, setVideoUrl] = useState(state?.videoUrl || "");
  const [currentTime, setCurrentTime] = useState(0);
  
  // 🔥 Jarvis Mentor States
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState([
    { role: 'bot', text: "Hello! I'm Jarvis, your AI Mentor. Ask me anything about your performance or technical concepts mentioned in this session." }
  ]);
  const [isTyping, setIsTyping] = useState(false);

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

  // Auto-scroll transcript & chat
  useEffect(() => {
    const activeElem = transcriptContainerRef.current?.querySelector(".active-segment");
    if (activeElem) activeElem.scrollIntoView({ behavior: "smooth", block: "center" });
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentTime, messages]);

  if (!data) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
      <Activity className="animate-spin text-blue-600 mb-4" size={40} />
      <p className="text-slate-500 font-medium">Loading analysis report...</p>
    </div>
  );

  const interviewData = data || {};
  const qaAnalysis = interviewData.analysis || []; 
  const mainAnalysisNode = qaAnalysis[0]?.analysis || {}; 
  const emotionAnalysis = interviewData.emotions || {};
  const transcriptSegments = Array.isArray(interviewData.transcript) ? interviewData.transcript : [];

  const scores = {
    communication: mainAnalysisNode.communication_score || 0,
    confidence: mainAnalysisNode.confidence_score || 0,
    technical: mainAnalysisNode.technical_depth_score || 0,
    final: mainAnalysisNode.final_interview_score || 0
  };

  // 🔥 Jarvis Chat Logic
  const askJarvis = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = { role: 'user', text: chatInput, time: currentTime };
    setMessages(prev => [...prev, userMsg]);
    setChatInput("");
    setIsTyping(true);

    try {
      const res = await fetch(`${API_BASE}/mentor/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interview_id: id,
          query: chatInput,
          timestamp: currentTime
        })
      });
      const result = await res.json();
      setMessages(prev => [...prev, { role: 'bot', text: result.answer, resources: result.resources }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'bot', text: "Sorry, I'm having trouble connecting to my knowledge base right now." }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSeek = (seconds) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play();
    }
  };

  const handleChartClick = (e) => {
    if (e && e.activeLabel && videoRef.current) {
      const parts = e.activeLabel.split(':');
      if (parts.length === 2) {
        const totalSeconds = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
        if (!isNaN(totalSeconds)) handleSeek(totalSeconds);
      }
    }
  };

  const getSentimentColor = (text) => {
    const lower = text.toLowerCase();
    const stumbling = ["um", "uh", "actually", "like", "maybe", "sort of"];
    const confident = ["definitely", "implemented", "achieved", "solved", "designed"];
    if (stumbling.some(word => lower.includes(word))) return "bg-rose-50 border-rose-100 text-rose-700";
    if (confident.some(word => lower.includes(word))) return "bg-emerald-50 border-emerald-100 text-emerald-700";
    return "bg-slate-50 border-slate-100 text-slate-600";
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-12">
      <div className="max-w-7xl mx-auto">
        <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-8 transition font-medium">
          <ArrowLeft size={20} /> Back to Dashboard
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-8">
            <div className="bg-white rounded-[2.5rem] shadow-sm overflow-hidden border border-slate-200 relative">
              <video 
                ref={videoRef} src={videoUrl} controls 
                onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
                className="w-full aspect-video bg-black shadow-inner" 
              />
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
              <h3 className="flex items-center gap-2 font-bold text-xl text-slate-800 mb-6">
                <Sparkles size={22} className="text-blue-500" /> Interactive Transcript
              </h3>
              <div ref={transcriptContainerRef} className="max-h-[500px] overflow-y-auto pr-4 space-y-3 custom-scrollbar">
                {transcriptSegments.length > 0 ? transcriptSegments.map((seg, i) => {
                  const isActive = currentTime >= seg.start && currentTime <= seg.end;
                  return (
                    <div 
                      key={i} onClick={() => handleSeek(seg.start)}
                      className={`p-4 rounded-2xl border-2 cursor-pointer transition-all duration-300 group ${
                        isActive ? "active-segment border-blue-500 ring-4 ring-blue-50 shadow-md scale-[1.01]" : "border-transparent opacity-60 hover:opacity-100"
                      } ${getSentimentColor(seg.text)}`}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-tighter opacity-50">
                          <Clock size={10} /> {Math.floor(seg.start / 60)}:{(seg.start % 60).toFixed(0).padStart(2, '0')}
                        </span>
                        {isActive && <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />}
                      </div>
                      <p className="text-sm font-semibold leading-relaxed">{seg.text}</p>
                    </div>
                  );
                }) : <div className="text-center py-10 text-slate-400 italic">No transcript segments found.</div>}
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-8">
            {/* 🔥 JARVIS MENTOR INTERFACE */}
            <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col h-[550px]">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-purple-100 p-2 rounded-xl text-purple-600"><Sparkles size={20}/></div>
                <div>
                  <h3 className="font-bold text-slate-800">Jarvis Mentor</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">RAG-Powered AI</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 space-y-4 mb-4 custom-scrollbar">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[85%] p-4 rounded-3xl text-sm leading-relaxed ${
                      msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-100 text-slate-800 rounded-tl-none'
                    }`}>
                      {msg.text}
                      {msg.time !== undefined && <div className="mt-1 text-[9px] opacity-60 font-bold uppercase">At {Math.floor(msg.time / 60)}:{(msg.time % 60).toFixed(0).padStart(2, '0')}</div>}
                    </div>
                  </div>
                ))}
                {isTyping && <div className="text-slate-400 text-xs italic animate-pulse">Jarvis is thinking...</div>}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={askJarvis} className="relative">
                <input 
                  value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask about a specific moment..."
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 pr-12 text-sm focus:outline-none focus:border-purple-400 transition-all font-medium"
                />
                <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-purple-600 hover:bg-purple-50 rounded-xl transition-colors">
                  <Send size={18} />
                </button>
              </form>
            </div>

            {/* Existing Score Card */}
            <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-200 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-purple-500"></div>
              <h3 className="flex items-center gap-2 font-bold text-xl mb-8 text-slate-800"><BarChart3 size={22} className="text-blue-500" /> Overall Score</h3>
              <div className="text-center mb-10"><div className="text-8xl font-black text-slate-900 leading-none">{scores.final}</div></div>
              <div className="space-y-6">
                <ScoreBar label="Communication" score={scores.communication} color="bg-blue-500" />
                <ScoreBar label="Confidence" score={scores.confidence} color="bg-indigo-500" />
                <ScoreBar label="Technical Depth" score={scores.technical} color="bg-purple-500" />
              </div>
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
      <div className="flex justify-between text-xs mb-2 font-bold text-slate-500 uppercase tracking-tight"><span>{label}</span><span className="text-slate-900">{score}/10</span></div>
      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
        <div className={`${color} h-full transition-all duration-1000 ease-out`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}