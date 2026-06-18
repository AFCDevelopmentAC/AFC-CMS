import { useEffect, useState, useMemo, useRef } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import "./Members.css";

// ── Cloudinary config ─────────────────────────────────────
const CLOUDINARY_CLOUD_NAME = "dlxaqqbks";
const CLOUDINARY_UPLOAD_PRESET = "afc-uploads";
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

const DEPARTMENTS = [
  "BROTHERS UNION",
  "SISTERS UNION",
  "YOUTH DEPARTMENT",
  "PRE-YOUTH DEPARTMENT",
  "SUNDAY SCHOOL",
];

const ALL_DEPARTMENTS = [
  "BROTHERS UNION",
  "SISTERS UNION",
  "YOUTH DEPARTMENT",
  "PRE-YOUTH DEPARTMENT",
  "SUNDAY SCHOOL",
  "PRAISE & WORSHIP",
  "CHURCH SCHOOL",
  "DISCIPLESHIP",
  "WORKERS",
  "CHURCH BOARD",
  "NEW CLASS MEMBERS",
];

const DEPT_BADGE = {
  "BROTHERS UNION": "badge-brothers",
  "SISTERS UNION": "badge-sisters",
  "YOUTH DEPARTMENT": "badge-youth",
  "PRE-YOUTH DEPARTMENT": "badge-preyouth",
  "SUNDAY SCHOOL": "badge-sunday",
};

const DEPT_LABEL = {
  "BROTHERS UNION": "Brothers' Union",
  "SISTERS UNION": "Sisters' Union",
  "YOUTH DEPARTMENT": "Youth",
  "PRE-YOUTH DEPARTMENT": "Pre-Youth",
  "SUNDAY SCHOOL": "Sunday School",
};

const EMPTY_FORM = {
  PROFILE_PHOTO_URL: "",
  MEMBER_NAME: "",
  PHONE: "",
  EMAIL: "",
  PHYSICAL_ADDRESS: "",
  LOCATION_AREA: "",
  HOME_CHURCH: "",
  SEX: "",
  MARITAL_STATUS: "",
  DATE_OF_BIRTH: "",
  OCCUPATION: "",
  SUNDAY_SCHOOL_CLASS: "",
  DATE_JOINED: "",
  MEMBERSHIP_STATUS: "ACTIVE MEMBER",
  SPOUSE_NAME: "",
  CONVERSION_DATE: "",
  NO_OF_CHILDREN: "",
  BAPTISM_DATE: "",
  HOLY_SPIRIT_RECEIVED: "",
  HOLY_SPIRIT_DATE: "",
  MEMBERSHIP_NUMBER: "",
  NOK_NAME: "",
  NOK_RELATIONSHIP: "",
  NOK_PHONE: "",
};

function initials(name = "") {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
}

function ageFromDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d)) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

export default function Members() {
  const { user } = useAuth();
  const isAdmin = user?.is_admin;

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [showList, setShowList] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [photoPreview, setPhotoPreview] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const fileInputRef = useRef(null);

  const [selectedMember, setSelectedMember] = useState(null);

  // Admin department override state
  const [showDeptOverride, setShowDeptOverride] = useState(false);
  const [newDept, setNewDept] = useState("");
  const [deptSaving, setDeptSaving] = useState(false);
  const [deptError, setDeptError] = useState("");

  async function loadMembers() {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/api/members");
      setMembers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err?.response?.data?.detail || "Couldn't load members. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadMembers(); }, []);

  const filtered = useMemo(() => {
    let list = members;
    if (deptFilter !== "ALL") {
      list = list.filter((m) => (m.DEPARTMENT_1 || "").toUpperCase() === deptFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((m) =>
        (m.MEMBER_NAME || "").toLowerCase().includes(q) ||
        (m.PHONE || "").toLowerCase().includes(q) ||
        (m.EMAIL || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [members, search, deptFilter]);

  const deptCounts = useMemo(() => {
    const counts = {};
    DEPARTMENTS.forEach((d) => (counts[d] = 0));
    members.forEach((m) => {
      const d = (m.DEPARTMENT_1 || "").toUpperCase();
      if (counts[d] !== undefined) counts[d]++;
    });
    return counts;
  }, [members]);

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setFormError("");
    setPhotoPreview("");
    setPhotoError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── Photo upload ─────────────────────────────────────────
  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError("");
    if (!file.type.startsWith("image/")) { setPhotoError("Please choose an image file."); return; }
    if (file.size > 8 * 1024 * 1024) { setPhotoError("Image is too large (max 8MB)."); return; }

    setPhotoPreview(URL.createObjectURL(file));
    setUploadingPhoto(true);
    try {
      const data = new FormData();
      data.append("file", file);
      data.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
      const res = await fetch(CLOUDINARY_UPLOAD_URL, { method: "POST", body: data });
      if (!res.ok) throw new Error("Upload failed");
      const json = await res.json();
      updateField("PROFILE_PHOTO_URL", json.secure_url);
      setPhotoPreview(json.secure_url);
    } catch {
      setPhotoError("Photo upload failed. You can try again or skip it.");
      setPhotoPreview("");
      updateField("PROFILE_PHOTO_URL", "");
    } finally {
      setUploadingPhoto(false);
    }
  }

  function removePhoto() {
    setPhotoPreview("");
    updateField("PROFILE_PHOTO_URL", "");
    setPhotoError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── Submit new member ────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(""); setSuccessMsg("");
    if (!form.MEMBER_NAME.trim()) { setFormError("Member name is required."); return; }
    if (uploadingPhoto) { setFormError("Please wait for the photo to finish uploading."); return; }

    setSaving(true);
    try {
      const payload = { ...form };
      if (payload.NO_OF_CHILDREN === "") delete payload.NO_OF_CHILDREN;
      else payload.NO_OF_CHILDREN = parseInt(payload.NO_OF_CHILDREN, 10);
      if (!payload.SUNDAY_SCHOOL_CLASS) delete payload.SUNDAY_SCHOOL_CLASS;
      if (!payload.MEMBERSHIP_NUMBER) delete payload.MEMBERSHIP_NUMBER;

      const res = await api.post("/api/members", payload);
      const dept = res?.data?.department_1;
      setSuccessMsg(`${form.MEMBER_NAME} added${dept ? ` — placed in ${DEPT_LABEL[dept] || dept}` : ""}.`);
      resetForm();
      setShowForm(false);
      loadMembers();
    } catch (err) {
      setFormError(err?.response?.data?.detail || "Couldn't save this member. Check the details and try again.");
    } finally {
      setSaving(false);
    }
  }

  // ── Admin department override ────────────────────────────
  async function handleDeptOverride(e) {
    e.preventDefault();
    setDeptError("");
    if (!newDept) { setDeptError("Please select a department."); return; }
    setDeptSaving(true);
    try {
      // Use PUT to update the member's DEPARTMENT_1 via admin override
      await api.put(`/api/members/${selectedMember.S_N}/department`, { department: newDept });
      setShowDeptOverride(false);
      setNewDept("");
      // Refresh and update selected member
      const res = await api.get("/api/members");
      const updated = res.data;
      setMembers(updated);
      const refreshed = updated.find((m) => String(m.S_N) === String(selectedMember.S_N));
      if (refreshed) setSelectedMember(refreshed);
    } catch (err) {
      setDeptError(err?.response?.data?.detail || "Couldn't update department.");
    } finally {
      setDeptSaving(false);
    }
  }

  const showSundaySchoolClass = useMemo(() => {
    const age = ageFromDob(form.DATE_OF_BIRTH);
    const status = (form.MARITAL_STATUS || "").toUpperCase();
    const married = ["MARRIED", "DIVORCED", "SEPARATED", "WIDOW/WIDOWER", "SINGLE-PARENT"].includes(status);
    return !married && age !== null && age <= 12;
  }, [form.DATE_OF_BIRTH, form.MARITAL_STATUS]);

  return (
    <div className="members-page">
      <header className="members-header">
        <div>
          <h1>Members</h1>
          <p className="members-subtitle">
            {members.length} {members.length === 1 ? "member" : "members"} registered at AFC Uthiru
          </p>
        </div>
        <button className="btn-primary" onClick={() => { setShowForm((s) => !s); setSuccessMsg(""); if (!showForm) resetForm(); }}>
          {showForm ? "Close" : "+ Add member"}
        </button>
      </header>

      {successMsg && <div className="banner banner-success">{successMsg}</div>}

      {/* Department tally strip */}
      <div className="dept-strip">
        <button className={`dept-chip ${deptFilter === "ALL" ? "active" : ""}`} onClick={() => setDeptFilter("ALL")}>
          <span className="dept-chip-count">{members.length}</span>
          <span className="dept-chip-label">All members</span>
        </button>
        {DEPARTMENTS.map((d) => (
          <button key={d} className={`dept-chip ${DEPT_BADGE[d]} ${deptFilter === d ? "active" : ""}`}
            onClick={() => setDeptFilter(deptFilter === d ? "ALL" : d)}>
            <span className="dept-chip-count">{deptCounts[d]}</span>
            <span className="dept-chip-label">{DEPT_LABEL[d]}</span>
          </button>
        ))}
      </div>

      {/* Add member form */}
      {showForm && (
        <div className="member-form-card">
          <h2>Register a new member</h2>
          <p className="form-hint">
            Primary department is assigned automatically from sex, marital status, and date of birth.
            {isAdmin && " As an admin, you can override the department from a member's profile after registration."}
          </p>
          {formError && <div className="banner banner-error">{formError}</div>}

          <form onSubmit={handleSubmit} className="member-form">

            {/* Photo upload */}
            <div className="photo-upload-row">
              <div className="photo-preview">
                {photoPreview ? <img src={photoPreview} alt="Preview" /> : <span>{initials(form.MEMBER_NAME) || "?"}</span>}
                {uploadingPhoto && <div className="photo-uploading-overlay">Uploading…</div>}
              </div>
              <div className="photo-upload-actions">
                <label className="photo-upload-label">
                  <span className="btn-secondary">{photoPreview ? "Change photo" : "Add photo"}</span>
                  {/* No capture attribute — lets the user choose between camera and gallery */}
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} hidden />
                </label>
                {photoPreview && <button type="button" className="link-action" onClick={removePhoto}>Remove</button>}
                <p className="photo-hint">Opens camera or photo gallery. Optional.</p>
                {photoError && <p className="photo-error">{photoError}</p>}
              </div>
            </div>

            <div className="form-grid">

              {/* Personal */}
              <div className="form-section-label span-3">Personal details</div>

              <div className="form-field span-2">
                <label htmlFor="MEMBER_NAME">Full name *</label>
                <input id="MEMBER_NAME" value={form.MEMBER_NAME}
                  onChange={(e) => updateField("MEMBER_NAME", e.target.value)}
                  placeholder="e.g. Joseph Gichimu" required />
              </div>

              <div className="form-field">
                <label htmlFor="SEX">Sex</label>
                <select id="SEX" value={form.SEX} onChange={(e) => updateField("SEX", e.target.value)}>
                  <option value="">Select</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="MARITAL_STATUS">Marital status</label>
                <select id="MARITAL_STATUS" value={form.MARITAL_STATUS}
                  onChange={(e) => updateField("MARITAL_STATUS", e.target.value)}>
                  <option value="">Select</option>
                  <option value="SINGLE">Single</option>
                  <option value="MARRIED">Married</option>
                  <option value="SINGLE-PARENT">Single parent</option>
                  <option value="DIVORCED">Divorced</option>
                  <option value="SEPARATED">Separated</option>
                  <option value="WIDOW/WIDOWER">Widow/Widower</option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="DATE_OF_BIRTH">Date of birth</label>
                <input id="DATE_OF_BIRTH" type="date" value={form.DATE_OF_BIRTH}
                  onChange={(e) => updateField("DATE_OF_BIRTH", e.target.value)} />
              </div>

              {showSundaySchoolClass && (
                <div className="form-field">
                  <label htmlFor="SUNDAY_SCHOOL_CLASS">Sunday School class</label>
                  <select id="SUNDAY_SCHOOL_CLASS" value={form.SUNDAY_SCHOOL_CLASS}
                    onChange={(e) => updateField("SUNDAY_SCHOOL_CLASS", e.target.value)}>
                    <option value="">Select</option>
                    <option value="JUNIOR">Junior (0–7 yrs)</option>
                    <option value="SENIOR">Senior (8–12 yrs)</option>
                  </select>
                </div>
              )}

              <div className="form-field">
                <label htmlFor="OCCUPATION">Occupation</label>
                <input id="OCCUPATION" value={form.OCCUPATION}
                  onChange={(e) => updateField("OCCUPATION", e.target.value)}
                  placeholder="e.g. Teacher" />
              </div>

              <div className="form-field">
                <label htmlFor="PHONE">Phone</label>
                <input id="PHONE" value={form.PHONE}
                  onChange={(e) => updateField("PHONE", e.target.value)}
                  placeholder="07XX XXX XXX" />
              </div>

              <div className="form-field">
                <label htmlFor="EMAIL">Email</label>
                <input id="EMAIL" type="email" value={form.EMAIL}
                  onChange={(e) => updateField("EMAIL", e.target.value)}
                  placeholder="name@example.com" />
              </div>

              {/* Home address */}
              <div className="form-section-label span-3">Home address</div>

              <div className="form-field span-2">
                <label htmlFor="PHYSICAL_ADDRESS">Physical address</label>
                <input id="PHYSICAL_ADDRESS" value={form.PHYSICAL_ADDRESS}
                  onChange={(e) => updateField("PHYSICAL_ADDRESS", e.target.value)}
                  placeholder="Plot / house number / street" />
              </div>

              <div className="form-field span-3">
                <label htmlFor="LOCATION_AREA">Location / area description</label>
                <input id="LOCATION_AREA" value={form.LOCATION_AREA}
                  onChange={(e) => updateField("LOCATION_AREA", e.target.value)}
                  placeholder="e.g. Kinoo, behind Kinoo Primary School" />
              </div>

              {/* Church info */}
              <div className="form-section-label span-3">Church information</div>

              <div className="form-field">
                <label htmlFor="HOME_CHURCH">Home church</label>
                <input id="HOME_CHURCH" value={form.HOME_CHURCH}
                  onChange={(e) => updateField("HOME_CHURCH", e.target.value)}
                  placeholder="e.g. AFC Uthiru" />
              </div>

              <div className="form-field">
                <label htmlFor="DATE_JOINED">Date joined</label>
                <input id="DATE_JOINED" type="date" value={form.DATE_JOINED}
                  onChange={(e) => updateField("DATE_JOINED", e.target.value)} />
              </div>

              <div className="form-field">
                <label htmlFor="MEMBERSHIP_STATUS">Membership status</label>
                <select id="MEMBERSHIP_STATUS" value={form.MEMBERSHIP_STATUS}
                  onChange={(e) => updateField("MEMBERSHIP_STATUS", e.target.value)}>
                  <option value="MEMBER">Active member</option>
                  <option value="NEW CONVERT">New convert</option>
                  <option value="VISITOR">Visitor</option>
                </select>
              </div>
        

              <div className="form-field">
                <label htmlFor="MEMBERSHIP_NUMBER">Membership number</label>
                <input id="MEMBERSHIP_NUMBER" value={form.MEMBERSHIP_NUMBER}
                  onChange={(e) => updateField("MEMBERSHIP_NUMBER", e.target.value)}
                  placeholder="Leave blank if not yet issued" />
              </div>

              <div className="form-field">
                <label htmlFor="CONVERSION_DATE">Date of conversion</label>
                <input id="CONVERSION_DATE" type="date" value={form.CONVERSION_DATE}
                  onChange={(e) => updateField("CONVERSION_DATE", e.target.value)} />
              </div>

              <div className="form-field">
                <label htmlFor="BAPTISM_DATE">Baptism date</label>
                <input id="BAPTISM_DATE" type="date" value={form.BAPTISM_DATE}
                  onChange={(e) => updateField("BAPTISM_DATE", e.target.value)} />
              </div>

              <div className="form-field">
                <label htmlFor="HOLY_SPIRIT_RECEIVED">Received Holy Spirit?</label>
                <select id="HOLY_SPIRIT_RECEIVED" value={form.HOLY_SPIRIT_RECEIVED}
                  onChange={(e) => updateField("HOLY_SPIRIT_RECEIVED", e.target.value)}>
                  <option value="">Select</option>
                  <option value="YES">Yes</option>
                  <option value="NO">No</option>
                  <option value="NOT SURE">Not sure</option>
                </select>
              </div>

              {form.HOLY_SPIRIT_RECEIVED === "YES" && (
                <div className="form-field">
                  <label htmlFor="HOLY_SPIRIT_DATE">Date received Holy Spirit</label>
                  <input id="HOLY_SPIRIT_DATE" type="date" value={form.HOLY_SPIRIT_DATE}
                    onChange={(e) => updateField("HOLY_SPIRIT_DATE", e.target.value)} />
                </div>
              )}

              {/* Family */}
              <div className="form-section-label span-3">Family</div>

              <div className="form-field">
                <label htmlFor="SPOUSE_NAME">Spouse's name</label>
                <input id="SPOUSE_NAME" value={form.SPOUSE_NAME}
                  onChange={(e) => updateField("SPOUSE_NAME", e.target.value)} />
              </div>

              <div className="form-field">
                <label htmlFor="NO_OF_CHILDREN">Number of children</label>
                <input id="NO_OF_CHILDREN" type="number" min="0" value={form.NO_OF_CHILDREN}
                  onChange={(e) => updateField("NO_OF_CHILDREN", e.target.value)} />
              </div>

              {/* Next of kin */}
              <div className="form-section-label span-3">Next of kin <span className="section-hint">— for follow-up if member is unreachable</span></div>

              <div className="form-field">
                <label htmlFor="NOK_NAME">Full name</label>
                <input id="NOK_NAME" value={form.NOK_NAME}
                  onChange={(e) => updateField("NOK_NAME", e.target.value)}
                  placeholder="e.g. Mary Kamu" />
              </div>

              <div className="form-field">
                <label htmlFor="NOK_RELATIONSHIP">Relationship</label>
                <select id="NOK_RELATIONSHIP" value={form.NOK_RELATIONSHIP}
                  onChange={(e) => updateField("NOK_RELATIONSHIP", e.target.value)}>
                  <option value="">Select</option>
                  <option value="SPOUSE">Spouse</option>
                  <option value="PARENT">Parent</option>
                  <option value="SIBLING">Sibling</option>
                  <option value="CHILD">Child</option>
                  <option value="RELATIVE">Other relative</option>
                  <option value="FRIEND">Friend</option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="NOK_PHONE">Phone number</label>
                <input id="NOK_PHONE" value={form.NOK_PHONE}
                  onChange={(e) => updateField("NOK_PHONE", e.target.value)}
                  placeholder="07XX XXX XXX" />
              </div>

            </div>

            <div className="form-actions">
              <button type="button" className="btn-secondary"
                onClick={() => { setShowForm(false); resetForm(); }} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save member"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Members list toggle */}
      {error && <div className="banner banner-error">{error}</div>}

      {!showList ? (
        <div className="members-summary-cta">
          <p className="cta-hint">
            {loading
              ? "Loading member data…"
              : members.length === 0
              ? "No members registered yet. Use \"+ Add member\" to register the first one."
              : `${members.length} ${members.length === 1 ? "member" : "members"} registered across all departments.`}
          </p>
          {!loading && members.length > 0 && (
            <button className="btn-primary" onClick={() => setShowList(true)}>
              View member list
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="members-list-header">
            <button className="btn-back"
              onClick={() => { setShowList(false); setSearch(""); setDeptFilter("ALL"); }}>
              ← Back to overview
            </button>
          </div>

          <div className="members-toolbar">
            <input className="members-search" placeholder="Search by name, phone, or email…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
            {deptFilter !== "ALL" && (
              <span className="active-filter">
                Showing: {DEPT_LABEL[deptFilter]}
                <button onClick={() => setDeptFilter("ALL")}>×</button>
              </span>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="members-empty">No members match your search or filter.</div>
          ) : (
            <div className="members-grid">
              {filtered.map((m) => {
                const dept = (m.DEPARTMENT_1 || "").toUpperCase();
                return (
                  <button key={m.S_N} className="member-card" onClick={() => setSelectedMember(m)}>
                    <div className="member-avatar">
                      {m.PROFILE_PHOTO_URL
                        ? <img src={m.PROFILE_PHOTO_URL} alt={m.MEMBER_NAME} />
                        : <span>{initials(m.MEMBER_NAME)}</span>}
                    </div>
                    <div className="member-info">
                      <span className="member-name">{m.MEMBER_NAME}</span>
                      <span className="member-phone">{m.PHONE || "—"}</span>
                    </div>
                    {dept && DEPT_BADGE[dept] && (
                      <span className={`dept-badge ${DEPT_BADGE[dept]}`}>{DEPT_LABEL[dept]}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Member detail modal */}
      {selectedMember && (
        <div className="modal-overlay" onClick={() => { setSelectedMember(null); setShowDeptOverride(false); setNewDept(""); setDeptError(""); }}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => { setSelectedMember(null); setShowDeptOverride(false); }}>×</button>

            <div className="modal-header">
              <div className="member-avatar large">
                {selectedMember.PROFILE_PHOTO_URL
                  ? <img src={selectedMember.PROFILE_PHOTO_URL} alt={selectedMember.MEMBER_NAME} />
                  : <span>{initials(selectedMember.MEMBER_NAME)}</span>}
              </div>
              <div>
                <h2>{selectedMember.MEMBER_NAME}</h2>
                <div className="dept-row">
                  {selectedMember.DEPARTMENT_1 && (
                    <span className={`dept-badge ${DEPT_BADGE[selectedMember.DEPARTMENT_1.toUpperCase()] || ""}`}>
                      {DEPT_LABEL[selectedMember.DEPARTMENT_1.toUpperCase()] || selectedMember.DEPARTMENT_1}
                    </span>
                  )}
                  {isAdmin && (
                    <button className="link-action dept-change-btn"
                      onClick={() => { setShowDeptOverride((s) => !s); setNewDept(""); setDeptError(""); }}>
                      {showDeptOverride ? "Cancel" : "Change department"}
                    </button>
                  )}
                </div>

                {/* Admin department override form */}
                {isAdmin && showDeptOverride && (
                  <form className="dept-override-form" onSubmit={handleDeptOverride}>
                    {deptError && <p className="photo-error">{deptError}</p>}
                    <select value={newDept} onChange={(e) => setNewDept(e.target.value)}>
                      <option value="">Select new department</option>
                      {ALL_DEPARTMENTS.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                    <button type="submit" className="btn-primary" disabled={deptSaving}>
                      {deptSaving ? "Saving…" : "Confirm"}
                    </button>
                  </form>
                )}
              </div>
            </div>

            <dl className="member-detail-grid">
              <Detail label="Phone" value={selectedMember.PHONE} />
              <Detail label="Email" value={selectedMember.EMAIL} />
              <Detail label="Physical address" value={selectedMember.PHYSICAL_ADDRESS} />
              <Detail label="Location / area" value={selectedMember.LOCATION_AREA} />
              <Detail label="Home church" value={selectedMember.HOME_CHURCH} />
              <Detail label="Sex" value={selectedMember.SEX} />
              <Detail label="Marital status" value={selectedMember.MARITAL_STATUS} />
              <Detail label="Date of birth" value={selectedMember.DATE_OF_BIRTH} />
              <Detail label="Occupation" value={selectedMember.OCCUPATION} />
              <Detail label="Date joined" value={selectedMember.DATE_JOINED} />
              <Detail label="Membership status" value={selectedMember.MEMBERSHIP_STATUS} />
              <Detail label="Membership number" value={selectedMember.MEMBERSHIP_NUMBER} />
              <Detail label="Spouse" value={selectedMember.SPOUSE_NAME} />
              <Detail label="No. of children" value={selectedMember.NO_OF_CHILDREN} />
              <Detail label="Conversion date" value={selectedMember.CONVERSION_DATE} />
              <Detail label="Baptism date" value={selectedMember.BAPTISM_DATE} />
              <Detail label="Received Holy Spirit" value={selectedMember.HOLY_SPIRIT_RECEIVED} />
              <Detail label="Holy Spirit date" value={selectedMember.HOLY_SPIRIT_DATE} />
            </dl>

            {/* Next of kin section */}
            {(selectedMember.NOK_NAME || selectedMember.NOK_PHONE) && (
              <div className="nok-section">
                <h3 className="nok-title">Next of kin</h3>
                <dl className="member-detail-grid">
                  <Detail label="Name" value={selectedMember.NOK_NAME} />
                  <Detail label="Relationship" value={selectedMember.NOK_RELATIONSHIP} />
                  <Detail label="Phone" value={selectedMember.NOK_PHONE} />
                </dl>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="detail-item">
      <dt>{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}
