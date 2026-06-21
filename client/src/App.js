import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import HomePage from "./pages/HomePage";
import Dashboard from "./pages/Dashboard";
import UploadPage from "./pages/UploadPage";
import AnalysisPage from "./pages/AnalysisPage";
import ComparisonPage from "./pages/ComparisonPage";
import SimulationRoom from "./pages/SimulationRoom";
import RealtimeInterviewRoom from "./pages/RealtimeInterviewRoom";
import GeminiLiveInterviewRoom from "./pages/GeminiLiveInterviewRoom";
import PaymentHistory from "./pages/PaymentHistory";
import GlobalLayout from "./components/GlobalLayout";
import PreFlight from "./pages/Preflight";
import AuthPage from "./pages/Authpage";

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/auth" replace />;
  return children;
};

function App() {
  return (
    <BrowserRouter>
      <GlobalLayout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/auth" element={<AuthPage />} />

          <Route path="/start" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
          <Route path="/upload" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />

          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/payments" element={<ProtectedRoute><PaymentHistory /></ProtectedRoute>} />
          <Route path="/billing" element={<ProtectedRoute><PaymentHistory /></ProtectedRoute>} />

          <Route path="/analysis/:id" element={<ProtectedRoute><AnalysisPage /></ProtectedRoute>} />
          <Route path="/compare/:id1/:id2" element={<ProtectedRoute><ComparisonPage /></ProtectedRoute>} />
          <Route path="/simulate" element={<ProtectedRoute><SimulationRoom /></ProtectedRoute>} />
          <Route path="/realtime-interview" element={<ProtectedRoute><RealtimeInterviewRoom /></ProtectedRoute>} />
          <Route path="/gemini-live-interview" element={<ProtectedRoute><GeminiLiveInterviewRoom /></ProtectedRoute>} />
          <Route path="/pre-flight" element={<ProtectedRoute><PreFlight /></ProtectedRoute>} />

          <Route
            path="*"
            element={
              <div className="p-20 text-center text-slate-500 font-bold uppercase tracking-widest text-xs">
                404: Route Not Found
              </div>
            }
          />
        </Routes>
      </GlobalLayout>
    </BrowserRouter>
  );
}

export default App;