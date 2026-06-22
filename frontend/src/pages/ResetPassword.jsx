import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import "./Login.css";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("This reset link is missing its token. Request a new one.");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      await api.post("/api/auth/reset-password", { token, new_password: newPassword });
      setSuccess(true);
      setTimeout(() => navigate("/login", { replace: true }), 2500);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(detail || "Couldn't reset your password. The link may have expired.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-mark">AFC</div>
          <h1>Invalid link</h1>
          <p className="login-subtitle">
            This password reset link is missing or malformed. Please request a new one.
          </p>
          <Link to="/forgot-password" className="login-button login-button-link">
            Request new link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-mark">AFC</div>
        <h1>Reset password</h1>
        <p className="login-subtitle">Choose a new password for your account.</p>

        {success ? (
          <div className="login-success">
            Password reset successfully. Redirecting you to sign in…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
            {error && <div className="login-error">{error}</div>}
            <div className="login-field">
              <label htmlFor="newPassword">New password</label>
              <input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                autoFocus
              />
            </div>
            <div className="login-field">
              <label htmlFor="confirmPassword">Confirm new password</label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
              />
            </div>
            <button type="submit" className="login-button" disabled={loading}>
              {loading ? "Resetting…" : "Reset password"}
            </button>
          </form>
        )}

        <Link to="/login" className="login-back-link">
          ← Back to sign in
        </Link>
      </div>
    </div>
  );
}
