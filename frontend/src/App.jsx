import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import AppShell from "./components/AppShell";
import Login from "./pages/Login";
import Members from "./pages/Members";
import Users from "./pages/Users";
import Sessions from "./pages/Sessions";
import SessionForm from "./pages/SessionForm";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Audit from "./pages/Audit";

const API_URL = import.meta.env.VITE_API_BASE_URL || "https://afc-cms.onrender.com";
const MAX_RETRIES = 10;      // try up to 10 times
const RETRY_INTERVAL = 3000; // every 3 seconds = 30 seconds max wait

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!user?.is_admin) return <Navigate to="/members" replace />;
  return children;
}

function BackendWakeUp({ onReady }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let tries = 0;

    async function ping() {
      while (tries < MAX_RETRIES && !cancelled) {
        try {
          const res = await fetch(`${API_URL}/`, { cache: "no-store" });
          if (res.ok) {
            if (!cancelled) onReady();
            return;
          }
        } catch (e) {
          // still sleeping — keep trying
        }
        tries++;
        if (!cancelled) setAttempt(tries);
        if (tries < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, RETRY_INTERVAL));
        }
      }
      if (!cancelled) setFailed(true);
    }

    ping();
    return () => { cancelled = true; };
  }, []);

  if (failed) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", fontFamily: "Inter, sans-serif",
        background: "#F7FAFC", padding: "24px"
      }}>
        <div style={{
          background: "#fff", borderRadius: "16px", padding: "40px 32px",
          maxWidth: "400px", textAlign: "center",
          boxShadow: "0 8px 32px rgba(15,42,71,.12)",
          border: "1px solid #E8EDF3"
        }}>
          <div style={{ fontSize: "40px", marginBottom: "16px" }}>⚠️</div>
          <h2 style={{ color: "#0F2A47", margin: "0 0 8px", fontSize: "18px" }}>
            Server unavailable
          </h2>
          <p style={{ color: "#64748B", fontSize: "13.5px", lineHeight: "1.6", margin: "0 0 24px" }}>
            Could not connect to the server after {MAX_RETRIES} attempts.
            Please check your internet connection and try again.
          </p>
          <button onClick={() => window.location.reload()} style={{
            background: "#00B4D8", color: "#04212F", border: "none",
            borderRadius: "8px", padding: "10px 24px", fontFamily: "Inter, sans-serif",
            fontSize: "14px", fontWeight: "600", cursor: "pointer"
          }}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", fontFamily: "Inter, sans-serif",
      background: "#F7FAFC"
    }}>
      <div style={{
        background: "#fff", borderRadius: "16px", padding: "40px 32px",
        maxWidth: "360px", width: "100%", textAlign: "center",
        boxShadow: "0 8px 32px rgba(15,42,71,.12)",
        border: "1px solid #E8EDF3"
      }}>
        {/* AFC logo */}
        <div style={{
          width: "56px", height: "56px", borderRadius: "14px",
          background: "#00B4D8", color: "#04212F",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: "800", fontSize: "16px", margin: "0 auto 20px"
        }}>AFC</div>

        <h2 style={{ color: "#0F2A47", margin: "0 0 6px", fontSize: "18px", fontWeight: "700" }}>
          AFC Uthiru CMS
        </h2>
        <p style={{ color: "#64748B", fontSize: "13px", margin: "0 0 28px" }}>
          Starting up the server...
        </p>

        {/* Animated progress dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginBottom: "20px" }}>
          {Array.from({ length: MAX_RETRIES }).map((_, i) => (
            <div key={i} style={{
              width: "8px", height: "8px", borderRadius: "50%",
              background: i < attempt ? "#00B4D8" : "#E2E8F0",
              transition: "background 0.3s"
            }} />
          ))}
        </div>

        {/* Spinner */}
        <div style={{
          width: "28px", height: "28px",
          border: "3px solid #E8EDF3", borderTopColor: "#00B4D8",
          borderRadius: "50%", animation: "spin 0.7s linear infinite",
          margin: "0 auto 16px"
        }} />

        <p style={{ color: "#94A3B8", fontSize: "12px", margin: "0" }}>
          {attempt === 0
            ? "Connecting to server..."
            : `Waiting for server to wake up... (${attempt}/${MAX_RETRIES})`}
        </p>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

export default function App() {
  const [backendReady, setBackendReady] = useState(false);

  return (
    <AuthProvider>
      <BrowserRouter>
        {!backendReady ? (
          <BackendWakeUp onReady={() => setBackendReady(true)} />
        ) : (
          <Routes>
            {/* Public */}
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Protected inside AppShell */}
            <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
              <Route path="/members"  element={<Members />} />
              <Route path="/sessions" element={<Sessions />} />
              <Route path="/sessions/:sessionId" element={<SessionForm />} />
              <Route path="/users" element={<AdminRoute><Users /></AdminRoute>} />
              <Route path="/audit" element={<AdminRoute><Audit /></AdminRoute>} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/members" replace />} />
          </Routes>
        )}
      </BrowserRouter>
    </AuthProvider>
  );
}