import { useEffect, useState } from "react";
import api from "../api/axios";
import { SkeletonCard } from "../components/PageLoader";
import "../components/PageLoader.css";
import "./Members.css";

export default function Members() {
  const [members, setMembers]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [search, setSearch]     = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const { data } = await api.get("/api/members");
      setMembers(data);
    } catch {
      setError("Could not load members. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = members.filter(m => {
    const q = search.toLowerCase();
    return !q ||
      (m.MEMBER_NAME || m.FULL_NAME || "").toLowerCase().includes(q) ||
      (m.PHONE || "").includes(q) ||
      (m.DEPARTMENT_1 || "").toLowerCase().includes(q);
  });

  return (
    <div className="members-page">
      <div className="members-header">
        <div>
          <h1>Members</h1>
          <p className="members-subtitle">
            {loading ? "Loading…" : `${members.length} member${members.length !== 1 ? "s" : ""} registered`}
          </p>
        </div>
        <button className="members-btn-primary" onClick={() => {}}>+ Add Member</button>
      </div>

      <input className="members-search"
        placeholder="Search name, phone, department…"
        value={search} onChange={e => setSearch(e.target.value)} />

      {error && (
        <div className="members-error">
          {error}
          <button onClick={load} className="members-retry">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="members-skeleton-list">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} lines={3} avatar />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="members-empty">
          <div className="members-empty-icon">👥</div>
          <div className="members-empty-title">
            {search ? `No results for "${search}"` : "No members yet"}
          </div>
          <div className="members-empty-hint">
            {search ? "Try a different name or phone number." : "Click + Add Member to register the first member."}
          </div>
        </div>
      ) : (
        <div className="members-list">
          {filtered.map(m => (
            <div key={m.S_N} className="member-card">
              <div className="member-photo-wrap">
                {m.PROFILE_PHOTO_URL || m.PHOTO_URL ? (
                  <img src={m.PROFILE_PHOTO_URL || m.PHOTO_URL}
                    alt={m.MEMBER_NAME || m.FULL_NAME}
                    className="member-photo"
                    onError={e => { e.target.style.display = "none"; }} />
                ) : (
                  <div className="member-avatar">
                    {((m.MEMBER_NAME || m.FULL_NAME || "?")[0]).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="member-info">
                <div className="member-name">{m.MEMBER_NAME || m.FULL_NAME}</div>
                <div className="member-phone">{m.PHONE || "-"}</div>
                <div className="member-dept">{m.DEPARTMENT_1 || "-"}</div>
              </div>
              <span className={`member-status member-status-${(m.MEMBERSHIP_STATUS||"").toLowerCase().replace(/\s+/g,"-")}`}>
                {m.MEMBERSHIP_STATUS || "-"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}