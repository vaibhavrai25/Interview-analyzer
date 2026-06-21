import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Camera,
  Mic,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  VideoOff,
  FileCheck,
  Activity,
  Radio,
  Server,
  Wallet,
  Loader2,
  Sparkles,
} from "lucide-react";
import StarryBackground from "../components/StarryBackground";
import { checkCredits, consumeCredits, getCreditBalance, getUserEmail } from "../services/api";

export default function PreFlight() {
  const navigate = useNavigate();
  const location = useLocation();
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const interviewConfig = location.state?.config || {};

  const [selectedMode, setSelectedMode] = useState("gemini");
  const [wallet, setWallet] = useState(null);
  const [creditCheck, setCreditCheck] = useState(null);
  const [creditLoading, setCreditLoading] = useState(false);
  const [startLoading, setStartLoading] = useState(false);

  const [checks, setChecks] = useState({
    video: false,
    audio: false,
    stable: false,
    ready: false,
  });

  const [error, setError] = useState("");

  const userEmail = interviewConfig.user_email || interviewConfig.userEmail || getUserEmail();
  const duration = Number(interviewConfig.duration || 15);
  const creditsRequired = Math.max(1, Math.ceil(duration / 15));

  useEffect(() => {
    let mounted = true;

    async function startPreview() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera/microphone API is not supported in this browser.");
        }

        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) videoRef.current.srcObject = stream;

        setChecks((prev) => ({
          ...prev,
          video: stream.getVideoTracks().length > 0,
          audio: stream.getAudioTracks().length > 0,
        }));

        setError("");
      } catch (err) {
        console.error("Preflight media error:", err);
        setChecks((prev) => ({ ...prev, video: false, audio: false }));
        setError("Camera or microphone access denied. Please allow permissions and refresh this page.");
      }
    }

    startPreview();

    return () => {
      mounted = false;
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const refreshCredits = async () => {
    if (!userEmail) return;
    setCreditLoading(true);
    setError("");

    try {
      const [balanceRes, checkRes] = await Promise.all([
        getCreditBalance(userEmail),
        checkCredits({ email: userEmail, durationMinutes: duration }),
      ]);

      setWallet(balanceRes.wallet || balanceRes.data || balanceRes);
      setCreditCheck(checkRes);
    } catch (err) {
      console.error("Credit check failed:", err);
      setError(err?.message || "Allocation verification failed.");
    } finally {
      setCreditLoading(false);
    }
  };

  useEffect(() => {
    refreshCredits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail, duration]);

  const allSystemGo = checks.video && checks.audio && checks.stable && checks.ready;
  const creditsAllowed = creditCheck?.allowed !== false;

  const buildFinalConfig = () => ({
    title: interviewConfig.title || "Mock Interview Session",
    role: interviewConfig.role || "Candidate",
    company: interviewConfig.company || "",
    duration,
    interview_type: interviewConfig.interview_type || interviewConfig.interviewType || "custom",
    resume_context: interviewConfig.resume_context || interviewConfig.resumeContext || "",
    resume_url: interviewConfig.resume_url || interviewConfig.resumeUrl || "",
    topics: interviewConfig.topics || "",
    difficulty: interviewConfig.difficulty || "medium",
    interviewer_voice: interviewConfig.interviewer_voice || interviewConfig.interviewerVoice || "male_balanced",
    user_email: userEmail,
    mode: selectedMode,
  });

  const handleStart = async () => {
    setError("");

    if (!allSystemGo) {
      setError("Please complete the system checklist before proceeding.");
      return;
    }

    if (!userEmail) {
      setError("Authentication missing. Please sign in again.");
      return;
    }

    setStartLoading(true);

    try {
      const consume = await consumeCredits({
        email: userEmail,
        durationMinutes: duration,
        reason: `${selectedMode}_interview_start`,
      });

      const finalConfig = {
        ...buildFinalConfig(),
        credit_result: consume,
      };

      if (selectedMode === "gemini") {
        navigate("/gemini-live-interview", { state: { config: finalConfig } });
        return;
      }

      if (selectedMode === "realtime") {
        navigate("/realtime-interview", { state: { config: finalConfig } });
        return;
      }

      navigate("/simulate", { state: { config: finalConfig } });
    } catch (err) {
      console.error("Start blocked:", err);
      setError(err?.message || "Initialization failed. Please check your network or allocation balance.");
      await refreshCredits();
    } finally {
      setStartLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-slate-200 font-sans flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <StarryBackground />

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative z-10 max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center"
      >
        <div className="space-y-6">
          <div className="relative group">
            <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-900 border border-slate-800 shadow-xl">
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />

              {!checks.video && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90">
                  <VideoOff size={40} className="text-slate-600 mb-3" />
                  <p className="text-xs font-semibold uppercase text-slate-400">Camera Offline</p>
                </div>
              )}

              <div className="absolute bottom-4 left-4 flex gap-2">
                <StatusBadge active={checks.video} icon={<Camera size={14} />} label="Video Stream" />
                <StatusBadge active={checks.audio} icon={<Mic size={14} />} label="Audio Stream" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-lg border border-slate-800 bg-slate-900/50 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Document Context</h3>
                  <p className="text-xs text-slate-500 mt-1">Evaluation parameters</p>
                </div>

                {interviewConfig.resume_context || interviewConfig.resumeContext ? (
                  <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-md border border-emerald-500/20">
                    <FileCheck size={14} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Synced</span>
                  </div>
                ) : (
                  <div className="text-slate-500 bg-slate-800 px-3 py-1.5 rounded-md border border-slate-700 text-[10px] font-bold uppercase">Generic</div>
                )}
              </div>
            </div>

            <div className="p-5 rounded-lg border border-slate-800 bg-slate-900/50 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Allocation</h3>
                  <p className="text-xs text-slate-500 mt-1">Requires {creditsRequired} credit(s)</p>
                </div>

                <div className="w-10 h-10 rounded-md bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center">
                  {creditLoading ? <Loader2 className="animate-spin" size={18} /> : <Wallet size={18} />}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  {wallet?.is_dev_unlimited ? "Mode" : "Available Balance"}
                </span>
                <span className="font-bold text-slate-100">
                  {wallet?.is_dev_unlimited ? "Developer" : wallet?.credits ?? "--"}
                </span>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-lg border border-slate-800 bg-slate-900/50 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">System Checklist</h3>

            <div className="space-y-3 mt-4">
              <CheckItem checked={checks.stable} onClick={() => setChecks((prev) => ({ ...prev, stable: !prev.stable }))} label="My environment is quiet and well-lit." />
              <CheckItem checked={checks.ready} onClick={() => setChecks((prev) => ({ ...prev, ready: !prev.ready }))} label="I am ready to begin the evaluation." />
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-50 mb-3">
              Session Initialization
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed max-w-md">
              The evaluation environment is prepared for the <span className="text-slate-200 font-semibold">{interviewConfig.role || "selected"}</span> role.
              {(interviewConfig.resume_context || interviewConfig.resumeContext) && " Context parameters have been applied based on your uploaded document."}
            </p>
          </div>

          <div className="p-5 rounded-lg border border-slate-800 bg-slate-900/40">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">Select Protocol</h3>

            <div className="grid grid-cols-1 gap-3">
              <ModeCard 
                active={selectedMode === "gemini"} 
                icon={<Sparkles size={18} />} 
                title="Standard Voice Mode" 
                badge="Recommended" 
                desc="Low-latency conversational evaluation." 
                onClick={() => setSelectedMode("gemini")} 
              />
              <ModeCard 
                active={selectedMode === "realtime"} 
                icon={<Radio size={18} />} 
                title="Advanced Voice Mode" 
                badge="High Fidelity" 
                desc="Premium interaction engine for complex technical queries." 
                onClick={() => setSelectedMode("realtime")} 
              />
              <ModeCard 
                active={selectedMode === "fallback"} 
                icon={<Server size={18} />} 
                title="Standard Protocol" 
                badge="Fallback" 
                desc="Reliable, structured evaluation interface." 
                onClick={() => setSelectedMode("fallback")} 
              />
            </div>

            {creditCheck && !creditsAllowed && (
              <div className="mt-4 p-3 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-300 leading-relaxed font-medium">
                {creditCheck.message || "Insufficient allocation for this session."}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <InstructionBox icon={<ShieldCheck className="text-emerald-400" />} title="Evaluation Conduct" desc="Maintain professional conduct. The system monitors communication patterns, clarity, and technical accuracy throughout the session." />
            <InstructionBox icon={<Activity className="text-blue-400" />} title="Interaction Flow" desc="Speak clearly and pause naturally after completing your thoughts. The voice protocol processes turn-taking automatically." />
          </div>

          {error && (
            <div className="p-4 rounded-md bg-red-500/10 border border-red-500/20 text-red-300 text-sm font-medium flex items-center gap-3">
              <AlertCircle size={18} /> {error}
            </div>
          )}

          <button
            disabled={!allSystemGo || startLoading || creditCheck?.allowed === false}
            onClick={handleStart}
            className={`w-full py-3.5 rounded-md font-semibold text-sm flex items-center justify-center gap-3 transition-colors ${
              allSystemGo && !startLoading && creditCheck?.allowed !== false
                ? "bg-blue-600 text-white hover:bg-blue-500 shadow-sm shadow-blue-900/20"
                : "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
            }`}
          >
            {startLoading ? (
              <><Loader2 className="animate-spin" size={18} /> Initializing...</>
            ) : (
              <>Begin Evaluation <ArrowRight size={18} /></>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function StatusBadge({ active, icon, label }) {
  return (
    <div className={`px-2.5 py-1 rounded bg-slate-900/80 flex items-center gap-1.5 border text-[10px] font-bold uppercase tracking-wider backdrop-blur-md transition-colors ${
      active ? "border-emerald-500/30 text-emerald-400" : "border-slate-700 text-slate-500"
    }`}>
      {icon} {label}
    </div>
  );
}

function CheckItem({ checked, onClick, label }) {
  return (
    <div onClick={onClick} className="flex items-center gap-3 cursor-pointer group">
      <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
        checked ? "bg-blue-600 border-blue-600" : "border-slate-600 bg-slate-800 group-hover:border-blue-500"
      }`}>
        {checked && <CheckCircle2 size={12} className="text-white" />}
      </div>
      <span className={`text-sm font-medium transition-colors ${checked ? "text-slate-200" : "text-slate-400"}`}>{label}</span>
    </div>
  );
}

function InstructionBox({ icon, title, desc }) {
  return (
    <div className="flex gap-4 p-4 rounded-lg bg-slate-900/30 border border-slate-800/50">
      <div className="shrink-0 pt-0.5">{icon}</div>
      <div>
        <h4 className="text-sm font-semibold text-slate-200">{title}</h4>
        <p className="text-xs text-slate-400 leading-relaxed mt-1">{desc}</p>
      </div>
    </div>
  );
}

function ModeCard({ active, icon, title, badge, desc, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-4 rounded-lg border transition-all flex items-start gap-4 ${
        active 
        ? "bg-blue-900/10 border-blue-500/40" 
        : "bg-slate-900/40 border-slate-800 hover:border-slate-700"
      }`}
    >
      <div className={`shrink-0 w-10 h-10 rounded-md flex items-center justify-center border ${
        active ? "bg-blue-600/20 border-blue-500/30 text-blue-400" : "bg-slate-800 border-slate-700 text-slate-400"
      }`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h4 className={`text-sm font-semibold truncate ${active ? "text-slate-100" : "text-slate-300"}`}>{title}</h4>
          <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
            active ? "bg-blue-500/20 text-blue-300 border-blue-500/30" : "bg-slate-800 text-slate-500 border-slate-700"
          }`}>
            {badge}
          </span>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed pr-2">{desc}</p>
      </div>
    </button>
  );
}