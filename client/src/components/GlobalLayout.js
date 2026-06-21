import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "react-router-dom";
import StarryBackground from "./StarryBackground";
import Navbar from "./Navbar";

const GlobalLayout = ({ children }) => {
  const location = useLocation();
  const publicPages = ["/", "/home", "/auth"];
  const hideNavbar = publicPages.includes(location.pathname);

  return (
    <div className="relative min-h-screen w-full text-slate-200 bg-[#050505] overflow-x-hidden font-sans">
      {/* Background Layer */}
      <div className="fixed inset-0 -z-20">
        <StarryBackground />
      </div>

      {/* Subtle Ambient Glow */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-600/5 blur-[120px] rounded-full -z-10 pointer-events-none" />

      {!hideNavbar && <Navbar />}

      {/* Main Content Area */}
      <AnimatePresence mode="wait">
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className={`relative z-10 w-full ${hideNavbar ? "pt-0" : "pt-20"}`}
        >
          {children}
        </motion.main>
      </AnimatePresence>
    </div>
  );
};

export default GlobalLayout;