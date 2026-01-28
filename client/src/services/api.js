export const uploadAudio = async (file) => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("http://localhost:8000/analyze-audio", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Upload failed");
  }

  return response.json();
};
