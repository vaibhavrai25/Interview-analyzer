import { useEffect, useState } from "react";

export default function Dashboard() {
  const [data, setData] = useState([]);

  useEffect(() => {
    fetch("http://127.0.0.1:8000/interviews")
      .then(res => res.json())
      .then(res => setData(res.data));
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-10">
      <h1 className="text-3xl font-bold mb-6">Your Interviews</h1>

      <div className="grid gap-6">
        {data.map((item) => {
  const report = item.report || {};
  const text = report.text_analysis || {};
  const emotion = report.emotion_analysis || {};

  return (
    <div key={item.created_at} className="bg-white shadow-xl rounded-xl p-6 mb-6">
      <p className="text-gray-500 text-sm">
        {new Date(item.created_at).toLocaleString()}
      </p>

      <h2 className="text-lg font-bold mt-2">
        {item.name || "Untitled Interview"}
      </h2>

      {/* SCORES */}
      <div className="mt-3 space-y-1">
        <p><b>Final Interview Score:</b> {text.final_interview_score}</p>
        <p><b>Confidence (Face):</b> {emotion.confidence_score}</p>
        <p><b>Communication Score:</b> {text.communication_score}</p>
        <p><b>Dominant Emotion:</b> {emotion.dominant_emotion}</p>
      </div>

      {/* PROBLEMS */}
      <div className="mt-3">
        <b>Problems Detected:</b>
        <ul className="list-disc ml-6">
          {text.problems_detected?.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      </div>

      {/* SUGGESTIONS */}
      <div className="mt-3">
        <b>Suggestions:</b>
        <ul className="list-disc ml-6">
          {text.suggestions?.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </div>

      {/* EMOTIONS */}
      <div className="mt-3">
        <b>Emotion Percentages:</b>
        <ul className="list-disc ml-6">
          {Object.entries(emotion.emotion_percentages || {}).map(
            ([emo, val]) => (
              <li key={emo}>
                {emo}: {val}%
              </li>
            )
          )}
        </ul>
      </div>

      {/* TRANSCRIPT */}
      <div className="mt-3">
        <b>Transcript:</b>
        <p className="text-gray-700">
          {report.transcript || "No transcript available"}
        </p>
      </div>

      {/* VIDEO */}
      <div className="mt-3">
        <video width="400" controls>
          <source
            src={`http://127.0.0.1:8000/videos/${item.video_path}`}
            type="video/mp4"
          />
        </video>
      </div>
    </div>
  );
})}



      </div>
    </div>
  );
}
