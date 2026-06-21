const BASE_URL = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";

const isFrontendDevUnlimited = () => {
  return (
    String(process.env.REACT_APP_DEV_UNLIMITED_CREDITS || "false").toLowerCase() ===
    "true"
  );
};

const getStoredUser = () => {
  try {
    const keys = ["user", "jarvis_user", "currentUser", "auth_user"];

    for (const key of keys) {
      const rawUser = localStorage.getItem(key);
      if (!rawUser) continue;

      const parsed = JSON.parse(rawUser);

      if (parsed?.email) return parsed;
      if (parsed?.user?.email) return parsed.user;
    }

    return null;
  } catch {
    return null;
  }
};

const getToken = () =>
  localStorage.getItem("token") ||
  localStorage.getItem("access_token") ||
  localStorage.getItem("jarvis_token") ||
  "";

const getUserEmail = () => {
  const user = getStoredUser();

  return (
    user?.email ||
    localStorage.getItem("user_email") ||
    localStorage.getItem("email") ||
    ""
  );
};

const buildHeaders = (extraHeaders = {}) => {
  const token = getToken();

  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  };
};

const parseResponse = async (response) => {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return await response.json();
  }

  return await response.text();
};

const normalizeApiError = (data, fallback) => {
  if (!data) return fallback;

  if (typeof data === "string") return data;

  if (typeof data.detail === "string") return data.detail;

  if (data.detail?.message) return data.detail.message;

  if (Array.isArray(data.detail)) {
    return data.detail
      .map((item) => {
        const loc = Array.isArray(item.loc) ? item.loc.join(".") : "";
        const msg = item.msg || "Invalid request";
        return loc ? `${loc}: ${msg}` : msg;
      })
      .join(" | ");
  }

  if (data.message) return data.message;

  return fallback;
};

const requestJson = async (path, { method = "GET", body, headers = {} } = {}) => {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: buildHeaders({
      "Content-Type": "application/json",
      ...headers,
    }),
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await parseResponse(response);

  if (!response.ok) {
    throw new Error(
      normalizeApiError(data, `${path} failed with status ${response.status}`)
    );
  }

  return data;
};

const withEmailQuery = (path, emailArg) => {
  const email = emailArg || getUserEmail();

  if (!email) return path;

  const separator = path.includes("?") ? "&" : "?";

  return `${path}${separator}email=${encodeURIComponent(email)}`;
};

export const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const existing = document.querySelector("script[src='https://checkout.razorpay.com/v1/checkout.js']");
    if (existing) {
      existing.onload = () => resolve(true);
      existing.onerror = () => resolve(false);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export const loginUser = async ({ email, password }) => {
  const data = await requestJson("/auth/login", {
    method: "POST",
    body: { email, password },
  });

  localStorage.setItem("token", data.access_token);
  localStorage.setItem("user", JSON.stringify(data.user));

  if (data?.user?.email) {
    localStorage.setItem("user_email", data.user.email);
  } else if (email) {
    localStorage.setItem("user_email", email);
  }

  if (typeof data.credits !== "undefined") {
    localStorage.setItem("credits", String(data.credits));
  }

  return data;
};

export const registerUser = async ({ name, email, password }) => {
  return await requestJson("/auth/signup", {
    method: "POST",
    body: { name, email, password },
  });
};

export const getMe = async () => {
  return await requestJson("/auth/me");
};

export const getCreditPlans = async () => {
  return await requestJson("/credits/plans");
};

export const getCreditBalance = async (emailArg) => {
  const email = emailArg || getUserEmail();

  if (isFrontendDevUnlimited()) {
    return {
      mode: "dev_unlimited",
      dev_mode: true,
      dev_unlimited: true,
      wallet: {
        credits: 999999,
        used: 0,
        total_purchased: 999999,
        expires_at: null,
        dev_mode: true,
        dev_unlimited: true,
      },
    };
  }

  return await requestJson(withEmailQuery("/credits/balance", email));
};

export const getCreditWallet = async (emailArg) => {
  const email = emailArg || getUserEmail();

  if (isFrontendDevUnlimited()) {
    return {
      mode: "dev_unlimited",
      dev_mode: true,
      dev_unlimited: true,
      wallet: {
        credits: 999999,
        used: 0,
        total_purchased: 999999,
        expires_at: null,
        dev_mode: true,
        dev_unlimited: true,
      },
    };
  }

  return await requestJson(withEmailQuery("/credits/wallet", email));
};

export const claimFreeTrial = async (emailArg) => {
  const email = emailArg || getUserEmail();

  if (!email) {
    throw new Error("User email missing. Please login again.");
  }

  return await requestJson("/credits/free-trial", {
    method: "POST",
    body: { email },
  });
};

export const checkCredits = async ({
  email,
  durationMinutes = 15,
  reason = "interview",
  interviewId = "",
  engine = "gemini",
} = {}) => {
  const finalEmail = email || getUserEmail();

  if (!finalEmail) {
    throw new Error("User email missing. Please login again.");
  }

  if (isFrontendDevUnlimited()) {
    return {
      allowed: true,
      mode: "dev_unlimited",
      dev_mode: true,
      dev_unlimited: true,
      credits_required: Math.ceil(Number(durationMinutes || 15) / 15),
      credits_deducted: 0,
      remaining_credits: 999999,
      message: "Developer unlimited credits enabled.",
    };
  }

  return await requestJson("/credits/check", {
    method: "POST",
    body: {
      email: finalEmail,
      user_email: finalEmail,
      duration_minutes: Number(durationMinutes || 15),
      reason,
      interview_id: interviewId || undefined,
      engine,
    },
  });
};

export const consumeCredits = async ({
  email,
  durationMinutes = 15,
  reason = "interview",
  interviewId = "",
  engine = "gemini",
} = {}) => {
  const finalEmail = email || getUserEmail();

  if (!finalEmail) {
    throw new Error("User email missing. Please login again.");
  }

  if (isFrontendDevUnlimited()) {
    return {
      allowed: true,
      consumed: false,
      mode: "dev_unlimited",
      dev_mode: true,
      dev_unlimited: true,
      credits_required: Math.ceil(Number(durationMinutes || 15) / 15),
      credits_deducted: 0,
      remaining_credits: 999999,
      message: "Developer unlimited credits enabled. No credits deducted.",
    };
  }

  return await requestJson("/credits/consume", {
    method: "POST",
    body: {
      email: finalEmail,
      user_email: finalEmail,
      duration_minutes: Number(durationMinutes || 15),
      reason,
      interview_id: interviewId || undefined,
      engine,
    },
  });
};

export const createPaymentOrder = async ({ packId, email } = {}) => {
  const finalEmail = email || getUserEmail();

  if (!finalEmail) throw new Error("User email missing. Please login again.");
  if (!packId) throw new Error("Credit pack missing.");

  return await requestJson("/payments/create-order", {
    method: "POST",
    body: {
      email: finalEmail,
      pack_id: packId,
    },
  });
};

export const verifyPayment = async ({
  email,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}) => {
  const finalEmail = email || getUserEmail();

  if (!finalEmail) throw new Error("User email missing. Please login again.");

  return await requestJson("/payments/verify", {
    method: "POST",
    body: {
      email: finalEmail,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
    },
  });
};

export const getPaymentHistory = async ({ email, status = "all", limit = 100 } = {}) => {
  const finalEmail = email || getUserEmail();

  if (!finalEmail) throw new Error("User email missing. Please login again.");

  return await requestJson(
    `/payments/history?email=${encodeURIComponent(finalEmail)}&status=${encodeURIComponent(
      status
    )}&limit=${encodeURIComponent(limit)}`
  );
};

export const getPaymentDetails = async ({ orderId, email } = {}) => {
  const finalEmail = email || getUserEmail();

  if (!finalEmail) throw new Error("User email missing. Please login again.");
  if (!orderId) throw new Error("Payment order ID missing.");

  return await requestJson(
    `/payments/history/${encodeURIComponent(orderId)}?email=${encodeURIComponent(finalEmail)}`
  );
};

export const startCreditPurchase = async ({ packId, onSuccess, onFailure } = {}) => {
  const scriptLoaded = await loadRazorpayScript();

  if (!scriptLoaded) {
    throw new Error("Razorpay checkout could not be loaded. Check internet connection.");
  }

  const user = getStoredUser();
  const email = getUserEmail();

  if (!email) throw new Error("User email missing. Please login again.");

  const orderData = await createPaymentOrder({ packId, email });

  return new Promise((resolve, reject) => {
    const options = {
      key: orderData.key_id || process.env.REACT_APP_RAZORPAY_KEY_ID,
      amount: orderData.amount,
      currency: orderData.currency || "INR",
      name: "Jarvis Intelligence",
      description: orderData.description || "Interview credits",
      order_id: orderData.order_id,
      prefill: {
        name: user?.name || "",
        email,
      },
      theme: {
        color: "#9333ea",
      },
      handler: async function (response) {
        try {
          const verifyResult = await verifyPayment({
            email,
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });

          if (onSuccess) onSuccess(verifyResult);
          resolve(verifyResult);
        } catch (error) {
          if (onFailure) onFailure(error);
          reject(error);
        }
      },
      modal: {
        ondismiss: function () {
          const error = new Error("Payment popup closed before completion.");
          if (onFailure) onFailure(error);
          reject(error);
        },
      },
    };

    const razorpay = new window.Razorpay(options);

    razorpay.on("payment.failed", function (response) {
      const error = new Error(
        response?.error?.description || "Payment failed. Please try again."
      );
      if (onFailure) onFailure(error);
      reject(error);
    });

    razorpay.open();
  });
};

export const devGrantCredits = async ({ packId, paymentId = "dev", email } = {}) => {
  const finalEmail = email || getUserEmail();

  if (!finalEmail) throw new Error("User email missing. Please login again.");

  try {
    return await requestJson("/credits/dev-grant", {
      method: "POST",
      body: {
        email: finalEmail,
        user_email: finalEmail,
        pack_id: packId,
        payment_id: paymentId,
      },
    });
  } catch (firstError) {
    return await requestJson("/credits/dev-topup", {
      method: "POST",
      body: {
        email: finalEmail,
        user_email: finalEmail,
        pack_id: packId,
        payment_id: paymentId,
      },
    });
  }
};

export const devTopupCredits = async ({ email, credits = 999 } = {}) => {
  const finalEmail = email || getUserEmail();

  if (!finalEmail) throw new Error("User email missing. Please login again.");

  return await requestJson("/credits/dev-topup", {
    method: "POST",
    body: {
      email: finalEmail,
      user_email: finalEmail,
      credits: Number(credits || 999),
    },
  });
};

export const uploadVideo = async (file, title, interviewType, userEmailArg) => {
  const userEmail = userEmailArg || getUserEmail();

  if (!file) throw new Error("No video file selected.");
  if (!userEmail) throw new Error("User email missing. Please login again.");

  const formData = new FormData();
  formData.append("video", file);
  formData.append("title", title || "Untitled Interview");
  formData.append("interview_type", interviewType || "General Interview");
  formData.append("user_email", userEmail);
  formData.append("email", userEmail);

  const response = await fetch(`${BASE_URL}/analyze-video`, {
    method: "POST",
    headers: buildHeaders(),
    body: formData,
  });

  const data = await parseResponse(response);

  if (!response.ok) {
    throw new Error(
      normalizeApiError(data, `Upload failed with status ${response.status}`)
    );
  }

  return data;
};

export const uploadLiveInterview = async ({
  video,
  interviewId,
  title,
  userEmail,
  interviewType = "Live Simulation",
  resumeContext = "",
  transcript = "",
  codeSnapshot = "",
  durationMinutes = "15",
}) => {
  const finalUserEmail = userEmail || getUserEmail();

  if (!video) throw new Error("No live interview video found.");
  if (video.size === 0) throw new Error("Live interview video is empty.");
  if (!interviewId) throw new Error("Interview ID missing.");
  if (!finalUserEmail) throw new Error("User email missing. Please login again.");

  const formData = new FormData();
  formData.append("video", video, `${interviewId}.webm`);
  formData.append("interview_id", interviewId);
  formData.append("title", title || "Live Mock Interview");
  formData.append("user_email", finalUserEmail);
  formData.append("email", finalUserEmail);
  formData.append("interview_type", interviewType || "Live Simulation");
  formData.append("resume_context", resumeContext || "");
  formData.append(
    "transcript",
    typeof transcript === "string" ? transcript : JSON.stringify(transcript || [])
  );
  formData.append("code_snapshot", codeSnapshot || "");
  formData.append("duration_minutes", String(durationMinutes || "15"));

  const response = await fetch(`${BASE_URL}/analyze-live-interview`, {
    method: "POST",
    headers: buildHeaders(),
    body: formData,
  });

  const data = await parseResponse(response);

  if (!response.ok) {
    throw new Error(
      normalizeApiError(data, `Live upload failed with status ${response.status}`)
    );
  }

  return data;
};

export const createRealtimeSession = async ({
  interviewId,
  userEmail,
  title,
  interviewType,
  role,
  company,
  duration,
  resumeContext,
  topics,
  difficulty,
}) => {
  const finalUserEmail = userEmail || getUserEmail();

  if (!finalUserEmail) throw new Error("User email missing. Please login again.");

  const payload = {
    interview_id: interviewId || undefined,
    user_email: finalUserEmail,
    email: finalUserEmail,
    title: title || "Realtime Interview",
    interview_type: interviewType || "custom",
    role: role || "Candidate",
    company: company || "",
    duration: Number(duration || 15),
    resume_context: resumeContext || "",
    topics: topics || "",
    difficulty: difficulty || "medium",
  };

  return await requestJson("/realtime/session", {
    method: "POST",
    body: payload,
  });
};

export const saveRealtimeEvent = async ({
  interviewId,
  userEmail,
  eventType,
  role,
  text,
  rawEvent,
}) => {
  if (!interviewId) return null;

  const finalUserEmail = userEmail || getUserEmail();

  return await requestJson("/realtime/event", {
    method: "POST",
    body: {
      interview_id: interviewId,
      user_email: finalUserEmail,
      email: finalUserEmail,
      event_type: eventType || "unknown",
      role: role || "",
      text: text || "",
      raw_event: rawEvent || {},
    },
  });
};

export const endRealtimeSession = async ({
  interviewId,
  userEmail,
  codeSnapshot,
  durationMinutes,
}) => {
  if (!interviewId) throw new Error("Interview ID missing.");

  const finalUserEmail = userEmail || getUserEmail();

  return await requestJson("/realtime/end", {
    method: "POST",
    body: {
      interview_id: interviewId,
      user_email: finalUserEmail,
      email: finalUserEmail,
      code_snapshot: codeSnapshot || "",
      duration_minutes: String(durationMinutes || "15"),
    },
  });
};

export const createGeminiLiveSession = async ({
  interviewId,
  userEmail,
  title,
  interviewType,
  role,
  company,
  duration,
  resumeContext,
  topics,
  difficulty,
  interviewerVoice,
}) => {
  const finalUserEmail = userEmail || getUserEmail();

  if (!finalUserEmail) throw new Error("User email missing. Please login again.");

  const payload = {
    interview_id: interviewId || undefined,
    user_email: finalUserEmail,
    email: finalUserEmail,
    title: title || "Gemini Live Interview",
    interview_type: interviewType || "custom",
    role: role || "Candidate",
    company: company || "",
    duration: Number(duration || 15),
    resume_context: resumeContext || "",
    topics: topics || "",
    difficulty: difficulty || "medium",
    interviewer_voice: interviewerVoice || "male_balanced",
  };

  return await requestJson("/gemini/live/session", {
    method: "POST",
    body: payload,
  });
};

export const saveGeminiLiveEvent = async ({
  interviewId,
  userEmail,
  eventType,
  role,
  text,
  rawEvent,
}) => {
  if (!interviewId) return null;

  const finalUserEmail = userEmail || getUserEmail();

  return await requestJson("/gemini/live/event", {
    method: "POST",
    body: {
      interview_id: interviewId,
      user_email: finalUserEmail,
      email: finalUserEmail,
      event_type: eventType || "unknown",
      role: role || "",
      text: text || "",
      raw_event: rawEvent || {},
    },
  });
};

export const endGeminiLiveSession = async ({
  interviewId,
  userEmail,
  codeSnapshot,
  durationMinutes,
}) => {
  if (!interviewId) throw new Error("Interview ID missing.");

  const finalUserEmail = userEmail || getUserEmail();

  return await requestJson("/gemini/live/end", {
    method: "POST",
    body: {
      interview_id: interviewId,
      user_email: finalUserEmail,
      email: finalUserEmail,
      code_snapshot: codeSnapshot || "",
      duration_minutes: String(durationMinutes || "15"),
    },
  });
};

export const getInterviews = async (emailArg) => {
  const email = emailArg || getUserEmail();
  const query = email ? `?email=${encodeURIComponent(email)}` : "";

  try {
    const response = await fetch(`${BASE_URL}/interviews${query}`, {
      method: "GET",
      headers: buildHeaders(),
    });

    const data = await parseResponse(response);

    if (!response.ok) {
      throw new Error(
        normalizeApiError(data, `Failed to fetch interviews: ${response.status}`)
      );
    }

    return data;
  } catch (error) {
    console.error("API getInterviews error:", error);
    return { data: [] };
  }
};

export const getInterviewById = async (interviewId, emailArg) => {
  const email = emailArg || getUserEmail();
  const query = email ? `?email=${encodeURIComponent(email)}` : "";

  if (!interviewId) throw new Error("Interview ID missing.");

  const response = await fetch(`${BASE_URL}/interview/${interviewId}${query}`, {
    method: "GET",
    headers: buildHeaders(),
  });

  const data = await parseResponse(response);

  if (!response.ok) {
    throw new Error(
      normalizeApiError(data, `Failed to fetch interview: ${response.status}`)
    );
  }

  return data;
};

export const deleteInterview = async (interviewId, emailArg) => {
  const email = emailArg || getUserEmail();
  const query = email ? `?email=${encodeURIComponent(email)}` : "";

  if (!interviewId) throw new Error("Interview ID missing.");

  const response = await fetch(`${BASE_URL}/interview/${interviewId}${query}`, {
    method: "DELETE",
    headers: buildHeaders(),
  });

  const data = await parseResponse(response);

  if (!response.ok) {
    throw new Error(
      normalizeApiError(data, `Failed to delete interview: ${response.status}`)
    );
  }

  return data;
};

export const parseResume = async (file) => {
  if (!file) throw new Error("No resume file selected.");

  const formData = new FormData();
  formData.append("file", file);

  const userEmail = getUserEmail();
  if (userEmail) {
    formData.append("email", userEmail);
    formData.append("user_email", userEmail);
  }

  const response = await fetch(`${BASE_URL}/parse-resume`, {
    method: "POST",
    headers: buildHeaders(),
    body: formData,
  });

  const data = await parseResponse(response);

  if (!response.ok) {
    throw new Error(
      normalizeApiError(data, `Resume parsing failed with status ${response.status}`)
    );
  }

  return data;
};

export const getVideoUrl = (videoName, emailArg) => {
  const email = emailArg || getUserEmail();

  if (!videoName || !email) return "";

  if (String(videoName).startsWith("http")) return videoName;

  const cleanName = String(videoName).split("\\").pop().split("/").pop();

  return `${BASE_URL}/videos/${encodeURIComponent(cleanName)}?email=${encodeURIComponent(
    email
  )}`;
};

export { BASE_URL, getUserEmail, getToken, getStoredUser };