import React, { useCallback, useEffect, useRef, useState } from "react";
import Editor, { loader } from "@monaco-editor/react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  ShieldCheck,
  Activity,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

import StarryBackground from "../components/StarryBackground";
import {
  createRealtimeSession,
  saveRealtimeEvent,
  endRealtimeSession,
  getUserEmail,
} from "../services/api";
import { RealtimeVoiceClient } from "../services/realtimeVoice";

loader.config({
  paths: {
    vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.43.0/min/vs",
  },
});

const DEFAULT_CODE = "// Start coding your solution here...";

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

  return null;
};

const cleanText = (value) => {
  return String(value || "").replace(/\s+/g, " ").trim();
};

export default function RealtimeInterviewRoom() {
  const navigate = useNavigate();
  const location = useLocation();

  const config = location.state?.config || {
    title: "Realtime Interview",
    role: "Candidate",
    company: "",
    duration: 15,
    interview_type: "custom",
    resume_context: "",
    topics: "",
    difficulty: "medium",
  };

  const [interviewId, setInterviewId] = useState(
    location.state?.interviewId || `realtime_${Date.now()}`
  );

  const realtimeClientRef = useRef(null);
  const startedRef = useRef(false);
  const endedRef = useRef(false);
  const chatEndRef = useRef(null);
  const codeRef = useRef(DEFAULT_CODE);
  const statusRef = useRef("");

  const [status, setStatus] = useState("Preparing realtime interview...");
  const [isConnecting, setIsConnecting] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [chat, setChat] = useState([]);
  const [liveAssistantText, setLiveAssistantText] = useState("");
  const [code, setCode] = useState(DEFAULT_CODE);
  const [timeLeft, setTimeLeft] = useState(Number(config.duration || 15) * 60);
  const [error, setError] = useState("");

  const user = getStoredUser();
  const userEmail = user?.email || getUserEmail();

  const updateStatus = useCallback((nextStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }, []);

  const pushChat = useCallback((message) => {
    const safeText = cleanText(message.text);
    if (!safeText) return;

    setChat((prev) => [
      ...prev,
      {
        role: message.role,
        text: safeText,
        time: Date.now(),
      },
    ]);
  }, []);

  const persistRealtimeText = useCallback(
    async ({ role, text, eventType, rawEvent }) => {
      const safeText = cleanText(text);
      if (!safeText || !interviewId) return;

      try {
        await saveRealtimeEvent({
          interviewId,
          userEmail,
          eventType,
          role,
          text: safeText,
          rawEvent,
        });
      } catch (err) {
        console.warn("Realtime event save failed:", err);
      }
    },
    [interviewId, userEmail]
  );

  const handleCodeChange = useCallback((value) => {
    const nextCode = value || "";
    codeRef.current = nextCode;
    setCode(nextCode);
  }, []);

  const endInterview = useCallback(async () => {
    if (endedRef.current) return;

    endedRef.current = true;
    updateStatus("Ending interview...");

    try {
      realtimeClientRef.current?.disconnect();
    } catch (_) {}

    try {
      await endRealtimeSession({
        interviewId,
        userEmail,
        codeSnapshot: codeRef.current,
        durationMinutes: String(config.duration || 15),
      });
    } catch (err) {
      console.error("End realtime session failed:", err);
    }

    navigate("/dashboard");
  }, [config.duration, interviewId, navigate, updateStatus, userEmail]);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    if (nextMuted) {
      realtimeClientRef.current?.mute();
      updateStatus("Microphone muted.");
    } else {
      realtimeClientRef.current?.unmute();
      updateStatus("Microphone active.");
    }
  }, [isMuted, updateStatus]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const startRealtimeInterview = async () => {
      try {
        if (!userEmail) {
          throw new Error("User email missing. Please login again.");
        }

        updateStatus("Creating realtime session...");

        const sessionResponse = await createRealtimeSession({
          interviewId,
          userEmail,
          title: config.title || "Realtime Interview",
          interviewType:
            config.interview_type || config.interviewType || "custom",
          role: config.role || "Candidate",
          company: config.company || "",
          duration: Number(config.duration || 15),
          resumeContext: config.resume_context || config.resumeContext || "",
          topics: config.topics || "",
          difficulty: config.difficulty || "medium",
        });

        const finalInterviewId = sessionResponse.interview_id || interviewId;
        setInterviewId(finalInterviewId);

        const client = new RealtimeVoiceClient({
          sessionData: sessionResponse,
          interviewId: finalInterviewId,

          onStatus: updateStatus,

          onAssistantText: async (text, done, rawEvent) => {
            const safeText = cleanText(text);

            if (!done) {
              setLiveAssistantText(safeText);
              return;
            }

            setLiveAssistantText("");

            if (safeText) {
              pushChat({ role: "assistant", text: safeText });

              await persistRealtimeText({
                role: "assistant",
                text: safeText,
                eventType: "assistant_transcript_done",
                rawEvent,
              });
            }
          },

          onUserText: async (text, rawEvent) => {
            const safeText = cleanText(text);
            if (!safeText) return;

            pushChat({ role: "user", text: safeText });

            await persistRealtimeText({
              role: "user",
              text: safeText,
              eventType: "user_transcript_done",
              rawEvent,
            });
          },

          onTranscript: () => {},

          onEvent: async (event) => {
            const importantTypes = [
              "session.created",
              "response.created",
              "response.done",
              "input_audio_buffer.speech_started",
              "input_audio_buffer.speech_stopped",
              "conversation.item.created",
            ];

            if (!importantTypes.includes(event.type)) return;

            try {
              await saveRealtimeEvent({
                interviewId: finalInterviewId,
                userEmail,
                eventType: event.type,
                role: "",
                text: "",
                rawEvent: event,
              });
            } catch (_) {}
          },

          onError: (err) => {
            console.error("Realtime client error:", err);
            const message =
              err?.message ||
              err?.error?.message ||
              "Realtime voice connection failed.";
            setError(message);
            updateStatus("Realtime connection error.");
          },
        });

        realtimeClientRef.current = client;

        await client.connect();

        setIsConnecting(false);
        updateStatus("Realtime interview active.");
      } catch (err) {
        console.error("Realtime interview start failed:", err);
        setError(err?.message || "Failed to start realtime interview.");
        setIsConnecting(false);
        updateStatus("Realtime interview failed.");
      }
    };

    startRealtimeInterview();

    return () => {
      try {
        realtimeClientRef.current?.disconnect();
      } catch (_) {}
    };
  }, [
    config,
    interviewId,
    persistRealtimeText,
    pushChat,
    updateStatus,
    userEmail,
  ]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          endInterview();
          return 0;
        }

        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [endInterview]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, liveAssistantText]);

  return (
    <div className="h-screen w-full bg-[#050505] flex flex-col overflow-hidden text-white font-sans">
      <StarryBackground />

      <AnimatePresence>
        {isConnecting && (
          <div className="absolute inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center backdrop-blur-xl px-6 text-center">
            <Loader2 className="animate-spin text-purple-500 mb-4" size={60} />
            <h2 className="text-xl font-black uppercase tracking-widest italic">
              Connecting Realtime Jarvis...
            </h2>
            <p className="mt-3 text-xs text-slate-400 max-w-lg">{status}</p>

            {error && (
              <div className="mt-6 max-w-xl rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                <p className="font-bold mb-2">Realtime start failed</p>
                <p>{error}</p>
                <button
                  onClick={() => navigate("/simulate", { state: { config } })}
                  className="mt-4 rounded-full bg-purple-600 px-5 py-2 text-xs font-black uppercase"
                >
                  Use Fallback Simulation
                </button>
              </div>
            )}
          </div>
        )}
      </AnimatePresence>

      <div className="relative z-10 p-4 flex justify-between items-center bg-black/40 border-b border-white/5">
        <div className="flex items-center gap-4">
          <div className="px-4 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 font-mono font-bold flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            {Math.floor(timeLeft / 60)}:
            {(timeLeft % 60).toString().padStart(2, "0")}
          </div>

          <div>
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
              {config.title || "Realtime Interview"}
            </p>
            <p className="text-[10px] text-purple-300 mt-1 flex items-center gap-1">
              <Radio size={10} /> {status}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleMute}
            className={`px-5 py-2 rounded-full font-black uppercase text-[10px] flex items-center gap-2 transition-all ${
              isMuted
                ? "bg-yellow-600 hover:bg-yellow-500"
                : "bg-emerald-600 hover:bg-emerald-500"
            }`}
          >
            {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
            {isMuted ? "Unmute" : "Mute"}
          </button>

          <button
            onClick={endInterview}
            className="bg-rose-600 hover:bg-rose-500 px-6 py-2 rounded-full font-black uppercase text-[10px] flex items-center gap-2 transition-all"
          >
            <PhoneOff size={14} /> End Session
          </button>
        </div>
      </div>

      <div className="relative z-10 flex-1 flex overflow-hidden p-4 gap-4">
        <div className="flex-1 glass-card overflow-hidden border border-white/5 bg-[#0a0a0a] rounded-[2rem]">
          <Editor
            height="100%"
            defaultLanguage="cpp"
            theme="vs-dark"
            value={code}
            onChange={handleCodeChange}
            options={{
              fontSize: 16,
              minimap: { enabled: false },
              wordWrap: "on",
              scrollBeyondLastLine: false,
            }}
          />
        </div>

        <div className="w-[440px] flex flex-col gap-4">
          <div className="glass-card rounded-[2rem] p-5 bg-black/60 border border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-purple-600 flex items-center justify-center shadow-lg shadow-purple-900/30">
                <Bot size={22} />
              </div>

              <div>
                <h2 className="text-sm font-black uppercase tracking-widest">
                  Jarvis Live
                </h2>
                <p className="text-[11px] text-slate-400 mt-1">
                  Realtime voice interviewer
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-2 text-[11px] text-emerald-300">
              <ShieldCheck size={14} />
              Session ID: {interviewId}
            </div>

            <div className="mt-3 flex items-center gap-2 text-[11px] text-purple-300">
              <Activity size={14} />
              Mic streams directly to realtime AI
            </div>

            {error && (
              <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
                {error}
              </div>
            )}
          </div>

          <div className="flex-1 glass-card border border-white/10 bg-[#0c0c0c] rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <span className="font-black text-[10px] uppercase tracking-widest text-white">
                Live Transcript
              </span>

              <div
                className={`w-2 h-2 rounded-full ${
                  isMuted ? "bg-yellow-500" : "bg-emerald-500 animate-pulse"
                }`}
              />
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {chat.length === 0 && !liveAssistantText && (
                <div className="text-center text-xs text-slate-500 mt-20">
                  Jarvis will start speaking after connection.
                </div>
              )}

              {chat.map((msg, index) => (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={`${msg.role}-${msg.time}-${index}`}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[90%] px-4 py-2.5 rounded-2xl text-[12px] shadow-xl ${
                      msg.role === "user"
                        ? "bg-purple-700 text-white rounded-tr-none"
                        : "bg-[#1e1e1e] text-slate-300 rounded-tl-none border border-white/5"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    ) : (
                      msg.text
                    )}
                  </div>
                </motion.div>
              ))}

              {liveAssistantText && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div className="max-w-[90%] px-4 py-2.5 rounded-2xl text-[12px] shadow-xl bg-[#1e1e1e] text-slate-300 rounded-tl-none border border-purple-500/20">
                    <ReactMarkdown>{liveAssistantText}</ReactMarkdown>
                  </div>
                </motion.div>
              )}

              <div ref={chatEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}