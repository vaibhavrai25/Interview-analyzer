import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  Calendar,
  CreditCard,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Wallet,
  XCircle,
} from "lucide-react";
import { getPaymentHistory, getUserEmail } from "../services/api";

const formatDate = (value) => {
  if (!value) return "N/A";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "N/A";
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (_) {
    return "N/A";
  }
};

const statusTone = (status) => {
  const s = String(status || "").toLowerCase();
  if (s === "paid") return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  if (s.includes("fail")) return "text-red-400 bg-red-500/10 border-red-500/20";
  if (s.includes("created")) return "text-amber-400 bg-amber-500/10 border-amber-500/20";
  return "text-slate-400 bg-slate-800 border-slate-700";
};

const statusIcon = (status) => {
  const s = String(status || "").toLowerCase();
  if (s === "paid") return <BadgeCheck size={14} />;
  if (s.includes("fail")) return <XCircle size={14} />;
  return <CreditCard size={14} />;
};

export default function PaymentHistory() {
  const [payments, setPayments] = useState([]);
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const email = getUserEmail();

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await getPaymentHistory({ email, status, limit: 200 });
      setPayments(result.data || []);
    } catch (err) {
      setError(err?.message || "Could not load payment history.");
    } finally {
      setLoading(false);
    }
  }, [email, status]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const filteredPayments = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter((p) => {
      return (
        String(p.razorpay_order_id || "").toLowerCase().includes(q) ||
        String(p.razorpay_payment_id || "").toLowerCase().includes(q) ||
        String(p.pack_label || "").toLowerCase().includes(q) ||
        String(p.pack_id || "").toLowerCase().includes(q) ||
        String(p.receipt || "").toLowerCase().includes(q)
      );
    });
  }, [payments, query]);

  const totalPaid = payments
    .filter((p) => String(p.status).toLowerCase() === "paid")
    .reduce((sum, p) => sum + Number(p.amount_rupees || 0), 0);

  const totalCredits = payments
    .filter((p) => String(p.status).toLowerCase() === "paid")
    .reduce((sum, p) => sum + Number(p.credits || 0), 0);

  return (
    <div className="min-h-screen bg-[#050505] text-slate-200 px-6 py-10 pb-28 font-sans">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <header className="flex flex-col lg:flex-row justify-between gap-5 lg:items-end mb-10 border-b border-slate-800 pb-6">
          <div>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-slate-100 mb-6 transition-colors"
            >
              <ArrowLeft size={16} /> Back to Dashboard
            </Link>

            <h1 className="text-2xl md:text-3xl font-bold text-slate-50 tracking-tight">
              Billing History
            </h1>

            <p className="text-sm text-slate-400 mt-2">
              {email || "Authentication required"} • Managed via secure payment gateway
            </p>
          </div>

          <button
            onClick={fetchHistory}
            className="px-4 py-2 rounded-md bg-slate-900 border border-slate-700 text-slate-300 hover:text-slate-50 hover:bg-slate-800 text-sm font-medium transition-colors flex items-center gap-2 w-fit shadow-sm"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </header>

        {/* Metrics */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <MetricCard
            icon={<Wallet size={18} />}
            label="Total Spent"
            value={`₹${totalPaid}`}
            sub="Verified transactions only"
          />

          <MetricCard
            icon={<ShieldCheck size={18} />}
            label="Credits Acquired"
            value={totalCredits}
            sub="Lifetime allocation purchased"
          />

          <MetricCard
            icon={<Calendar size={18} />}
            label="Transaction Count"
            value={payments.length}
            sub="All ledger records"
          />
        </section>

        {/* Transactions Table Section */}
        <section className="border border-slate-800 bg-slate-900/40 rounded-xl overflow-hidden shadow-sm">
          
          <div className="p-5 border-b border-slate-800 bg-slate-900/80">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">Ledger</h2>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative w-full sm:w-72">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                    size={16}
                  />
                  <input
                    type="text"
                    placeholder="Search invoices, IDs..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 rounded-md bg-slate-950 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-shadow placeholder:text-slate-600"
                  />
                </div>

                <div className="relative">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full sm:w-auto pl-4 pr-8 py-2 rounded-md bg-slate-950 border border-slate-700 text-sm font-medium text-slate-300 focus:outline-none focus:border-blue-500 appearance-none hover:border-slate-600 transition-colors cursor-pointer"
                  >
                    <option value="all">All Statuses</option>
                    <option value="paid">Paid</option>
                    <option value="created">Pending</option>
                    <option value="failed">Failed</option>
                    <option value="signature_failed">Signature Failed</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-500">
              <Loader2 className="animate-spin text-blue-500 mb-3" size={32} />
              <p className="text-sm font-medium">Synchronizing ledger...</p>
            </div>
          ) : error ? (
            <div className="py-20 text-center text-red-400 text-sm font-medium bg-red-500/5">{error}</div>
          ) : filteredPayments.length === 0 ? (
            <div className="py-16 text-center px-4">
              <Wallet size={32} className="mx-auto text-slate-600 mb-4" />
              <p className="text-slate-300 font-semibold mb-2">No transaction records found</p>
              <p className="text-slate-500 text-sm max-w-sm mx-auto mb-6">
                Your payment history and credit purchases will appear here once you make your first transaction.
              </p>
              <Link
                to="/#pricing"
                className="inline-flex bg-blue-600 text-white px-5 py-2.5 rounded-md font-semibold text-sm shadow-sm hover:bg-blue-500 transition-colors"
              >
                View Plans
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-900 text-slate-400 text-xs uppercase tracking-wider font-semibold border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-4">Transaction / Status</th>
                    <th className="px-6 py-4">Reference IDs</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4">Allocation</th>
                    <th className="px-6 py-4">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {filteredPayments.map((payment) => (
                    <tr 
                      key={payment.razorpay_order_id || payment._id} 
                      className="hover:bg-slate-800/30 transition-colors"
                    >
                      {/* Name & Status */}
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-200 mb-1.5">
                          {payment.pack_label || payment.pack_id || "Credit Allocation"}
                        </div>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${statusTone(payment.status)}`}>
                          {statusIcon(payment.status)}
                          {payment.status || "Unknown"}
                        </span>
                      </td>

                      {/* IDs */}
                      <td className="px-6 py-4">
                        <div className="text-xs text-slate-400 mb-1">
                          <span className="font-semibold text-slate-500 mr-1">Order:</span>
                          <span className="font-mono">{payment.razorpay_order_id || "--"}</span>
                        </div>
                        <div className="text-xs text-slate-400">
                          <span className="font-semibold text-slate-500 mr-1">Txn:</span>
                          <span className="font-mono">{payment.razorpay_payment_id || "Pending"}</span>
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="px-6 py-4 font-semibold text-slate-200">
                        ₹{payment.amount_rupees || 0}
                      </td>

                      {/* Credits */}
                      <td className="px-6 py-4 font-semibold text-slate-200">
                        {payment.credits || 0}
                      </td>

                      {/* Dates */}
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-slate-300 mb-1">
                          {formatDate(payment.created_at)}
                        </div>
                        <div className="text-xs text-slate-500">
                          Expires: {payment.expires_at ? formatDate(payment.expires_at) : "Upon verification"}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, sub }) {
  return (
    <div className="p-5 border border-slate-800 bg-slate-900/50 rounded-xl flex flex-col justify-between">
      <div className="flex justify-between items-start mb-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
        <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
          {icon}
        </div>
      </div>
      <div>
        <p className="text-3xl font-bold text-slate-50">{value}</p>
        <p className="text-xs text-slate-500 mt-2 font-medium">{sub}</p>
      </div>
    </div>
  );
}