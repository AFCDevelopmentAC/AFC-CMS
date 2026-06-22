import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Sidebar.css";

const NAV = [
  { to: "/dashboard",    icon: "⊞", label: "Dashboard",    roles: ["SYSTEM_ADMIN","ADMIN","USER"] },
  { to: "/members",      icon: "👥", label: "Members",      roles: ["SYSTEM_ADMIN","ADMIN","USER"] },
  { to: "/visitors",     icon: "🚶", label: "Visitors",     roles: ["SYSTEM_ADMIN","ADMIN","USER"] },
  { to: "/new-converts", icon: "✝",  label: "New Converts", roles: ["SYSTEM_ADMIN","ADMIN","USER"] },
  { to: "/services",     icon: "🏛",  label: "Services",     roles: ["SYSTEM_ADMIN","ADMIN","USER"] },
  { to: "/events",       icon: "📅", label: "Events",       roles: ["SYSTEM_ADMIN","ADMIN","USER"] },
  { to: "/finance",      icon: "💰", label: "Finance",      roles: ["SYSTEM_ADMIN","ADMIN"] },
  { to: "/users",        icon: "🔐", label: "Users",        roles: ["SYSTEM_ADMIN"] },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate("/login"); };

  const allowed = NAV.filter((n) => n.roles.includes(user?.role));

  const roleLabel = {
    SYSTEM_ADMIN: "System Admin",
    ADMIN: "Admin",
    USER: "Clerk",
  }[user?.role] || user?.role;

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-cross">✝</span>
        <div>
          <div className="sidebar-church">AFC Uthiru</div>
          <div className="sidebar-sub">Church Management</div>
        </div>
      </div>

      <div className="sidebar-user">
        <div className="sidebar-avatar">{user?.full_name?.[0] || "U"}</div>
        <div>
          <div className="sidebar-name">{user?.full_name || user?.username}</div>
          <div className="sidebar-role">{roleLabel}</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {allowed.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              "sidebar-link" + (isActive ? " sidebar-link--active" : "")
            }
          >
            <span className="sidebar-icon">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <button className="sidebar-logout" onClick={handleLogout}>
        <span>⎋</span> Sign Out
      </button>
    </aside>
  );
}
