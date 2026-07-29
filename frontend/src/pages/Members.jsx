import { useEffect, useState } from "react";
import api from "../api/axios";
import { SkeletonCard } from "../components/PageLoader";
import "../components/PageLoader.css";
import "./Members.css";

const EMPTY_FORM = {
  full_name: "", phone_number: "", email: "", sex: "",
  marital_status: "", date_of_birth: "", occupation: "",
  residence: "", landmark: "", membership_status: "ACTIVE MEMBER",
  spouse_name: "", no_of_children: "0",
  conversion_date: "", baptism_date: "",
  holy_spirit_received: "NO", holy_spirit_date: "",
  nok_name: "", nok_relationship: "", nok_phone: "",
  photo_url: "", membership_number: "", departments: [],
};

const SEX_OPTIONS        = ["MALE", "FEMALE"];
const MARITAL_OPTIONS    = ["SINGLE", "MARRIED", "DIVORCED", "SEPARATED", "WIDOW/WIDOWER", "SINGLE PARENT"];
const STATUS_OPTIONS     = ["ACTIVE MEMBER", "INACTIVE", "NEW CONVERT", "OFFICER"];
const HS_OPTIONS         = ["YES", "NO", "NOT SURE"];

export default function Members() {
  const [members, setMembers]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [search, setSearch]       = useState("");
  const [showForm, setShowForm]   = useState(false);
  const [showView, setShowView]   = useState(false);
  const [editing, setEditing]     = useState(null);
  const [viewing, setViewing]     = useState(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [deleting, setDeleting]   = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");

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
      full_name:           m.MEMBER_NAME || m.FULL_NAME || "",
      phone_number:        m.PHONE || "",
      email:               m.EMAIL || "",
      sex:                 m.SEX || "",
      marital_status:      m.MARITAL_STATUS || "",
      date_of_birth:       m.DATE_OF_BIRTH || "",
      occupation:          m.OCCUPATION || "",
      residence:           m.RESIDENCE || m.PHYSICAL_ADDRESS || "",
      landmark:            m.LANDMARK || m.AREA_DESCRIPTION || "",
      membership_status:   m.MEMBERSHIP_STATUS || "ACTIVE MEMBER",
      spouse_name:         m.SPOUSE_NAME || "",
      no_of_children:      m.NO_OF_CHILDREN || "0",
      conversion_date:     m.CONVERSION_DATE || "",
      baptism_date:        m.BAPTISM_DATE || "",
      holy_spirit_received: m.HOLY_SPIRIT_RECEIVED || "NO",
      holy_spirit_date:    m.HOLY_SPIRIT_DATE || "",
      nok_name:            m.NOK_NAME || "",
      nok_relationship:    m.NOK_RELATIONSHIP || "",
      nok_phone:           m.NOK_PHONE || "",
      photo_url:           m.PROFILE_PHOTO_URL || m.PHOTO_URL || "",
      membership_number:   m.MEMBERSHIP_NUMBER || "",
      departments:         Array.isArray(m.DEPARTMENTS) ? m.DEPARTMENTS : [],
    });
    setPhotoFile(null);
    setPhotoPreview(m.PROFILE_PHOTO_URL || m.PHOTO_URL || "");
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

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(""); setFormSuccess(""); setSaving(true);
    if (!form.full_name.trim()) {
      setFormError("Full name is required.");
      setSaving(false); return;
    }
    try {
      const payload = { ...form };
      // If a photo was selected, use the preview (base64) as photo_url
      // In production this would upload to Google Drive / Cloudinary first
      if (photoFile && photoPreview) {
        payload.photo_url = photoPreview;
      }
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

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const filtered = members.filter(m => {
    const q = search.toLowerCase();
    return !q ||
      (m.MEMBER_NAME || m.FULL_NAME || "").toLowerCase().includes(q) ||
      (m.PHONE || "").includes(q) ||
      (m.DEPARTMENT_1 || "").toLowerCase().includes(q) ||
      (m.MEMBERSHIP_NUMBER || "").toLowerCase().includes(q);
  });

  return (
    <div className="members-page">
      {/* Header */}
      <div className="members-header">
        <div>
          <h1>Members</h1>
          <p className="members-subtitle">
            {loading ? "Loading..." : `${members.length} member${members.length !== 1 ? "s" : ""} registered`}
          </p>
        </div>
        <button className="members-btn-primary" onClick={openAdd}>+ Add Member</button>
      </div>

      {/* Search */}
      <input className="members-search"
        placeholder="Search name, phone, department, membership number..."
        value={search} onChange={e => setSearch(e.target.value)} />

      {/* Error */}
      {error && (
        <div className="members-error">
          {error}
          <button onClick={load} className="members-retry">Retry</button>
        </div>
      )}

      {/* Loading skeleton */}
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
                {(m.PROFILE_PHOTO_URL || m.PHOTO_URL) ? (
                  <img src={m.PROFILE_PHOTO_URL || m.PHOTO_URL}
                    alt={m.MEMBER_NAME || m.FULL_NAME}
                    className="member-photo"
                    onError={e => { e.target.style.display = "none"; }} />
                ) : (
                  <div className="member-avatar">
                    {((m.MEMBER_NAME || m.FULL_NAME || "?")[0]).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="member-info">
                <div className="member-name">{m.MEMBER_NAME || m.FULL_NAME}</div>
                <div className="member-phone">{m.PHONE || "-"}</div>
                <div className="member-dept">{m.DEPARTMENT_1 || "-"}</div>
                {m.MEMBERSHIP_NUMBER && (
                  <div className="member-number">{m.MEMBERSHIP_NUMBER}</div>
                )}
              </div>
              <div className="member-card-right">
                <span className={`member-status member-status-${(m.MEMBERSHIP_STATUS||"").toLowerCase().replace(/\s+/g,"-")}`}>
                  {m.MEMBERSHIP_STATUS || "-"}
                </span>
                <div className="member-actions" onClick={e => e.stopPropagation()}>
                  <button className="member-btn-edit" onClick={() => openEdit(m)}>Edit</button>
                  <button className="member-btn-delete"
                    onClick={() => handleDelete(m.S_N, m.MEMBER_NAME || m.FULL_NAME)}
                    disabled={deleting === m.S_N}>
                    {deleting === m.S_N ? "..." : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* -- VIEW MODAL ----------------------------------------- */}
      {showView && viewing && (
        <div className="members-overlay" onClick={() => setShowView(false)}>
          <div className="members-modal members-modal-view" onClick={e => e.stopPropagation()}>
            <div className="members-modal-header">
              <h2>Member Profile</h2>
              <div style={{display:"flex",gap:"8px"}}>
                <button className="members-btn-edit-sm" onClick={() => { setShowView(false); openEdit(viewing); }}>Edit</button>
                <button className="members-modal-close" onClick={() => setShowView(false)}>x</button>
              </div>
            </div>
            <div className="members-view-body">
              <div className="members-view-photo-row">
                {(viewing.PROFILE_PHOTO_URL || viewing.PHOTO_URL) ? (
                  <img src={viewing.PROFILE_PHOTO_URL || viewing.PHOTO_URL}
                    alt={viewing.MEMBER_NAME || viewing.FULL_NAME}
                    className="members-view-photo" />
                ) : (
                  <div className="members-view-avatar">
                    {((viewing.MEMBER_NAME || viewing.FULL_NAME || "?")[0]).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="members-view-name">{viewing.MEMBER_NAME || viewing.FULL_NAME}</div>
                  <div className="members-view-number">{viewing.MEMBERSHIP_NUMBER || "No membership number"}</div>
                  <span className={`member-status member-status-${(viewing.MEMBERSHIP_STATUS||"").toLowerCase().replace(/\s+/g,"-")}`}>
                    {viewing.MEMBERSHIP_STATUS}
                  </span>
                </div>
              </div>

              <div className="members-view-grid">
                {[
                  ["Phone",          viewing.PHONE],
                  ["Email",          viewing.EMAIL],
                  ["Sex",            viewing.SEX],
                  ["Marital Status", viewing.MARITAL_STATUS],
                  ["Date of Birth",  viewing.DATE_OF_BIRTH],
                  ["Occupation",     viewing.OCCUPATION],
                  ["Residence",      viewing.RESIDENCE || viewing.PHYSICAL_ADDRESS],
                  ["Area / Landmark",viewing.LANDMARK || viewing.AREA_DESCRIPTION],
                  ["Department",     viewing.DEPARTMENT_1],
                  ["Date Joined",    viewing.DATE_JOINED],
                  ["Spouse Name",    viewing.SPOUSE_NAME],
                  ["No. of Children",viewing.NO_OF_CHILDREN],
                  ["Conversion Date",viewing.CONVERSION_DATE],
                  ["Baptism Date",   viewing.BAPTISM_DATE],
                  ["Holy Spirit",    viewing.HOLY_SPIRIT_RECEIVED],
                  ["H.S. Date",      viewing.HOLY_SPIRIT_DATE],
                ].filter(([,v]) => v && v !== "0").map(([label, val]) => (
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
                    ].filter(([,v]) => v).map(([label, val]) => (
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
                  onClick={() => handleDelete(viewing.S_N, viewing.MEMBER_NAME || viewing.FULL_NAME)}>
                  Delete Member
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -- ADD / EDIT MODAL ----------------------------------- */}
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
                      {form.full_name ? form.full_name[0].toUpperCase() : "?"}
                    </div>
                  )}
                </div>
                <div className="members-photo-actions">
                  <label className="members-photo-btn">
                    Choose Photo
                    <input type="file" accept="image/*" onChange={handlePhotoChange}
                      style={{display:"none"}} />
                  </label>
                  <p className="members-photo-hint">
                    Camera and gallery supported. Max 5MB.
                  </p>
                  {photoPreview && (
                    <button type="button" className="members-photo-remove"
                      onClick={() => { setPhotoPreview(""); setPhotoFile(null); f("photo_url",""); }}>
                      Remove photo
                    </button>
                  )}
                </div>
              </div>

              {/* Personal Info */}
              <div className="members-form-section">Personal Information</div>
              <div className="members-form-row">
                <div className="members-field">
                  <label>Full Name *</label>
                  <input value={form.full_name} onChange={e => f("full_name", e.target.value)}
                    placeholder="Full legal name" required />
                </div>
                <div className="members-field">
                  <label>Membership Number</label>
                  <input value={form.membership_number} onChange={e => f("membership_number", e.target.value)}
                    placeholder="e.g. AFC-UTH-2024-0001" />
                </div>
              </div>
              <div className="members-form-row">
                <div className="members-field">
                  <label>Phone</label>
                  <input value={form.phone_number} onChange={e => f("phone_number", e.target.value)}
                    placeholder="+254..." />
                </div>
                <div className="members-field">
                  <label>Email</label>
                  <input type="email" value={form.email} onChange={e => f("email", e.target.value)}
                    placeholder="email@example.com" />
                </div>
              </div>
              <div className="members-form-row">
                <div className="members-field">
                  <label>Sex</label>
                  <select value={form.sex} onChange={e => f("sex", e.target.value)}>
                    <option value="">-- Select --</option>
                    {SEX_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div className="members-field">
                  <label>Marital Status</label>
                  <select value={form.marital_status} onChange={e => f("marital_status", e.target.value)}>
                    <option value="">-- Select --</option>
                    {MARITAL_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div className="members-form-row">
                <div className="members-field">
                  <label>Date of Birth</label>
                  <input type="date" value={form.date_of_birth} onChange={e => f("date_of_birth", e.target.value)} />
                </div>
                <div className="members-field">
                  <label>Occupation</label>
                  <input value={form.occupation} onChange={e => f("occupation", e.target.value)}
                    placeholder="e.g. Teacher" />
                </div>
              </div>

              {/* Address */}
              <div className="members-form-section">Home Address</div>
              <div className="members-field">
                <label>Physical Address</label>
                <input value={form.residence} onChange={e => f("residence", e.target.value)}
                  placeholder="Street / estate / plot number" />
              </div>
              <div className="members-field">
                <label>Area / Landmark</label>
                <input value={form.landmark} onChange={e => f("landmark", e.target.value)}
                  placeholder="e.g. Kinoo, behind Kinoo Primary School" />
              </div>

              {/* Church Info */}
              <div className="members-form-section">Church Information</div>
              <div className="members-form-row">
                <div className="members-field">
                  <label>Membership Status</label>
                  <select value={form.membership_status} onChange={e => f("membership_status", e.target.value)}>
                    {STATUS_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div className="members-field">
                  <label>Conversion Date</label>
                  <input type="date" value={form.conversion_date} onChange={e => f("conversion_date", e.target.value)} />
                </div>
              </div>
              <div className="members-form-row">
                <div className="members-field">
                  <label>Baptism Date</label>
                  <input type="date" value={form.baptism_date} onChange={e => f("baptism_date", e.target.value)} />
                </div>
                <div className="members-field">
                  <label>Received Holy Spirit</label>
                  <select value={form.holy_spirit_received} onChange={e => f("holy_spirit_received", e.target.value)}>
                    {HS_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              {form.holy_spirit_received === "YES" && (
                <div className="members-field">
                  <label>Holy Spirit Date</label>
                  <input type="date" value={form.holy_spirit_date} onChange={e => f("holy_spirit_date", e.target.value)} />
                </div>
              )}

              {/* Family */}
              <div className="members-form-section">Family</div>
              <div className="members-form-row">
                <div className="members-field">
                  <label>Spouse Name</label>
                  <input value={form.spouse_name} onChange={e => f("spouse_name", e.target.value)}
                    placeholder="If married" />
                </div>
                <div className="members-field">
                  <label>Number of Children</label>
                  <input type="number" min="0" value={form.no_of_children}
                    onChange={e => f("no_of_children", e.target.value)} />
                </div>
              </div>

              {/* Next of Kin */}
              <div className="members-form-section">Next of Kin</div>
              <div className="members-form-row">
                <div className="members-field">
                  <label>NOK Name</label>
                  <input value={form.nok_name} onChange={e => f("nok_name", e.target.value)}
                    placeholder="Full name" />
                </div>
                <div className="members-field">
                  <label>Relationship</label>
                  <input value={form.nok_relationship} onChange={e => f("nok_relationship", e.target.value)}
                    placeholder="e.g. Spouse, Sibling" />
                </div>
              </div>
              <div className="members-field">
                <label>NOK Phone</label>
                <input value={form.nok_phone} onChange={e => f("nok_phone", e.target.value)}
                  placeholder="+254..." />
              </div>

              {/* Actions */}
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