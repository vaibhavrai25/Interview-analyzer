import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  UploadCloud, 
  Briefcase, 
  FileText, 
  FileUp, 
  CheckCircle2, 
  Play, 
  Clock, 
  Target, 
  Loader2, 
  Coins 
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { consumeCredits, getCreditBalance, parseResume, uploadVideo } from "../services/api";

const getUser = () => JSON.parse(localStorage.getItem("user") || "{}");
const creditsRequired = (minutes) => Math.ceil(Number(minutes || 15) / 15);

const UploadPage = () => {
  const [activeTab, setActiveTab] = useState("simulate");
  const [isUploading, setIsUploading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [resumeText, setResumeText] = useState("");
  const [creditInfo, setCreditInfo] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const user = getUser();

  const [simConfig, setSimConfig] = useState({ 
    title: "", 
    role: "", 
    company: "", 
    duration: 15, 
    topics: "" 
  });

  useEffect(() => {
    getCreditBalance().then(setCreditInfo).catch(() => setCreditInfo(null));
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setSimConfig((prev) => ({ ...prev, [name]: name === "duration" ? parseInt(value) : value }));
  };

  const handleResumeUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsParsing(true);
    setError("");
    try {
      const data = await parseResume(file);
      if (data.resume_context) setResumeText(data.resume_context);
    } catch (err) {
      setError(err?.message || "Failed to process resume document.");
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    setError("");
    try {
      await consumeCredits({ durationMinutes: 15, reason: "upload_analysis", engine: "upload" });
      const data = await uploadVideo(file, file.name, "Uploaded Interview", user.email);
      if (data.interview_id) navigate("/dashboard");
    } catch (err) {
      setError(err?.message || "Upload failed. Please check your connection or credit balance.");
    } finally {
      setIsUploading(false);
    }
  };

  const startSimulation = async () => {
    setError("");
    if (!simConfig.title || !simConfig.role) {
      setError("Please provide at least a Session Title and Target Role.");
      return;
    }

    setIsSimulating(true);
    try {
      await consumeCredits({
        durationMinutes: simConfig.duration,
        reason: "live_interview_start",
        engine: "gemini",
      });
      navigate("/pre-flight", { state: { config: { ...simConfig, resume_context: resumeText, user_email: user.email } } });
    } catch (err) {
      setError(err?.message || "Insufficient allocation. Please purchase credits or claim a trial.");
      setIsSimulating(false);
    }
  };

  const required = creditsRequired(simConfig.duration);
  const balance = creditInfo?.credits ?? creditInfo?.credit_balance ?? 0;

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-6 py-24 bg-[#050505] text-slate-200 font-sans">
      
      {/* Top Right Credit Badge */}
      <div className="absolute top-8 right-8 z-20 px-4 py-2 rounded-md flex items-center gap-3 bg-slate-900/60 border border-slate-800 shadow-sm">
        <Coins className="text-blue-400" size={16} />
        <div className="text-left">
          <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Available Credits</p>
          <p className="text-sm font-bold text-slate-100">{balance}</p>
        </div>
      </div>

      {/* Tab Selector */}
      <div className="flex p-1 mb-10 rounded-lg w-full max-w-md z-10 border border-slate-800 bg-slate-900/40">
        <button 
          onClick={() => setActiveTab("simulate")} 
          className={`flex-1 py-2.5 rounded-md font-semibold text-xs transition-colors ${
            activeTab === "simulate" 
            ? "bg-slate-700 text-slate-100 shadow-sm" 
            : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Mock Interview
        </button>
        <button 
          onClick={() => setActiveTab("upload")} 
          className={`flex-1 py-2.5 rounded-md font-semibold text-xs transition-colors ${
            activeTab === "upload" 
            ? "bg-slate-700 text-slate-100 shadow-sm" 
            : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Upload Recording
        </button>
      </div>

      {error && (
        <div className="mb-6 z-10 max-w-3xl w-full rounded-md border border-red-500/20 bg-red-500/10 p-4 text-sm font-medium text-red-200 flex items-start gap-3">
           <span>{error}</span>
        </div>
      )}

      <AnimatePresence mode="wait">
        {activeTab === "simulate" ? (
          <motion.div 
            key="sim" 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -10 }} 
            transition={{ duration: 0.2 }}
            className="p-8 md:p-10 w-full max-w-3xl rounded-xl border border-slate-800 bg-slate-900/50 shadow-2xl z-10 text-left"
          >
            <div className="mb-8">
              <h2 className="text-xl font-bold text-slate-50">Configure Session</h2>
              <p className="text-sm text-slate-400 mt-1">Set the parameters for your technical evaluation.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field label="Session Title" icon={<FileText />}>
                <input 
                  name="title" 
                  value={simConfig.title} 
                  onChange={handleInputChange} 
                  type="text" 
                  placeholder="e.g. Initial Technical Screen" 
                  className="w-full bg-black/40 border border-slate-700 rounded-md pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors" 
                />
              </Field>
              <Field label="Target Role" icon={<Briefcase />}>
                <input 
                  name="role" 
                  value={simConfig.role} 
                  onChange={handleInputChange} 
                  type="text" 
                  placeholder="e.g. Backend Engineer" 
                  className="w-full bg-black/40 border border-slate-700 rounded-md pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors" 
                />
              </Field>
              <Field label="Duration" icon={<Clock />}>
                <select 
                  name="duration" 
                  value={simConfig.duration} 
                  onChange={handleInputChange} 
                  className="w-full bg-black/40 border border-slate-700 rounded-md pl-10 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors appearance-none"
                >
                  <option value={15}>15 Minutes (1 credit)</option>
                  <option value={30}>30 Minutes (2 credits)</option>
                  <option value={45}>45 Minutes (3 credits)</option>
                  <option value={60}>60 Minutes (4 credits)</option>
                </select>
              </Field>
              <Field label="Focus Topics" icon={<Target />}>
                <input 
                  name="topics" 
                  value={simConfig.topics} 
                  onChange={handleInputChange} 
                  type="text" 
                  placeholder="e.g. System Design, React, Node.js" 
                  className="w-full bg-black/40 border border-slate-700 rounded-md pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors" 
                />
              </Field>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-800">
              <label className="text-xs font-semibold text-slate-400 mb-3 block">Resume Context (PDF)</label>
              <label className={`flex flex-col items-center justify-center gap-3 p-6 rounded-lg border border-dashed transition-colors cursor-pointer ${
                resumeText 
                ? "border-emerald-500/40 bg-emerald-500/5" 
                : "border-slate-700 bg-black/20 hover:border-blue-500/50"
              }`}>
                <input type="file" accept=".pdf" className="hidden" onChange={handleResumeUpload} />
                {isParsing ? (
                  <Loader2 className="animate-spin text-blue-500" size={24} />
                ) : resumeText ? (
                  <CheckCircle2 className="text-emerald-500" size={24} />
                ) : (
                  <FileUp className="text-slate-500" size={24} />
                )}
                <span className="text-sm font-medium text-slate-300">
                  {isParsing 
                    ? "Processing document..." 
                    : resumeText 
                    ? "Resume parsed successfully" 
                    : "Click to upload resume for personalized questions"}
                </span>
              </label>
            </div>

            <div className="mt-6 rounded-md bg-slate-800/50 border border-slate-700 p-4 text-sm text-slate-300 flex items-center justify-between">
              <span>Required Allocation: <strong>{required} credit{required > 1 ? "s" : ""}</strong></span>
              <span className="text-xs text-slate-500">1 credit = 15 mins</span>
            </div>

            <button 
              onClick={startSimulation} 
              disabled={isSimulating}
              className="w-full mt-6 bg-blue-600 text-white py-3.5 rounded-md font-semibold text-sm hover:bg-blue-500 transition-colors flex items-center justify-center gap-2 shadow-sm shadow-blue-900/20 disabled:opacity-70"
            >
              {isSimulating ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} fill="currentColor" />}
              {isSimulating ? "Initializing..." : "Start Session"}
            </button>
          </motion.div>
        ) : (
          <motion.div 
            key="upload" 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -10 }} 
            transition={{ duration: 0.2 }}
            onClick={() => !isUploading && document.getElementById("file-upload").click()} 
            className="p-12 w-full max-w-xl rounded-xl border-dashed border-2 border-slate-700 bg-slate-900/50 hover:border-blue-500/50 transition-colors group cursor-pointer z-10 text-center shadow-xl"
          >
            <input type="file" id="file-upload" className="hidden" accept="video/*" onChange={handleFileChange} />
            
            {isUploading ? (
              <Loader2 size={40} className="text-blue-500 mx-auto animate-spin mb-4" />
            ) : (
              <UploadCloud size={40} className="text-slate-400 mx-auto mb-5 group-hover:text-blue-400 transition-colors" />
            )}
            
            <h3 className="text-lg font-bold mb-2 text-slate-100">
              {isUploading ? "Uploading Recording..." : "Upload Interview Video"}
            </h3>
            
            <p className="text-slate-400 text-sm max-w-xs mx-auto leading-relaxed mt-2">
              Upload an existing video file for automated evaluation. <br/>
              <span className="text-xs text-slate-500 mt-2 block">Consumes 1 credit per upload.</span>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Reusable input wrapper
function Field({ label, icon, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-400 mb-2 block">{label}</label>
      <div className="relative">
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 [&>svg]:w-[18px] [&>svg]:h-[18px]">
          {icon}
        </div>
        {children}
      </div>
    </div>
  );
}

export default UploadPage;