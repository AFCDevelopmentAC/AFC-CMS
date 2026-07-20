import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import "./Sessions.css";

export default function Sessions() {
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [events, setEvents]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [creating, setCreating] = useState(null);
  const [tab, setTab]           = useState("ALL");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [s, e] = await Promise.all([
        api.get("/api/services"),
        api.get("/api/events"),
      ]);
      setServices(Array.isArray(s.data) ? s.data : []);
      setEvents(Array.isArray(e.data) ? e.data : []);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      const status = err?.response?.status;
      setError(detail || `Error ${status || ""}: Could not load sessions.`);
      console.error("Sessions load error:", err?.response || err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(type) {
    setCreating(type);
    try {
      const today = new Date().toISOString().slice(0, 10);
      if (type === "service") {
        const res = await api.post("/api/services", {
          DATE: today,
          NATURE_OF_SERVICE: "",
          CHURCH_BRANCH: "AFC UTHIRU",
        });
        // Backend returns { sn, status, message }
        navigate(`/sessions/${res.data.sn}`);
      } else {
        const res = await api.post("/api/events", {
          EVENT_TITLE: "New Event",
          EVENT_DATE: today,
          CHURCH_BRANCH: "AFC UTHIRU",
        });
        navigate(`/sessions/${res.data.sn}`);
      }
    } catch (err) {
      const detail = err?.response?.data?.detail;
      alert(detail || "Could not create session. Please try again.");
      console.error("Create error:", err?.response || err);
    } finally {
      setCreating(null);
    }
  }

  // Derive status from date if STATUS field is missing/empty
  function resolveStatus(dateStr) {
    if (!dateStr) return "UPCOMING";
    try {
      const d = new Date(dateStr);
      return d <= new Date() ? "PAST" : "UPCOMING";
    } catch {
      return "UPCOMING";
    }
  }

  const all = [
    ...services.map(s => ({
      ...s,
      _type:   "SERVICE",
      _date:   s.DATE || "",
      _title:  s.NATURE_OF_SERVICE || s.S_N,
      STATUS:  s.STATUS || resolveStatus(s.DATE),
    })),
    ...events.map(e => ({
      ...e,
      _type:   "EVENT",
      _date:   e.EVENT_DATE || "",
      _title:  e.EVENT_TITLE || e.S_N,
      STATUS:  e.STATUS || resolveStatus(e.EVENT_DATE),
    })),
  ].sort((a, b) => (b._date || "").localeCompare(a._date || ""));

  const filtered = tab === "ALL"
    ? all
    : all.filter(s => s.STATUS === tab);

  const counts = {
    ALL:      all.length,
    UPCOMING: all.filter(s => s.STATUS === "UPCOMING").length,
    PAST:     all.filter(s => s.STATUS === "PAST").length,
  };

  return (
    <div className="sess-page">
      <div className="sess-header">
        <div>
          <h1>Services & Events</h1>
          <p className="sess-subtitle">
            Register a service or event to begin tracking attendance.
          </p>
        </div>
      </div>

      {/* Create buttons */}
      <div className="sess-create-row">
        <button
          className={`sess-create-card ${creating === "service" ? "loading" : ""}`}
          onClick={() => handleCreate("service")}
          disabled={!!creating}
        >
          <span className="sess-create-icon">🕊</span>
          <span className="sess-create-label">
            {creating === "service" ? "Creating..." : "Register a Service"}
          </span>
          <span className="sess-create-hint">Sunday, midweek, prayer meeting...</span>
        </button>

        <button
          className={`sess-create-card ${creating === "event" ? "loading" : ""}`}
          onClick={() => handleCreate("event")}
          disabled={!!creating}
        >
          <span className="sess-create-icon">📅</span>
          <span className="sess-create-label">
            {creating === "event" ? "Creating..." : "Register an Event"}
          </span>
          <span className="sess-create-hint">Programs, outreaches, seminars...</span>
        </button>
      </div>

      {/* Filter tabs */}
      <div className="sess-tabs">
        {["ALL", "UPCOMING", "PAST"].map(t => (
          <button
            key={t}
            className={`sess-tab ${tab === t ? "active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t}
            <span className="sess-tab-count">{counts[t]}</span>
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="sess-error">
          {error}
          <button className="sess-retry" onClick={load}>Retry</button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="sess-loading">Loading sessions...</div>
      ) : filtered.length === 0 ? (
        <div className="sess-empty">
          {tab === "ALL"
            ? "No sessions yet. Create one above."
            : `No ${tab.toLowerCase()} sessions.`}
        </div>
      ) : (
        <div className="sess-list">
          {filtered.map(s => (
            <div
              key={s.S_N}
              className="sess-card"
              onClick={() => navigate(`/sessions/${s.S_N}`)}
            >
              <div className="sess-card-left">
                <span className={`sess-type-badge sess-type-${s._type.toLowerCase()}`}>
                  {s._type === "SERVICE" ? "Service" : "Event"}
                </span>
                <div className="sess-card-title">{s._title || s.S_N}</div>
                <div className="sess-card-meta">
                  <span className="sess-card-date">{s._date || "No date"}</span>
                  <span className="sess-card-id">{s.S_N}</span>
                </div>
              </div>

              <div className="sess-card-right">
                <span className={`sess-status sess-status-${s.STATUS.toLowerCase()}`}>
                  {s.STATUS === "PAST" ? "Past" : "Upcoming"}
                </span>
                {s.STATUS === "PAST" && (
                  <div className="sess-att-count">
                    <span className="sess-att-num">{s.TOTAL_ATTENDANCE || 0}</span>
                    <span className="sess-att-label">present</span>
                  </div>
                )}
                <span className="sess-chevron">›</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}