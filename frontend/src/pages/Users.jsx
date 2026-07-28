import { useEffect, useState } from "react";
import api from "../api/axios";
import { SkeletonTable } from "../components/PageLoader";
import "../components/PageLoader.css";
import "./Users.css";

export default function Users() {
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({
    username: "", full_name: "", email: "", password: "", is_admin: false
  });

  async function load() {
    setLoading(true); setError("");
    try {
      const { data } = await api.get("/api/users");
      setUsers(data);
    } catch {
      setError("Could not load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSubmit(e) {
    e.preventDefault(); setFormError(""); setSaving(true);
    try {
      await api.post("/api/users", form);
      setShowForm(false);
      setForm({ username: "", full_name: "", email: "", password: "", is_admin: false });
      load();
    } catch (err) {
      setFormError(err?.response?.data?.detail || "Could not create user.");
    } finally { setSaving(false); }
  }

  async function handleDeactivate(username) {
    if (!window.confirm(`Deactivate ${username}?`)) return;
    try {
      await api.post(`/api/users/deactivate/${username}`);
      load();
    } catch { alert("Could not deactivate user."); }
  }

  return (
    <div className="users-page">
      <div className="users-header">
        <div>
          <h1>Users</h1>
          <p className="users-subtitle">Manage system accounts and access.</p>
        </div>
        <button className="users-btn-primary" onClick={() => setShowForm(true)}>
          + New User
        </button>
      </div>

      {error && (
        <div className="users-error">
          {error}
          <button onClick={load} className="users-retry">Retry</button>
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={4} cols={5} />
      ) : users.length === 0 ? (
        <div className="users-empty">
          <div className="users-empty-icon">👤</div>
          <div className="users-empty-title">No users yet</div>
          <div className="users-empty-hint">Click + New User to create the first account.</div>
        </div>
      ) : (
        <div className="users-table-wrap">
          <table className="users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.S_N}>
                  <td className="users-name">{u.FULL_NAME}</td>
                  <td className="users-mono">{u.USERNAME}</td>
                  <td>{u.EMAIL}</td>
                  <td>
                    <span className={`users-role-badge ${u.IS_ADMIN === "TRUE" ? "admin" : "staff"}`}>
                      {u.IS_ADMIN === "TRUE" ? "Admin" : "Staff"}
                    </span>
                  </td>
                  <td>
                    <span className={`users-status-badge ${u.IS_ACTIVE === "TRUE" ? "active" : "inactive"}`}>
                      {u.IS_ACTIVE === "TRUE" ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    {u.IS_ACTIVE === "TRUE" && (
                      <button className="users-btn-deactivate"
                        onClick={() => handleDeactivate(u.USERNAME)}>
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

      {showForm && (
        <div className="users-overlay" onClick={() => setShowForm(false)}>
          <div className="users-modal" onClick={e => e.stopPropagation()}>
            <div className="users-modal-header">
              <h2>New User</h2>
              <button className="users-modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit} className="users-form">
              {formError && <div className="users-form-error">{formError}</div>}
              <div className="users-field">
                <label>Full Name</label>
                <input value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})}
                  placeholder="John Doe" required />
              </div>
              <div className="users-field">
                <label>Username</label>
                <input value={form.username} onChange={e => setForm({...form, username: e.target.value})}
                  placeholder="johndoe" required />
              </div>
              <div className="users-field">
                <label>Email</label>
                <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                  placeholder="john@example.com" required />
              </div>
              <div className="users-field">
                <label>Password</label>
                <input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                  placeholder="At least 6 characters" required />
              </div>
              <div className="users-field users-field-check">
                <input type="checkbox" id="is_admin" checked={form.is_admin}
                  onChange={e => setForm({...form, is_admin: e.target.checked})} />
                <label htmlFor="is_admin">Admin account</label>
              </div>
              <div className="users-form-actions">
                <button type="button" className="users-btn-ghost"
                  onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="users-btn-primary" disabled={saving}>
                  {saving ? <><span className="btn-spinner" />Creating…</> : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}