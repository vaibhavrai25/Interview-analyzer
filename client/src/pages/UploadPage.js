import React, { useState } from "react";
import { UploadCloud } from "lucide-react";
import { uploadAudio } from "../services/api";

const UploadPage = () => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    if (!file) return alert("Please upload an audio file");

    setLoading(true);
    try {
      const result = await uploadAudio(file);
      console.log(result);
      alert("Analysis Complete! Check console for now.");
    } catch (err) {
      alert("Error analyzing audio");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-200 flex flex-col items-center">
      <a
        href="/dashboard"
        className="bg-black text-white px-4 py-2 rounded-lg"
        style={{ position: 'absolute', top: 20, right: 20 }}>
         Go to Dashboard
      </a>


      {/* Header */}
      <header className="w-full py-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          Interview Behavior Analyzer
        </h1>
        <p className="text-gray-600 mt-2">
          AI that evaluates how you communicate in interviews
        </p>
      </header>

      {/* Upload Card */}
      <div className="bg-white shadow-2xl rounded-3xl p-10 w-full max-w-xl mt-10">
        <div className="flex flex-col items-center">
          <UploadCloud size={60} className="text-gray-500 mb-4" />
          <h2 className="text-2xl font-semibold mb-2">Upload Interview Audio</h2>
          <p className="text-gray-500 text-sm mb-6 text-center">
            Supported formats: mp3, wav, m4a
          </p>

          <input
            type="file"
            accept="audio/*"
            onChange={(e) => setFile(e.target.files[0])}
            className="mb-6"
          />

          <button
            onClick={handleUpload}
            disabled={loading}
            className="w-full bg-black text-white py-3 rounded-xl hover:opacity-80 transition"
          >
            {loading ? "Analyzing..." : "Analyze Interview"}
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-20 text-gray-500 text-sm">
        Built with AI • NLP • Whisper • FastAPI • React
      </footer>
    </div>
  );
};

export default UploadPage;
