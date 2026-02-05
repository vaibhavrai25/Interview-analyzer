import React, { useState } from "react";
import { UploadCloud, Loader2 } from "lucide-react"; // Added Loader2 for better spinner
import { uploadVideo } from "../services/api"; // Renamed to reflect video support
import { useNavigate, Link } from "react-router-dom";

const UploadPage = () => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleUpload = async () => {
  if (!file) return alert("Please select a video file");
  setLoading(true);

  try {
    await uploadVideo(file);
    // Pass a state variable to the dashboard so it knows to show a "Processing" UI
    navigate("/dashboard", { state: { processing: true } });
  } catch (err) {
    alert("Upload failed");
    setLoading(false);
  }
};

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex flex-col items-center">
      {/* Navigation - Uses Link instead of <a> */}
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
          Upload your recorded interview to get deep insights on emotions, 
          speech quality, and technical depth.
        </p>
      </header>

      <div className="bg-white shadow-xl rounded-3xl p-10 w-full max-w-xl mt-4 border border-slate-100">
        <div className="flex flex-col items-center">
          <div className="p-4 bg-blue-50 rounded-full mb-4">
            <UploadCloud size={48} className="text-blue-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Upload Recording</h2>
          <p className="text-slate-500 text-sm mb-8 text-center">
            Upload .mp4, .mov, or .avi files. <br/>
            Our AI will handle the rest.
          </p>

          <input
            type="file"
            accept="video/*" // Changed to video
            onChange={(e) => setFile(e.target.files[0])}
            className="block w-full text-sm text-slate-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100 mb-8 cursor-pointer"
          />

          <button
            onClick={handleUpload}
            disabled={loading || !file}
            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg 
            hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed 
            transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" />
                Uploading & Analyzing...
              </>
            ) : (
              "Start AI Analysis"
            )}
          </button>
        </div>
      </div>

      <footer className="mt-auto py-10 text-slate-400 text-sm font-medium">
        Multimodal Pipeline: Whisper • OpenCV • FER • FastAPI
      </footer>
    </div>
  );
};

export default UploadPage;