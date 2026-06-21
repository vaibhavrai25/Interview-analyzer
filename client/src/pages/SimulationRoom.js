import React, { useState, useEffect, useRef, useCallback } from "react";
import Editor, { loader } from "@monaco-editor/react";
import { motion, AnimatePresence } from "framer-motion";
import { PhoneOff, Activity, Loader2, Bot, Code2, Video, MessageSquare } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  socket,
  connectSocket,
  disconnectSocket,
  emitCodeUpdate,
  emitUserAnswer,
} from "../services/socket";
import ReactMarkdown from "react-markdown";
import StarryBackground from "../components/StarryBackground";
import { uploadLiveInterview } from "../services/api";

loader.config({
  paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.43.0/min/vs" },
});

const DEFAULT_CODE = "// Implement your solution here...";
const ANSWER_SILENCE_MS = 3400;
const MIN_ANSWER_LENGTH = 4;
const SPEECH_WATCHDOG_MS = 2200;

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

const getStoredUserEmail = () => {
  const user = getStoredUser();
  return (
    user?.email ||
    localStorage.getItem("user_email") ||
    localStorage.getItem("email") ||
    ""
  );
};

const getSupportedMimeType = () => {
  const types = [
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
  ];
  for (const type of types) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "";
};

const cleanTranscriptText = (text) => {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
};

export default function SimulationRoom() {
  const navigate = useNavigate();
  const location = useLocation();

  const [interviewId] = useState(`live_${Date.now()}`);

  const config = location.state?.config || {
    title: "Standard Mock Session",
    role: "Developer",
    company: "",
    duration: 15,
    resume_context: "",
  };

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chatEndRef = useRef(null);

  const chunksRef = useRef([]);
  const chatRef = useRef([]);
  const codeRef = useRef(DEFAULT_CODE);

  const listeningRef = useRef(false);
  const speakingRef = useRef(false);
  const syncingRef = useRef(false);
  const hasSyncedRef = useRef(false);

  const shouldSyncOnRecorderStopRef = useRef(false);
  const componentUnmountingRef = useRef(false);

  const finalSpeechBufferRef = useRef("");
  const interimSpeechRef = useRef("");
  const lastSentAnswerRef = useRef("");
  const silenceTimerRef = useRef(null);
  const recognitionRestartTimerRef = useRef(null);
  const speechWatchdogTimerRef = useRef(null);

  const codeDebounceRef = useRef(null);
  const lastSentCodeRef = useRef("");

  const [isMuted] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [code, setCode] = useState(DEFAULT_CODE);
  const [chat, setChat] = useState([]);
  const [timeLeft, setTimeLeft] = useState(Number(config.duration || 15) * 60);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [listenStatus, setListenStatus] = useState("Initializing protocol...");

  const pushChat = useCallback((msg) => {
    setChat((prev) => {
      const next = [...prev, { ...msg, time: Date.now() }];
      chatRef.current = next;
      return next;
    });
  }, []);

  const hardRestartRecognition = useCallback(() => {
    if (!recognitionRef.current || syncingRef.current || speakingRef.current || isMuted) return;

    try {
      recognitionRef.current.abort();
    } catch (_) {}

    listeningRef.current = false;
    clearTimeout(recognitionRestartTimerRef.current);

    recognitionRestartTimerRef.current = setTimeout(() => {
      if (!recognitionRef.current || syncingRef.current || speakingRef.current || isMuted) return;
      try {
        recognitionRef.current.start();
        listeningRef.current = true;
        setListenStatus("Listening...");
      } catch (_) {
        listeningRef.current = false;
        setListenStatus("Restarting capture...");
      }
    }, 650);
  }, [isMuted]);

  const stopListening = useCallback(() => {
    clearTimeout(recognitionRestartTimerRef.current);
    try {
      recognitionRef.current?.stop();
    } catch (_) {}
    listeningRef.current = false;
    setListenStatus("Input paused");
  }, []);

  const startListening = useCallback(() => {
    if (
      isMuted ||
      syncingRef.current ||
      speakingRef.current ||
      listeningRef.current ||
      !recognitionRef.current
    ) return;

    try {
      recognitionRef.current.start();
      listeningRef.current = true;
      setListenStatus("Listening...");
    } catch (_) {
      listeningRef.current = false;
      setListenStatus("Restarting capture...");
      clearTimeout(recognitionRestartTimerRef.current);
      recognitionRestartTimerRef.current = setTimeout(() => {
        if (!speakingRef.current && !syncingRef.current && !listeningRef.current) {
          try {
            recognitionRef.current?.start();
            listeningRef.current = true;
            setListenStatus("Listening...");
          } catch (_) {
            setListenStatus("Capture retry pending...");
          }
        }
      }, 1000);
    }
  }, [isMuted]);

  const speak = useCallback((text) => {
    if (!text || text.toUpperCase().includes("SILENCE")) return;

    stopListening();
    speakingRef.current = true;
    setLiveTranscript("");
    setListenStatus("Interviewer speaking...");

    try {
      window.speechSynthesis.cancel();
    } catch (_) {}

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();

    utterance.voice =
      voices.find((v) => v.lang === "en-US" && v.name.includes("Google")) ||
      voices.find((v) => v.lang?.startsWith("en")) ||
      voices[0] ||
      null;

    utterance.rate = 0.96;
    utterance.pitch = 0.94;

    utterance.onend = () => {
      speakingRef.current = false;
      clearTimeout(recognitionRestartTimerRef.current);
      recognitionRestartTimerRef.current = setTimeout(() => startListening(), 650);
    };

    utterance.onerror = () => {
      speakingRef.current = false;
      clearTimeout(recognitionRestartTimerRef.current);
      recognitionRestartTimerRef.current = setTimeout(() => startListening(), 650);
    };

    window.speechSynthesis.speak(utterance);
  }, [startListening, stopListening]);

  const sendBufferedAnswer = useCallback(() => {
    const mergedAnswer = cleanTranscriptText(`${finalSpeechBufferRef.current} ${interimSpeechRef.current}`);

    finalSpeechBufferRef.current = "";
    interimSpeechRef.current = "";
    setLiveTranscript("");

    if (syncingRef.current || speakingRef.current) return;

    if (mergedAnswer.length < MIN_ANSWER_LENGTH) {
      setTimeout(() => startListening(), 400);
      return;
    }

    if (mergedAnswer === lastSentAnswerRef.current) {
      setTimeout(() => startListening(), 400);
      return;
    }

    lastSentAnswerRef.current = mergedAnswer;
    pushChat({ role: "user", text: mergedAnswer });
    setIsThinking(true);
    setListenStatus("Processing input...");

    const emitted = emitUserAnswer(mergedAnswer, codeRef.current, {
      ...config,
      interview_id: interviewId,
      interview_type: config.interview_type || config.interviewType || "sde",
    });

    if (!emitted) {
      setIsThinking(false);
      console.warn("Connection lost. Answer not transmitted.");
      setTimeout(() => startListening(), 700);
    }
  }, [config, interviewId, pushChat, startListening]);

  const scheduleAnswerSend = useCallback(() => {
    clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      sendBufferedAnswer();
    }, ANSWER_SILENCE_MS);
  }, [sendBufferedAnswer]);

  const handleCodeChange = useCallback((value) => {
    const nextCode = value || "";
    codeRef.current = nextCode;
    setCode(nextCode);

    clearTimeout(codeDebounceRef.current);
    codeDebounceRef.current = setTimeout(() => {
      const cleanCode = codeRef.current.trim();
      if (cleanCode.length < 80) return;
      if (cleanCode === lastSentCodeRef.current) return;

      lastSentCodeRef.current = cleanCode;
      emitCodeUpdate(cleanCode, {
        ...config,
        interview_id: interviewId,
        interview_type: config.interview_type || config.interviewType || "sde",
      });
    }, 4500);
  }, [config, interviewId]);

  const stopAllMedia = useCallback(() => {
    try {
      streamRef.current?.getTracks()?.forEach((track) => track.stop());
    } catch (_) {}
  }, []);

  const syncLiveInterview = useCallback(async (blob) => {
    if (hasSyncedRef.current) return;

    hasSyncedRef.current = true;
    syncingRef.current = true;
    setIsSyncing(true);
    setSyncError("");

    const userEmail = getStoredUserEmail();

    if (!userEmail) {
      const message = "Authentication error. Unable to verify user session.";
      console.error(message);
      setSyncError(message);
      setIsSyncing(false);
      syncingRef.current = false;
      hasSyncedRef.current = false;
      return;
    }

    if (!blob || blob.size === 0) {
      const message = "Data stream empty. Media capture failed to initialize.";
      console.error(message);
      setSyncError(message);
      setIsSyncing(false);
      syncingRef.current = false;
      hasSyncedRef.current = false;
      return;
    }

    try {
      const videoFile = new File([blob], `${interviewId}.webm`, { type: "video/webm" });

      await uploadLiveInterview({
        video: videoFile,
        interviewId,
        title: config.title || "Mock Technical Session",
        userEmail,
        interviewType: config.interview_type || config.interviewType || "Simulation",
        resumeContext: config.resume_context || config.resumeContext || "",
        transcript: chatRef.current,
        codeSnapshot: codeRef.current,
        durationMinutes: String(config.duration || 15),
      });

      stopAllMedia();
      disconnectSocket();
      navigate("/dashboard");
    } catch (err) {
      console.error("Transmission failed:", err);
      const message = err?.message || err?.response?.data?.detail || "Session data upload failed.";
      setSyncError(message);
      setIsSyncing(false);
      syncingRef.current = false;
      hasSyncedRef.current = false;
      shouldSyncOnRecorderStopRef.current = false;
    }
  }, [config, interviewId, navigate, stopAllMedia]);

  const endSession = useCallback(() => {
    if (syncingRef.current) return;

    const pendingAnswer = cleanTranscriptText(`${finalSpeechBufferRef.current} ${interimSpeechRef.current}`);

    if (pendingAnswer.length >= MIN_ANSWER_LENGTH) {
      pushChat({ role: "user", text: pendingAnswer });
      finalSpeechBufferRef.current = "";
      interimSpeechRef.current = "";
    }

    shouldSyncOnRecorderStopRef.current = true;
    syncingRef.current = true;
    setIsSyncing(true);
    setSyncError("");
    stopListening();

    try {
      window.speechSynthesis.cancel();
    } catch (_) {}

    clearTimeout(silenceTimerRef.current);
    clearTimeout(codeDebounceRef.current);
    clearTimeout(recognitionRestartTimerRef.current);
    clearTimeout(speechWatchdogTimerRef.current);

    try {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.requestData();
        setTimeout(() => {
          try {
            mediaRecorderRef.current?.stop();
          } catch (e) {
            console.error("Recording termination error:", e);
            const blob = new Blob(chunksRef.current, { type: "video/webm" });
            syncLiveInterview(blob);
          }
        }, 300);
      } else {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        syncLiveInterview(blob);
      }
    } catch (e) {
      console.error("Recording termination error:", e);
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      syncLiveInterview(blob);
    }
  }, [pushChat, stopListening, syncLiveInterview]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          endSession();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [endSession]);

  useEffect(() => {
    componentUnmountingRef.current = false;

    connectSocket({
      ...config,
      interview_id: interviewId,
      interview_type: config.interview_type || config.interviewType || "sde",
    });

    const introText = "Hello. Let's begin the evaluation. Please start by introducing yourself and highlighting a recent project.";

    chatRef.current = [{ role: "bot", text: introText, time: Date.now() }];
    setChat(chatRef.current);

    socket.off("ai_question");
    socket.on("ai_question", (data) => {
      const text = data?.text || "";
      setIsThinking(false);

      if (!text || text.toUpperCase().includes("SILENCE")) {
        setTimeout(() => startListening(), 300);
        return;
      }

      pushChat({ role: "bot", text });
      speak(text);
    });

    socket.off("server_warning");
    socket.on("server_warning", (data) => {
      console.warn("System warning:", data);
      setIsThinking(false);

      const fallbackText = data?.fallback_question || "Understood. Could you explain the rationale behind a specific technical decision you recently made?";
      pushChat({ role: "bot", text: fallbackText });
      speak(fallbackText);
    });

    const introTimer = setTimeout(() => speak(introText), 800);

    return () => {
      componentUnmountingRef.current = true;
      clearTimeout(introTimer);
      socket.off("ai_question");
      socket.off("server_warning");
      if (!syncingRef.current) disconnectSocket();
    };
  }, [config, interviewId, pushChat, speak, startListening]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.error("SpeechRecognition API unavailable.");
      setListenStatus("Speech input unsupported");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      listeningRef.current = true;
      setListenStatus("Listening...");
    };

    recognition.onend = () => {
      listeningRef.current = false;
      if (!isMuted && !speakingRef.current && !syncingRef.current) {
        clearTimeout(recognitionRestartTimerRef.current);
        recognitionRestartTimerRef.current = setTimeout(() => startListening(), 750);
      }
    };

    recognition.onerror = (event) => {
      listeningRef.current = false;
      if (event.error !== "no-speech") console.warn("Recognition error:", event.error);

      if (!syncingRef.current && !speakingRef.current && event.error !== "not-allowed" && event.error !== "service-not-allowed") {
        setListenStatus(`Input error: ${event.error}. Reconnecting...`);
        hardRestartRecognition();
      }
    };

    recognition.onresult = (event) => {
      if (speakingRef.current || syncingRef.current) return;

      let finalChunk = "";
      let interimChunk = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0]?.transcript || "";
        if (event.results[i].isFinal) finalChunk += ` ${chunk}`;
        else interimChunk += ` ${chunk}`;
      }

      if (finalChunk.trim()) {
        finalSpeechBufferRef.current = cleanTranscriptText(`${finalSpeechBufferRef.current} ${finalChunk}`);
      }
      interimSpeechRef.current = cleanTranscriptText(interimChunk);

      const previewText = cleanTranscriptText(`${finalSpeechBufferRef.current} ${interimSpeechRef.current}`);
      setLiveTranscript(previewText);

      if (previewText.length >= MIN_ANSWER_LENGTH) scheduleAnswerSend();
    };

    recognitionRef.current = recognition;
    const listenTimer = setTimeout(() => startListening(), 1600);

    return () => {
      clearTimeout(listenTimer);
      clearTimeout(silenceTimerRef.current);
      clearTimeout(recognitionRestartTimerRef.current);

      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      try { recognition.abort(); } catch (_) {}
    };
  }, [isMuted, scheduleAnswerSend, startListening, hardRestartRecognition]);

  useEffect(() => {
    speechWatchdogTimerRef.current = setInterval(() => {
      if (syncingRef.current || speakingRef.current || isMuted || !recognitionRef.current) return;
      if (!listeningRef.current) {
        console.log("Watchdog: recognition inactive, forcing restart.");
        hardRestartRecognition();
      }
    }, SPEECH_WATCHDOG_MS);
    return () => clearInterval(speechWatchdogTimerRef.current);
  }, [hardRestartRecognition, isMuted]);

  useEffect(() => {
    let mounted = true;

    const setupRecorder = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Media access API not supported.");

        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        chunksRef.current = [];

        const mimeType = getSupportedMimeType();
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
        };
        recorder.onerror = (event) => console.error("Capture stream error:", event);
        recorder.onstop = async () => {
          if (!shouldSyncOnRecorderStopRef.current) return;
          if (componentUnmountingRef.current && !syncingRef.current) return;

          const blob = new Blob(chunksRef.current, { type: "video/webm" });
          await syncLiveInterview(blob);
        };
        recorder.start(1000);
      } catch (err) {
        console.error("Device permission error:", err);
        setSyncError("Media devices inaccessible. Please verify camera and microphone permissions.");
      }
    };

    setupRecorder();

    return () => {
      mounted = false;
      shouldSyncOnRecorderStopRef.current = false;
      try {
        if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
      } catch (_) {}
      stopAllMedia();
    };
  }, [syncLiveInterview, stopAllMedia]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, liveTranscript]);

  return (
    <div className="h-screen w-full bg-[#050505] flex flex-col overflow-hidden text-slate-200 font-sans">
      <StarryBackground />

      <AnimatePresence>
        {isSyncing && (
          <div className="absolute inset-0 z-[100] bg-slate-950/90 flex flex-col items-center justify-center backdrop-blur-md px-6 text-center">
            <Loader2 className="animate-spin text-blue-500 mb-5" size={48} />
            <h2 className="text-lg font-semibold text-slate-100 mb-2">Finalizing Evaluation</h2>
            <p className="text-sm text-slate-400">Saving session data and generating report...</p>

            {syncError && (
              <div className="mt-8 max-w-md w-full rounded-md border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-200 text-left">
                <p className="font-bold mb-1">Transmission Error</p>
                <p className="text-red-300/80 mb-4">{syncError}</p>
                <button
                  onClick={() => {
                    setIsSyncing(false);
                    syncingRef.current = false;
                    shouldSyncOnRecorderStopRef.current = false;
                  }}
                  className="rounded bg-red-600 hover:bg-red-500 px-4 py-2 text-xs font-semibold text-white transition-colors"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="relative z-10 px-6 py-4 flex justify-between items-center bg-slate-900/60 border-b border-slate-800 backdrop-blur-md">
        <div className="flex items-center gap-5">
          <div className="px-3 py-1.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 font-mono text-sm font-semibold flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, "0")}
          </div>

          <div>
            <span className="block text-sm font-semibold text-slate-200">
              {config.title || config.role || "Technical Evaluation"}
            </span>
            <span className="block text-xs text-slate-400 mt-0.5">
              Status: {listenStatus}
            </span>
          </div>
        </div>

        <button
          onClick={endSession}
          disabled={isSyncing}
          className="bg-red-600 hover:bg-red-500 disabled:opacity-60 px-5 py-2 rounded-md font-semibold text-sm text-white flex items-center gap-2 transition-colors shadow-sm"
        >
          <PhoneOff size={16} /> End Session
        </button>
      </div>

      {/* Main Workspace */}
      <div className="relative z-10 flex-1 flex overflow-hidden p-6 gap-6">
        
        {/* Code Editor Panel */}
        <div className="flex-1 rounded-xl overflow-hidden border border-slate-800 bg-[#1e1e1e] shadow-sm flex flex-col">
          <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center gap-2 text-slate-400">
            <Code2 size={16} />
            <span className="text-xs font-semibold uppercase tracking-wider">Implementation Environment</span>
          </div>
          <div className="flex-1">
            <Editor
              height="100%"
              defaultLanguage="cpp"
              theme="vs-dark"
              value={code}
              onChange={handleCodeChange}
              options={{
                fontSize: 14,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                minimap: { enabled: false },
                wordWrap: "on",
                scrollBeyondLastLine: false,
                padding: { top: 16 },
              }}
            />
          </div>
        </div>

        {/* Side Panel (Video & Chat) */}
        <div className="w-[400px] flex flex-col gap-6 shrink-0">
          
          {/* Video Feed */}
          <div className="aspect-video rounded-xl overflow-hidden bg-slate-900 border border-slate-800 relative shadow-sm">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            
            <div className="absolute top-3 left-3 flex gap-2">
              <div className="px-2 py-1 rounded bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-semibold text-slate-300 flex items-center gap-1.5 uppercase">
                <Video size={12} /> Feed Active
              </div>
            </div>

            {liveTranscript && !speakingRef.current && (
              <div className="absolute bottom-3 left-3 right-3 rounded-md bg-black/80 backdrop-blur-md border border-slate-700 p-3 text-sm text-slate-200">
                <span className="text-blue-400 font-semibold text-xs block mb-1 uppercase tracking-wider">Transcribing</span>
                <p className="leading-snug">{liveTranscript}</p>
              </div>
            )}
          </div>

          {/* Transcript Log */}
          <div className="flex-1 border border-slate-800 bg-slate-900/50 rounded-xl flex flex-col overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-800 bg-slate-900 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center shadow-sm">
                  <Bot size={16} className="text-white" />
                </div>
                <span className="font-semibold text-sm text-slate-200">
                  Evaluation Engine
                </span>
              </div>
              {isThinking && (
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 bg-slate-800 px-2 py-1 rounded">
                  <Loader2 size={12} className="animate-spin text-blue-400" /> Processing
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar bg-slate-950/30">
              {chat.map((msg, i) => (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={`${msg.role}-${msg.time || i}-${i}`}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`max-w-[85%] px-4 py-3 rounded-lg text-sm leading-relaxed shadow-sm ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white rounded-tr-sm"
                      : "bg-slate-800 text-slate-200 rounded-tl-sm border border-slate-700"
                  }`}>
                    {msg.role === "bot" ? (
                      <ReactMarkdown className="prose prose-invert prose-sm prose-p:my-0">{msg.text}</ReactMarkdown>
                    ) : (
                      <p>{msg.text}</p>
                    )}
                  </div>
                </motion.div>
              ))}
              <div ref={chatEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}