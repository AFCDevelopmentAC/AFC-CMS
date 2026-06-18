import { useEffect, useState } from "react";
import api from "../api/axios";
import "./Users.css";

const EMPTY_FORM = {
  username: "",
  full_name: "",
  email: "",
  password: "",
  is_admin: false,
  church_branch: "AFC UTHIRU",
};

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/api/users");
      setUsers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(
        err?.response?.data?.detail || "Couldn't load users. Try again."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
    setSuccessMsg("");

    if (!form.username.trim() || !form.full_name.trim() || !form.password) {
      setFormError("Username, full name, and password are required.");
      return;
    }

    setSaving(true);
    try {
      await api.post("/api/users", form);
      setSuccessMsg(`Account '${form.username}' created.`);
      setForm(EMPTY_FORM);
      setShowForm(false);
      loadUsers();
    } catch (err) {
      setFormError(
        err?.response?.data?.detail || "Couldn't create this account."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(username) {
    if (!window.confirm(`Deactivate account '${username}'?`)) return;
    try {
      await api.patch(`/api/users/${username}/deactivate`);
      loadUsers();
    } catch (err) {
      setError(
        err?.response?.data?.detail || `Couldn't deactivate '${username}'.`
      );
    }
  }

  return (
    <div className="users-page">
      <header className="users-header">
        <div>
          <h1>User accounts</h1>
          <p className="users-subtitle">
            {users.length} {users.length === 1 ? "account" : "accounts"}
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => {
            setShowForm((s) => !s);
            setSuccessMsg("");
            setFormError("");
            if (!showForm) setForm(EMPTY_FORM);
          }}
        >
          {showForm ? "Close" : "+ Add account"}
        </button>
      </header>

      {successMsg && <div className="banner banner-success">{successMsg}</div>}
      {error && <div className="banner banner-error">{error}</div>}

      {showForm && (
        <div className="user-form-card">
          <h2>Create a new account</h2>
          {formError && <div className="banner banner-error">{formError}</div>}

          <form onSubmit={handleSubmit} className="user-form">
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="username">Username *</label>
                <input
                  id="username"
                  value={form.username}
                  onChange={(e) => updateField("username", e.target.value)}
                  placeholder="e.g. jmwangi"
                />
              </div>

              <div className="form-field">
                <label htmlFor="full_name">Full name *</label>
                <input
                  id="full_name"
                  value={form.full_name}
                  onChange={(e) => updateField("full_name", e.target.value)}
                  placeholder="e.g. John Mwangi"
                />
              </div>

              <div className="form-field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  placeholder="name@example.com"
                />
              </div>

              <div className="form-field">
                <label htmlFor="password">Password *</label>
                <input
                  id="password"
                  type="text"
                  value={form.password}
                  onChange={(e) => updateField("password", e.target.value)}
                  placeholder="Temporary password"
                />
              </div>

              <div className="form-field checkbox-field">
                <label htmlFor="is_admin" className="checkbox-label">
                  <input
                    id="is_admin"
                    type="checkbox"
                    checked={form.is_admin}
                    onChange={(e) =>
                      updateField("is_admin", e.target.checked)
                    }
                  />
                  Admin account
                </label>
              </div>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowForm(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Create account"}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="users-empty">Loading accounts…</div>
      ) : users.length === 0 ? (
        <div className="users-empty">No accounts yet.</div>
      ) : (
        <div className="users-table-wrap">
          <table className="users-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Full name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.S_N}>
                  <td className="cell-strong">{u.USERNAME}</td>
                  <td>{u.FULL_NAME}</td>
                  <td>{u.EMAIL || "—"}</td>
                  <td>
                    <span
                      className={`role-badge ${
                        String(u.IS_ADMIN).toUpperCase() === "TRUE"
                          ? "admin"
                          : "staff"
                      }`}
                    >
                      {String(u.IS_ADMIN).toUpperCase() === "TRUE"
                        ? "Admin"
                        : "Staff"}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`status-badge ${
                        String(u.IS_ACTIVE).toUpperCase() === "TRUE"
                          ? "active"
                          : "inactive"
                      }`}
                    >
                      {String(u.IS_ACTIVE).toUpperCase() === "TRUE"
                        ? "Active"
                        : "Inactive"}
                    </span>
                  </td>
                  <td className="cell-actions">
                    {String(u.IS_ACTIVE).toUpperCase() === "TRUE" && (
                      <button
                        className="link-action"
                        onClick={() => handleDeactivate(u.USERNAME)}
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
