/** Wall-clock helper for server components (display-only decisions; the database is the authority). */
export function nowMs(): number {
  return Date.now();
}
