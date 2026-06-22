# AI-Interview Analyser 

A production-grade AI Interviewer and real-time simulator designed to bridge the gap between traditional interview platforms and modern LLM voice assistants. By combining real-time WebRTC/WebSocket streaming with intelligent interview logic, it provides an immersive, resume-aware environment for candidates to practice and refine their skills.

## 🎯 Vision
To build the world's most intelligent, adaptive interview platform—combining the structural rigor of traditional mock interviews, the peer-matching environment, and the fluid, low-latency conversational capability of advanced Voice AI.

## 🛠 Tech Stack

### Frontend
- **Framework:** React, React Router
- **Real-time:** WebRTC, MediaRecorder, AudioWorklet 
- **Styling:** Tailwind CSS, Framer Motion 
- **UI Assets:** Lucide Icons

### Backend
- **Core:** Python, FastAPI
- **Real-time:** WebSockets, Socket.IO
- **Database:** MongoDB
- **Security:** JWT Authentication, Secure Password Hashing
- **AI/ML:** Google Gemini 2.0 Flash (Live API), Groq (Llama 3.3 70B), Whisper (STT)
- **Payments:** Razorpay Integration (Credit-based Wallet System)

---

## 🏗 System Architecture

### High-Level Flow
1. **Authentication & Billing:** JWT-based secure access with a Razorpay-powered credit wallet system. 1 Credit = 15 minutes of interview time.
2. **Pre-flight & Configuration:** Resume parsing, system audio/video checks, and role-specific interview room generation.
3. **The Interview Engine:** A stateful decision engine connected via low-latency WebSockets. Features Software Echo-Lock to prevent AI barge-in loops and aggressive context truncation for instantaneous response times.
4. **Post-Session Analysis:** Post-interview processing of video/audio to generate performance scores, technical code audits, and transcript logs.

---

## 📂 Project Structure

### `/ai-engine` (Backend)
The backend is built with **FastAPI** and orchestrates real-time AI processing, interview logic, media analysis, and billing.

- **`main.py`**: FastAPI entry point, handling API routing, CORS, and background task orchestration.
- **`gemini_live_session.py`**: Manages Bidi-streaming WebSockets with Google Gemini for real-time interactions. Handles aggressive resume context truncation to maintain ultra-low latency.
- **`interview_brain.py`**: Core heuristic decision engine that determines the next interview action and constructs prompts.
- **`simulation_logic.py`**: State management for active interview sessions (code snapshots, memory, and fallback logic).
- **`conversation_memory.py`**: Manages the structured state of the interview, candidate claims, and technical context.
- **`video_processor.py`**: The neural pipeline that orchestrates audio extraction, frame sampling, and emotion analysis.
- **`audio_extractor.py` & `frame_extractor.py`**: Low-level utilities for media preprocessing.
- **`analyzer.py` & `code_analyzer.py`**: AI model integrations (Groq/Gemini) for text analysis and technical code audits.
- **`rubrics.py` & `interview_types.py`**: Domain-specific definitions for HR, SDE, and Civil engineering interview rubrics.
- **`database.py` & `models.py`**: MongoDB connection management and Pydantic schema definitions (including password strength validation).
- **`payment_utils.py` & `credit_utils.py`**: Ledger management, Razorpay signature verification, and transactional credit allocation.

### `/client` (Frontend)
The frontend is a **React** application featuring a clean, professional SaaS aesthetic, optimized for secure authentication and real-time media processing.

- **`/pages`**:
  - `HomePage.js`: Landing page showcasing platform features, pricing tiers, and direct entry points.
  - `Authpage.js`: Secure JWT login/registration with client-side and server-side password strength validation.
  - `Dashboard.js`: Central hub for users to view session history, filtering, metric trends, and wallet balance.
  - `Preflight.js`: Pre-interview hardware validation (Camera/Mic checks), resume syncing, and protocol selection.
  - `UploadPage.js`: Interface allowing users to upload pre-recorded interview videos for asynchronous AI analysis.
  - `GeminiLiveInterviewRoom.js`: Core interface for Gemini Live voice interactions. Features integrated code editor and real-time audio visualization.
  - `SimulationRoom.js`: Fallback and alternative real-time simulation environment.
  - `AnalysisPage.js`: Deep-dive report viewer for past interviews (Transcript, scores, code audits, and interactive AI assistant).
  - `ComparisonPage.js`: Advanced analytics page to compare performance variance between two selected sessions.
  - `PaymentHistory.js`: Financial ledger displaying Razorpay order IDs, payment status, credit allocation, and expiry.
- **`/services`**:
  - `geminiLiveVoice.js`: Advanced class-based audio client using `AudioWorkletNode`. Implements Anti-Lag Buffering (8192 bytes limit) and Software Echo-Locking to prevent AI interruptions.
  - `socket.js`: Shared Socket.IO client for standard interview room signaling.
  - `api.js`: Standard REST API layer for auth, payments, uploads, and report fetching.
- **`/components`**:
  - `StarryBackground.js`: Subtle, professional background animation.
  - `Navbar.js` & `GlobalLayout.js`: Structural UI wrappers handling global routing and session persistence.

---

## 🚀 Key Features
1. **Resume-Aware Interviewing:** AI uses highly-optimized, truncated resume context to drive personalized questioning without sacrificing audio latency.
2. **Live Voice Interaction:** Real-time, low-latency voice conversation via Gemini Live, protected by custom audio buffering and echo-cancellation logic.
3. **Credit-Based Billing System:** Fully integrated Razorpay gateway handling user wallets, transaction histories, and trial credits.
4. **Automated Performance Reports:** Detailed post-interview analysis including transcripts, communication metrics, and technical audits.
5. **Session Comparison:** Compare performance across multiple interviews to track growth and technical depth improvements.
6. **Technical Audit Engine:** Monitors code snapshots to provide post-session complexity and quality scoring.

---

## 🔮 Future Add-ons (Roadmap)
1. **Computer Vision:** Advanced screen observation, active code monitoring, and eye-contact analysis.
2. **Interviewer Personalities:** Expanding customizable personas (e.g., "FAANG Bar Raiser," "Friendly Mentor") with unique system prompts.
3. **Live Code Execution:** Allowing the backend to securely compile and test the user's code during the interview.

---

## 📊 Current Status
**Status:** Beta Release(Approx 85% Complete)

**Primary Focus:** Cloud deployment, media storage lifecycle (Cloudinary auto-cleanup), and production Razorpay key migration.

---

## Deployment Constraints
1. **Memory Limits:** The local ML pipeline (Whisper, OpenCV) requires at least 2GB-4GB RAM and will instantly crash standard 512MB free-tier cloud containers like Render.

2. **Storage Ephemerality:** Cloud hosts wipe local disk storage on restart, so heavy video/audio processing must be offloaded to persistent storage (e.g., S3, Cloudinary) to prevent server exhaustion.

**Built By** Vaibhav Rai  
*AI Interview Analyzer © 2026*





