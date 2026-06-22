import { useEffect, useState, useMemo } from "react";
import api from "../api/axios";
import "./Members.css";

const DEPARTMENTS = [
  "BROTHERS UNION",
  "SISTERS UNION",
  "YOUTH DEPARTMENT",
  "PRE-YOUTH DEPARTMENT",
  "SUNDAY SCHOOL",
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
  ADDRESS: "",
  PHONE: "",
  EMAIL: "",
  SEX: "",
  MARITAL_STATUS: "",
  DATE_OF_BIRTH: "",
  OCCUPATION: "",
  OFFICE_ADDRESS: "",
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
};

function initials(name = "") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
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
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("ALL");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [selectedMember, setSelectedMember] = useState(null);

  async function loadMembers() {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/api/members");
      setMembers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          "Couldn't load members. Check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMembers();
  }, []);

  const filtered = useMemo(() => {
    let list = members;
    if (deptFilter !== "ALL") {
      list = list.filter(
        (m) => (m.DEPARTMENT_1 || "").toUpperCase() === deptFilter
      );
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (m) =>
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
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
    setSuccessMsg("");

    if (!form.MEMBER_NAME.trim()) {
      setFormError("Member name is required.");
      return;
    }

    setSaving(true);
    try {
      const payload = { ...form };
      if (payload.NO_OF_CHILDREN === "") {
        delete payload.NO_OF_CHILDREN;
      } else {
        payload.NO_OF_CHILDREN = parseInt(payload.NO_OF_CHILDREN, 10);
      }
      // Only send SUNDAY_SCHOOL_CLASS if relevant
      if (!payload.SUNDAY_SCHOOL_CLASS) delete payload.SUNDAY_SCHOOL_CLASS;
      if (!payload.MEMBERSHIP_NUMBER) delete payload.MEMBERSHIP_NUMBER;

      const res = await api.post("/api/members", payload);
      const dept = res?.data?.department_1;
      setSuccessMsg(
        `${form.MEMBER_NAME} was added${
          dept ? ` — placed in ${DEPT_LABEL[dept] || dept}` : ""
        }.`
      );
      resetForm();
      setShowForm(false);
      loadMembers();
    } catch (err) {
      setFormError(
        err?.response?.data?.detail ||
          "Couldn't save this member. Check the details and try again."
      );
    } finally {
      setSaving(false);
    }
  }

  const showSundaySchoolClass = useMemo(() => {
    const age = ageFromDob(form.DATE_OF_BIRTH);
    const status = (form.MARITAL_STATUS || "").toUpperCase();
    const married = ["MARRIED", "DIVORCED", "SEPARATED", "WIDOW/WIDOWER"].includes(
      status
    );
    return !married && age !== null && age <= 12;
  }, [form.DATE_OF_BIRTH, form.MARITAL_STATUS]);

  return (
    <div className="members-page">
      <header className="members-header">
        <div>
          <h1>Members</h1>
          <p className="members-subtitle">
            {members.length} {members.length === 1 ? "member" : "members"}{" "}
            registered at AFC Uthiru
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => {
            setShowForm((s) => !s);
            setSuccessMsg("");
            if (!showForm) resetForm();
          }}
        >
          {showForm ? "Close" : "+ Add member"}
        </button>
      </header>

      {successMsg && <div className="banner banner-success">{successMsg}</div>}

      {/* Department tally strip */}
      <div className="dept-strip">
        <button
          className={`dept-chip ${deptFilter === "ALL" ? "active" : ""}`}
          onClick={() => setDeptFilter("ALL")}
        >
          <span className="dept-chip-count">{members.length}</span>
          <span className="dept-chip-label">All members</span>
        </button>
        {DEPARTMENTS.map((d) => (
          <button
            key={d}
            className={`dept-chip ${DEPT_BADGE[d]} ${
              deptFilter === d ? "active" : ""
            }`}
            onClick={() => setDeptFilter(deptFilter === d ? "ALL" : d)}
          >
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
            The primary department is assigned automatically based on sex,
            marital status, and date of birth — no need to set it manually.
          </p>

          {formError && <div className="banner banner-error">{formError}</div>}

          <form onSubmit={handleSubmit} className="member-form">
            <div className="form-grid">
              <div className="form-field span-2">
                <label htmlFor="MEMBER_NAME">Full name *</label>
                <input
                  id="MEMBER_NAME"
                  value={form.MEMBER_NAME}
                  onChange={(e) => updateField("MEMBER_NAME", e.target.value)}
                  placeholder="e.g. Joseph Gichimu"
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="PROFILE_PHOTO_URL">Profile photo URL</label>
                <input
                  id="PROFILE_PHOTO_URL"
                  value={form.PROFILE_PHOTO_URL}
                  onChange={(e) =>
                    updateField("PROFILE_PHOTO_URL", e.target.value)
                  }
                  placeholder="https://..."
                />
              </div>

              <div className="form-field">
                <label htmlFor="PHONE">Phone</label>
                <input
                  id="PHONE"
                  value={form.PHONE}
                  onChange={(e) => updateField("PHONE", e.target.value)}
                  placeholder="07XX XXX XXX"
                />
              </div>

              <div className="form-field">
                <label htmlFor="EMAIL">Email</label>
                <input
                  id="EMAIL"
                  type="email"
                  value={form.EMAIL}
                  onChange={(e) => updateField("EMAIL", e.target.value)}
                  placeholder="name@example.com"
                />
              </div>

              <div className="form-field">
                <label htmlFor="ADDRESS">Address</label>
                <input
                  id="ADDRESS"
                  value={form.ADDRESS}
                  onChange={(e) => updateField("ADDRESS", e.target.value)}
                  placeholder="Home address"
                />
              </div>

              <div className="form-field">
                <label htmlFor="SEX">Sex</label>
                <select
                  id="SEX"
                  value={form.SEX}
                  onChange={(e) => updateField("SEX", e.target.value)}
                >
                  <option value="">Select</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="MARITAL_STATUS">Marital status</label>
                <select
                  id="MARITAL_STATUS"
                  value={form.MARITAL_STATUS}
                  onChange={(e) =>
                    updateField("MARITAL_STATUS", e.target.value)
                  }
                >
                  <option value="">Select</option>
                  <option value="SINGLE">Single</option>
                  <option value="MARRIED">Married</option>
                  <option value="DIVORCED">Divorced</option>
                  <option value="SEPARATED">Separated</option>
                  <option value="WIDOW/WIDOWER">Widow/Widower</option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="DATE_OF_BIRTH">Date of birth</label>
                <input
                  id="DATE_OF_BIRTH"
                  type="date"
                  value={form.DATE_OF_BIRTH}
                  onChange={(e) =>
                    updateField("DATE_OF_BIRTH", e.target.value)
                  }
                />
              </div>

              {showSundaySchoolClass && (
                <div className="form-field">
                  <label htmlFor="SUNDAY_SCHOOL_CLASS">
                    Sunday School class
                  </label>
                  <select
                    id="SUNDAY_SCHOOL_CLASS"
                    value={form.SUNDAY_SCHOOL_CLASS}
                    onChange={(e) =>
                      updateField("SUNDAY_SCHOOL_CLASS", e.target.value)
                    }
                  >
                    <option value="">Select</option>
                    <option value="JUNIOR">Junior (0–7 yrs)</option>
                    <option value="SENIOR">Senior (8–12 yrs)</option>
                  </select>
                </div>
              )}

              <div className="form-field">
                <label htmlFor="OCCUPATION">Occupation</label>
                <input
                  id="OCCUPATION"
                  value={form.OCCUPATION}
                  onChange={(e) => updateField("OCCUPATION", e.target.value)}
                  placeholder="e.g. Teacher"
                />
              </div>

              <div className="form-field">
                <label htmlFor="OFFICE_ADDRESS">Office address</label>
                <input
                  id="OFFICE_ADDRESS"
                  value={form.OFFICE_ADDRESS}
                  onChange={(e) =>
                    updateField("OFFICE_ADDRESS", e.target.value)
                  }
                  placeholder="Workplace location"
                />
              </div>

              <div className="form-field">
                <label htmlFor="DATE_JOINED">Date joined church</label>
                <input
                  id="DATE_JOINED"
                  type="date"
                  value={form.DATE_JOINED}
                  onChange={(e) => updateField("DATE_JOINED", e.target.value)}
                />
              </div>

              <div className="form-field">
                <label htmlFor="MEMBERSHIP_STATUS">Membership status</label>
                <select
                  id="MEMBERSHIP_STATUS"
                  value={form.MEMBERSHIP_STATUS}
                  onChange={(e) =>
                    updateField("MEMBERSHIP_STATUS", e.target.value)
                  }
                >
                  <option value="ACTIVE MEMBER">Active member</option>
                  <option value="OFFICER">Officer</option>
                  <option value="NEW CONVERT">New convert</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="MEMBERSHIP_NUMBER">Membership number</label>
                <input
                  id="MEMBERSHIP_NUMBER"
                  value={form.MEMBERSHIP_NUMBER}
                  onChange={(e) =>
                    updateField("MEMBERSHIP_NUMBER", e.target.value)
                  }
                  placeholder="Leave blank if not yet issued"
                />
              </div>

              <div className="form-field">
                <label htmlFor="SPOUSE_NAME">Spouse's name</label>
                <input
                  id="SPOUSE_NAME"
                  value={form.SPOUSE_NAME}
                  onChange={(e) => updateField("SPOUSE_NAME", e.target.value)}
                />
              </div>

              <div className="form-field">
                <label htmlFor="NO_OF_CHILDREN">Number of children</label>
                <input
                  id="NO_OF_CHILDREN"
                  type="number"
                  min="0"
                  value={form.NO_OF_CHILDREN}
                  onChange={(e) =>
                    updateField("NO_OF_CHILDREN", e.target.value)
                  }
                />
              </div>

              <div className="form-field">
                <label htmlFor="CONVERSION_DATE">Date of conversion</label>
                <input
                  id="CONVERSION_DATE"
                  type="date"
                  value={form.CONVERSION_DATE}
                  onChange={(e) =>
                    updateField("CONVERSION_DATE", e.target.value)
                  }
                />
              </div>

              <div className="form-field">
                <label htmlFor="BAPTISM_DATE">Baptism date</label>
                <input
                  id="BAPTISM_DATE"
                  type="date"
                  value={form.BAPTISM_DATE}
                  onChange={(e) =>
                    updateField("BAPTISM_DATE", e.target.value)
                  }
                />
              </div>

              <div className="form-field">
                <label htmlFor="HOLY_SPIRIT_RECEIVED">
                  Received Holy Spirit?
                </label>
                <select
                  id="HOLY_SPIRIT_RECEIVED"
                  value={form.HOLY_SPIRIT_RECEIVED}
                  onChange={(e) =>
                    updateField("HOLY_SPIRIT_RECEIVED", e.target.value)
                  }
                >
                  <option value="">Select</option>
                  <option value="YES">Yes</option>
                  <option value="NO">No</option>
                  <option value="NOT SURE">Not sure</option>
                </select>
              </div>

              {form.HOLY_SPIRIT_RECEIVED === "YES" && (
                <div className="form-field">
                  <label htmlFor="HOLY_SPIRIT_DATE">
                    Date received Holy Spirit
                  </label>
                  <input
                    id="HOLY_SPIRIT_DATE"
                    type="date"
                    value={form.HOLY_SPIRIT_DATE}
                    onChange={(e) =>
                      updateField("HOLY_SPIRIT_DATE", e.target.value)
                    }
                  />
                </div>
              )}
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                disabled={saving}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save member"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search */}
      <div className="members-toolbar">
        <input
          className="members-search"
          placeholder="Search by name, phone, or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {deptFilter !== "ALL" && (
          <span className="active-filter">
            Showing: {DEPT_LABEL[deptFilter]}
            <button onClick={() => setDeptFilter("ALL")}>×</button>
          </span>
        )}
      </div>

      {/* Members list */}
      {error && <div className="banner banner-error">{error}</div>}

      {loading ? (
        <div className="members-empty">Loading members…</div>
      ) : filtered.length === 0 ? (
        <div className="members-empty">
          {members.length === 0
            ? "No members yet. Use “Add member” to register the first one."
            : "No members match your search or filter."}
        </div>
      ) : (
        <div className="members-grid">
          {filtered.map((m) => {
            const dept = (m.DEPARTMENT_1 || "").toUpperCase();
            return (
              <button
                key={m.S_N}
                className="member-card"
                onClick={() => setSelectedMember(m)}
              >
                <div className="member-avatar">
                  {m.PROFILE_PHOTO_URL ? (
                    <img src={m.PROFILE_PHOTO_URL} alt={m.MEMBER_NAME} />
                  ) : (
                    <span>{initials(m.MEMBER_NAME)}</span>
                  )}
                </div>
                <div className="member-info">
                  <span className="member-name">{m.MEMBER_NAME}</span>
                  <span className="member-phone">{m.PHONE || "—"}</span>
                </div>
                {dept && DEPT_BADGE[dept] && (
                  <span className={`dept-badge ${DEPT_BADGE[dept]}`}>
                    {DEPT_LABEL[dept]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Member detail modal */}
      {selectedMember && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedMember(null)}
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => setSelectedMember(null)}
            >
              ×
            </button>
            <div className="modal-header">
              <div className="member-avatar large">
                {selectedMember.PROFILE_PHOTO_URL ? (
                  <img
                    src={selectedMember.PROFILE_PHOTO_URL}
                    alt={selectedMember.MEMBER_NAME}
                  />
                ) : (
                  <span>{initials(selectedMember.MEMBER_NAME)}</span>
                )}
              </div>
              <div>
                <h2>{selectedMember.MEMBER_NAME}</h2>
                {selectedMember.DEPARTMENT_1 && (
                  <span
                    className={`dept-badge ${
                      DEPT_BADGE[selectedMember.DEPARTMENT_1.toUpperCase()] ||
                      ""
                    }`}
                  >
                    {DEPT_LABEL[selectedMember.DEPARTMENT_1.toUpperCase()] ||
                      selectedMember.DEPARTMENT_1}
                  </span>
                )}
              </div>
            </div>

            <dl className="member-detail-grid">
              <Detail label="Phone" value={selectedMember.PHONE} />
              <Detail label="Email" value={selectedMember.EMAIL} />
              <Detail label="Address" value={selectedMember.ADDRESS} />
              <Detail label="Sex" value={selectedMember.SEX} />
              <Detail
                label="Marital status"
                value={selectedMember.MARITAL_STATUS}
              />
              <Detail
                label="Date of birth"
                value={selectedMember.DATE_OF_BIRTH}
              />
              <Detail label="Occupation" value={selectedMember.OCCUPATION} />
              <Detail
                label="Office address"
                value={selectedMember.OFFICE_ADDRESS}
              />
              <Detail
                label="Date joined"
                value={selectedMember.DATE_JOINED}
              />
              <Detail
                label="Membership status"
                value={selectedMember.MEMBERSHIP_STATUS}
              />
              <Detail
                label="Membership number"
                value={selectedMember.MEMBERSHIP_NUMBER}
              />
              <Detail label="Spouse" value={selectedMember.SPOUSE_NAME} />
              <Detail
                label="No. of children"
                value={selectedMember.NO_OF_CHILDREN}
              />
              <Detail
                label="Conversion date"
                value={selectedMember.CONVERSION_DATE}
              />
              <Detail
                label="Baptism date"
                value={selectedMember.BAPTISM_DATE}
              />
              <Detail
                label="Received Holy Spirit"
                value={selectedMember.HOLY_SPIRIT_RECEIVED}
              />
              <Detail
                label="Holy Spirit date"
                value={selectedMember.HOLY_SPIRIT_DATE}
              />
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