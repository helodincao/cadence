/* Client for the Cadence FastAPI backend (syllabus parsing).
   The backend runs on :8000; see ../../backend/README.md. */

import type { Calendar, CalEvent, Priority, Settings, Task } from "../types";

// 127.0.0.1 (not "localhost") — uvicorn binds IPv4, and "localhost" can resolve
// to IPv6 (::1) in the browser, which the backend isn't listening on.
// Override with VITE_API_BASE in frontend/.env (see frontend/.env.example).
// Defaults to :8010 so it doesn't collide with anything already on :8000.
const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://127.0.0.1:8010";

/** The whole workspace, as synced to/from the backend. */
export interface AppStateDTO {
  calendars: Calendar[];
  events: CalEvent[];
  tasks: Task[];
  settings: Settings;
}

export async function getState(): Promise<AppStateDTO> {
  const res = await fetch(`${API_BASE}/api/state`);
  if (!res.ok) throw new Error(`state GET ${res.status}`);
  return res.json();
}

export async function putState(state: AppStateDTO): Promise<void> {
  const res = await fetch(`${API_BASE}/api/state`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
  if (!res.ok) throw new Error(`state PUT ${res.status}`);
}

export interface ImportedTask {
  title: string;
  dueDate: string | null; // ISO "YYYY-MM-DD", or null if none was resolved
  dueDateText: string | null;
  effortHours: number;
  priority: Priority;
}

export interface ImportedEvent {
  title: string;
  date: string; // ISO
  start: number; // decimal 24h hour
  end: number;
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
    res = await fetch(`${API_BASE}/api/import`, { method: "POST", body: fd });
  } catch {
    throw new Error(
      "Can't reach the backend. Start it with `cd backend && uvicorn main:app --port 8010`.",
    );
  }
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
