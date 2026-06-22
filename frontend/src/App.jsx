import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import AppShell from "./components/AppShell";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Members from "./pages/Members";

// Placeholder pages — we'll build these out next
const Placeholder = ({ title }) => (
  <div style={{ padding: "2rem", fontFamily: "Inter, sans-serif" }}>
    <h2 style={{ color: "#0F2A47", marginBottom: "0.5rem" }}>{title}</h2>
    <p style={{ color: "#64748B" }}>This module is coming up next.</p>
  </div>
);

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/members" element={<Members />} />
          <Route path="/" element={<AppShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard"    element={<Dashboard />} />
            <Route path="members"      element={<Placeholder title="Members" />} />
            <Route path="visitors"     element={<Placeholder title="Visitors" />} />
            <Route path="new-converts" element={<Placeholder title="New Converts" />} />
            <Route path="services"     element={<Placeholder title="Services" />} />
            <Route path="events"       element={<Placeholder title="Events" />} />
            <Route path="finance"      element={<Placeholder title="Finance" />} />
            <Route path="users"        element={<Placeholder title="User Management" />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
