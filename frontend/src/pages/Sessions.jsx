import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import "./Sessions.css";

export default function Sessions() {
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [events, setEvents]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(null); // "service" | "event" | null
  const [tab, setTab]           = useState("ALL"); // ALL | UPCOMING | PAST

  async function load() {
    setLoading(true);
    try {
      const [s, e] = await Promise.all([
        api.get("/api/services"),
        api.get("/api/events"),
      ]);
      setServices(s.data);
      setEvents(e.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(type) {
    setCreating(type);
    try {
      const today = new Date().toISOString().slice(0, 10);
      let res;
      if (type === "service") {
        res = await api.post("/api/services", { date: today });
        navigate(`/sessions/${res.data.service_id}`);
      } else {
        res = await api.post("/api/events", {
          event_title: "New Event", event_date: today
        });
        navigate(`/sessions/${res.data.event_id}`);
      }
    } catch (err) {
      alert("Could not create session. Please try again.");
    } finally {
      setCreating(null);
    }
  }

  // Merge and sort all sessions newest first
  const all = [
    ...services.map(s => ({ ...s, _type: "SERVICE", _date: s.DATE, _title: s.NATURE_OF_SERVICE || s.S_N })),
    ...events.map(e => ({ ...e, _type: "EVENT", _date: e.EVENT_DATE, _title: e.EVENT_TITLE || e.S_N })),
  ].sort((a, b) => (b._date || "").localeCompare(a._date || ""));

  const filtered = all.filter(s =>
    tab === "ALL" || s.STATUS === tab
  );

  return (
    <div className="sess-page">
      <div className="sess-header">
        <div>
          <h1>Services & Events</h1>
          <p className="sess-subtitle">Register a service or event to begin tracking attendance.</p>
        </div>
      </div>

      {/* ── Create buttons ── */}
      <div className="sess-create-row">
        <button
          className={`sess-create-card ${creating === "service" ? "loading" : ""}`}
          onClick={() => handleCreate("service")}
          disabled={!!creating}
        >
          <span className="sess-create-icon">🏛</span>
          <span className="sess-create-label">
            {creating === "service" ? "Creating…" : "Register a Service"}
          </span>
          <span className="sess-create-hint">Sunday, midweek, prayer meeting…</span>
        </button>

        <button
          className={`sess-create-card ${creating === "event" ? "loading" : ""}`}
          onClick={() => handleCreate("event")}
          disabled={!!creating}
        >
          <span className="sess-create-icon">📅</span>
          <span className="sess-create-label">
            {creating === "event" ? "Creating…" : "Register an Event"}
          </span>
          <span className="sess-create-hint">Programs, outreaches, seminars…</span>
        </button>
      </div>

      {/* ── Filter tabs ── */}
      <div className="sess-tabs">
        {["ALL", "UPCOMING", "PAST"].map(t => (
          <button key={t}
            className={`sess-tab ${tab === t ? "active" : ""}`}
            onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {/* ── List ── */}
      {loading ? (
        <div className="sess-loading">Loading sessions…</div>
      ) : filtered.length === 0 ? (
        <div className="sess-empty">No sessions found. Create one above.</div>
      ) : (
        <div className="sess-list">
          {filtered.map(s => (
            <div key={s.S_N} className="sess-card"
              onClick={() => navigate(`/sessions/${s.S_N}`)}>
              <div className="sess-card-left">
                <span className={`sess-type-badge sess-type-${s._type.toLowerCase()}`}>
                  {s._type === "SERVICE" ? "🏛 Service" : "📅 Event"}
                </span>
                <div className="sess-card-title">{s._title || s.S_N}</div>
                <div className="sess-card-date">{s._date}</div>
                <div className="sess-card-id">{s.S_N}</div>
              </div>
              <div className="sess-card-right">
                <span className={`sess-status sess-status-${(s.STATUS||"").toLowerCase()}`}>
                  {s.STATUS}
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