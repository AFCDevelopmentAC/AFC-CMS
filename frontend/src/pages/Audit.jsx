import { useEffect, useState } from "react";
import api from "../api/axios";
import "./Audit.css";

const ACTION_OPTIONS = [
  "", "LOGIN", "LOGIN_FAILED", "LOGIN_BLOCKED",
  "CREATE_USER", "DEACTIVATE_USER", "REACTIVATE_USER",
  "ADD_MEMBER", "UPDATE_MEMBER", "DELETE_MEMBER",
  "OVERRIDE_DEPARTMENT", "ADD_MEMBER_DEPARTMENT", "REMOVE_MEMBER_DEPARTMENT",
  "FORGOT_PASSWORD", "RESET_PASSWORD",
];

const MODULE_OPTIONS = ["", "AUTH", "USERS", "MEMBERS"];

function actionTone(action) {
  const norm = String(action || "").toUpperCase();
  if (norm.includes("FAILED") || norm.includes("BLOCKED") || norm.includes("DELETE")) return "danger";
  if (norm.includes("CREATE") || norm.includes("ADD")) return "success";
  if (norm.includes("UPDATE") || norm.includes("OVERRIDE") || norm.includes("RESET")) return "warning";
  return "neutral";
}

export default function Audit() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("");
  const [module, setModule] = useState("");

  async function fetchAudit(e) {
    if (e) e.preventDefault();
    setLoading(true);
    setError("");
    try {
      // Connect directly to the search router utilizing proper search params mapping
      const res = await api.get("/api/audit/search", {
        params: {
          q: query.trim(),
          action: action,
          module: module
        }
      });
      setRecords(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not fetch audit history log details.");
    } finally {
      setLoading(false);
    }
  }

  // Load baseline logs automatically on component view entry
  useEffect(() => {
    fetchAudit();
  }, [action, module]); // Automatically refetch if drop-downs toggle

  return (
    <div className="audit-page">
      <div className="audit-header">
        <div>
          <h1>System Audit Trail</h1>
          <p className="audit-subtitle">Security monitoring and operations log history</p>
        </div>
      </div>

      <form onSubmit={fetchAudit} className="audit-filters">
        <input
          type="text"
          className="audit-search"
          placeholder="Search by User, Description, or Item ID..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <select value={action} onChange={(e) => setAction(e.target.value)} className="audit-select">
          <option value="">All Actions</option>
          {ACTION_OPTIONS.filter(Boolean).map(opt => (
            <option key={opt} value={opt}>{opt.replaceAll("_", " ")}</option>
          ))}
        </select>

        <select value={module} onChange={(e) => setModule(e.target.value)} className="audit-select">
          <option value="">All Modules</option>
          {MODULE_OPTIONS.filter(Boolean).map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>

        <button type="submit" className="btn-primary">Filter</button>
      </form>

      {error && <div className="banner-error">{error}</div>}

      {loading ? (
        <div className="audit-loading">Loading configuration trails...</div>
      ) : records.length === 0 ? (
        <div className="audit-empty">No log history rows matched your criteria.</div>
      ) : (
        <div className="audit-table-wrap">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User Account</th>
                <th>Action State</th>
                <th>Module</th>
                <th>Target Reference</th>
                <th>Activity Description</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, idx) => (
                <tr key={r.S_N || idx}>
                  <td className="audit-timestamp">{r.TIMESTAMP}</td>
                  <td className="audit-username">{r.USERNAME}</td>
                  <td>
                    <span className={`audit-badge audit-badge-${actionTone(r.ACTION)}`}>
                      {String(r.ACTION || "").replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="audit-module">{r.MODULE}</td>
                  <td className="audit-item">{r.ITEM_ID || "—"}</td>
                  <td className="audit-description">{r.DESCRIPTION}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
