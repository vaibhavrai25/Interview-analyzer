import React, { useState } from "react";
import { UploadCloud, Loader2, Briefcase, Code, FileText } from "lucide-react"; 
import { uploadVideo } from "../services/api"; 
import { useNavigate, Link } from "react-router-dom";

const UploadPage = () => {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState(""); // 🏷️ New property
  const [interviewType, setInterviewType] = useState("Technical"); // 🏷️ New property
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleUpload = async () => {
    if (!file) return alert("Please select a video file");
    if (!title) return alert("Please provide a title for this session");
    
    setLoading(true);

    try {
      // 🔥 We now pass the title and type to our upload service
      await uploadVideo(file, title, interviewType);
      navigate("/dashboard", { state: { processing: true } });
    } catch (err) {
      alert("Upload failed");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex flex-col items-center">
      <Link
        to="/dashboard"
        className="bg-black text-white px-5 py-2 rounded-full font-medium shadow-md hover:bg-gray-800 transition-all"
        style={{ position: 'absolute', top: 20, right: 20 }}
      >
        View Past Interviews
      </Link>

      <header className="w-full py-12 text-center">
        <h1 className="text-5xl font-extrabold tracking-tight text-slate-900">
          AI Interview <span className="text-blue-600">Analyzer</span>
        </h1>
        <p className="text-slate-600 mt-4 text-lg max-w-lg mx-auto">
          Configure your session and let our multimodal pipeline provide deep insights.
        </p>
      </header>

      <div className="bg-white shadow-xl rounded-[2.5rem] p-10 w-full max-w-xl mt-4 border border-slate-100">
        <div className="space-y-8">
          
          {/* 1. Title Input */}
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1 mb-2 block">
              Session Title
            </label>
            <div className="relative">
              <FileText className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text"
                placeholder="e.g. Google L4 Mock Interview"
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          </div>

          {/* 2. Interview Type Selector */}
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1 mb-3 block">
              Interview Type
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setInterviewType("Technical")}
                className={`flex items-center justify-center gap-2 py-4 rounded-2xl font-bold transition-all border-2 ${
                  interviewType === "Technical" 
                  ? "border-blue-600 bg-blue-50 text-blue-600" 
                  : "border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200"
                }`}
              >
                <Code size={20} /> Technical
              </button>
              <button
                onClick={() => setInterviewType("Behavioral")}
                className={`flex items-center justify-center gap-2 py-4 rounded-2xl font-bold transition-all border-2 ${
                  interviewType === "Behavioral" 
                  ? "border-blue-600 bg-blue-50 text-blue-600" 
                  : "border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200"
                }`}
              >
                <Briefcase size={20} /> Behavioral
              </button>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-8">
            <div className="flex flex-col items-center">
              <input
                type="file"
                id="video-upload"
                accept="video/*"
                onChange={(e) => setFile(e.target.files[0])}
                className="hidden"
              />
              <label 
                htmlFor="video-upload"
                className="w-full mb-6 cursor-pointer group"
              >
                <div className="flex flex-col items-center p-8 border-2 border-dashed border-slate-200 rounded-[2rem] group-hover:border-blue-400 group-hover:bg-blue-50/30 transition-all">
                  <UploadCloud size={40} className="text-slate-300 group-hover:text-blue-500 mb-2 transition-colors" />
                  <span className="text-slate-500 font-medium">
                    {file ? file.name : "Select Video File"}
                  </span>
                </div>
              </label>

              <button
                onClick={handleUpload}
                disabled={loading || !file || !title}
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg 
                hover:bg-blue-700 disabled:bg-gray-200 disabled:cursor-not-allowed 
                transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Analyzing Pipeline...
                  </>
                ) : (
                  "Start AI Analysis"
                )}
              </button>
            </div>
          </div>

        </div>
      </div>

      <footer className="mt-auto py-10 text-slate-400 text-sm font-medium">
        Multimodal Pipeline: Whisper • OpenCV • FER • FastAPI
      </footer>
    </div>
  );
};

export default UploadPage;