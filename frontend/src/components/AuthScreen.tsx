import { useState, type FormEvent } from "react";
import { useAuth } from "../store/AuthStore";
import styles from "./AuthScreen.module.css";

export default function AuthScreen() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") await signup(email.trim(), password);
      else await login(email.trim(), password);
      // On success the auth store flips `user` and this screen unmounts.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className={styles.screen}>
      <form className={styles.card} onSubmit={onSubmit}>
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            ◈
          </span>
          <span className={styles.name}>CADENCE</span>
        </div>
        <p className={styles.tagline}>
          {mode === "login" ? "Sign in to your schedule." : "Create your account."}
        </p>

        <label className={styles.label} htmlFor="auth-email">
          Email
        </label>
        <input
          id="auth-email"
          className={styles.input}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />

        <label className={styles.label} htmlFor="auth-password">
          Password
        </label>
        <input
          id="auth-password"
          className={styles.input}
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={mode === "signup" ? 8 : undefined}
        />
        {mode === "signup" && (
          <span className={styles.hint}>At least 8 characters.</span>
        )}

        {error && <div className={styles.error}>{error}</div>}

        <button className={styles.submit} type="submit" disabled={busy}>
          {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
        </button>

        <button
          type="button"
          className={styles.switch}
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError(null);
          }}
        >
          {mode === "login"
            ? "Need an account? Sign up"
            : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
