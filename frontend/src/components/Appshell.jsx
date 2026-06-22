import { useState } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Sidebar from "./Sidebar";
import "./AppShell.css";

export default function AppShell() {
  const { user, loading } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  if (loading) return <div className="shell-loading">Loading…</div>;
  if (!user)   return <Navigate to="/login" replace />;

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <div className="shell">
      {/* Mobile Top Header Bar */}
      <header className="mobile-header">
        <button className="hamburger-btn" onClick={toggleMobileMenu} aria-label="Toggle Menu">
          {isMobileMenuOpen ? "✕" : "☰"}
        </button>
        <div className="mobile-header-title">AFC Uthiru CMS</div>
      </header>

      {/* Sidebar gets passed down visibility class states */}
      <div className={`sidebar-container ${isMobileMenuOpen ? "mobile-open" : ""}`}>
        {/* Backdrop overlay to close menu when tapping outside */}
        {isMobileMenuOpen && <div className="sidebar-overlay" onClick={toggleMobileMenu}></div>}
        <Sidebar onMobileClick={() => setIsMobileMenuOpen(false)} />
      </div>

      <main className="shell-main">
        <Outlet />
      </main>
    </div>
  );
}