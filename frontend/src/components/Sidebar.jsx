import { NavLink } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import "./Sidebar.css";

export default function Sidebar() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  function handleLogout() {
    logout();
    window.location.href = "/login";
  }

  const link = (to, label) => (
    <NavLink to={to}
      className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
      onClick={() => setOpen(false)}>
      {label}
    </NavLink>
  );

  return (
    <>
      <button className="sidebar-toggle" onClick={() => setOpen(o => !o)} aria-label="Toggle menu">☰</button>
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebar-brand">
          <div className="sidebar-mark">AFC</div>
          <div>
            <div className="sidebar-title">AFC Uthiru</div>
            <div className="sidebar-subtitle">Church Management</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {link("/members",  "Members")}
          {link("/services", "Services")}
          {link("/events",   "Events")}
          {user?.is_admin && link("/users", "Users")}
          {user?.is_admin && link("/audit", "Audit Trail")}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">
              {(user?.full_name || user?.username || "?")[0].toUpperCase()}
            </div>
            <div>
              <div className="sidebar-username">{user?.full_name || user?.username}</div>
              <div className="sidebar-role">{user?.is_admin ? "Admin" : "Staff"}</div>
            </div>
          </div>
          <button className="sidebar-logout" onClick={handleLogout}>Sign out</button>
        </div>
      </aside>
      {open && <div className="sidebar-overlay" onClick={() => setOpen(false)} />}
    </>
  );
}