/** Short unique id. Uses the browser's crypto UUID (available on
 *  localhost + https), with a tiny fallback for odd environments. */
export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
