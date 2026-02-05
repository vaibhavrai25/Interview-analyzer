import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowLeft, MessageSquare, BarChart3, AlertCircle, CheckCircle2 } from "lucide-react";

const API_BASE = "http://127.0.0.1:8000";

export default function AnalysisPage() {
  const { id } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const [data, setData] = useState(state?.analysis || null);
  const [videoUrl, setVideoUrl] = useState(state?.videoUrl || "");

  // 🔥 FIX: If the user refreshes, fetch the data using the ID from the URL
  useEffect(() => {
    if (!data && id) {
      fetch(`${API_BASE}/interviews`)
        .then(res => res.json())
        .then(res => {
          const interview = res.data.find(i => (i.interview_id === id || i._id === id));
          if (interview) {
            setData(interview);
            setVideoUrl(`${API_BASE}/${interview.video_path}`);
          }
        });
    }
  }, [id, data]);

  if (!data) return <div className="p-20 text-center">Loading Analysis...</div>;

  // Destructure for easier access (mapping backend keys to local vars)
  const textAnalysis = data.analysis || data.final_report?.scores || {};
  const emotionAnalysis = data.emotions || data.emotion_analysis || {};

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <button 
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-6 transition"
        >
          <ArrowLeft size={20} /> Back to Dashboard
        </button>

        <h1 className="text-3xl font-bold text-slate-900 mb-8">Performance Report</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LEFT COLUMN: Video & Transcript */}
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white rounded-3xl shadow-sm overflow-hidden border border-slate-200">
              <video src={videoUrl} controls className="w-full aspect-video bg-black" />
              <div className="p-6">
                <h3 className="flex items-center gap-2 font-bold text-lg mb-4 text-slate-800">
                  <MessageSquare size={20} className="text-blue-500" /> Full Transcript
                </h3>
                <p className="text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  {data.transcript || "No transcript available."}
                </p>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Scores & Insights */}
          <div className="space-y-6">
            
            {/* Score Section */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <h3 className="flex items-center gap-2 font-bold text-lg mb-4">
                <BarChart3 size={20} className="text-purple-500" /> Overall Score
              </h3>
              <div className="text-center py-6">
                <div className="text-6xl font-black text-blue-600">
                  {textAnalysis.final_interview_score || textAnalysis.final_interview || 0}
                </div>
                <div className="text-slate-400 text-sm font-medium mt-1">out of 100</div>
              </div>
              
              <div className="space-y-4">
                <ScoreBar label="Communication" score={textAnalysis.communication_score || textAnalysis.communication} />
                <ScoreBar label="Confidence" score={textAnalysis.confidence_score || textAnalysis.confidence} />
                <ScoreBar label="Technical" score={textAnalysis.technical_depth_score || textAnalysis.technical_depth} />
              </div>
            </div>

            {/* Emotions Section */}
            <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl">
              <h3 className="font-bold text-lg mb-4 opacity-80">Dominant Emotion</h3>
              <div className="text-3xl font-bold capitalize text-blue-400 mb-2">
                {emotionAnalysis.dominant_emotion || "Neutral"}
              </div>
              <p className="text-slate-400 text-sm">
                Emotional Stability: {emotionAnalysis.emotional_stability || 0}%
              </p>
            </div>

            {/* Suggestions */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <h3 className="flex items-center gap-2 font-bold text-lg mb-4 text-amber-600">
                <AlertCircle size={20} /> Suggestions
              </h3>
              <ul className="space-y-3">
                {(data.suggestions || data.final_report?.suggestions || []).map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-600">
                    <CheckCircle2 size={16} className="text-green-500 shrink-0" /> {s}
                  </li>
                ))}
              </ul>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

// Helper component for the score bars
function ScoreBar({ label, score }) {
  const percentage = (score / 10) * 100;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1 font-medium text-slate-700">
        <span>{label}</span>
        <span>{score}/10</span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2">
        <div 
          className="bg-blue-500 h-2 rounded-full transition-all duration-1000" 
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}