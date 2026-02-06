// 1. Centralized Configuration
const BASE_URL = "http://localhost:8000";

/**
 * Uploads an interview video to the AI Engine for multimodal analysis.
 * @param {File} file - The video file from the input field
 */
export const uploadVideo = async (file, title, interviewType) => {
  const formData = new FormData();
  
  // 🚀 File must match the FastAPI parameter name (video)
  formData.append("video", file);

  // 🚀 Append new metadata fields
  // These will be received by your FastAPI endpoint
  formData.append("title", title);
  formData.append("interview_type", interviewType);

  try {
    const response = await fetch(`${BASE_URL}/analyze-video`, {
      method: "POST",
      body: formData,
      // Reminder: Browser sets Content-Type with boundary automatically
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Upload failed with status ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("🚀 API Service Error:", error);
    throw error;
  }
};

/**
 * Fetches all interview reports from the database.
 */
export const getInterviews = async () => {
  try {
    const response = await fetch(`${BASE_URL}/interviews`);
    if (!response.ok) throw new Error("Failed to fetch interviews");
    return await response.json();
  } catch (error) {
    console.error("🚀 API Service Error:", error);
    return { data: [] };
  }
};

/**
 * Updates interview metadata (title/notes).
 */
export const updateInterview = async (id, payload) => {
  const response = await fetch(`${BASE_URL}/interview/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.json();
};

