import { useEffect, useState } from "react";
import api from "../api/axios";
import { SkeletonTable } from "../components/PageLoader";
import "../components/PageLoader.css";
import "./Audit.css";

const ACTION_OPTIONS = [
  "", "LOGIN", "LOGIN_FAILED", "LOGIN_BLOCKED",
  "CREATE_USER", "DEACTIVATE_USER",
  "ADD_MEMBER", "UPDATE_MEMBER", "DELETE_MEMBER",
  "OVERRIDE_DEPARTMENT", "FORGOT_PASSWORD", "RESET_PASSWORD",
  "CREATE_SERVICE", "UPDATE_SERVICE", "DELETE_SERVICE",
  "CREATE_EVENT", "UPDATE_EVENT", "DELETE_EVENT",
  "MARK_ATTENDANCE", "UNMARK_ATTENDANCE",
];

const MODULE_OPTIONS = ["", "AUTH", "USERS", "MEMBERS", "SERVICES", "EVENTS", "ATTENDANCE"];

function actionTone(action) {
  if (!action) return "neutral";
  if (action.includes("FAILED") || action.includes("BLOCKED") || action.includes("DELETE")) return "danger";
  if (action.includes("CREATE") || action.includes("ADD") || action.includes("MARK")) return "success";
  if (action.includes("UPDATE") || action.includes("OVERRIDE") || action.includes("RESET")) return "warning";
  if (action === "LOGIN") return "info";
  return "neutral";
}

export default function Audit() {
  const [records, setRecords]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [query, setQuery]       = useState("");
  const [action, setAction]     = useState("");
  const [module, setModule]     = useState("");

  async function fetchAudit() {
    setLoading(true); setError("");
    try {
      const params = {};
      if (query.trim()) params.q = query.trim();
      if (action) params.action = action;
      if (module) params.module = module;
      const hasFilters = params.q || params.action || params.module;
      const { data } = await api.get(hasFilters ? "/api/audit/search" : "/api/audit", { params });
      setRecords(data);
    } catch (err) {
      if (err?.response?.status === 403) setError("Admin access required to view the audit trail.");
      else setError("Could not load audit trail. Check your connection.");
    } finally { setLoading(false); }
  }

  useEffect(() => { fetchAudit(); }, []);

  function clearFilters() {
    setQuery(""); setAction(""); setModule("");
    setTimeout(fetchAudit, 0);
  }

  return (
    <div className="audit-page">
      <div className="audit-header">
        <div>
          <h1>Audit Trail</h1>
          <p className="audit-subtitle">
            Every significant action — who did what and when.
          </p>
        </div>
      </div>

      <form className="audit-filters" onSubmit={e => { e.preventDefault(); fetchAudit(); }}>
        <input type="text" className="audit-search"
          placeholder="Search user, item, description…"
          value={query} onChange={e => setQuery(e.target.value)} />
        <select value={action} onChange={e => setAction(e.target.value)}>
          {ACTION_OPTIONS.map(a => (
            <option key={a} value={a}>{a === "" ? "All actions" : a.replaceAll("_", " ")}</option>
          ))}
        </select>
        <select value={module} onChange={e => setModule(e.target.value)}>
          {MODULE_OPTIONS.map(m => (
            <option key={m} value={m}>{m === "" ? "All modules" : m}</option>
          ))}
        </select>
        <button type="submit" className="audit-filter-btn">Filter</button>
        {(query || action || module) && (
          <button type="button" className="audit-clear-btn" onClick={clearFilters}>Clear</button>
        )}
      </form>

      {error && <div className="audit-error">{error}</div>}

      {loading ? (
        <SkeletonTable rows={6} cols={5} />
      ) : records.length === 0 ? (
        <div className="audit-empty">
          <div className="audit-empty-icon">📋</div>
          <div className="audit-empty-title">No audit records</div>
          <div className="audit-empty-hint">
            {(query || action || module) ? "No records match your filters." : "Actions will appear here as users interact with the system."}
          </div>
        </div>
      ) : (
        <div className="audit-table-wrap">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Module</th>
                <th>Item</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, idx) => (
                <tr key={r.S_N || idx}>
                  <td className="audit-timestamp">{r.TIMESTAMP}</td>
                  <td className="audit-username">{r.USERNAME}</td>
                  <td>
                    <span className={`audit-badge audit-badge-${actionTone(r.ACTION || "")}`}>
                      {(r.ACTION || "").replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="audit-module">{r.MODULE}</td>
                  <td className="audit-item">{r.ITEM_ID}</td>
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