import { useEffect, useState } from "react";
import api from "../api/axios";
import { SkeletonCard } from "../components/PageLoader";
import "../components/PageLoader.css";
import "./Members.css";

// Matches MemberDetails_db columns exactly:
// S_N | PROFILE_PHOTO_URL | MEMBER_NAME | PHYSICAL_ADDRESS | AREA_DESCRIPTION |
// HOME_CHURCH | PHONE | EMAIL | SEX | MARITAL_STATUS | DATE_OF_BIRTH |
// OCCUPATION | DEPARTMENT_1 | DATE_JOINED | MEMBERSHIP_STATUS | MEMBERSHIP_NUMBER |
// SPOUSE_NAME | CONVERSION_DATE | NO_OF_CHILDREN | BAPTISM_DATE |
// HOLY_SPIRIT_RECEIVED | HOLY_SPIRIT_DATE | NOK_NAME | NOK_RELATIONSHIP |
// NOK_PHONE | NOK_ADDRESS | RECORD_OFFICER | LAST_UPDATED

const EMPTY_FORM = {
  MEMBER_NAME:          "",
  PHYSICAL_ADDRESS:     "",
  AREA_DESCRIPTION:     "",
  HOME_CHURCH:          "AFC UTHIRU",
  PHONE:                "",
  EMAIL:                "",
  SEX:                  "",
  MARITAL_STATUS:       "",
  DATE_OF_BIRTH:        "",
  OCCUPATION:           "",
  DATE_JOINED:          "",
  MEMBERSHIP_STATUS:    "ACTIVE MEMBER",
  MEMBERSHIP_NUMBER:    "",
  SPOUSE_NAME:          "",
  CONVERSION_DATE:      "",
  NO_OF_CHILDREN:       "0",
  BAPTISM_DATE:         "",
  HOLY_SPIRIT_RECEIVED: "NO",
  HOLY_SPIRIT_DATE:     "",
  NOK_NAME:             "",
  NOK_RELATIONSHIP:     "",
  NOK_PHONE:            "",
  NOK_ADDRESS:          "",
  photo_url:            "",
  departments:          [],
};

const SEX_OPTIONS     = ["MALE", "FEMALE"];
const MARITAL_OPTIONS = ["SINGLE", "MARRIED", "DIVORCED", "SEPARATED", "WIDOW/WIDOWER", "SINGLE PARENT"];
const STATUS_OPTIONS  = ["ACTIVE MEMBER", "INACTIVE", "NEW CONVERT", "OFFICER"];
const HS_OPTIONS      = ["YES", "NO", "NOT SURE"];

export default function Members() {
  const [members, setMembers]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [search, setSearch]           = useState("");
  const [showForm, setShowForm]       = useState(false);
  const [showView, setShowView]       = useState(false);
  const [editing, setEditing]         = useState(null);
  const [viewing, setViewing]         = useState(null);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [saving, setSaving]           = useState(false);
  const [formError, setFormError]     = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [deleting, setDeleting]       = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoFile, setPhotoFile]     = useState(null);

  async function load() {
    setLoading(true); setError("");
    try {
      const { data } = await api.get("/api/members");
      setMembers(data);
    } catch {
      setError("Could not load members. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setPhotoFile(null);
    setPhotoPreview("");
    setFormError("");
    setFormSuccess("");
    setShowForm(true);
  }

  function openEdit(m) {
    setEditing(m.S_N);
    setForm({
      MEMBER_NAME:          m.MEMBER_NAME || "",
      PHYSICAL_ADDRESS:     m.PHYSICAL_ADDRESS || "",
      AREA_DESCRIPTION:     m.AREA_DESCRIPTION || "",
      HOME_CHURCH:          m.HOME_CHURCH || "AFC UTHIRU",
      PHONE:                m.PHONE || "",
      EMAIL:                m.EMAIL || "",
      SEX:                  m.SEX || "",
      MARITAL_STATUS:       m.MARITAL_STATUS || "",
      DATE_OF_BIRTH:        m.DATE_OF_BIRTH || "",
      OCCUPATION:           m.OCCUPATION || "",
      DATE_JOINED:          m.DATE_JOINED || "",
      MEMBERSHIP_STATUS:    m.MEMBERSHIP_STATUS || "ACTIVE MEMBER",
      MEMBERSHIP_NUMBER:    m.MEMBERSHIP_NUMBER || "",
      SPOUSE_NAME:          m.SPOUSE_NAME || "",
      CONVERSION_DATE:      m.CONVERSION_DATE || "",
      NO_OF_CHILDREN:       m.NO_OF_CHILDREN || "0",
      BAPTISM_DATE:         m.BAPTISM_DATE || "",
      HOLY_SPIRIT_RECEIVED: m.HOLY_SPIRIT_RECEIVED || "NO",
      HOLY_SPIRIT_DATE:     m.HOLY_SPIRIT_DATE || "",
      NOK_NAME:             m.NOK_NAME || "",
      NOK_RELATIONSHIP:     m.NOK_RELATIONSHIP || "",
      NOK_PHONE:            m.NOK_PHONE || "",
      NOK_ADDRESS:          m.NOK_ADDRESS || "",
      photo_url:            m.PROFILE_PHOTO_URL || "",
      departments:          Array.isArray(m.DEPARTMENTS) ? m.DEPARTMENTS : [],
    });
    setPhotoFile(null);
    setPhotoPreview(m.PROFILE_PHOTO_URL || "");
    setFormError("");
    setFormSuccess("");
    setShowForm(true);
  }

  function openView(m) {
    setViewing(m);
    setShowView(true);
  }

  function handlePhotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = ev => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(""); setFormSuccess(""); setSaving(true);
    if (!form.MEMBER_NAME.trim()) {
      setFormError("Full name is required.");
      setSaving(false); return;
    }
    try {
      // Build payload matching MemberModel in main.py exactly
      const payload = {
        membership_number:    form.MEMBERSHIP_NUMBER,
        full_name:            form.MEMBER_NAME,
        phone_number:         form.PHONE,
        email:                form.EMAIL,
        sex:                  form.SEX,
        marital_status:       form.MARITAL_STATUS,
        date_of_birth:        form.DATE_OF_BIRTH,
        residence:            form.PHYSICAL_ADDRESS,
        landmark:             form.AREA_DESCRIPTION,
        home_church:          form.HOME_CHURCH,
        occupation:           form.OCCUPATION,
        membership_status:    form.MEMBERSHIP_STATUS,
        spouse_name:          form.SPOUSE_NAME,
        no_of_children:       form.NO_OF_CHILDREN,
        conversion_date:      form.CONVERSION_DATE,
        baptism_date:         form.BAPTISM_DATE,
        holy_spirit_received: form.HOLY_SPIRIT_RECEIVED,
        holy_spirit_date:     form.HOLY_SPIRIT_DATE,
        nok_name:             form.NOK_NAME,
        nok_relationship:     form.NOK_RELATIONSHIP,
        nok_phone:            form.NOK_PHONE,
        nok_address:          form.NOK_ADDRESS,
        photo_url:            photoPreview || form.photo_url,
        departments:          form.departments,
      };

      if (editing) {
        await api.put(`/api/members/${editing}`, payload);
        setFormSuccess("Member updated successfully.");
      } else {
        await api.post("/api/members", payload);
        setFormSuccess("Member registered successfully.");
      }
      load();
      setTimeout(() => { setShowForm(false); setFormSuccess(""); }, 1200);
    } catch (err) {
      setFormError(err?.response?.data?.detail || "Could not save member. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(sn, name) {
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
    setDeleting(sn);
    try {
      await api.delete(`/api/members/${sn}`);
      load();
      if (showView) setShowView(false);
    } catch {
      alert("Could not delete member.");
    } finally {
      setDeleting(null);
    }
  }

  const filtered = members.filter(m => {
    const q = search.toLowerCase();
    return !q ||
      (m.MEMBER_NAME || "").toLowerCase().includes(q) ||
      (m.PHONE || "").includes(q) ||
      (m.DEPARTMENT_1 || "").toLowerCase().includes(q) ||
      (m.MEMBERSHIP_NUMBER || "").toLowerCase().includes(q);
  });

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <h1>Members</h1>
          <p className="members-subtitle">
            {loading ? "Loading..." : `${members.length} member${members.length !== 1 ? "s" : ""} registered`}
          </p>
        </div>
        <button className="members-btn-primary" onClick={openAdd}>+ Add Member</button>
      </div>

      <input className="members-search"
        placeholder="Search name, phone, department, membership number..."
        value={search} onChange={e => setSearch(e.target.value)} />

      {error && (
        <div className="members-error">
          {error}
          <button onClick={load} className="members-retry">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="members-skeleton-list">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} lines={3} avatar />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="members-empty">
          <div className="members-empty-icon">&#128101;</div>
          <div className="members-empty-title">
            {search ? `No results for "${search}"` : "No members yet"}
          </div>
          <div className="members-empty-hint">
            {search ? "Try a different name or phone number." : "Click + Add Member to register the first member."}
          </div>
        </div>
      ) : (
        <div className="members-list">
          {filtered.map(m => (
            <div key={m.S_N} className="member-card" onClick={() => openView(m)}>
              <div className="member-photo-wrap">
                {m.PROFILE_PHOTO_URL ? (
                  <img src={m.PROFILE_PHOTO_URL} alt={m.MEMBER_NAME}
                    className="member-photo"
                    onError={e => { e.target.style.display = "none"; }} />
                ) : (
                  <div className="member-avatar">
                    {(m.MEMBER_NAME || "?")[0].toUpperCase()}
                  </div>
                )}
              </div>
              <div className="member-info">
                <div className="member-name">{m.MEMBER_NAME}</div>
                <div className="member-phone">{m.PHONE || "-"}</div>
                <div className="member-dept">{m.DEPARTMENT_1 || "-"}</div>
                {m.MEMBERSHIP_NUMBER && (
                  <div className="member-number">{m.MEMBERSHIP_NUMBER}</div>
                )}
              </div>
              <div className="member-card-right">
                <span className={`member-status member-status-${(m.MEMBERSHIP_STATUS || "").toLowerCase().replace(/\s+/g, "-")}`}>
                  {m.MEMBERSHIP_STATUS || "-"}
                </span>
                <div className="member-actions" onClick={e => e.stopPropagation()}>
                  <button className="member-btn-edit" onClick={() => openEdit(m)}>Edit</button>
                  <button className="member-btn-delete"
                    onClick={() => handleDelete(m.S_N, m.MEMBER_NAME)}
                    disabled={deleting === m.S_N}>
                    {deleting === m.S_N ? "..." : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* VIEW MODAL */}
      {showView && viewing && (
        <div className="members-overlay" onClick={() => setShowView(false)}>
          <div className="members-modal members-modal-view" onClick={e => e.stopPropagation()}>
            <div className="members-modal-header">
              <h2>Member Profile</h2>
              <div style={{ display: "flex", gap: "8px" }}>
                <button className="members-btn-edit-sm"
                  onClick={() => { setShowView(false); openEdit(viewing); }}>Edit</button>
                <button className="members-modal-close" onClick={() => setShowView(false)}>x</button>
              </div>
            </div>
            <div className="members-view-body">
              <div className="members-view-photo-row">
                {viewing.PROFILE_PHOTO_URL ? (
                  <img src={viewing.PROFILE_PHOTO_URL} alt={viewing.MEMBER_NAME}
                    className="members-view-photo" />
                ) : (
                  <div className="members-view-avatar">
                    {(viewing.MEMBER_NAME || "?")[0].toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="members-view-name">{viewing.MEMBER_NAME}</div>
                  <div className="members-view-number">{viewing.MEMBERSHIP_NUMBER || "No membership number"}</div>
                  <span className={`member-status member-status-${(viewing.MEMBERSHIP_STATUS || "").toLowerCase().replace(/\s+/g, "-")}`}>
                    {viewing.MEMBERSHIP_STATUS}
                  </span>
                </div>
              </div>

              <div className="members-view-grid">
                {[
                  ["Phone",           viewing.PHONE],
                  ["Email",           viewing.EMAIL],
                  ["Sex",             viewing.SEX],
                  ["Marital Status",  viewing.MARITAL_STATUS],
                  ["Date of Birth",   viewing.DATE_OF_BIRTH],
                  ["Occupation",      viewing.OCCUPATION],
                  ["Physical Address",viewing.PHYSICAL_ADDRESS],
                  ["Area / Landmark", viewing.AREA_DESCRIPTION],
                  ["Home Church",     viewing.HOME_CHURCH],
                  ["Department",      viewing.DEPARTMENT_1],
                  ["Date Joined",     viewing.DATE_JOINED],
                  ["Spouse Name",     viewing.SPOUSE_NAME],
                  ["No. of Children", viewing.NO_OF_CHILDREN],
                  ["Conversion Date", viewing.CONVERSION_DATE],
                  ["Baptism Date",    viewing.BAPTISM_DATE],
                  ["Holy Spirit",     viewing.HOLY_SPIRIT_RECEIVED],
                  ["H.S. Date",       viewing.HOLY_SPIRIT_DATE],
                ].filter(([, v]) => v && v !== "0").map(([label, val]) => (
                  <div key={label} className="members-view-row">
                    <span className="members-view-label">{label}</span>
                    <span className="members-view-value">{val}</span>
                  </div>
                ))}
              </div>

              {(viewing.NOK_NAME || viewing.NOK_PHONE) && (
                <div className="members-view-section">
                  <div className="members-view-section-title">Next of Kin</div>
                  <div className="members-view-grid">
                    {[
                      ["Name",         viewing.NOK_NAME],
                      ["Relationship", viewing.NOK_RELATIONSHIP],
                      ["Phone",        viewing.NOK_PHONE],
                      ["Address",      viewing.NOK_ADDRESS],
                    ].filter(([, v]) => v).map(([label, val]) => (
                      <div key={label} className="members-view-row">
                        <span className="members-view-label">{label}</span>
                        <span className="members-view-value">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="members-view-footer">
                <button className="members-btn-delete-lg"
                  onClick={() => handleDelete(viewing.S_N, viewing.MEMBER_NAME)}>
                  Delete Member
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT MODAL */}
      {showForm && (
        <div className="members-overlay" onClick={() => setShowForm(false)}>
          <div className="members-modal" onClick={e => e.stopPropagation()}>
            <div className="members-modal-header">
              <h2>{editing ? "Edit Member" : "Add New Member"}</h2>
              <button className="members-modal-close" onClick={() => setShowForm(false)}>x</button>
            </div>

            <form onSubmit={handleSubmit} className="members-form">
              {formError   && <div className="members-form-error">{formError}</div>}
              {formSuccess && <div className="members-form-success">{formSuccess}</div>}

              {/* Photo */}
              <div className="members-form-section">Profile Photo</div>
              <div className="members-photo-upload">
                <div className="members-photo-preview">
                  {photoPreview ? (
                    <img src={photoPreview} alt="Preview" className="members-photo-img" />
                  ) : (
                    <div className="members-photo-placeholder">
                      {form.MEMBER_NAME ? form.MEMBER_NAME[0].toUpperCase() : "?"}
                    </div>
                  )}
                </div>
                <div className="members-photo-actions">
                  <label className="members-photo-btn">
                    Choose Photo
                    <input type="file" accept="image/*" onChange={handlePhotoChange}
                      style={{ display: "none" }} />
                  </label>
                  <p className="members-photo-hint">Camera and gallery supported.</p>
                  {photoPreview && (
                    <button type="button" className="members-photo-remove"
                      onClick={() => { setPhotoPreview(""); setPhotoFile(null); f("photo_url", ""); }}>
                      Remove photo
                    </button>
                  )}
                </div>
              </div>

              {/* Personal */}
              <div className="members-form-section">Personal Information</div>
              <div className="members-form-row">
                <div className="members-field">
                  <label>Full Name *</label>
                  <input value={form.MEMBER_NAME}
                    onChange={e => f("MEMBER_NAME", e.target.value)}
                    placeholder="Full legal name" required />
                </div>
                <div className="members-field">
                  <label>Membership Number</label>
                  <input value={form.MEMBERSHIP_NUMBER}
                    onChange={e => f("MEMBERSHIP_NUMBER", e.target.value)}
                    placeholder="e.g. AFC-UTH-2024-0001" />
                </div>
              </div>
              <div className="members-form-row">
                <div className="members-field">
                  <label>Phone</label>
                  <input value={form.PHONE} onChange={e => f("PHONE", e.target.value)}
                    placeholder="+254..." />
                </div>
                <div className="members-field">
                  <label>Email</label>
                  <input type="email" value={form.EMAIL}
                    onChange={e => f("EMAIL", e.target.value)}
                    placeholder="email@example.com" />
                </div>
              </div>
              <div className="members-form-row">
                <div className="members-field">
                  <label>Sex</label>
                  <select value={form.SEX} onChange={e => f("SEX", e.target.value)}>
                    <option value="">-- Select --</option>
                    {SEX_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div className="members-field">
                  <label>Marital Status</label>
                  <select value={form.MARITAL_STATUS}
                    onChange={e => f("MARITAL_STATUS", e.target.value)}>
                    <option value="">-- Select --</option>
                    {MARITAL_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div className="members-form-row">
                <div className="members-field">
                  <label>Date of Birth</label>
                  <input type="date" value={form.DATE_OF_BIRTH}
                    onChange={e => f("DATE_OF_BIRTH", e.target.value)} />
                </div>
                <div className="members-field">
                  <label>Occupation</label>
                  <input value={form.OCCUPATION}
                    onChange={e => f("OCCUPATION", e.target.value)}
                    placeholder="e.g. Teacher" />
                </div>
              </div>

              {/* Address */}
              <div className="members-form-section">Home Address</div>
              <div className="members-field">
                <label>Physical Address</label>
                <input value={form.PHYSICAL_ADDRESS}
                  onChange={e => f("PHYSICAL_ADDRESS", e.target.value)}
                  placeholder="Street / estate / plot number" />
              </div>
              <div className="members-field">
                <label>Area / Landmark</label>
                <input value={form.AREA_DESCRIPTION}
                  onChange={e => f("AREA_DESCRIPTION", e.target.value)}
                  placeholder="e.g. Kinoo, behind Kinoo Primary School" />
              </div>
              <div className="members-field">
                <label>Home / Sending Church</label>
                <input value={form.HOME_CHURCH}
                  onChange={e => f("HOME_CHURCH", e.target.value)}
                  placeholder="e.g. AFC Uthiru" />
              </div>

              {/* Church Info */}
              <div className="members-form-section">Church Information</div>
              <div className="members-form-row">
                <div className="members-field">
                  <label>Membership Status</label>
                  <select value={form.MEMBERSHIP_STATUS}
                    onChange={e => f("MEMBERSHIP_STATUS", e.target.value)}>
                    {STATUS_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div className="members-field">
                  <label>Date Joined</label>
                  <input type="date" value={form.DATE_JOINED}
                    onChange={e => f("DATE_JOINED", e.target.value)} />
                </div>
              </div>
              <div className="members-form-row">
                <div className="members-field">
                  <label>Conversion Date</label>
                  <input type="date" value={form.CONVERSION_DATE}
                    onChange={e => f("CONVERSION_DATE", e.target.value)} />
                </div>
                <div className="members-field">
                  <label>Baptism Date</label>
                  <input type="date" value={form.BAPTISM_DATE}
                    onChange={e => f("BAPTISM_DATE", e.target.value)} />
                </div>
              </div>
              <div className="members-form-row">
                <div className="members-field">
                  <label>Received Holy Spirit</label>
                  <select value={form.HOLY_SPIRIT_RECEIVED}
                    onChange={e => f("HOLY_SPIRIT_RECEIVED", e.target.value)}>
                    {HS_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                {form.HOLY_SPIRIT_RECEIVED === "YES" && (
                  <div className="members-field">
                    <label>Holy Spirit Date</label>
                    <input type="date" value={form.HOLY_SPIRIT_DATE}
                      onChange={e => f("HOLY_SPIRIT_DATE", e.target.value)} />
                  </div>
                )}
              </div>

              {/* Family */}
              <div className="members-form-section">Family</div>
              <div className="members-form-row">
                <div className="members-field">
                  <label>Spouse Name</label>
                  <input value={form.SPOUSE_NAME}
                    onChange={e => f("SPOUSE_NAME", e.target.value)}
                    placeholder="If married" />
                </div>
                <div className="members-field">
                  <label>Number of Children</label>
                  <input type="number" min="0" value={form.NO_OF_CHILDREN}
                    onChange={e => f("NO_OF_CHILDREN", e.target.value)} />
                </div>
              </div>

              {/* Next of Kin */}
              <div className="members-form-section">Next of Kin</div>
              <div className="members-form-row">
                <div className="members-field">
                  <label>NOK Name</label>
                  <input value={form.NOK_NAME}
                    onChange={e => f("NOK_NAME", e.target.value)}
                    placeholder="Full name" />
                </div>
                <div className="members-field">
                  <label>Relationship</label>
                  <input value={form.NOK_RELATIONSHIP}
                    onChange={e => f("NOK_RELATIONSHIP", e.target.value)}
                    placeholder="e.g. Spouse, Sibling" />
                </div>
              </div>
              <div className="members-form-row">
                <div className="members-field">
                  <label>NOK Phone</label>
                  <input value={form.NOK_PHONE}
                    onChange={e => f("NOK_PHONE", e.target.value)}
                    placeholder="+254..." />
                </div>
                <div className="members-field">
                  <label>NOK Address</label>
                  <input value={form.NOK_ADDRESS}
                    onChange={e => f("NOK_ADDRESS", e.target.value)}
                    placeholder="NOK physical address" />
                </div>
              </div>

              <div className="members-form-actions">
                <button type="button" className="members-btn-ghost"
                  onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="members-btn-primary" disabled={saving}>
                  {saving ? (
                    <><span className="btn-spinner" />{editing ? "Updating..." : "Registering..."}</>
                  ) : (editing ? "Update Member" : "Register Member")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}