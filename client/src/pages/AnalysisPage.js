import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion"; 
import { 
  ArrowLeft, BarChart3, Activity, Clock, Send, FileText,
  Terminal, Mic, MicOff, Volume2, VolumeX, Settings2, Trash2, Bot, PlayCircle, Loader2
} from "lucide-react";
import StarryBackground from "../components/StarryBackground";
import ReactMarkdown from 'react-markdown';

const API_BASE = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";

const PERSONAS = [
  { id: 'p1', name: "Standard (Calm)", lang: "en-US", rate: 0.9, pitch: 1.2 },
  { id: 'p2', name: "Standard (Energetic)", lang: "en-GB", rate: 1.1, pitch: 1.0 },
  { id: 'p3', name: "Standard (Formal)", lang: "en-US", rate: 1.0, pitch: 0.8 },
  { id: 'p4', name: "Regional (Hindi/English)", lang: "hi-IN", rate: 1.0, pitch: 1.0 },
  { id: 'p5', name: "Standard (Professional)", lang: "en-AU", rate: 1.0, pitch: 1.1 },
];

function TypewriterText({ text, speed = 15 }) {
  const [displayedText, setDisplayedText] = useState("");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText((prev) => prev + text.charAt(index));
        setIndex((prev) => prev + 1);
      }, speed);
      return () => clearTimeout(timeout);
    }
  }, [index, text, speed]);

  return <ReactMarkdown>{displayedText}</ReactMarkdown>;
}

export default function AnalysisPage() {
  const { id } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);

  const [data, setData] = useState(state?.analysis || null);
  const [videoUrl, setVideoUrl] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState([
    { 
      role: 'bot', 
      text: "### Analysis Complete\nI have reviewed your session and document context. \n\nWhat specific feedback would you like to review?", 
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
    }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isMuted, setIsMuted] = useState(false); 
  const [selectedPersona, setSelectedPersona] = useState(PERSONAS[2]); 
  const [showSettings, setShowSettings] = useState(false);

  const user = JSON.parse(localStorage.getItem("user") || "{}");

  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await fetch(`${API_BASE}/interviews?email=${user.email}`);
        const result = await res.json();
        const interview = result.data.find(i => (i.interview_id === id || i._id === id));
        
        if (interview) {
          setData(interview);
          const path = interview.video_path || "";
          const finalUrl = path.startsWith("http") 
            ? path 
            : `${API_BASE}/${path}?email=${user.email}`;
          setVideoUrl(finalUrl);

          if (interview.mentor_chat_history && interview.mentor_chat_history.length > 0) {
            setMessages(interview.mentor_chat_history.map(m => ({
                role: m.role === 'assistant' ? 'bot' : 'user',
                text: m.content,
                time: "Saved"
            })));
          }
        }
      } catch (err) { console.error("Data load failed:", err); }
    };
    loadData();

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition && !recognitionRef.current) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.onstart = () => setIsListening(true);
      recognitionRef.current.onend = () => setIsListening(false);
      recognitionRef.current.onresult = (e) => handleSendMessage(e.results[0][0].transcript, true);
    }
  }, [id, user.email]);

  const speak = (text) => {
    if (isMuted) return;
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[#*_]/g, "");
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.voice = window.speechSynthesis.getVoices().find(v => v.lang.startsWith(selectedPersona.lang)) || null;
    utterance.rate = selectedPersona.rate;
    utterance.pitch = selectedPersona.pitch;
    window.speechSynthesis.speak(utterance);
  };

  const toggleMic = () => {
    if (isListening) recognitionRef.current.stop();
    else { try { window.speechSynthesis.cancel(); recognitionRef.current.start(); } catch (e) { console.error(e); } }
  };

  const handleSendMessage = async (textOverride, isVoiceRequest = false) => {
    const text = textOverride || chatInput;
    if (!text.trim()) return;

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages(prev => [...prev, { role: 'user', text, time: timestamp }]);
    setChatInput("");
    setIsTyping(true);

    try {
      const res = await fetch(`${API_BASE}/mentor/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interview_id: id, query: text, timestamp: currentTime })
      });
      const result = await res.json();
      setMessages(prev => [...prev, { role: 'bot', text: result.answer, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
      if (isVoiceRequest) speak(result.answer);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'bot', text: "Connection error. Please try again.", time: timestamp }]);
    } finally { setIsTyping(false); }
  };

  const handleSeek = (seconds) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play();
    }
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isTyping]);

  if (!data) return (
    <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center font-sans text-slate-400">
      <Loader2 className="animate-spin text-blue-500 mb-4" size={32} />
      <span className="text-sm font-medium">Loading report data...</span>
    </div>
  );

  const scoreNode = data.analysis?.[0]?.analysis || data || {};
  const transcriptSegments = Array.isArray(data.transcript) ? data.transcript : [];

  return (
    <div className="h-screen w-full text-slate-200 bg-[#050505] font-sans overflow-hidden flex flex-col relative">
      <StarryBackground />
      
      {/* Header */}
      <div className="relative z-20 w-full px-6 flex justify-between items-center bg-slate-900/60 backdrop-blur-md border-b border-slate-800 h-[64px] shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/dashboard")} className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-lg font-semibold text-slate-50 tracking-tight">Session Report</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { window.speechSynthesis.cancel(); setIsMuted(!isMuted); }} className={`p-2 rounded-md transition-colors ${isMuted ? 'text-red-400 bg-red-500/10' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button onClick={() => setShowSettings(!showSettings)} className="p-2 rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors">
            <Settings2 size={18} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="absolute right-6 top-20 z-[100] w-64 p-4 border border-slate-800 shadow-xl rounded-lg bg-slate-900">
            <p className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">Voice Settings</p>
            <div className="space-y-1.5">
              {PERSONAS.map(p => (
                <button key={p.id} onClick={() => { setSelectedPersona(p); setShowSettings(false); }} className={`w-full text-left px-3 py-2 rounded text-sm font-medium transition-colors ${selectedPersona.id === p.id ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>
                  {p.name}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 flex flex-1 overflow-hidden p-6 gap-6">
        
        {/* Left Column: Data & Metrics */}
        <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
          
          {/* Video Player */}
          <div className="rounded-xl overflow-hidden border border-slate-800 bg-black shadow-sm shrink-0">
            {videoUrl && <video ref={videoRef} src={videoUrl} controls className="w-full aspect-video" onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)} />}
          </div>

          {/* Scores */}
          <div className="grid grid-cols-3 gap-4 shrink-0">
            <div className="col-span-1 p-5 rounded-lg border border-slate-800 bg-slate-900/50 flex flex-col items-center justify-center">
              <div className="text-4xl font-bold text-slate-50">{scoreNode.final_interview_score || 0}</div>
              <p className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wider">Overall Score</p>
            </div>
            <div className="col-span-2 p-5 rounded-lg border border-slate-800 bg-slate-900/50 flex flex-col justify-center gap-5">
              <ScoreMini label="Communication Skills" score={scoreNode.communication_score} color="bg-blue-500" />
              <ScoreMini label="Technical Accuracy" score={scoreNode.technical_depth_score} color="bg-emerald-500" />
            </div>
          </div>

          {/* Resume Context */}
          <div className="p-6 rounded-lg border border-slate-800 bg-slate-900/50 shrink-0">
            <h3 className="flex items-center gap-2 font-semibold text-sm mb-4 text-slate-200">
              <FileText size={16} className="text-slate-400" /> Document Context
            </h3>
            <div className="max-h-[120px] overflow-y-auto pr-2 custom-scrollbar">
              <p className="text-sm text-slate-400 leading-relaxed font-mono whitespace-pre-wrap">
                {data.resume_context || "No document context provided during this session."}
              </p>
            </div>
          </div>

          {/* Transcript */}
          <div className="p-6 rounded-lg border border-slate-800 bg-slate-900/50 flex-1 min-h-[300px] flex flex-col">
            <h3 className="flex items-center gap-2 font-semibold text-sm mb-4 text-slate-200 shrink-0">
              <Activity size={16} className="text-slate-400" /> Session Transcript
            </h3>
            <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
              {transcriptSegments.length > 0 ? transcriptSegments.map((seg, i) => {
                const isActive = currentTime >= seg.start && currentTime <= (seg.end || seg.start + 2);
                return (
                  <button key={i} onClick={() => handleSeek(seg.start)} className={`w-full text-left p-3 rounded-md border transition-colors flex justify-between items-start gap-4 ${isActive ? "border-blue-500/50 bg-blue-500/10" : "border-slate-800 bg-slate-900 hover:border-slate-700"}`}>
                    <p className={`text-sm leading-relaxed ${isActive ? 'text-slate-200' : 'text-slate-400'}`}>{seg.text}</p>
                    <PlayCircle size={14} className={`shrink-0 mt-0.5 ${isActive ? "text-blue-400" : "text-slate-600"}`} />
                  </button>
                );
              }) : (
                <div className="py-8 text-center border border-slate-800 rounded-md bg-slate-900/50">
                    <p className="text-slate-500 text-sm font-medium mb-2">Reviewing Transcripts</p>
                    <div className="text-xs text-slate-600 leading-relaxed font-mono whitespace-pre-wrap px-4">
                      {typeof data.transcript === 'string' ? data.transcript : "No interactive dialogue recorded."}
                    </div>
                </div>
              )}
            </div>
          </div>

          {/* Technical Code Analysis */}
          <div className="p-6 rounded-lg border border-slate-800 bg-slate-900/50 shrink-0">
            <h3 className="flex items-center gap-2 font-semibold text-sm mb-4 text-slate-200">
              <Terminal size={16} className="text-slate-400" /> Technical Assessment
            </h3>
            <div className="prose prose-invert prose-sm text-slate-300 leading-relaxed max-w-none">
              <ReactMarkdown>{data.code_analysis || "No code evaluations recorded for this session."}</ReactMarkdown>
            </div>
          </div>
        </div>

        {/* Right Column: AI Assistant Chat */}
        <div className="w-[400px] xl:w-[480px] flex flex-col border border-slate-800 bg-slate-900/80 rounded-xl overflow-hidden shadow-sm shrink-0">
          
          <div className="p-4 border-b border-slate-800 bg-slate-900 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white"><Bot size={18} /></div>
              <div>
                <h4 className="font-semibold text-sm text-slate-100">AI Assistant</h4>
                <span className="text-[10px] font-medium text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Active
                </span>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar bg-slate-950/50">
            {messages.map((msg, i) => (
              <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-4 py-3 rounded-lg text-sm shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-slate-800 text-slate-200 rounded-tl-sm border border-slate-700'}`}>
                  <div className="leading-relaxed prose prose-invert prose-p:my-0 prose-sm">
                    {msg.role === 'bot' && i === messages.length - 1 ? <TypewriterText text={msg.text} /> : <ReactMarkdown>{msg.text}</ReactMarkdown>}
                  </div>
                  <span className="text-[9px] text-slate-400 block text-right mt-1.5 font-medium">{msg.time}</span>
                </div>
              </motion.div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-slate-800 px-4 py-3 rounded-lg rounded-tl-sm border border-slate-700">
                  <Loader2 className="animate-spin text-slate-400" size={16} />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 bg-slate-900 border-t border-slate-800 shrink-0">
            <div className="flex items-center gap-2 bg-slate-950 rounded-md p-1.5 border border-slate-700 focus-within:border-blue-500 transition-colors shadow-inner">
              <button onClick={toggleMic} className={`p-2 rounded transition-colors ${isListening ? 'bg-red-500/20 text-red-400' : 'hover:bg-slate-800 text-slate-400'}`}>
                {isListening ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
              <input 
                value={chatInput} 
                onChange={(e) => setChatInput(e.target.value)} 
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage(null, false)} 
                placeholder="Ask for specific feedback..." 
                className="flex-1 bg-transparent py-1.5 text-sm text-slate-200 focus:outline-none placeholder:text-slate-600" 
              />
              <button 
                onClick={() => handleSendMessage(null, false)} 
                disabled={!chatInput.trim()}
                className={`p-2 rounded transition-colors ${chatInput.trim() ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
              >
                <Send size={14} />
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function ScoreMini({ label, score, color }) {
  const percentage = Math.min((score / 10) * 100, 100);
  return (
    <div className="w-full">
      <div className="flex justify-between text-[10px] mb-1.5 font-semibold text-slate-400 uppercase tracking-wider">
        <span>{label}</span>
        <span className="text-slate-200">{score || 0}/10</span>
      </div>
      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${percentage}%` }} transition={{ duration: 1 }} className={`${color} h-full rounded-full`} />
      </div>
    </div>
  );
}