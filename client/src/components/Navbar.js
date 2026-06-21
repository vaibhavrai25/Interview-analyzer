import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LayoutDashboard, Terminal, LogOut, User } from 'lucide-react';

export default function Navbar() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "null");

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/auth"; // Force clear refresh
  };

  if (!user) return null; // Hide navbar on Auth page

  return (
    <motion.nav 
      initial={{ y: -10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between px-6 py-3 bg-[#050505]/80 backdrop-blur-md border-b border-slate-800"
    >
      <Link to="/" className="flex items-center gap-3 group">
        <div className="w-8 h-8 rounded-md bg-blue-600/10 border border-blue-500/20 flex items-center justify-center transition-colors group-hover:border-blue-500/40">
          <Terminal size={16} className="text-blue-400" />
        </div>
        <span className="text-sm font-semibold text-slate-100 tracking-tight">
          AI Interview Analyzer
        </span>
      </Link>

      <div className="flex items-center gap-3">
        {/* User Profile Info */}
        <div className="hidden md:flex items-center gap-2.5 px-4 py-1.5 border-r border-slate-800 mr-1">
            <div className="w-6 h-6 rounded bg-slate-800 border border-slate-700 flex items-center justify-center">
                <User size={14} className="text-slate-400" />
            </div>
            <span className="text-sm font-medium text-slate-300">{user.name || "User"}</span>
        </div>

        {/* Dashboard Button */}
        <button 
          onClick={() => navigate("/dashboard", { replace: true })}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-slate-900 border border-slate-700 hover:bg-slate-800 hover:text-slate-100 text-slate-300 transition-colors text-sm font-medium shadow-sm"
        >
          <LayoutDashboard size={16} />
          Dashboard
        </button>

        {/* Sign Out Button */}
        <button 
          onClick={handleLogout}
          className="p-2 rounded-md bg-slate-900 border border-slate-700 hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400 text-slate-400 transition-colors shadow-sm"
          title="Sign Out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </motion.nav>
  );
}