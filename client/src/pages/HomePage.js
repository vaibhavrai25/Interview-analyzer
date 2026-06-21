import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Code2,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  Mic,
  ShieldCheck,
  Video,
  Wallet,
  Terminal,
  BadgeCheck,
  AlertCircle,
  History,
  LogOut,
} from "lucide-react";
import StarryBackground from "../components/StarryBackground";
import { startCreditPurchase } from "../services/api";

const creditPacks = [
  {
    id: "trial",
    name: "Free Trial",
    credits: 1,
    minutes: 15,
    price: "₹0",
    badge: "Trial",
    description: "One 15-minute mock interview session to evaluate the platform.",
  },
  {
    id: "pack_3",
    name: "Starter",
    credits: 3,
    minutes: 45,
    price: "₹49",
    badge: "Standard",
    description: "Ideal for a single, comprehensive role-specific preparation round.",
  },
  {
    id: "pack_5",
    name: "Value",
    credits: 5,
    minutes: 75,
    price: "₹99",
    badge: "Popular",
    description: "Consistent practice pipeline for upcoming technical interviews.",
  },
  {
    id: "pack_10",
    name: "Pro",
    credits: 10,
    minutes: 150,
    price: "₹199",
    badge: "Recommended",
    description: "Extended capacity for multiple rounds and resume-based iterations.",
  },
  {
    id: "pack_20",
    name: "Volume",
    credits: 20,
    minutes: 300,
    price: "₹349",
    badge: "High Volume",
    description: "Maximum bandwidth for rigorous, long-term interview preparation.",
  },
];

const features = [
  "Low-latency voice interactions with adaptive technical follow-ups",
  "Context-aware evaluations based on provided resume and role parameters",
  "Post-session diagnostics covering communication, accuracy, and logic",
  "Integrated code snapshot analysis during technical rounds",
  "Transparent utilization: 1 credit = 15 minutes, 12-month validity",
];

export default function HomePage() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [buyingPackId, setBuyingPackId] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");
  const [paymentError, setPaymentError] = useState("");

  const handleStart = () => {
    navigate(token ? "/start" : "/auth");
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/auth";
  };

  const handleBuyPack = async (pack) => {
    setPaymentMessage("");
    setPaymentError("");

    if (!token) {
      navigate("/auth");
      return;
    }

    if (pack.id === "trial") {
      navigate("/start");
      return;
    }

    try {
      setBuyingPackId(pack.id);
      setPaymentMessage("Initializing secure transaction...");

      const result = await startCreditPurchase({
        packId: pack.id,
        onSuccess: () => {
          setPaymentMessage("Transaction verified. Account provisioned.");
        },
        onFailure: (error) => {
          setPaymentError(error?.message || "Transaction failed. Please retry.");
        },
      });

      if (result?.wallet) {
        setPaymentMessage("Transaction successful. Credits are available.");
      }

      setTimeout(() => {
        navigate("/dashboard");
      }, 900);
    } catch (error) {
      setPaymentError(error?.message || "Transaction could not be completed.");
    } finally {
      setBuyingPackId("");
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-slate-200 relative overflow-hidden font-sans">
      <StarryBackground />

      <nav className="relative z-20 max-w-7xl mx-auto px-6 py-6 flex items-center justify-between border-b border-white/5">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center transition-colors group-hover:border-blue-500/40">
            <Terminal className="text-blue-400" size={20} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-100 tracking-tight">
              AI Interview Analyzer
            </p>
            <p className="text-[11px] text-slate-500 font-medium">
              Technical Interview Platform
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-4">
          {token ? (
            <>
              <Link
                to="/payments"
                className="hidden md:flex px-4 py-2 rounded-md text-sm font-medium text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors items-center gap-2"
              >
                <History size={16} /> Billing
              </Link>
              <Link
                to="/dashboard"
                className="hidden sm:block px-4 py-2 rounded-md text-sm font-medium text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors"
              >
                Dashboard
              </Link>
              <button
                onClick={handleStart}
                className="bg-slate-100 text-slate-900 px-5 py-2.5 rounded-md text-sm font-semibold hover:bg-white transition-colors"
              >
                Start Session
              </button>
              <button 
                onClick={handleLogout}
                className="p-2.5 rounded-md bg-slate-900 border border-slate-700 hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400 text-slate-400 transition-colors shadow-sm"
                title="Sign Out"
              >
                <LogOut size={16} />
              </button>
            </>
          ) : (
            <>
              <Link
                to="/auth"
                className="px-4 py-2 rounded-md text-sm font-medium text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors"
              >
                Sign In
              </Link>
              <Link
                to="/auth"
                className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-md text-sm font-semibold transition-colors shadow-sm shadow-blue-900/20"
              >
                Create Account
              </Link>
            </>
          )}
        </div>
      </nav>

      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-24 grid lg:grid-cols-2 gap-16 items-center">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-medium mb-6">
            <Code2 size={14} /> Production-grade mock interviews
          </div>

          <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-slate-50 leading-[1.1]">
            Evaluate your skills with objective precision.
          </h1>

          <p className="mt-6 text-slate-400 text-lg leading-relaxed max-w-xl">
            Configure a role, upload your context, and undergo a structured, adaptive technical interview. Review logic, communication patterns, and execution metrics via a comprehensive post-session dashboard.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-4">
            <button
              onClick={handleStart}
              className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3.5 rounded-md font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-sm shadow-blue-900/20"
            >
              Initialize Session <ArrowRight size={16} />
            </button>

            <a
              href="#pricing"
              className="bg-slate-800/50 hover:bg-slate-800 border border-slate-700 px-8 py-3.5 rounded-md font-medium text-slate-200 text-sm transition-colors text-center"
            >
              View Plans
            </a>
          </div>

          <div className="mt-10 grid sm:grid-cols-3 gap-4 max-w-xl border-t border-white/5 pt-8">
            <MiniStat icon={<Mic size={16} />} label="Voice Protocol" />
            <MiniStat icon={<Video size={16} />} label="Session Logging" />
            <MiniStat icon={<Terminal size={16} />} label="Logic Audit" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="p-1 rounded-xl border border-slate-800 bg-slate-900/50 shadow-2xl"
        >
          <div className="rounded-lg bg-black border border-slate-800 p-6 flex flex-col justify-between h-full min-h-[340px]">
            <div className="flex justify-between items-start mb-8">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Active Session
                </p>
                <h3 className="text-lg font-semibold text-slate-200 mt-1">Backend Engineering Mock</h3>
              </div>
              <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                Connected
              </div>
            </div>

            <div className="space-y-4 flex-1">
              <ChatLine
                side="left"
                text="I reviewed your resume. Walk me through your most complex distributed systems project."
              />
              <ChatLine
                side="right"
                text="I implemented a scalable job queue using Redis and Node.js to handle asynchronous data processing."
              />
              <ChatLine
                side="left"
                text="How did you approach managing worker node failures in that architecture?"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <InfoCard
              icon={<ShieldCheck size={18} />}
              title="Secure Infrastructure"
              text="JWT authentication, encrypted payloads, and verified transactions."
            />
            <InfoCard
              icon={<CreditCard size={18} />}
              title="Predictable Billing"
              text="Standardized credits mapping to 15-minute evaluation blocks."
            />
          </div>
        </motion.div>
      </section>

      <section className="relative z-10 max-w-7xl mx-auto px-6 pb-24 border-t border-white/5 pt-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4">
          {features.map((feature, idx) => (
            <div
              key={idx}
              className="p-5 rounded-lg bg-slate-900/40 border border-slate-800 hover:border-slate-700 transition-colors"
            >
              <CheckCircle2 size={20} className="text-slate-400 mb-4" />
              <p className="text-sm text-slate-300 leading-relaxed">{feature}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="relative z-10 max-w-7xl mx-auto px-6 pb-28">
        <div className="mb-12 max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight text-slate-50">
            Explore our credit plans
          </h2>
          <p className="text-slate-400 text-base mt-3">
            1 credit equals 15 minutes of active interview time. Valid for 12 months.
          </p>
        </div>

        {(paymentMessage || paymentError) && (
          <div
            className={`mb-8 p-4 rounded-md border text-sm flex items-start gap-3 ${
              paymentError
                ? "bg-red-500/10 border-red-500/20 text-red-300"
                : "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
            }`}
          >
            {paymentError ? (
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
            ) : (
              <BadgeCheck size={18} className="shrink-0 mt-0.5" />
            )}
            <span className="font-medium">{paymentError || paymentMessage}</span>
          </div>
        )}

        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4">
          {creditPacks.map((pack) => {
            const isPopular = pack.id === "pack_5";
            const isBuying = buyingPackId === pack.id;

            return (
              <div
                key={pack.id}
                className={`p-6 rounded-lg border flex flex-col transition-colors ${
                  isPopular
                    ? "border-blue-500/40 bg-blue-900/10"
                    : "border-slate-800 bg-slate-900/30 hover:border-slate-700"
                }`}
              >
                <div className="flex justify-between items-center mb-6">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${isPopular ? 'bg-blue-500/20 text-blue-300' : 'bg-slate-800 text-slate-300'}`}>
                    {pack.badge}
                  </span>
                  <Clock size={16} className="text-slate-500" />
                </div>

                <h3 className="text-lg font-semibold text-slate-200">{pack.name}</h3>
                <p className="text-3xl font-bold text-slate-50 mt-3">{pack.price}</p>
                <p className="text-sm font-medium text-slate-400 mt-2">
                  {pack.credits} Credits / {pack.minutes} Min
                </p>

                <p className="text-sm text-slate-500 mt-4 leading-relaxed min-h-[60px]">
                  {pack.description}
                </p>

                <button
                  onClick={() => handleBuyPack(pack)}
                  disabled={Boolean(buyingPackId)}
                  className={`w-full mt-6 py-2.5 rounded-md text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                    isPopular
                      ? "bg-blue-600 text-white hover:bg-blue-500"
                      : "bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isBuying ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Processing
                    </>
                  ) : pack.id === "trial" ? (
                    "Initialize Trial"
                  ) : (
                    <>
                      <Wallet size={16} />
                      Purchase Credits
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-8 grid lg:grid-cols-3 gap-4 border-t border-slate-800 pt-8">
          <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800 text-slate-400 text-sm leading-relaxed">
            <strong className="text-slate-300 block mb-1">Architecture Note</strong>
            Suitable for standard processing usage. Premium real-time capabilities may require specialized allocation blocks.
          </div>

          <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800 text-slate-400 text-sm leading-relaxed">
            <strong className="text-slate-300 block mb-1">Transaction Security</strong>
            Operations are authorized server-side. Ledger updates occur strictly post-signature verification.
          </div>

          <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800 text-slate-400 text-sm leading-relaxed">
            <strong className="text-slate-300 block mb-1">Ledger Auditing</strong>
            Monitor comprehensive transaction history, including status flags and expiration metadata via the dashboard.
          </div>
        </div>
      </section>
    </div>
  );
}

function MiniStat({ icon, label }) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3 flex items-center gap-3 text-sm font-medium text-slate-300">
      <span className="text-slate-400">{icon}</span>
      {label}
    </div>
  );
}

function ChatLine({ side, text }) {
  return (
    <div
      className={`max-w-[90%] px-4 py-2.5 rounded-lg text-sm leading-relaxed ${
        side === "right"
          ? "ml-auto bg-blue-600/90 text-white rounded-tr-sm"
          : "bg-slate-800 text-slate-200 rounded-tl-sm border border-slate-700/50"
      }`}
    >
      {text}
    </div>
  );
}

function InfoCard({ icon, title, text }) {
  return (
    <div className="rounded-lg bg-slate-900/50 border border-slate-800 p-4">
      <div className="text-slate-400 mb-2">{icon}</div>
      <h4 className="text-sm font-semibold text-slate-200">{title}</h4>
      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{text}</p>
    </div>
  );
}