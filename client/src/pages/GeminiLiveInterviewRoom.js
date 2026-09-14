import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { loader } from "@monaco-editor/react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Camera,
  VideoOff,
  Maximize,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

import StarryBackground from "../components/StarryBackground";
import {
  createGeminiLiveSession,
  uploadLiveInterview,
  getUserEmail,
} from "../services/api";
import { GeminiLiveVoiceClient } from "../services/geminiLiveVoice";

// Suppress benign ResizeObserver errors caused by Monaco Editor during rapid window resizing
if (typeof window !== "undefined") {
  const originalError = window.console.error;
  window.console.error = (...args) => {
    if (args[0] && typeof args[0] === "string" && args[0].includes("ResizeObserver loop")) {
      return;
    }
    originalError.call(window.console, ...args);
  };

  window.addEventListener("error", (e) => {
    if (e.message === "ResizeObserver loop limit exceeded" || e.message.includes("undelivered notifications")) {
      e.stopImmediatePropagation();
    }
  });
}

loader.config({
  paths: {
    vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.43.0/min/vs",
  },
});

const DEFAULT_CODE = "// Start coding your solution here...";
const CODE_SNAPSHOT_DEBOUNCE_MS = 12000;
const MIN_CODE_SNAPSHOT_LENGTH = 30;

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

const cleanText = (value) => String(value || "").replace(/\s+/g, " ").trim();

const formatTime = (ts) => {
  if (!ts) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(ts));
};

export default function GeminiLiveInterviewRoom() {
  const navigate = useNavigate();
  const location = useLocation();

  const config = useMemo(() => {
    const passedConfig = location.state?.config || {};
    return {
      title: passedConfig.title || "Gemini Live Interview",
      role: passedConfig.role || "Candidate",
      company: passedConfig.company || "Target Company", // Added default
      duration: passedConfig.duration || 15,
      interview_type: passedConfig.interview_type || "Technical SDE", // Added explicit default
      resume_context: passedConfig.resume_context || passedConfig.resumeContext || "",
      topics: passedConfig.topics || "General Software Engineering", // Added default
      difficulty: passedConfig.difficulty || "medium",
      interviewer_voice: passedConfig.interviewer_voice || "male_balanced",
    };
  }, [location.state]);

  const initialInterviewIdRef = useRef(
    location.state?.interviewId || `gemini_${Date.now()}`
  );

  const [interviewId, setInterviewId] = useState(initialInterviewIdRef.current);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recordingStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const recorderAudioContextRef = useRef(null);
  const recorderUserSourceRef = useRef(null);
  const recorderAssistantSourceRef = useRef(null);
  const recorderDestinationRef = useRef(null);

  const clientRef = useRef(null);
  const startedRef = useRef(false);
  const endedRef = useRef(false);
  const mountedRef = useRef(true);
  const hasSyncedRef = useRef(false);
  const shouldSyncOnRecorderStopRef = useRef(false);

  const chatEndRef = useRef(null);
  const chatRef = useRef([]);
  const codeRef = useRef(DEFAULT_CODE);
  const lastSentCodeRef = useRef("");
  const codeSnapshotTimerRef = useRef(null);

  const aiTextBufferRef = useRef("");
  const lastUserTranscriptRef = useRef("");

  const [status, setStatus] = useState("Preparing Gemini Live...");
  const [isConnecting, setIsConnecting] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isJarvisSpeaking, setIsJarvisSpeaking] = useState(false);
  const [chat, setChat] = useState([]);
  const [code, setCode] = useState(DEFAULT_CODE);
  const [timeLeft, setTimeLeft] = useState(Number(config.duration || 15) * 60);
  const [error, setError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [leftWidth, setLeftWidth] = useState(45);
  const [topHeight, setTopHeight] = useState(50);
  const [language, setLanguage] = useState("javascript");
  
  const isDraggingLeftRef = useRef(false);
  const isDraggingTopRef = useRef(false);

  const startDraggingLeft = useCallback((e) => {
    e.preventDefault();
    isDraggingLeftRef.current = true;
    document.body.style.cursor = "col-resize";
  }, []);

  const startDraggingTop = useCallback((e) => {
    e.preventDefault();
    isDraggingTopRef.current = true;
    document.body.style.cursor = "row-resize";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDraggingLeftRef.current) {
        const newWidth = (e.clientX / window.innerWidth) * 100;
        if (newWidth > 20 && newWidth < 70) setLeftWidth(newWidth);
      }
      if (isDraggingTopRef.current) {
        const newHeight = (e.clientY / window.innerHeight) * 100;
        if (newHeight > 20 && newHeight < 80) setTopHeight(newHeight);
      }
    };
    const handleMouseUp = () => {
      isDraggingLeftRef.current = false;
      isDraggingTopRef.current = false;
      document.body.style.cursor = "default";
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const user = getStoredUser();
  const userEmail = user?.email || getUserEmail();

  const updateStatus = useCallback((nextStatus) => {
    if (!mountedRef.current) return;
    setStatus(nextStatus || "Gemini Live status update.");
  }, []);

  const pushChat = useCallback((message) => {
    const safeText = cleanText(message.text);
    if (!safeText || !mountedRef.current) return;

    setChat((prev) => {
      const last = prev[prev.length - 1];

      if (
        last &&
        last.role === message.role &&
        cleanText(last.text).toLowerCase() === safeText.toLowerCase()
      ) {
        return prev;
      }

      const next = [
        ...prev,
        {
          role: message.role,
          text: safeText,
          time: Date.now(),
        },
      ];

      chatRef.current = next;
      return next;
    });
  }, []);

  const stopAllMedia = useCallback(() => {
    try {
      streamRef.current?.getTracks()?.forEach((track) => track.stop());
    } catch (_) {}

    try {
      recordingStreamRef.current?.getTracks()?.forEach((track) => track.stop());
    } catch (_) {}

    try {
      recorderUserSourceRef.current?.disconnect();
    } catch (_) {}

    try {
      recorderAssistantSourceRef.current?.disconnect();
    } catch (_) {}

    try {
      recorderDestinationRef.current?.disconnect();
    } catch (_) {}

    try {
      recorderAudioContextRef.current?.close();
    } catch (_) {}
  }, []);

  const createMixedRecordingStream = useCallback((cameraStream, assistantStream) => {
    const videoTracks = cameraStream.getVideoTracks();
    const userAudioTracks = cameraStream.getAudioTracks();
    const assistantAudioTracks = assistantStream?.getAudioTracks?.() || [];

    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();

    recorderAudioContextRef.current = audioContext;
    recorderDestinationRef.current = destination;

    if (userAudioTracks.length > 0) {
      const userAudioOnlyStream = new MediaStream(userAudioTracks);
      const userSource = audioContext.createMediaStreamSource(userAudioOnlyStream);
      userSource.connect(destination);
      recorderUserSourceRef.current = userSource;
    }

    if (assistantAudioTracks.length > 0) {
      const assistantAudioOnlyStream = new MediaStream(assistantAudioTracks);
      const assistantSource = audioContext.createMediaStreamSource(assistantAudioOnlyStream);
      assistantSource.connect(destination);
      recorderAssistantSourceRef.current = assistantSource;
    }

    const mixedStream = new MediaStream();

    videoTracks.forEach((track) => mixedStream.addTrack(track));
    destination.stream.getAudioTracks().forEach((track) => mixedStream.addTrack(track));

    recordingStreamRef.current = mixedStream;
    return mixedStream;
  }, []);

  const startCameraPreview = useCallback(async () => {
    if (streamRef.current) return streamRef.current;

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera/microphone API is not supported in this browser.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    streamRef.current = stream;
    setCameraReady(stream.getVideoTracks().length > 0);

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }

    return stream;
  }, []);

  const startRecorder = useCallback(
    (cameraStream, assistantAudioStream) => {
      if (mediaRecorderRef.current?.state === "recording") return;

      chunksRef.current = [];

      const mixedStream = createMixedRecordingStream(cameraStream, assistantAudioStream);
      const mimeType = getSupportedMimeType();

      const recorder = mimeType
        ? new MediaRecorder(mixedStream, { mimeType })
        : new MediaRecorder(mixedStream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        console.error("Gemini MediaRecorder error:", event);
      };

      recorder.onstop = async () => {
        if (!shouldSyncOnRecorderStopRef.current) {
          console.log("Gemini recorder stopped during cleanup. Skipping sync.");
          return;
        }

        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        await syncGeminiInterview(blob);
      };

      recorder.start(1000);
    },
    [createMixedRecordingStream]
  );

  const syncGeminiInterview = useCallback(
    async (blob) => {
      if (hasSyncedRef.current) return;

      hasSyncedRef.current = true;
      setIsSyncing(true);
      setError("");
      updateStatus("Uploading Gemini interview recording...");

      if (!userEmail) {
        const message = "User email missing. Please login again.";
        setError(message);
        setIsSyncing(false);
        hasSyncedRef.current = false;
        return;
      }

      if (!blob || blob.size === 0) {
        const message =
          "Recorded video is empty. Camera/mic recording did not start correctly.";
        setError(message);
        setIsSyncing(false);
        hasSyncedRef.current = false;
        return;
      }

      try {
        const videoFile = new File([blob], `${interviewId}.webm`, {
          type: "video/webm",
        });

        await uploadLiveInterview({
          video: videoFile,
          interviewId,
          title: config.title || "Gemini Live Interview",
          userEmail,
          interviewType: "Gemini Live Interview",
          resumeContext: config.resume_context || config.resumeContext || "",
          transcript: chatRef.current,
          codeSnapshot: codeRef.current,
          durationMinutes: String(config.duration || 15),
        });

        clientRef.current?.disconnect();
        stopAllMedia();
        navigate("/dashboard");
      } catch (err) {
        console.error("Gemini sync failed:", err);

        setError(
          err?.message ||
            err?.response?.data?.detail ||
            "Gemini interview upload failed."
        );
        setIsSyncing(false);
        hasSyncedRef.current = false;
        shouldSyncOnRecorderStopRef.current = false;
      }
    },
    [config, interviewId, navigate, stopAllMedia, updateStatus, userEmail]
  );

  const handleCodeChange = useCallback(
    (value) => {
      const nextCode = value || "";
      codeRef.current = nextCode;
      setCode(nextCode);

      clearTimeout(codeSnapshotTimerRef.current);

      codeSnapshotTimerRef.current = setTimeout(() => {
        const cleanCode = codeRef.current.trim();

        if (cleanCode.length < MIN_CODE_SNAPSHOT_LENGTH) return;
        if (cleanCode === lastSentCodeRef.current) return;

        lastSentCodeRef.current = cleanCode;

        clientRef.current?.sendCodeSnapshot(cleanCode, {
          role: config.role || "Candidate",
          company: config.company || "",
          interview_id: interviewId,
        });

        updateStatus("Code snapshot safely synced to DB without interrupting AI.");
      }, CODE_SNAPSHOT_DEBOUNCE_MS);
    },
    [config.company, config.role, interviewId, updateStatus]
  );

  // NEW FIX: Manual trigger to check code
  const handleManualCodeCheck = useCallback(() => {
    const cleanCode = codeRef.current.trim();
    
    if (cleanCode.length < MIN_CODE_SNAPSHOT_LENGTH) {
      updateStatus("Please write some code before checking.");
      return;
    }

    lastSentCodeRef.current = cleanCode;

    clientRef.current?.sendCodeSnapshot(cleanCode, {
      role: config.role || "Candidate",
      company: config.company || "",
      interview_id: interviewId,
    });

    updateStatus("Code snapshot sent for AI review.");
  }, [config.company, config.role, interviewId, updateStatus]);

  const endInterview = useCallback(async () => {
    if (endedRef.current) return;

    endedRef.current = true;
    shouldSyncOnRecorderStopRef.current = true;
    setIsSyncing(true);
    updateStatus("Ending Gemini Live interview...");

    // Final turn flush of any remaining text chunks
    if (aiTextBufferRef.current) {
      pushChat({ role: "assistant", text: aiTextBufferRef.current });
      aiTextBufferRef.current = "";
    }

    try {
      clientRef.current?.disconnect();
    } catch (_) {}

    clearTimeout(codeSnapshotTimerRef.current);

    try {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.requestData();

        setTimeout(() => {
          try {
            mediaRecorderRef.current?.stop();
          } catch (e) {
            console.error("Gemini recorder stop failed:", e);
            const blob = new Blob(chunksRef.current, { type: "video/webm" });
            syncGeminiInterview(blob);
          }
        }, 300);
      } else {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        syncGeminiInterview(blob);
      }
    } catch (e) {
      console.error("Gemini recorder stop failed:", e);
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      syncGeminiInterview(blob);
    }
  }, [syncGeminiInterview, updateStatus, pushChat]);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    if (nextMuted) {
      clientRef.current?.mute();
      updateStatus("Microphone muted.");
    } else {
      clientRef.current?.unmute();
      updateStatus("Microphone active.");
    }
  }, [isMuted, updateStatus]);

  useEffect(() => {
    mountedRef.current = true;

    if (startedRef.current) return;
    startedRef.current = true;

    const start = async () => {
      try {
        if (!userEmail) throw new Error("User email missing. Please login again.");

        updateStatus("Starting camera preview...");
        const cameraStream = await startCameraPreview();

        updateStatus("Creating Gemini Live session...");

        const sessionResponse = await createGeminiLiveSession({
          interviewId: initialInterviewIdRef.current,
          userEmail,
          title: config.title || "Gemini Live Interview",
          interviewType: config.interview_type || config.interviewType || "custom",
          role: config.role || "Candidate",
          company: config.company || "",
          duration: Number(config.duration || 15),
          resumeContext: config.resume_context || config.resumeContext || "",
          jdContext: config.jd_context || config.jdContext || "",
          topics: config.topics || "",
          difficulty: config.difficulty || "medium",
          interviewerVoice: config.interviewer_voice || "male_balanced",
        });

        const finalInterviewId =
          sessionResponse.interview_id || initialInterviewIdRef.current;

        if (!mountedRef.current) return;

        setInterviewId(finalInterviewId);

        const client = new GeminiLiveVoiceClient({
          interviewId: finalInterviewId,
          userEmail,
          config: {
            ...config,
            interviewer_voice: config.interviewer_voice || "male_balanced",
          },
          externalStream: cameraStream,
          onStatus: updateStatus,

          // FIXED: Accumulate incoming voice text into a transient string buffer
          onAssistantText: (text) => {
            const safeText = cleanText(text);
            if (!safeText) return;
            aiTextBufferRef.current += (aiTextBufferRef.current ? " " : "") + safeText;
          },

          // FIXED: Prevent live jumping text by waiting until final speech complete event
          onTurnComplete: () => {
            setIsJarvisSpeaking(false);
            if (aiTextBufferRef.current) {
              pushChat({ role: "assistant", text: aiTextBufferRef.current });
              aiTextBufferRef.current = "";
            }
          },

          onAudio: () => {
            setIsJarvisSpeaking(true);
          },

          // FIXED: Safely look for final speech recognition transcripts to push to chat view
          onUserText: (text, meta) => {
            const safeText = cleanText(text);
            if (!safeText) return;

            if (meta?.type === "final") {
              pushChat({ role: "user", text: safeText });
            }
          },

          onTranscript: () => {},
          onEvent: () => {},

          onError: (err) => {
            console.error("Gemini Live client error:", err);
            const message = err?.message || "Gemini Live connection failed.";

            if (!mountedRef.current) return;

            setError(message);
            updateStatus("Gemini Live error.");
          },
        });

        clientRef.current = client;

        const assistantAudioStream = client.getAssistantAudioStream();
        await client.connect(); // Wait for the backend and Gemini to connect first
        startRecorder(cameraStream, assistantAudioStream); // Start recording only when ready

        if (!mountedRef.current) return;

        setIsConnecting(false);
        updateStatus("Gemini Live interview active.");
      } catch (err) {
        console.error("Gemini Live start failed:", err);

        if (!mountedRef.current) return;

        setError(err?.message || "Failed to start Gemini Live interview.");
        setIsConnecting(false);
        updateStatus("Gemini Live failed.");
      }
    };

    start();

    return () => {
      mountedRef.current = false;
      startedRef.current = false;
      if (clientRef.current) {
        clientRef.current.disconnect();
        clientRef.current = null;
      }
    };
  }, []);

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
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chat, isJarvisSpeaking]);

  return (
    <div className="h-screen w-full bg-[#050505] flex flex-col overflow-hidden text-white font-sans">
      <StarryBackground />

      <AnimatePresence>
        {(isConnecting || isSyncing) && (
          <div className="absolute inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center backdrop-blur-xl px-6 text-center">
            <Loader2 className="animate-spin text-emerald-500 mb-4" size={60} />

            <h2 className="text-xl font-black uppercase tracking-widest italic">
              {isSyncing ? "Syncing Gemini Interview..." : "Connecting Gemini Live..."}
            </h2>

            <p className="mt-3 text-xs text-slate-400 max-w-lg">{status}</p>

            {error && (
              <div className="mt-6 max-w-xl rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                <p className="font-bold mb-2">Gemini Live issue</p>
                <p>{error}</p>

                <button
                  onClick={() => {
                    setIsConnecting(false);
                    setIsSyncing(false);
                  }}
                  className="mt-4 rounded-full bg-red-600 px-5 py-2 text-xs font-black uppercase"
                >
                  Close
                </button>

                <button
                  onClick={() => navigate("/simulate", { state: { config } })}
                  className="mt-4 ml-3 rounded-full bg-purple-600 px-5 py-2 text-xs font-black uppercase"
                >
                  Use Fallback
                </button>
              </div>
            )}
          </div>
        )}
      </AnimatePresence>

      <div className="relative z-10 flex-1 flex overflow-hidden p-4 gap-3">
        {/* Left Panel - Control Center */}
        <div style={{ width: `${leftWidth}%` }} className="flex flex-col gap-4">
          
          {/* Video Area (Embedded controls) */}
          <div style={{ height: `calc(${topHeight}% - 6px)` }} className="glass-card rounded-[2rem] overflow-hidden bg-[#0a0a0a] border border-white/10 relative shadow-xl">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover grayscale-[0.15]"
            />

            {!cameraReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900">
                <VideoOff size={42} className="text-slate-700 mb-2" />
                <p className="text-[10px] font-black uppercase text-slate-500">
                  Camera Preview Loading
                </p>
              </div>
            )}

            {/* Top Video Overlay: Timer and Status */}
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
              <div className="px-3 py-1.5 rounded-full bg-black/60 border border-white/10 text-[11px] font-mono font-bold text-white flex items-center gap-2 shadow-md">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                {Math.floor(timeLeft / 60)}:
                {(timeLeft % 60).toString().padStart(2, "0")}
              </div>
              
              <div className="flex flex-col items-end">
                <div className="px-3 py-1 bg-black/60 border border-white/10 rounded-full text-[9px] font-black uppercase text-emerald-400 flex items-center gap-1.5 shadow-md">
                  <Radio size={10} /> {status}
                </div>
              </div>
            </div>

            {/* Bottom Video Overlay: Controls */}
            <div className="absolute bottom-4 left-0 right-0 flex justify-center items-center gap-3">
              <button
                onClick={toggleMute}
                className={`p-3 rounded-full shadow-lg transition-colors border border-white/10 ${
                  isMuted
                    ? "bg-yellow-600 hover:bg-yellow-500 text-white"
                    : "bg-black/60 hover:bg-black/40 text-slate-200"
                }`}
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
              </button>

              <button
                onClick={endInterview}
                disabled={isSyncing}
                className="bg-red-600 hover:bg-red-500 disabled:opacity-60 p-3 rounded-full shadow-lg transition-colors text-white border border-red-400/30"
                title="End Interview"
              >
                <PhoneOff size={18} />
              </button>
            </div>
            
            <div className="absolute bottom-4 left-4">
               <div className="px-2 py-1 rounded-md bg-black/60 text-[9px] font-black uppercase text-slate-300 border border-white/5">
                 Candidate
               </div>
            </div>
          </div>

          {/* Vertical Resizer Handle (for Video/Chat split) */}
          <div
            onMouseDown={startDraggingTop}
            className="h-1.5 hover:h-2 cursor-row-resize hover:bg-white/10 rounded-full transition-all flex items-center justify-center group flex-shrink-0"
          >
            <div className="h-0.5 w-12 bg-white/10 group-hover:bg-white/40 rounded-full transition-colors" />
          </div>

          {/* Transcript Chat Area - WhatsApp Style */}
          <div style={{ height: `calc(${100 - topHeight}% - 6px)` }} className="glass-card border border-white/10 bg-[#0a0a0a]/80 backdrop-blur-xl rounded-[2rem] flex flex-col overflow-hidden shadow-xl">
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/40">
              <span className="font-black text-[11px] uppercase tracking-widest text-slate-200">
                Live Chat
              </span>

              <div
                className={`w-2 h-2 rounded-full ${
                  isMuted ? "bg-yellow-500" : "bg-emerald-500 animate-pulse"
                }`}
              />
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col">
              {chat.length === 0 && !isJarvisSpeaking && (
                <div className="flex-1 flex items-center justify-center text-xs text-slate-500 italic">
                  Conversation will appear here...
                </div>
              )}

              {chat.map((msg, index) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 15, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.2 }}
                  key={`${msg.role}-${msg.time}-${index}`}
                  className={`flex w-full mb-3 ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`relative max-w-[85%] px-3 py-2 text-[13px] leading-relaxed shadow-sm ${
                      msg.role === "user"
                        ? "bg-slate-700 text-[#e9edef] rounded-2xl rounded-tr-sm border border-slate-600/30"
                        : "bg-slate-800 text-[#e9edef] rounded-2xl rounded-tl-sm border border-slate-700/30"
                    }`}
                  >
                    <div className="font-bold text-[9.5px] mb-0.5 opacity-60 tracking-wide text-emerald-200">
                      {msg.role === "user" ? "You" : "Jarvis"}
                    </div>
                    {msg.role === "assistant" ? (
                      <div className="prose prose-invert prose-sm max-w-none text-[12.5px]">
                       <ReactMarkdown>
                          {msg.text}
                       </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    )}
                  </div>
                </motion.div>
              ))}

              {isJarvisSpeaking && (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex w-full mb-3 justify-start"
                >
                  <div className="relative max-w-[80%] px-3 py-2 rounded-2xl rounded-tl-sm text-[12px] shadow-sm bg-slate-800 text-slate-200 border border-slate-700/30">
                    <div className="font-bold text-[9.5px] mb-0.5 opacity-60 tracking-wide text-emerald-200">
                      Jarvis
                    </div>
                    <div className="flex items-center gap-1.5 opacity-80 mt-1 mb-0.5">
                      <div className="w-1 h-1 rounded-full bg-slate-400 animate-pulse delay-75" />
                      <div className="w-1 h-1 rounded-full bg-slate-400 animate-pulse delay-150" />
                      <div className="w-1 h-1 rounded-full bg-slate-400 animate-pulse delay-300" />
                    </div>
                  </div>
                </motion.div>
              )}

              <div ref={chatEndRef} className="h-2" />
            </div>
          </div>
        </div>

        {/* Resizer Handle */}
        <div
          onMouseDown={startDraggingLeft}
          className="w-1.5 hover:w-2 cursor-col-resize hover:bg-white/10 rounded-full transition-all flex items-center justify-center group flex-shrink-0"
        >
          <div className="w-0.5 h-12 bg-white/10 group-hover:bg-white/40 rounded-full transition-colors" />
        </div>

        {/* Right Panel - Code Editor Area */}
        <div style={{ width: `calc(${100 - leftWidth}% - 12px)` }} className="glass-card overflow-hidden border border-white/10 bg-[#0a0a0a] rounded-[2rem] flex flex-col shadow-xl">
          <div className="p-3 px-5 border-b border-white/5 bg-black/40 flex justify-between items-center">
            <div>
              <p className="text-[12px] font-black uppercase tracking-widest text-slate-300">
                Code Editor
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Auto-syncs to interviewer
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="bg-black/40 border border-white/10 text-slate-300 text-[10px] uppercase font-black tracking-wider rounded-lg px-2 py-1.5 outline-none cursor-pointer hover:bg-black/60 transition-colors"
              >
                <option value="javascript">JavaScript</option>
                <option value="typescript">TypeScript</option>
                <option value="python">Python</option>
                <option value="cpp">C++</option>
                <option value="java">Java</option>
              </select>

              <button
                onClick={handleManualCodeCheck}
                className="bg-slate-800 hover:bg-slate-700 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider text-slate-200 transition-colors border border-slate-600/30 shadow-sm"
              >
                Check Code
              </button>
              
              <button
                onClick={toggleFullScreen}
                className="bg-black/40 hover:bg-black/60 p-1.5 rounded-lg text-slate-300 transition-colors border border-white/10"
                title="Toggle Fullscreen"
              >
                <Maximize size={16} />
              </button>
            </div>
          </div>
          <Editor
            height="100%"
            defaultLanguage={language}
            language={language}
            theme="vs-dark"
            value={code}
            onChange={setCode}
            onMount={(editor) => {
              editor.onDidChangeModelContent(() => {
                handleCodeChange(editor.getValue());
              });
            }}
            options={{
              fontSize: 14,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              minimap: { enabled: false },
              wordWrap: "on",
              scrollBeyondLastLine: false,
              padding: { top: 20, bottom: 20 },
              lineHeight: 24,
            }}
          />
        </div>
      </div>
    </div>
  );
}