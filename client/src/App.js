import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import UploadPage from "./pages/UploadPage";
import AnalysisPage from "./pages/AnalysisPage";

// Optional: You can add a Navbar here so it shows on every page
// import Navbar from "./components/Navbar";

function App() {
  return (
    <BrowserRouter>
      {/* <Navbar /> */}
      <Routes>
        {/* Home page is the Upload page */}
        <Route path="/" element={<UploadPage />} />

        {/* Dashboard showing list of all interviews */}
        <Route path="/dashboard" element={<Dashboard />} />

        {/* 🔥 FIX: Dynamic routing. 
          The ':id' allows you to visit /analysis/6984dcd3... 
          and grab that ID using useParams() in the AnalysisPage component.
        */}
        <Route path="/analysis/:id" element={<AnalysisPage />} />

        {/* Catch-all for 404 errors */}
        <Route path="*" element={<div className="p-10 text-center">Page Not Found</div>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;