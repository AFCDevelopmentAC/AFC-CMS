import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/axios";
import "./AttendancePage.css";

export default function AttendancePage() {
  const { sessionType, sessionId } = useParams();
  const navigate = useNavigate();

  const [roster, setRoster]       = useState([]);
  const [session, setSession]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [search, setSearch]       = useState("");
  const [marked, setMarked]       = useState(new Set());
  const [counts, setCounts]       = useState(null);

  async function load() {
    setLoading(true); setError("");
    try {
      const { data } = await api.get(`/api/attendance/roster/${sessionType}/${sessionId}`);
      setSession(data);
      setRoster(data.roster || []);
      const initialMarked = new Set(
        (data.roster || []).filter(m => m.is_present).map(m => m.member_sn)
      );
      setMarked(initialMarked);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(detail || "Could not load attendance roster.");
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [sessionId, sessionType]);

  function toggle(sn) {
    setMarked(prev => {
      const next = new Set(prev);
      if (next.has(sn)) next.delete(sn); else next.add(sn);
      return next;
    });
    setSaved(false);
  }

  function selectAll() {
    setMarked(new Set(filtered.map(m => m.member_sn)));
    setSaved(false);
  }

  function clearAll() {
    setMarked(new Set());
    setSaved(false);
  }

  async function saveAttendance() {
    setSaving(true); setSaved(false);
    try {
      // Mark present
      const toMark = roster.filter(m => marked.has(m.member_sn) && !m.is_present)
                           .map(m => m.member_sn);
      // Unmark those removed
      const toUnmark = roster.filter(m => !marked.has(m.member_sn) && m.is_present)
                             .map(m => m.member_sn);

      if (toMark.length > 0) {
        const { data } = await api.post("/api/attendance/mark", {
          session_type: sessionType, session_id: sessionId, member_sns: toMark
        });
        setCounts(data.counts);
      }
      for (const sn of toUnmark) {
        await api.delete("/api/attendance/unmark", {
          data: { session_type: sessionType, session_id: sessionId, member_sn: sn }
        });
      }
      setSaved(true);
      // Reload to sync is_present flags
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not save attendance.");
    } finally { setSaving(false); }
  }

  const filtered = roster.filter(m => {
    const q = search.toLowerCase();
    return !q || (m.member_name || "").toLowerCase().includes(q) ||
      (m.phone || "").includes(q) || (m.department || "").toLowerCase().includes(q);
  });

  const presentCount = marked.size;
  const totalCount   = roster.length;

  return (
    <div className="att-page">
      <div className="att-header">
        <button className="att-back" onClick={() => navigate(-1)}>← Back</button>
        <div className="att-header-info">
          <h1>Attendance — {sessionType}</h1>
          <div className="att-session-id">{sessionId}</div>
          {session && (
            <div className="att-session-meta">
              {session.session_date} {session.session_title && `· ${session.session_title}`}
            </div>
          )}
        </div>
        <div className="att-counts-pill">
          <span className="att-count-num">{presentCount}</span>
          <span className="att-count-sep">/</span>
          <span className="att-count-total">{totalCount}</span>
          <span className="att-count-label">present</span>
        </div>
      </div>

      {counts && (
        <div className="att-summary-bar">
          {[["Men", counts.MEN], ["Women", counts.WOMEN],
            ["Youth", counts.YOUTH], ["Children", counts.CHILDREN],
            ["Total", counts.TOTAL]].map(([l, v]) => (
            <div className="att-summary-item" key={l}>
              <span className="att-summary-val">{v}</span>
              <span className="att-summary-label">{l}</span>
            </div>
          ))}
        </div>
      )}

      {error && <div className="att-error">{error}</div>}

      <div className="att-toolbar">
        <input className="att-search" placeholder="Search name, phone, department…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <button className="att-btn-ghost" onClick={selectAll}>Select all</button>
        <button className="att-btn-ghost" onClick={clearAll}>Clear all</button>
        <button className="att-btn-save" onClick={saveAttendance} disabled={saving}>
          {saving ? "Saving…" : "Save Attendance"}
        </button>
      </div>

      {saved && (
        <div className="att-saved">✓ Attendance saved successfully.</div>
      )}

      {loading ? (
        <div className="att-loading">Loading roster…</div>
      ) : filtered.length === 0 ? (
        <div className="att-empty">No members found.</div>
      ) : (
        <div className="att-roster">
          {filtered.map(m => {
            const isPresent = marked.has(m.member_sn);
            return (
              <div key={m.member_sn}
                className={`att-card ${isPresent ? "att-card-present" : ""}`}
                onClick={() => toggle(m.member_sn)}>
                <div className="att-photo-wrap">
                  {m.profile_photo_url ? (
                    <img src={m.profile_photo_url} alt={m.member_name}
                      className="att-photo" onError={e => { e.target.style.display="none"; }} />
                  ) : (
                    <div className="att-photo-placeholder">
                      {(m.member_name || "?")[0].toUpperCase()}
                    </div>
                  )}
                  {isPresent && <div className="att-check">✓</div>}
                </div>
                <div className="att-info">
                  <div className="att-name">{m.member_name}</div>
                  <div className="att-phone">{m.phone || "—"}</div>
                  <div className="att-dept">{m.department || "—"}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="att-footer-save">
        <button className="att-btn-save att-btn-save-lg"
          onClick={saveAttendance} disabled={saving}>
          {saving ? "Saving…" : `Save Attendance (${presentCount} present)`}
        </button>
      </div>
    </div>
  );
}