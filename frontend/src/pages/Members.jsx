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

  // ── Media Selection & Crop Modals (Matches Images) ─────────
  const [showPickerMenu, setShowPickerMenu] = useState(false);
  const [cropSrc, setCropSrc] = useState(null);
  const [cropBox, setCropBox] = useState({ x: 10, y: 10, width: 80, height: 80 }); // Percentages

  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const cropImgRef = useRef(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

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
      setError(err?.response?.data?.detail || "Couldn't load members.");
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
    setCropSrc(null);
    setShowPickerMenu(false);
    if (galleryInputRef.current) galleryInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  // Final transmission step to Cloudinary backend API
  async function uploadToCloudinary(fileObject) {
    setUploadingPhoto(true);
    try {
      const data = new FormData();
      data.append("file", fileObject);
      data.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
      const res = await fetch(CLOUDINARY_UPLOAD_URL, { method: "POST", body: data });
      if (!res.ok) throw new Error("Upload failed");
      const json = await res.json();
      updateField("PROFILE_PHOTO_URL", json.secure_url);
      setPhotoPreview(json.secure_url);
    } catch {
      setPhotoError("Photo upload failed. Please try capturing or uploading again.");
      setPhotoPreview("");
      updateField("PROFILE_PHOTO_URL", "");
    } finally {
      setUploadingPhoto(false);
    }
  }

  // ── Handle Media Source Selections ────────────────────────
  function processIncomingFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setShowPickerMenu(false);
    setPhotoError("");

    if (!file.type.startsWith("image/")) {
      setPhotoError("Please select an image file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCropSrc(reader.result);
      setCropBox({ x: 15, y: 15, width: 70, height: 70 }); // Reset grid to centered square default
    };
    reader.readAsDataURL(file);
  }

  // ── Custom Canvas Cropper Drag Events (Image 15.11.06) ─────
  function handleCropMouseDown(e) {
    isDraggingRef.current = true;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragStartRef.current = { x: clientX, y: clientY };
  }

  function handleCropMouseMove(e) {
    if (!isDraggingRef.current || !cropImgRef.current) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const deltaX = clientX - dragStartRef.current.x;
    const deltaY = clientY - dragStartRef.current.y;
    
    const rect = cropImgRef.current.getBoundingClientRect();
    const pctDeltaX = (deltaX / rect.width) * 100;
    const pctDeltaY = (deltaY / rect.height) * 100;

    setCropBox((prev) => {
      let newX = prev.x + pctDeltaX;
      let newY = prev.y + pctDeltaY;

      // Keep bounding box constraints tight inside frame boundaries
      if (newX < 0) newX = 0;
      if (newY < 0) newY = 0;
      if (newX + prev.width > 100) newX = 100 - prev.width;
      if (newY + prev.height > 100) newY = 100 - prev.height;

      return { ...prev, x: newX, y: newY };
    });

    dragStartRef.current = { x: clientX, y: clientY };
  }

  function handleCropMouseUp() {
    isDraggingRef.current = false;
  }

  // Performs client side crop slice & enforces standard resolution downscaling
  function applyCropAndResize() {
    const img = cropImgRef.current;
    if (!img) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // Enforce optimized standardized thumbnail squares
    const targetSize = 480; 
    canvas.width = targetSize;
    canvas.height = targetSize;

    // Calculate source positions based on percent box markers
    const sourceX = (cropBox.x / 100) * img.naturalWidth;
    const sourceY = (cropBox.y / 100) * img.naturalHeight;
    const sourceWidth = (cropBox.width / 100) * img.naturalWidth;
    const sourceHeight = (cropBox.height / 100) * img.naturalHeight;

    // Maintain true 1:1 aspect extract mapping box
    const finalSize = Math.min(sourceWidth, sourceHeight);

    ctx.drawImage(
      img,
      sourceX, sourceY, finalSize, finalSize, // Source image box mapping coordinates
      0, 0, targetSize, targetSize            // Destination rendering size coordinates
    );

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `profile-${Date.now()}.jpg`, { type: "image/jpeg" });
      setPhotoPreview(URL.createObjectURL(file));
      setCropSrc(null); // Close crop manager overlay window
      uploadToCloudinary(file);
    }, "image/jpeg", 0.90);
  }

  function removePhoto() {
    setPhotoPreview("");
    updateField("PROFILE_PHOTO_URL", "");
    setPhotoError("");
    if (galleryInputRef.current) galleryInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
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
      setFormError(err?.response?.data?.detail || "Couldn't save this member.");
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
      await api.put(`/api/members/${selectedMember.S_N}/department`, { department: newDept });
      setShowDeptOverride(false);
      setNewDept("");
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
      {/* Hidden system triggers utilizing standard browser capture bindings */}
      <input ref={galleryInputRef} type="file" accept="image/*" onChange={processIncomingFile} style={{ display: "none" }} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="user" onChange={processIncomingFile} style={{ display: "none" }} />

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

      {/* Department filter bar */}
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
          {formError && <div className="banner banner-error">{formError}</div>}

          <form onSubmit={handleSubmit} className="member-form">

            {/* Custom Photo Upload Row Slot */}
            <div className="photo-upload-row">
              <div className="photo-preview" onClick={() => setShowPickerMenu(true)} style={{ cursor: "pointer" }}>
                {photoPreview ? (
                  <img src={photoPreview} alt="Preview" />
                ) : (
                  <span>{initials(form.MEMBER_NAME) || "?"}</span>
                )}
                {uploadingPhoto && <div className="photo-uploading-overlay">Uploading…</div>}
              </div>

              <div className="photo-upload-actions">
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowPickerMenu(true)}>
                    Choose Avatar Image
                  </button>
                  {photoPreview && (
                    <button type="button" className="link-action" onClick={removePhoto}>Remove</button>
                  )}
                </div>
                <p className="photo-hint">Supports live native camera snap or gallery library media selection.</p>
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
                    <option value="JUNIOR">Junior (3–8 yrs)</option>
                    <option value="SENIOR">Senior (9–12 yrs)</option>
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
                  <option value="MEMBER">Member</option>
                  <option value="NEW CONVERT">New convert</option>
                  <option value="Visitor">Visitor</option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="MEMBERSHIP_NUMBER">Membership number</label>
                <input id="MEMBERSHIP_NUMBER" value={form.MEMBERSHIP_NUMBER}
                  onChange={(e) => updateField("MEMBERSHIP_NUMBER", e.target.value)} />
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
              <div className="form-section-label span-3">Next of kin</div>

              <div className="form-field">
                <label htmlFor="NOK_NAME">Full name</label>
                <input id="NOK_NAME" value={form.NOK_NAME}
                  onChange={(e) => updateField("NOK_NAME", e.target.value)} />
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
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="NOK_PHONE">Phone number</label>
                <input id="NOK_PHONE" value={form.NOK_PHONE}
                  onChange={(e) => updateField("NOK_PHONE", e.target.value)} />
              </div>
            </div>

            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); resetForm(); }} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save member"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 📥 SOURCE PICKER OVERLAY (Matches: WhatsApp Image 2026-06-18 at 15.11.07 (1).jpeg) */}
      {showPickerMenu && (
        <div className="modal-overlay" style={{ alignItems: "flex-end" }} onClick={() => setShowPickerMenu(false)}>
          <div className="bottom-sheet-card" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-header">
              <span className="bottom-sheet-title">Profile picture</span>
              <button className="bottom-sheet-close-btn" onClick={() => setShowPickerMenu(false)}>×</button>
            </div>
            
            <div className="bottom-sheet-options">
              <button type="button" className="sheet-option-row" onClick={() => { cameraInputRef.current?.click(); }}>
                <span className="icon-slot">📸</span>
                <span className="option-text">Camera</span>
              </button>

              <button type="button" className="sheet-option-row" onClick={() => { galleryInputRef.current?.click(); }}>
                <span className="icon-slot">🖼️</span>
                <span className="option-text">Gallery</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✂️ INTERACTIVE CROPPER MODAL OVERLAY (Matches: WhatsApp Image 2026-06-18 at 15.11.06.jpeg) */}
      {cropSrc && (
        <div className="cropper-fullscreen-overlay">
          <div className="cropper-workspace">
            <div className="cropper-container" 
                 onMouseMove={handleCropMouseMove} 
                 onMouseUp={handleCropMouseUp}
                 onTouchMove={handleCropMouseMove}
                 onTouchEnd={handleCropMouseUp}>
              
              <img ref={cropImgRef} src={cropSrc} alt="Cropping track asset" className="cropper-source-img" draggable={false} />
              
              {/* Box container representing grid frame lines highlight box */}
              <div className="cropper-grid-box"
                   onMouseDown={handleCropMouseDown}
                   onTouchStart={handleCropMouseDown}
                   style={{
                     left: `${cropBox.x}%`,
                     top: `${cropBox.y}%`,
                     width: `${cropBox.width}%`,
                     height: `${cropBox.height}%`
                   }}>
                <div className="grid-line line-v1"></div>
                <div className="grid-line line-v2"></div>
                <div className="grid-line line-h1"></div>
                <div className="grid-line line-h2"></div>
                <div className="corner corner-tl"></div>
                <div className="corner corner-tr"></div>
                <div className="corner corner-bl"></div>
                <div className="corner corner-br"></div>
              </div>
            </div>
          </div>

          <div className="cropper-action-footer">
            <button type="button" className="cropper-btn-action text-cancel" onClick={() => setCropSrc(null)}>
              Cancel
            </button>
            <button type="button" className="cropper-btn-action text-rotate" onClick={() => { /* Op optional rotate step placeholder if required */ }}>
              🔄
            </button>
            <button type="button" className="cropper-btn-action text-done" onClick={applyCropAndResize}>
              Done
            </button>
          </div>
        </div>
      )}

      {/* Members overview grid container card lists list view blocks layout */}
      {!showList ? (
        <div className="members-summary-cta">
          <p className="cta-hint">
            {loading ? "Loading..." : `${members.length} members registered.`}
          </p>
          {!loading && members.length > 0 && (
            <button className="btn-primary" onClick={() => setShowList(true)}>View member list</button>
          )}
        </div>
      ) : (
        <>
          <div className="members-list-header">
            <button className="btn-back" onClick={() => { setShowList(false); setSearch(""); setDeptFilter("ALL"); }}>
              ← Back to overview
            </button>
          </div>

          <div className="members-toolbar">
            <input className="members-search" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <div className="members-grid">
            {filtered.map((m) => (
              <button key={m.S_N} className="member-card" onClick={() => setSelectedMember(m)}>
                <div className="member-avatar">
                  {m.PROFILE_PHOTO_URL ? <img src={m.PROFILE_PHOTO_URL} alt="" /> : <span>{initials(m.MEMBER_NAME)}</span>}
                </div>
                <div className="member-info">
                  <span className="member-name">{m.MEMBER_NAME}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Details View Modal Panel layout block component target hooks */}
      {selectedMember && (
        <div className="modal-overlay" onClick={() => setSelectedMember(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedMember(null)}>×</button>
            <h2>{selectedMember.MEMBER_NAME}</h2>
            <dl className="member-detail-grid">
              <Detail label="Phone" value={selectedMember.PHONE} />
              <Detail label="Email" value={selectedMember.EMAIL} />
            </dl>
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
