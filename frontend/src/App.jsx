import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import AppShell from "./components/AppShell";
import Login from "./pages/Login";
import Members from "./pages/Members";
import Users from "./pages/Users";
import Services from "./pages/Services";
import Events from "./pages/Events";
import AttendancePage from "./pages/AttendancePage";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Audit from "./pages/Audit";

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

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* ── Public ── */}
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* ── Protected (inside AppShell) ── */}
          <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
            <Route path="/members"  element={<Members />} />
            <Route path="/services" element={<Services />} />
            <Route path="/events"   element={<Events />} />

            {/* Attendance — :sessionType = SERVICE|EVENT, :sessionId = SVC-... or EVT-... */}
            <Route path="/attendance/:sessionType/:sessionId" element={<AttendancePage />} />

            {/* Admin-only */}
            <Route path="/users" element={<AdminRoute><Users /></AdminRoute>} />
            <Route path="/audit" element={<AdminRoute><Audit /></AdminRoute>} />
          </Route>

          {/* ── Fallback ── */}
          <Route path="*" element={<Navigate to="/members" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}