/* Client for the Cadence FastAPI backend.
   The frontend calls same-origin `/api/*`; in dev Vite proxies those to the
   backend (see vite.config.ts) so session cookies work without CORS friction.
   Override the base with VITE_API_BASE only when NOT using the proxy. */

import type { Calendar, CalEvent, Priority, Settings, Task } from "../types";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

// Always send the session cookie (needed if VITE_API_BASE points cross-origin).
const CREDS: RequestInit = { credentials: "include" };

/** Thrown when the backend returns 401 — the caller should show the sign-in UI. */
export class AuthError extends Error {}

/** A signed-in user. */
export interface User {
  id: string;
  email: string;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body?.detail) return body.detail;
  } catch {
    /* non-JSON body */
  }
  return fallback;
}

export async function signup(email: string, password: string): Promise<User> {
  const res = await fetch(`${API_BASE}/api/auth/signup`, {
    ...CREDS,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not create the account."));
  return res.json();
}

export async function login(email: string, password: string): Promise<User> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    ...CREDS,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not sign in."));
  return res.json();
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/api/auth/logout`, { ...CREDS, method: "POST" });
}

/** Returns the current user, or null if not signed in. */
export async function me(): Promise<User | null> {
  const res = await fetch(`${API_BASE}/api/auth/me`, CREDS);
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`auth/me ${res.status}`);
  return res.json();
}

/** The whole workspace, as synced to/from the backend. */
export interface AppStateDTO {
  calendars: Calendar[];
  events: CalEvent[];
  tasks: Task[];
  settings: Settings;
}

export async function getState(): Promise<AppStateDTO> {
  const res = await fetch(`${API_BASE}/api/state`, CREDS);
  if (res.status === 401) throw new AuthError("Not signed in");
  if (!res.ok) throw new Error(`state GET ${res.status}`);
  return res.json();
}

export async function putState(state: AppStateDTO): Promise<void> {
  const res = await fetch(`${API_BASE}/api/state`, {
    ...CREDS,
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
  if (res.status === 401) throw new AuthError("Not signed in");
  if (!res.ok) throw new Error(`state PUT ${res.status}`);
}

export interface ImportedTask {
  title: string;
  dueDate: string | null; // ISO "YYYY-MM-DD", or null if none was resolved
  dueDateText: string | null;
  effortHours: number;
  priority: Priority;
  group: string; // inferred category, e.g. "Exams", "Assignments"
}

export interface ImportedEvent {
  title: string;
  date: string; // ISO
  start: number; // decimal 24h hour
  end: number;
  group: string; // inferred category, e.g. "Lectures", "Office Hours"
}

export interface ImportResult {
  note: string;
  tasks: ImportedTask[];
  events: ImportedEvent[];
  /** "ai" = planned by Claude; "heuristic" = regex fallback (no API key). */
  source: "ai" | "heuristic";
}

/** Send an instruction + optional files to the AI import endpoint.
 *  Pass `deadline` (ISO "YYYY-MM-DD") to frame the result as work sessions
 *  that must finish on or before that date (the event editor's "plan work"). */
export async function importDetails(
  prompt: string,
  files: File[],
  deadline?: string,
): Promise<ImportResult> {
  const fd = new FormData();
  fd.append("prompt", prompt);
  if (deadline) fd.append("deadline", deadline);
  for (const f of files) fd.append("files", f);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/import`, { ...CREDS, method: "POST", body: fd });
  } catch {
    throw new Error(
      "Can't reach the backend. Start it with `./run.sh` (or `uvicorn main:app --port 8010`).",
    );
  }
  if (res.status === 401) throw new AuthError("Not signed in");
  if (!res.ok) {
    let msg = `Backend error (${res.status}). Check its logs.`;
    try {
      const body = await res.json();
      if (body?.detail) msg = body.detail; // FastAPI's clean error message
    } catch {
      /* non-JSON body — keep the generic message */
    }
    throw new Error(msg);
  }
  return res.json();
}
