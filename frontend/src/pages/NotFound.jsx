import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", textAlign: "center", padding: 24 }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>404</div>
        <h1 className="h-display" style={{ fontSize: 26, margin: "0 0 10px" }}>This node isn't on the graph</h1>
        <p style={{ color: "var(--text-lo)", marginBottom: 22 }}>The page you're looking for doesn't exist.</p>
        <Link to="/login" className="btn btn-primary">Back to sign in</Link>
      </div>
    </div>
  );
}
