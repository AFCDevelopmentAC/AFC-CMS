import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import "./Login.css";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("Enter your account email.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/api/auth/forgot-password", { email: email.trim() });
      setSubmitted(true);
    } catch (err) {
      setError("Couldn't send the reset link. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-mark">AFC</div>
        <h1>Forgot password</h1>
        <p className="login-subtitle">
          {submitted
            ? "Check your inbox for the reset link."
            : "Enter your account email and we'll send you a reset link."}
        </p>

        {submitted ? (
          <div className="login-success">
            If an account exists for <strong>{email}</strong>, a password reset link has been
            sent. The link expires in 1 hour.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
            {error && <div className="login-error">{error}</div>}
            <div className="login-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
              />
            </div>
            <button type="submit" className="login-button" disabled={loading}>
              {loading ? "Sending…" : "Send reset link"}
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
