/**
 * PageLoader — full-page loading overlay shown while any page is 
 * fetching its initial data. Pass `label` to customise the message.
 */
export default function PageLoader({ label = "Loading…" }) {
  return (
    <div className="pl-wrap">
      <div className="pl-card">
        <div className="pl-spinner" />
        <span className="pl-label">{label}</span>
      </div>
    </div>
  );
}

/**
 * SkeletonBlock — generic shimmering rectangle.
 * width / height are CSS strings e.g. "60%" / "14px"
 */
export function SkeletonBlock({ width = "100%", height = "14px", radius = "6px", style = {} }) {
  return (
    <div className="sk-block" style={{ width, height, borderRadius: radius, ...style }} />
  );
}

/**
 * SkeletonCard — a shimmering card placeholder with avatar + lines.
 */
export function SkeletonCard({ lines = 2, avatar = false }) {
  return (
    <div className="sk-card">
      {avatar && <div className="sk-avatar" />}
      <div className="sk-lines">
        <div className="sk-block sk-line-1" />
        {lines >= 2 && <div className="sk-block sk-line-2" />}
        {lines >= 3 && <div className="sk-block sk-line-3" />}
      </div>
    </div>
  );
}

/**
 * SkeletonTable — shimmering table rows.
 */
export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div className="sk-table">
      {Array.from({ length: rows }).map((_, ri) => (
        <div key={ri} className="sk-row">
          {Array.from({ length: cols }).map((_, ci) => (
            <div key={ci} className="sk-cell">
              <div className="sk-block" style={{ width: ci === 0 ? "40%" : ci === cols - 1 ? "60%" : "80%" }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * SkeletonForm — shimmering form fields.
 */
export function SkeletonForm({ fields = 4 }) {
  return (
    <div className="sk-form">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="sk-form-field">
          <div className="sk-block sk-label" />
          <div className="sk-block sk-input" />
        </div>
      ))}
      <div className="sk-block sk-btn" />
    </div>
  );
}