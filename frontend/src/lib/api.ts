/* Client for the Cadence FastAPI backend (syllabus parsing).
   The backend runs on :8000; see ../../backend/README.md. */

import type { Calendar, CalEvent, Priority, Settings, Task } from "../types";

// 127.0.0.1 (not "localhost") — uvicorn binds IPv4, and "localhost" can resolve
// to IPv6 (::1) in the browser, which the backend isn't listening on.
const API_BASE = "http://127.0.0.1:8000";

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

export interface ParsedTask {
  title: string;
  dueDate: string | null; // ISO "YYYY-MM-DD", or null if the parser couldn't resolve one
  dueDateText: string | null;
  effortHours: number;
  priority: Priority;
}

export interface ParseResult {
  tasks: ParsedTask[];
  /** "ai" = parsed by Claude; "heuristic" = regex fallback (no API key). */
  source: "ai" | "heuristic";
}

export async function parseSyllabus(text: string): Promise<ParseResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/parse-syllabus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    throw new Error(
      "Can't reach the backend. Start it with `cd backend && uvicorn main:app --port 8000`.",
    );
  }
  if (!res.ok) throw new Error(`Backend error (${res.status}). Check its logs.`);
  return res.json();
}
