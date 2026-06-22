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
  if (action.includes("FAILED") || action.includes("BLOCKED") || action.includes("DELETE")) return "danger";
  if (action.includes("CREATE") || action.includes("ADD")) return "success";
  if (action.includes("UPDATE") || action.includes("OVERRIDE") || action.includes("RESET")) return "warning";
  return "neutral";
}

export default function Audit() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("");
  const [module, setModule] = useState("");

  async function fetchAudit() {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (query.trim()) params.q = query.trim();
      if (action) params.action = action;
      if (module) params.module = module;
      const hasFilters = params.q || params.action || params.module;
      const { data } = await api.get(hasFilters ? "/api/audit/search" : "/api/audit", { params });
      setRecords(data);
    } catch (err) {
      if (err?.response?.status === 403) {
        setError("Admin access required to view the audit trail.");
      } else {
        setError("Couldn't load the audit trail. Check your connection and try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFilterSubmit(e) {
    e.preventDefault();
    fetchAudit();
  }

  function clearFilters() {
    setQuery("");
    setAction("");
    setModule("");
    setTimeout(fetchAudit, 0);
  }

  return (
    <div className="audit-page">
      <div className="audit-header">
        <div>
          <h1>Audit trail</h1>
          <p className="audit-subtitle">
            Every significant action in the system — who did what, when, and what changed.
          </p>
        </div>
      </div>

      <form className="audit-filters" onSubmit={handleFilterSubmit}>
        <input
          type="text"
          className="audit-search"
          placeholder="Search by user, item, or description…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          {ACTION_OPTIONS.map((a) => (
            <option key={a} value={a}>
              {a === "" ? "All actions" : a.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <select value={module} onChange={(e) => setModule(e.target.value)}>
          {MODULE_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m === "" ? "All modules" : m}
            </option>
          ))}
        </select>
        <button type="submit" className="audit-filter-btn">
          Filter
        </button>
        {(query || action || module) && (
          <button type="button" className="audit-clear-btn" onClick={clearFilters}>
            Clear
          </button>
        )}
      </form>

      {error && <div className="audit-error">{error}</div>}

      {loading ? (
        <div className="audit-loading">Loading audit trail…</div>
      ) : records.length === 0 ? (
        <div className="audit-empty">No audit records match your filters.</div>
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
