import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import "./Services.css";

const NATURE_OPTIONS = [
  "SUNDAY SERVICE", "MID-WEEK SERVICE", "PRAYER MEETING",
  "DELIVERANCE SERVICE", "SPECIAL SERVICE", "REVIVAL",
  "YOUTH SERVICE", "CHILDREN SERVICE", "OTHER"
];

const EMPTY = {
  date: "", nature_of_service: "", opening_time: "",
  closing_time: "", preacher: "", scripture_reading: "",
  sermon_topic: "", church_branch: "AFC UTHIRU"
};

export default function Services() {
  const navigate = useNavigate();
  const [services, setServices]   = useState([]);
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
      const { data } = await api.get("/api/services");
      setServices(data);
    } catch { setError("Could not load services."); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null); setForm(EMPTY); setFormError(""); setShowForm(true);
  }

  function openEdit(s) {
    setEditing(s.S_N);
    setForm({
      date: s.DATE || "", nature_of_service: s.NATURE_OF_SERVICE || "",
      opening_time: s.OPENING_TIME || "", closing_time: s.CLOSING_TIME || "",
      preacher: s.PREACHER || "", scripture_reading: s.SCRIPTURE_READING || "",
      sermon_topic: s.SERMON_TOPIC || "", church_branch: s.CHURCH_BRANCH || "AFC UTHIRU"
    });
    setFormError(""); setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault(); setFormError("");
    if (!form.date) { setFormError("Date is required."); return; }
    setSaving(true);
    try {
      if (editing) await api.put(`/api/services/${editing}`, form);
      else await api.post("/api/services", form);
      setShowForm(false); load();
    } catch (err) {
      setFormError(err?.response?.data?.detail || "Could not save service.");
    } finally { setSaving(false); }
  }

  async function handleDelete(sn) {
    if (!window.confirm("Delete this service record?")) return;
    try { await api.delete(`/api/services/${sn}`); load(); }
    catch { alert("Could not delete service."); }
  }

  const filtered = services.filter(s => {
    const matchStatus = filterStatus === "ALL" || s.STATUS === filterStatus;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (s.DATE || "").includes(q) ||
      (s.NATURE_OF_SERVICE || "").toLowerCase().includes(q) ||
      (s.PREACHER || "").toLowerCase().includes(q) ||
      (s.S_N || "").toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  return (
    <div className="svc-page">
      <div className="svc-header">
        <div>
          <h1>Services</h1>
          <p className="svc-subtitle">Register past services or plan upcoming ones.</p>
        </div>
        <button className="svc-btn-primary" onClick={openNew}>+ New Service</button>
      </div>

      <div className="svc-toolbar">
        <input className="svc-search" placeholder="Search date, preacher, type..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <div className="svc-filter-tabs">
          {["ALL", "PAST", "UPCOMING"].map(f => (
            <button key={f} className={`svc-tab ${filterStatus === f ? "active" : ""}`}
              onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
      </div>

      {error && <div className="svc-error">{error}</div>}

      {loading ? (
        <div className="svc-loading">Loading services...</div>
      ) : filtered.length === 0 ? (
        <div className="svc-empty">No services found. Click <strong>+ New Service</strong> to add one.</div>
      ) : (
        <div className="svc-table-wrap">
          <table className="svc-table">
            <thead>
              <tr>
                <th>ID</th><th>Date</th><th>Type</th><th>Preacher</th>
                <th>Attendance</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.S_N}>
                  <td className="svc-mono">{s.S_N}</td>
                  <td>{s.DATE}</td>
                  <td>{s.NATURE_OF_SERVICE || "-"}</td>
                  <td>{s.PREACHER || "-"}</td>
                  <td className="svc-count">{s.TOTAL_ATTENDANCE || 0}</td>
                  <td>
                    <span className={`svc-badge svc-badge-${(s.STATUS || "").toLowerCase()}`}>
                      {s.STATUS || "-"}
                    </span>
                  </td>
                  <td className="svc-actions">
                    <button className="svc-btn-sm" onClick={() => openEdit(s)}>Edit</button>
                    {s.STATUS === "PAST" && (
                      <button className="svc-btn-sm svc-btn-attend"
                        onClick={() => navigate(`/attendance/SERVICE/${s.S_N}`)}>
                        Attendance
                      </button>
                    )}
                    <button className="svc-btn-sm svc-btn-del"
                      onClick={() => handleDelete(s.S_N)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="svc-overlay" onClick={() => setShowForm(false)}>
          <div className="svc-modal" onClick={e => e.stopPropagation()}>
            <div className="svc-modal-header">
              <h2>{editing ? "Edit Service" : "New Service"}</h2>
              <button className="svc-modal-close" onClick={() => setShowForm(false)}>x</button>
            </div>
            <form onSubmit={handleSubmit} className="svc-form">
              {formError && <div className="svc-form-error">{formError}</div>}

              <div className="svc-form-section">Service Details</div>
              <div className="svc-row">
                <div className="svc-field">
                  <label>Date *</label>
                  <input type="date" value={form.date}
                    onChange={e => setForm({ ...form, date: e.target.value })} required />
                </div>
                <div className="svc-field">
                  <label>Nature of Service</label>
                  <select value={form.nature_of_service}
                    onChange={e => setForm({ ...form, nature_of_service: e.target.value })}>
                    <option value="">-- Select --</option>
                    {NATURE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div className="svc-row">
                <div className="svc-field">
                  <label>Opening Time</label>
                  <input type="time" value={form.opening_time}
                    onChange={e => setForm({ ...form, opening_time: e.target.value })} />
                </div>
                <div className="svc-field">
                  <label>Closing Time</label>
                  <input type="time" value={form.closing_time}
                    onChange={e => setForm({ ...form, closing_time: e.target.value })} />
                </div>
              </div>
              <div className="svc-row">
                <div className="svc-field">
                  <label>Preacher</label>
                  <input value={form.preacher}
                    onChange={e => setForm({ ...form, preacher: e.target.value })}
                    placeholder="Name of preacher" />
                </div>
                <div className="svc-field">
                  <label>Scripture Reading</label>
                  <input value={form.scripture_reading}
                    onChange={e => setForm({ ...form, scripture_reading: e.target.value })}
                    placeholder="e.g. John 3:16" />
                </div>
              </div>
              <div className="svc-field">
                <label>Sermon Topic</label>
                <input value={form.sermon_topic}
                  onChange={e => setForm({ ...form, sermon_topic: e.target.value })}
                  placeholder="Title of the sermon" />
              </div>

              <div className="svc-form-actions">
                <button type="button" className="svc-btn-ghost"
                  onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="svc-btn-primary" disabled={saving}>
                  {saving ? "Saving..." : editing ? "Update Service" : "Create Service"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}