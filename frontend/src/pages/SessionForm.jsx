import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/axios";
import "./SessionForm.css";

const NATURE_OPTIONS = [
  "SUNDAY SERVICE","MID-WEEK SERVICE","PRAYER MEETING",
  "DELIVERANCE SERVICE","SPECIAL SERVICE","REVIVAL",
  "YOUTH SERVICE","CHILDREN SERVICE","OTHER"
];
const GROUP_OPTIONS = [
  "ALL MEMBERS","YOUTH","CHILDREN","MEN","WOMEN","CHOIR",
  "MARRIED COUPLES","SINGLES","NEW CONVERTS","OTHERS"
];

export default function SessionForm() {
  const { sessionId } = useParams();
  const navigate      = useNavigate();
  const isService     = sessionId?.startsWith("SVC-");

  const [session, setSession]       = useState(null);
  const [loadingSession, setLS]     = useState(true);
  const [sessionError, setSessErr]  = useState("");
  const [form, setForm]             = useState({});
  const [savingForm, setSavingForm] = useState(false);
  const [formSaved, setFormSaved]   = useState(false);
  const [formError, setFormError]   = useState("");
  const [showAtt, setShowAtt]       = useState(false);
  const [roster, setRoster]         = useState([]);
  const [loadingRoster, setLR]      = useState(false);
  const [rosterError, setRE]        = useState("");
  const [marked, setMarked]         = useState(new Set());
  const [original, setOriginal]     = useState(new Set());
  const [savingAtt, setSavingAtt]   = useState(false);
  const [attSaved, setAttSaved]     = useState(false);
  const [counts, setCounts]         = useState(null);
  const [search, setSearch]         = useState("");
  const [showReport, setShowReport] = useState(false);
  const [report, setReport]         = useState(null);
  const [loadingReport, setLRep]    = useState(false);
  const attPanelRef                 = useRef(null);

  async function loadSession() {
    setLS(true); setSessErr("");
    try {
      const url = isService ? `/api/services/${sessionId}` : `/api/events/${sessionId}`;
      const { data } = await api.get(url);
      setSession(data);
      if (isService) {
        setForm({
          date: data.DATE || "",
          nature_of_service: data.NATURE_OF_SERVICE || "",
          opening_time: data.OPENING_TIME || "",
          closing_time: data.CLOSING_TIME || "",
          preacher: data.PREACHER || "",
          scripture_reading: data.SCRIPTURE_READING || "",
          sermon_topic: data.SERMON_TOPIC || "",
          church_branch: data.CHURCH_BRANCH || "AFC UTHIRU",
        });
      } else {
        setForm({
          event_title: data.EVENT_TITLE || "",
          event_description: data.EVENT_DESCRIPTION || "",
          event_date: data.EVENT_DATE || "",
          event_time: data.EVENT_TIME || "",
          event_location: data.EVENT_LOCATION || "",
          targeted_group: data.TARGETED_GROUP || "",
          pastor_in_charge: data.PASTOR_IN_CHARGE || "",
          phone: data.PHONE || "",
          church_branch: data.CHURCH_BRANCH || "AFC UTHIRU",
        });
      }
      const men      = parseInt(data.ATTENDANCE_MEN || 0);
      const women    = parseInt(data.ATTENDANCE_WOMEN || 0);
      const youth    = parseInt(data.ATTENDANCE_YOUTH || 0);
      const children = parseInt(data.ATTENDANCE_CHILDREN || 0);
      const total    = men + women + youth + children;
      if (total > 0) setCounts({ MEN: men, WOMEN: women, YOUTH: youth, CHILDREN: children, TOTAL: total });
    } catch (err) {
      setSessErr("Could not load this session. It may not exist or the server is waking up.");
    } finally {
      setLS(false);
    }
  }

  useEffect(() => { loadSession(); }, [sessionId]);

  async function saveDetails(e) {
    e.preventDefault(); setFormError(""); setSavingForm(true); setFormSaved(false);
    try {
      if (isService) await api.put(`/api/services/${sessionId}`, form);
      else await api.put(`/api/events/${sessionId}`, form);
      setFormSaved(true);
      loadSession();
    } catch (err) {
      setFormError(err?.response?.data?.detail || "Could not save details. Please try again.");
    } finally { setSavingForm(false); }
  }

  async function openAttendance() {
    setShowAtt(true); setLR(true); setRE(""); setAttSaved(false);
    try {
      const st = isService ? "SERVICE" : "EVENT";
      const { data } = await api.get(`/api/attendance/roster/${st}/${sessionId}`);
      setRoster(data.roster || []);
      const presentSet = new Set((data.roster || []).filter(m => m.is_present).map(m => m.member_sn));
      setMarked(new Set(presentSet));
      setOriginal(new Set(presentSet));
    } catch (err) {
      const msg = err?.response?.data?.detail || "Could not load roster.";
      setRE(msg);
      setRoster([]);
    } finally {
      setLR(false);
      setTimeout(() => attPanelRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }

  function toggleMember(sn) {
    setMarked(prev => {
      const next = new Set(prev);
      if (next.has(sn)) next.delete(sn); else next.add(sn);
      return next;
    });
    setAttSaved(false);
  }

  async function saveAttendance() {
    setSavingAtt(true); setAttSaved(false); setRE("");
    try {
      const st       = isService ? "SERVICE" : "EVENT";
      const toMark   = roster.filter(m => marked.has(m.member_sn) && !original.has(m.member_sn)).map(m => m.member_sn);
      const toUnmark = roster.filter(m => !marked.has(m.member_sn) && original.has(m.member_sn)).map(m => m.member_sn);
      if (toMark.length > 0) {
        const { data } = await api.post("/api/attendance/mark", {
          session_type: st, session_id: sessionId, member_sns: toMark
        });
        if (data.counts) setCounts(data.counts);
      }
      for (const sn of toUnmark) {
        const { data } = await api.delete("/api/attendance/unmark", {
          data: { session_type: st, session_id: sessionId, member_sn: sn }
        });
        if (data.counts) setCounts(data.counts);
      }
      setAttSaved(true);
      setOriginal(new Set(marked));
      loadSession();
    } catch (err) {
      setRE(err?.response?.data?.detail || "Could not save attendance. Please try again.");
    } finally { setSavingAtt(false); }
  }

  async function generateReport() {
    setLRep(true); setShowReport(true);
    try {
      const url = isService ? `/api/reports/service/${sessionId}` : `/api/reports/event/${sessionId}`;
      const { data } = await api.get(url);
      setReport(data);
    } catch (err) {
      setReport(null);
    } finally { setLRep(false); }
  }

  const sessionDate  = isService ? form.date : form.event_date;
  const isUpcoming   = sessionDate ? new Date(sessionDate) > new Date() : false;
  const hasAttendance = counts && counts.TOTAL > 0;
  const filteredRoster = roster.filter(m => {
    const q = search.toLowerCase();
    return !q || (m.member_name||"").toLowerCase().includes(q) || (m.phone||"").includes(q);
  });

  // ── Loading state ──────────────────────────────────────────
  if (loadingSession) return (
    <div className="sf-page">
      <div className="sf-loading-page">
        <div className="sf-loading-spinner" />
        <p>Loading session…</p>
      </div>
    </div>
  );

  // ── Error state ────────────────────────────────────────────
  if (sessionError) return (
    <div className="sf-page">
      <button className="sf-back" onClick={() => navigate("/sessions")}>← Back</button>
      <div className="sf-error-page">
        <div className="sf-error-icon">⚠️</div>
        <p>{sessionError}</p>
        <button className="sf-btn-primary" onClick={loadSession}>Try again</button>
      </div>
    </div>
  );

  return (
    <div className="sf-page">
      {/* Header */}
      <div className="sf-header">
        <button className="sf-back" onClick={() => navigate("/sessions")}>← Back</button>
        <div className="sf-header-info">
          <div className="sf-session-id">{sessionId}</div>
          <h1>{isService ? "Service" : "Event"} Details</h1>
        </div>
        <span className={`sf-status sf-status-${(session?.STATUS||"").toLowerCase()}`}>
          {session?.STATUS || ""}
        </span>
      </div>

      {/* Attendance summary bar */}
      {hasAttendance && (
        <div className="sf-att-summary">
          <div className="sf-att-summary-title">✅ Attendance recorded</div>
          <div className="sf-att-summary-counts">
            {[["Men", counts.MEN], ["Women", counts.WOMEN],
              ["Youth", counts.YOUTH], ["Children", counts.CHILDREN],
              ["Total", counts.TOTAL]].map(([l, v]) => (
              <div className="sf-att-count-item" key={l}>
                <span className="sf-att-count-num">{v}</span>
                <span className="sf-att-count-label">{l}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 1 — Details */}
      <div className="sf-section">
        <div className="sf-section-title">
          <span className="sf-section-num">1</span>
          {isService ? "Service Details" : "Event Details"}
        </div>
        <form onSubmit={saveDetails} className="sf-form">
          {formError   && <div className="sf-form-error">{formError}</div>}
          {formSaved   && <div className="sf-form-success">Details saved successfully.</div>}
          {isService ? (
            <>
              <div className="sf-row">
                <div className="sf-field">
                  <label>Date</label>
                  <input type="date" value={form.date||""}
                    onChange={e => setForm({...form, date: e.target.value})} />
                </div>
                <div className="sf-field">
                  <label>Nature of Service</label>
                  <select value={form.nature_of_service||""}
                    onChange={e => setForm({...form, nature_of_service: e.target.value})}>
                    <option value="">-- Select --</option>
                    {NATURE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div className="sf-row">
                <div className="sf-field">
                  <label>Opening Time</label>
                  <input type="time" value={form.opening_time||""}
                    onChange={e => setForm({...form, opening_time: e.target.value})} />
                </div>
                <div className="sf-field">
                  <label>Closing Time</label>
                  <input type="time" value={form.closing_time||""}
                    onChange={e => setForm({...form, closing_time: e.target.value})} />
                </div>
              </div>
              <div className="sf-row">
                <div className="sf-field">
                  <label>Preacher</label>
                  <input value={form.preacher||""}
                    onChange={e => setForm({...form, preacher: e.target.value})}
                    placeholder="Name of preacher" />
                </div>
                <div className="sf-field">
                  <label>Scripture Reading</label>
                  <input value={form.scripture_reading||""}
                    onChange={e => setForm({...form, scripture_reading: e.target.value})}
                    placeholder="e.g. John 3:16" />
                </div>
              </div>
              <div className="sf-field">
                <label>Sermon Topic</label>
                <input value={form.sermon_topic||""}
                  onChange={e => setForm({...form, sermon_topic: e.target.value})}
                  placeholder="Title of the sermon" />
              </div>
            </>
          ) : (
            <>
              <div className="sf-field">
                <label>Event Title</label>
                <input value={form.event_title||""}
                  onChange={e => setForm({...form, event_title: e.target.value})}
                  placeholder="Event name" />
              </div>
              <div className="sf-field">
                <label>Description</label>
                <input value={form.event_description||""}
                  onChange={e => setForm({...form, event_description: e.target.value})}
                  placeholder="Brief description" />
              </div>
              <div className="sf-row">
                <div className="sf-field">
                  <label>Date</label>
                  <input type="date" value={form.event_date||""}
                    onChange={e => setForm({...form, event_date: e.target.value})} />
                </div>
                <div className="sf-field">
                  <label>Time</label>
                  <input type="time" value={form.event_time||""}
                    onChange={e => setForm({...form, event_time: e.target.value})} />
                </div>
              </div>
              <div className="sf-row">
                <div className="sf-field">
                  <label>Location</label>
                  <input value={form.event_location||""}
                    onChange={e => setForm({...form, event_location: e.target.value})}
                    placeholder="Venue / address" />
                </div>
                <div className="sf-field">
                  <label>Targeted Group</label>
                  <select value={form.targeted_group||""}
                    onChange={e => setForm({...form, targeted_group: e.target.value})}>
                    <option value="">-- Select --</option>
                    {GROUP_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div className="sf-row">
                <div className="sf-field">
                  <label>Pastor in Charge</label>
                  <input value={form.pastor_in_charge||""}
                    onChange={e => setForm({...form, pastor_in_charge: e.target.value})}
                    placeholder="Name" />
                </div>
                <div className="sf-field">
                  <label>Contact Phone</label>
                  <input value={form.phone||""}
                    onChange={e => setForm({...form, phone: e.target.value})}
                    placeholder="+254..." />
                </div>
              </div>
            </>
          )}
          <div className="sf-form-actions">
            <button type="submit" className="sf-btn-primary" disabled={savingForm}>
              {savingForm ? (
                <span className="sf-btn-loading"><span className="sf-btn-spinner"/>Saving…</span>
              ) : "Save Details"}
            </button>
          </div>
        </form>
      </div>

      {/* SECTION 2 — Attendance */}
      <div className="sf-section" ref={attPanelRef}>
        <div className="sf-section-title">
          <span className="sf-section-num">2</span>
          Attendance
          {isUpcoming && <span className="sf-locked-badge">🔒 Locked until {sessionDate}</span>}
        </div>

        {isUpcoming ? (
          <div className="sf-upcoming-msg">
            This session is scheduled for a future date. Attendance marking will be available once the date arrives.
          </div>
        ) : !showAtt ? (
          <button className="sf-btn-attend" onClick={openAttendance}>
            {hasAttendance ? "✏️ Edit Attendance" : "Mark Attendance"}
          </button>
        ) : (
          <div className="sf-att-panel">
            {rosterError && (
              <div className="sf-att-error">
                <span>⚠️ {rosterError}</span>
                <button className="sf-att-retry" onClick={openAttendance}>Retry</button>
              </div>
            )}
            {attSaved && (
              <div className="sf-form-success">
                ✅ Attendance saved — {counts?.TOTAL || 0} present
                ({counts?.MEN||0}M · {counts?.WOMEN||0}W · {counts?.YOUTH||0}Y · {counts?.CHILDREN||0}C)
              </div>
            )}

            {loadingRoster ? (
              <div className="sf-att-loading-state">
                <div className="sf-loading-spinner" />
                <p>Loading member roster…</p>
              </div>
            ) : (
              <>
                <div className="sf-att-toolbar">
                  <input className="sf-att-search" placeholder="Search by name or phone…"
                    value={search} onChange={e => setSearch(e.target.value)} />
                  <button className="sf-btn-ghost" onClick={() => { setMarked(new Set(filteredRoster.map(m=>m.member_sn))); setAttSaved(false); }}>Select all</button>
                  <button className="sf-btn-ghost" onClick={() => { setMarked(new Set()); setAttSaved(false); }}>Clear</button>
                  <button className="sf-btn-primary" onClick={saveAttendance} disabled={savingAtt}>
                    {savingAtt ? <span className="sf-btn-loading"><span className="sf-btn-spinner"/>Saving…</span> : `Save (${marked.size})`}
                  </button>
                  <button className="sf-btn-ghost" onClick={() => setShowAtt(false)}>Close</button>
                </div>

                {!rosterError && roster.length === 0 ? (
                  <div className="sf-att-empty">
                    <div className="sf-att-empty-icon">👥</div>
                    <div className="sf-att-empty-title">No members found</div>
                    <div className="sf-att-empty-hint">
                      Add members to the system first, then come back to mark attendance.
                    </div>
                  </div>
                ) : filteredRoster.length === 0 && search ? (
                  <div className="sf-att-empty">
                    <div className="sf-att-empty-title">No results for "{search}"</div>
                    <div className="sf-att-empty-hint">Try a different name or phone number.</div>
                  </div>
                ) : (
                  <div className="sf-att-roster">
                    {filteredRoster.map(m => {
                      const isP = marked.has(m.member_sn);
                      return (
                        <div key={m.member_sn}
                          className={`sf-att-card ${isP ? "present" : ""}`}
                          onClick={() => toggleMember(m.member_sn)}>
                          <div className="sf-att-photo-wrap">
                            {m.profile_photo_url ? (
                              <img src={m.profile_photo_url} alt={m.member_name}
                                className="sf-att-photo"
                                onError={e => { e.target.style.display="none"; }} />
                            ) : (
                              <div className="sf-att-avatar">
                                {(m.member_name||"?")[0].toUpperCase()}
                              </div>
                            )}
                            {isP && <div className="sf-att-check">✓</div>}
                          </div>
                          <div className="sf-att-info">
                            <div className="sf-att-name">{m.member_name}</div>
                            <div className="sf-att-phone">{m.phone || "-"}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="sf-att-footer">
                  <button className="sf-btn-primary sf-btn-save-lg"
                    onClick={saveAttendance} disabled={savingAtt}>
                    {savingAtt
                      ? <span className="sf-btn-loading"><span className="sf-btn-spinner"/>Saving…</span>
                      : `Save Attendance (${marked.size} present)`}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* SECTION 3 — Report */}
      <div className="sf-section">
        <div className="sf-section-title">
          <span className="sf-section-num">3</span>
          Report
        </div>
        {isUpcoming ? (
          <p className="sf-report-hint">Report will be available after the session date.</p>
        ) : !hasAttendance ? (
          <p className="sf-report-hint">Mark and save attendance first to generate a report.</p>
        ) : (
          <button className="sf-btn-report" onClick={generateReport} disabled={loadingReport}>
            {loadingReport
              ? <span className="sf-btn-loading"><span className="sf-btn-spinner"/>Loading…</span>
              : "Generate Report"}
          </button>
        )}
      </div>

      {/* Report modal */}
      {showReport && (
        <div className="sf-report-overlay" onClick={() => setShowReport(false)}>
          <div className="sf-report-modal" onClick={e => e.stopPropagation()}>
            <div className="sf-report-header no-print">
              <h2>Report — {sessionId}</h2>
              <div className="sf-report-header-actions">
                <button className="sf-btn-primary" onClick={() => window.print()}>Print / Save PDF</button>
                <button className="sf-btn-ghost" onClick={() => setShowReport(false)}>Close</button>
              </div>
            </div>
            {loadingReport ? (
              <div className="sf-att-loading-state">
                <div className="sf-loading-spinner" />
                <p>Generating report…</p>
              </div>
            ) : !report ? (
              <div className="sf-form-error" style={{margin:"24px"}}>Could not load report. Please try again.</div>
            ) : (
              <div className="sf-report-body">
                <div className="sf-report-church">
                  <div className="sf-report-church-name">APOSTOLIC FAITH CHURCH — UTHIRU</div>
                  <div className="sf-report-church-sub">
                    {isService ? "SERVICE REPORT" : "EVENT REPORT"} | {sessionId}
                  </div>
                </div>
                <div className="sf-report-grid">
                  {isService ? (
                    Object.entries({
                      "Date": report.service_details?.date,
                      "Nature": report.service_details?.nature,
                      "Opening Time": report.service_details?.opening_time,
                      "Closing Time": report.service_details?.closing_time,
                      "Preacher": report.service_details?.preacher,
                      "Scripture": report.service_details?.scripture,
                      "Sermon Topic": report.service_details?.sermon_topic,
                      "Recorded By": report.service_details?.record_officer,
                    }).map(([k,v]) => v ? (
                      <div key={k} className="sf-report-detail-row">
                        <span className="sf-report-detail-label">{k}</span>
                        <span className="sf-report-detail-value">{v}</span>
                      </div>
                    ) : null)
                  ) : (
                    Object.entries({
                      "Event": report.event_details?.title,
                      "Date": report.event_details?.date,
                      "Time": report.event_details?.time,
                      "Location": report.event_details?.location,
                      "Group": report.event_details?.targeted_group,
                      "Pastor": report.event_details?.pastor,
                    }).map(([k,v]) => v ? (
                      <div key={k} className="sf-report-detail-row">
                        <span className="sf-report-detail-label">{k}</span>
                        <span className="sf-report-detail-value">{v}</span>
                      </div>
                    ) : null)
                  )}
                </div>
                <div className="sf-report-section-title">Attendance Summary</div>
                <div className="sf-report-counts">
                  {[["Men", report.attendance_summary?.men],
                    ["Women", report.attendance_summary?.women],
                    ["Youth", report.attendance_summary?.youth],
                    ["Children", report.attendance_summary?.children],
                    ["Total", report.attendance_summary?.total]].map(([l,v]) => (
                    <div key={l} className={`sf-report-count-box ${l==="Total"?"total":""}`}>
                      <div className="sf-report-count-num">{v||0}</div>
                      <div className="sf-report-count-label">{l}</div>
                    </div>
                  ))}
                </div>
                <div className="sf-report-section-title">
                  Attendees ({report.attendees?.length || 0})
                </div>
                {report.attendees?.length === 0 ? (
                  <p style={{color:"#94A3B8",fontSize:"13px"}}>No attendance records found.</p>
                ) : (
                  <table className="sf-report-table">
                    <thead><tr><th>#</th><th>Name</th><th>Phone</th><th>Department</th></tr></thead>
                    <tbody>
                      {(report.attendees||[]).map((a,i) => (
                        <tr key={i}>
                          <td>{i+1}</td>
                          <td>{a.member_name}</td>
                          <td>{a.phone}</td>
                          <td>{a.department}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}