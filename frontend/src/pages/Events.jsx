import { useEffect, useState } from "react";
import api from "../api/axios";
import "./Services.css";

const GROUP_OPTIONS = [
  "ALL MEMBERS","YOUTH","CHILDREN","MEN","WOMEN","CHOIR",
  "MARRIED COUPLES","SINGLES","NEW CONVERTS","OTHERS"
];

const EMPTY = {
  event_title: "", event_description: "", event_date: "", event_time: "",
  event_location: "", targeted_group: "", pastor_in_charge: "",
  phone: "", church_branch: "AFC UTHIRU"
};

export default function Events() {
  const [events, setEvents]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState(null);
  const [form, setForm]           = useState(EMPTY);
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState("");
  const [search, setSearch]       = useState("");
  const [filterStatus, setFilter] = useState("ALL");

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get("/api/events");
      setEvents(data);
    } catch { setError("Could not load events."); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function openNew() { setEditing(null); setForm(EMPTY); setFormError(""); setShowForm(true); }

  function openEdit(ev) {
    setEditing(ev.S_N);
    setForm({
      event_title: ev.EVENT_TITLE || "", event_description: ev.EVENT_DESCRIPTION || "",
      event_date: ev.EVENT_DATE || "", event_time: ev.EVENT_TIME || "",
      event_location: ev.EVENT_LOCATION || "", targeted_group: ev.TARGETED_GROUP || "",
      pastor_in_charge: ev.PASTOR_IN_CHARGE || "", phone: ev.PHONE || "",
      church_branch: ev.CHURCH_BRANCH || "AFC UTHIRU"
    });
    setFormError(""); setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault(); setFormError("");
    if (!form.event_title.trim()) { setFormError("Event title is required."); return; }
    if (!form.event_date) { setFormError("Event date is required."); return; }
    setSaving(true);
    try {
      if (editing) await api.put(`/api/events/${editing}`, form);
      else await api.post("/api/events", form);
      setShowForm(false); load();
    } catch (err) {
      setFormError(err?.response?.data?.detail || "Could not save event.");
    } finally { setSaving(false); }
  }

  async function handleDelete(sn) {
    if (!window.confirm("Delete this event?")) return;
    try { await api.delete(`/api/events/${sn}`); load(); }
    catch { alert("Could not delete event."); }
  }

  const filtered = events.filter(ev => {
    const matchStatus = filterStatus === "ALL" || ev.STATUS === filterStatus;
    const q = search.toLowerCase();
    const matchSearch = !q || (ev.EVENT_TITLE||"").toLowerCase().includes(q) ||
      (ev.EVENT_DATE||"").includes(q) || (ev.EVENT_LOCATION||"").toLowerCase().includes(q) ||
      (ev.S_N||"").toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  return (
    <div className="svc-page">
      <div className="svc-header">
        <div>
          <h1>Events & Programs</h1>
          <p className="svc-subtitle">Register past events or plan upcoming ones.</p>
        </div>
        <button className="svc-btn-primary" onClick={openNew}>+ New Event</button>
      </div>

      <div className="svc-toolbar">
        <input className="svc-search" placeholder="Search title, date, location…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <div className="svc-filter-tabs">
          {["ALL","PAST","UPCOMING"].map(f => (
            <button key={f} className={`svc-tab ${filterStatus===f?"active":""}`}
              onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
      </div>

      {error && <div className="svc-error">{error}</div>}
      {loading ? <div className="svc-loading">Loading events…</div> : (
        filtered.length === 0 ? (
          <div className="svc-empty">No events found. Click <strong>+ New Event</strong> to add one.</div>
        ) : (
          <div className="svc-table-wrap">
            <table className="svc-table">
              <thead><tr>
                <th>ID</th><th>Title</th><th>Date</th><th>Location</th>
                <th>Attendance</th><th>Status</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {filtered.map(ev => (
                  <tr key={ev.S_N}>
                    <td className="svc-mono">{ev.S_N}</td>
                    <td><strong>{ev.EVENT_TITLE}</strong></td>
                    <td>{ev.EVENT_DATE}</td>
                    <td>{ev.EVENT_LOCATION || "—"}</td>
                    <td className="svc-count">{ev.TOTAL_ATTENDANCE || 0}</td>
                    <td><span className={`svc-badge svc-badge-${(ev.STATUS||"").toLowerCase()}`}>
                      {ev.STATUS || "—"}
                    </span></td>
                    <td className="svc-actions">
                      <button className="svc-btn-sm" onClick={() => openEdit(ev)}>Edit</button>
                      {ev.STATUS === "PAST" && (
                        <a className="svc-btn-sm svc-btn-attend"
                          href={`/attendance/EVENT/${ev.S_N}`}>Attendance</a>
                      )}
                      <a className="svc-btn-sm svc-btn-report"
                        href={`/reports/event/${ev.S_N}`} target="_blank" rel="noreferrer">
                        Report
                      </a>
                      <button className="svc-btn-sm svc-btn-del"
                        onClick={() => handleDelete(ev.S_N)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {showForm && (
        <div className="svc-overlay" onClick={() => setShowForm(false)}>
          <div className="svc-modal" onClick={e => e.stopPropagation()}>
            <div className="svc-modal-header">
              <h2>{editing ? "Edit Event" : "New Event"}</h2>
              <button className="svc-modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit} className="svc-form">
              {formError && <div className="svc-form-error">{formError}</div>}

              <div className="svc-form-section">Event Details</div>
              <div className="svc-field svc-field-full">
                <label>Event Title *</label>
                <input value={form.event_title}
                  onChange={e => setForm({...form, event_title: e.target.value})}
                  placeholder="e.g. Annual Thanksgiving Service" required />
              </div>
              <div className="svc-field svc-field-full">
                <label>Description</label>
                <input value={form.event_description}
                  onChange={e => setForm({...form, event_description: e.target.value})}
                  placeholder="Brief description of the event" />
              </div>
              <div className="svc-row">
                <div className="svc-field">
                  <label>Date *</label>
                  <input type="date" value={form.event_date}
                    onChange={e => setForm({...form, event_date: e.target.value})} required />
                </div>
                <div className="svc-field">
                  <label>Time</label>
                  <input type="time" value={form.event_time}
                    onChange={e => setForm({...form, event_time: e.target.value})} />
                </div>
              </div>
              <div className="svc-row">
                <div className="svc-field">
                  <label>Location</label>
                  <input value={form.event_location}
                    onChange={e => setForm({...form, event_location: e.target.value})}
                    placeholder="Venue / address" />
                </div>
                <div className="svc-field">
                  <label>Targeted Group</label>
                  <select value={form.targeted_group}
                    onChange={e => setForm({...form, targeted_group: e.target.value})}>
                    <option value="">— Select —</option>
                    {GROUP_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div className="svc-row">
                <div className="svc-field">
                  <label>Pastor / Minister in Charge</label>
                  <input value={form.pastor_in_charge}
                    onChange={e => setForm({...form, pastor_in_charge: e.target.value})}
                    placeholder="Name" />
                </div>
                <div className="svc-field">
                  <label>Contact Phone</label>
                  <input value={form.phone}
                    onChange={e => setForm({...form, phone: e.target.value})}
                    placeholder="+254…" />
                </div>
              </div>

              <div className="svc-form-actions">
                <button type="button" className="svc-btn-ghost"
                  onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="svc-btn-primary" disabled={saving}>
                  {saving ? "Saving…" : editing ? "Update Event" : "Create Event"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}