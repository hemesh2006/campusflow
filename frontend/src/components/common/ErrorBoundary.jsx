import { Component } from "react";
import { AlertTriangle } from "lucide-react";

// Catches any render/runtime error anywhere below it in the tree and
// shows a recoverable screen instead of an unmounted, blank white page.
// Wrapped around the whole app in main.jsx.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Still log to console so it's visible in devtools during testing.
    console.error("CampusFlow crashed:", error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: 14, padding: 30, textAlign: "center", fontFamily: "system-ui, sans-serif",
        }}>
          <AlertTriangle size={34} color="#dc2626" />
          <h2 style={{ margin: 0, fontSize: 18 }}>Something went wrong</h2>
          <p style={{ margin: 0, fontSize: 13, color: "#6b7280", maxWidth: 420 }}>
            {this.state.error.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={() => { this.setState({ error: null }); window.location.href = "/"; }}
            style={{
              marginTop: 8, padding: "9px 18px", borderRadius: 8, border: "none",
              background: "#3b6cf6", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13.5,
            }}
          >
            Reload CampusFlow
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
