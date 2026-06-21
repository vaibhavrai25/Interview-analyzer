import React, { useState } from "react";
import { motion } from "framer-motion";
import { Mail, Lock, User, ArrowRight, Loader2, Terminal, ShieldCheck, AlertCircle, BadgeCheck } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import StarryBackground from "../components/StarryBackground";
import { loginUser, registerUser } from "../services/api";

export default function Authpage() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({ email: "", password: "", name: "" });
  const navigate = useNavigate();

  const updateForm = (patch) => {
    setError("");
    setFormData((prev) => ({ ...prev, ...patch }));
  };

  const validateClient = () => {
    if (!formData.email.trim()) return "Email address is required.";
    if (!formData.password) return "Password is required.";
    
    if (!isLogin) {
      if (formData.name.trim().length < 2) return "Please enter your full name.";
      if (formData.password.length < 8) return "Password must be at least 8 characters.";
      if (!/[A-Z]/.test(formData.password)) return "Password must contain at least one uppercase letter.";
      if (!/[a-z]/.test(formData.password)) return "Password must contain at least one lowercase letter.";
      if (!/[0-9]/.test(formData.password)) return "Password must contain at least one number.";
    }
    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const clientError = validateClient();
    if (clientError) {
      setError(clientError);
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (isLogin) {
        await loginUser({ email: formData.email, password: formData.password });
        navigate("/dashboard");
      } else {
        await registerUser({ name: formData.name, email: formData.email, password: formData.password });
        setIsLogin(true);
        setError("Account created successfully. Your free trial is ready. Please sign in.");
      }
    } catch (err) {
      // Safely extract FastAPI error details if they exist, otherwise fallback to generic/network messages
      const backendError = err?.response?.data?.detail || err?.response?.data?.message || err?.message;
      
      if (backendError === "Failed to fetch") {
        setError("Cannot connect to server. Please check your internet connection.");
      } else {
        setError(backendError || "Authentication failed. Please check your credentials.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6 relative overflow-hidden font-sans text-slate-200">
      <StarryBackground />

      <Link 
        to="/" 
        className="absolute top-6 left-6 z-20 text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors flex items-center gap-2"
      >
        ← Return Home
      </Link>

      <motion.div 
        initial={{ opacity: 0, y: 10 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.3 }}
        className="w-full max-w-[400px] z-10"
      >
        <div className="p-8 sm:p-10 rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl shadow-2xl relative">
          
          <div className="text-center mb-8">
            <div className="w-12 h-12 bg-blue-600/10 rounded-lg flex items-center justify-center mx-auto mb-5 border border-blue-500/20 shadow-sm">
              <Terminal className="text-blue-400" size={24} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-50">
              {isLogin ? "Welcome back" : "Create an account"}
            </h1>
            <p className="text-slate-400 text-sm mt-2">
              {isLogin ? "Sign in to access your dashboard" : "Start your free 15-minute mock interview trial"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <Input 
                icon={<User />} 
                type="text" 
                placeholder="Full Name" 
                value={formData.name} 
                onChange={(e) => updateForm({ name: e.target.value })} 
              />
            )}

            <Input 
              icon={<Mail />} 
              type="email" 
              placeholder="Email Address" 
              value={formData.email} 
              onChange={(e) => updateForm({ email: e.target.value })} 
            />
            
            <Input 
              icon={<Lock />} 
              type="password" 
              placeholder="Password" 
              value={formData.password} 
              onChange={(e) => updateForm({ password: e.target.value })} 
            />

            {!isLogin && (
              <div className="rounded-md bg-slate-800/50 border border-slate-700 p-3 text-xs text-slate-400 flex items-start gap-2.5 leading-relaxed">
                <ShieldCheck size={16} className="shrink-0 text-slate-500" />
                <span>Password must contain 8+ characters, including an uppercase letter, lowercase letter, and a number.</span>
              </div>
            )}

            {error && (
              <div className={`rounded-md p-3 text-sm font-medium flex items-start gap-2.5 border ${
                error.includes("created") 
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" 
                : "bg-red-500/10 border-red-500/20 text-red-300"
              }`}>
                {error.includes("created") ? <BadgeCheck size={18} className="shrink-0 mt-0.5" /> : <AlertCircle size={18} className="shrink-0 mt-0.5" />}
                <span className="leading-snug">{error}</span>
              </div>
            )}

            <button 
              disabled={loading} 
              className="w-full mt-2 bg-blue-600 hover:bg-blue-500 py-3 rounded-md font-semibold text-sm text-white flex items-center justify-center gap-2 transition-colors shadow-sm shadow-blue-900/20 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <><Loader2 size={16} className="animate-spin" /> Processing...</>
              ) : (
                <>{isLogin ? "Sign In" : "Sign Up"} <ArrowRight size={16} /></>
              )}
            </button>
          </form>

          <div className="mt-6 text-center pt-6 border-t border-slate-800">
            <button 
              onClick={() => { setIsLogin(!isLogin); setError(""); }} 
              className="text-slate-400 text-sm font-medium hover:text-slate-100 transition-colors"
            >
              {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function Input({ icon, ...props }) {
  return (
    <div className="relative">
      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 [&>svg]:w-[18px] [&>svg]:h-[18px]">
        {icon}
      </div>
      <input 
        {...props} 
        required 
        className="w-full pl-10 pr-4 py-2.5 bg-black/40 border border-slate-700 rounded-md text-sm text-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none transition-all placeholder:text-slate-500" 
      />
    </div>
  );
}