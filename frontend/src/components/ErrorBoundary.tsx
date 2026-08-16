import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** Catches render/runtime errors so a crash shows a recoverable message
 *  instead of a blank page. Reset clears the local cache and reloads. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Cadence crashed:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: 24,
            fontFamily: "var(--font-ui)",
            color: "var(--ink)",
            background: "var(--bg)",
          }}
        >
          <div
            style={{
              maxWidth: 420,
              textAlign: "center",
              border: "1px solid var(--cyan)",
              borderRadius: 4,
              padding: "24px 28px",
              background: "var(--surface-solid)",
              boxShadow: "var(--glow-cyan-soft)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 16,
                letterSpacing: "0.16em",
                color: "var(--cyan-bright)",
                marginBottom: 10,
              }}
            >
              ◈ SOMETHING WENT WRONG
            </div>
            <p style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.5, margin: "0 0 18px" }}>
              The app hit an error. Resetting clears the local cache and reloads —
              your data in the backend is safe.
            </p>
            <button
              onClick={() => {
                localStorage.clear();
                location.reload();
              }}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontWeight: 700,
                color: "var(--bg)",
                background: "var(--cyan)",
                border: "none",
                borderRadius: 3,
                padding: "9px 18px",
                cursor: "pointer",
              }}
            >
              Reset &amp; reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
