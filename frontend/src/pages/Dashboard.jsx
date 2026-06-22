import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";
import "./Dashboard.css";

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ members: 0, visitors: 0, converts: 0, services: 0 });

  useEffect(() => {
    Promise.allSettled([
      api.get("/api/members"),
      api.get("/api/visitors"),
      api.get("/api/new-converts"),
      api.get("/api/services"),
    ]).then(([m, v, c, s]) => {
      setStats({
        members:  m.status === "fulfilled" ? m.value.data.length : 0,
        visitors: v.status === "fulfilled" ? v.value.data.length : 0,
        converts: c.status === "fulfilled" ? c.value.data.length : 0,
        services: s.status === "fulfilled" ? s.value.data.length : 0,
      });
    });
  }, []);

  const cards = [
    { label: "Total Members",   value: stats.members,  color: "#00B4D8", icon: "👥" },
    { label: "Visitors",        value: stats.visitors, color: "#6366F1", icon: "🚶" },
    { label: "New Converts",    value: stats.converts, color: "#10B981", icon: "✝" },
    { label: "Services Logged", value: stats.services, color: "#F59E0B", icon: "🏛" },
  ];

  return (
    <div className="dash">
      <div className="dash-header">
        <div>
          <h1>Dashboard</h1>
          <p>Welcome back, {user?.full_name || user?.username}</p>
        </div>
        <div className="dash-date">{new Date().toLocaleDateString("en-KE", { weekday:"long", year:"numeric", month:"long", day:"numeric" })}</div>
      </div>

      <div className="dash-cards">
        {cards.map((c) => (
          <div className="dash-card" key={c.label} style={{"--accent": c.color}}>
            <div className="dash-card-icon">{c.icon}</div>
            <div className="dash-card-value">{c.value}</div>
            <div className="dash-card-label">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="dash-welcome">
        <div className="dash-welcome-text">
          <h2>AFC Uthiru Church Management System</h2>
          <p>Use the sidebar to navigate between modules. All data is synced live with Google Sheets.</p>
        </div>
      </div>
    </div>
  );
}
