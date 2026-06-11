/**
 * Path-param guards for capture routes. Non-UUID ids reaching a uuid-typed
 * column comparison throw a Postgres 500; validating first turns those into a
 * clean 404 (security/robustness finding).
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): boolean {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * v1 chunks are 30 s each, so even a 12-hour call is ~1440 chunks. Cap finalize
 * at a generous ceiling so an unbounded totalChunks can't drive a
 * multi-billion-iteration loop / giant allocation (DoS finding).
 */
export const MAX_TOTAL_CHUNKS = 5000;
