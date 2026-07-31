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
} from "lucide-react";
import ReactMarkdown from "react-markdown";

import StarryBackground from "../components/StarryBackground";
import {
  createGeminiLiveSession,
  uploadLiveInterview,
  getUserEmail,
} from "../services/api";
import { GeminiLiveVoiceClient } from "../services/geminiLiveVoice";

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
    return (
      location.state?.config || {
        title: "Gemini Live Interview",
        role: "Candidate",
        company: "",
        duration: 15,
        interview_type: "custom",
        resume_context: "",
        topics: "",
        difficulty: "medium",
        interviewer_voice: "male_balanced",
      }
    );
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
        startRecorder(cameraStream, assistantAudioStream);

        await client.connect();

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

      <div className="relative z-10 p-4 flex justify-between items-center bg-black/40 border-b border-white/5 shadow-md">
        <div className="flex items-center gap-4">
          <div className="px-4 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 font-mono font-bold flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            {Math.floor(timeLeft / 60)}:
            {(timeLeft % 60).toString().padStart(2, "0")}
          </div>

          <div>
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
              {config.title || config.role || "Gemini Live Interview"}
            </p>

            <p className="text-[10px] text-emerald-300 mt-1 flex items-center gap-1">
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
            disabled={isSyncing}
            className="bg-rose-600 hover:bg-rose-500 disabled:opacity-60 px-6 py-2 rounded-full font-black uppercase text-[10px] flex items-center gap-2 transition-all"
          >
            <PhoneOff size={14} /> End Session
          </button>
        </div>
      </div>

      <div className="relative z-10 flex-1 flex overflow-hidden p-4 gap-4">
        {/* Main Content Area - Video & Transcript (65%) */}
        <div className="flex-1 flex flex-col gap-4">
          {/* Video Area */}
          <div className="glass-card h-[55%] rounded-[2rem] overflow-hidden bg-black border border-white/10 relative shadow-2xl">
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

            <div className="absolute bottom-3 left-3 right-3 flex justify-between items-center">
              <div className="px-3 py-1.5 rounded-full bg-black/70 border border-white/10 text-[10px] font-black uppercase text-emerald-300 flex items-center gap-2 backdrop-blur-sm">
                <Camera size={12} /> Recording
              </div>
            </div>
          </div>

          {/* Transcript Chat Area - Classy WhatsApp Style */}
          <div className="flex-1 glass-card border border-white/10 bg-[#0a0a0a]/80 backdrop-blur-xl rounded-[2rem] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/40">
              <span className="font-black text-[11px] uppercase tracking-widest text-slate-200">
                Live Conversation
              </span>

              <div
                className={`w-2 h-2 rounded-full ${
                  isMuted ? "bg-yellow-500" : "bg-emerald-500 animate-pulse"
                }`}
              />
            </div>

            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar flex flex-col">
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
                  transition={{ duration: 0.3, type: "spring", bounce: 0.3 }}
                  key={`${msg.role}-${msg.time}-${index}`}
                  className={`flex w-full mb-4 ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`relative max-w-[80%] px-4 py-3 text-[13.5px] leading-relaxed shadow-lg ${
                      msg.role === "user"
                        ? "bg-emerald-600 text-[#e9edef] rounded-2xl rounded-tr-sm border border-emerald-500/30"
                        : "bg-slate-800 text-[#e9edef] rounded-2xl rounded-tl-sm border border-slate-700/30"
                    }`}
                  >
                    <div className="font-bold text-[10.5px] mb-1 opacity-70 tracking-wide text-emerald-200">
                      {msg.role === "user" ? "You" : "Jarvis"}
                    </div>
                    {msg.role === "assistant" ? (
                      <ReactMarkdown className="prose prose-invert prose-sm max-w-none">
                        {msg.text}
                      </ReactMarkdown>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    )}
                    <div className="text-[9.5px] opacity-40 mt-1 text-right flex justify-end gap-1 items-center">
                      {formatTime(msg.time)}
                    </div>
                  </div>
                </motion.div>
              ))}

              {isJarvisSpeaking && (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex w-full mb-4 justify-start"
                >
                  <div className="relative max-w-[80%] px-4 py-3 rounded-2xl rounded-tl-sm text-[13px] shadow-lg bg-slate-800 text-slate-200 border border-purple-500/20">
                    <div className="font-bold text-[10.5px] mb-1 opacity-70 tracking-wide text-emerald-200">
                      Jarvis
                    </div>
                    <div className="flex items-center gap-2 opacity-80 mt-2 mb-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse delay-75" />
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse delay-150" />
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse delay-300" />
                    </div>
                  </div>
                </motion.div>
              )}

              <div ref={chatEndRef} className="h-2" />
            </div>
          </div>
        </div>

        {/* Code Editor Area */}
        <div className="w-[35%] glass-card overflow-hidden border border-white/5 bg-[#0a0a0a] rounded-[2rem] flex flex-col shadow-2xl">
          <div className="p-3 border-b border-white/5 bg-black/40 flex justify-between items-center">
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-300">
                Code Editor
              </p>
              <p className="text-[9px] text-slate-500 mt-1">
                Auto-syncs to interviewer
              </p>
            </div>
            
            {/* NEW FIX: Added Check Code Button Here */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleManualCodeCheck}
                className="bg-blue-600 hover:bg-blue-500 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider text-white transition-all shadow-[0_0_15px_rgba(37,99,235,0.4)] border border-blue-400/30"
              >
                Check Code
              </button>
              <div className="w-2 h-2 rounded-full bg-blue-500/50 animate-pulse" />
            </div>
          </div>
          <Editor
            height="100%"
            defaultLanguage="cpp"
            theme="vs-dark"
            value={code}
            onChange={setCode}
            onMount={(editor) => {
              editor.onDidChangeModelContent(() => {
                handleCodeChange(editor.getValue());
              });
            }}
            options={{
              fontSize: 13.5,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              minimap: { enabled: false },
              wordWrap: "on",
              scrollBeyondLastLine: false,
              padding: { top: 15, bottom: 15 },
              lineHeight: 22,
            }}
          />
        </div>
      </div>
    </div>
  );
}