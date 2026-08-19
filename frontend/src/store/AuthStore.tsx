/* Authentication state: who's signed in, plus login/signup/logout.
   Sits above the data store (AppStore) — the calendar only mounts once a user
   is known, and remounts per user so each session loads its own workspace. */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  login as apiLogin,
  logout as apiLogout,
  me as apiMe,
  signup as apiSignup,
  type User,
} from "../lib/api";

interface AuthValue {
  user: User | null;
  loading: boolean; // true until the initial session check resolves
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

// Keep in sync with AppStore's STORAGE_KEY. Clearing it on every auth change
// prevents one account from briefly seeing another's cached workspace.
const WORKSPACE_CACHE_KEY = "cadence.state.v3";
function clearWorkspaceCache() {
  try {
    localStorage.removeItem(WORKSPACE_CACHE_KEY);
  } catch {
    /* private mode — nothing cached anyway */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiMe()
      .then((u) => !cancelled && setUser(u))
      .catch(() => {
        /* backend unreachable — treat as signed out */
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const value: AuthValue = {
    user,
    loading,
    async login(email, password) {
      clearWorkspaceCache();
      setUser(await apiLogin(email, password));
    },
    async signup(email, password) {
      clearWorkspaceCache();
      setUser(await apiSignup(email, password));
    },
    async logout() {
      await apiLogout();
      clearWorkspaceCache();
      setUser(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
