// Network-level failures mean "the database is not reachable right now". They
// are recoverable at startup: liveness must not depend on the database. SQL
// errors and authentication failures are real problems and must still abort.
const UNAVAILABLE_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTCONN",
  "ENOTFOUND",
  "EPIPE",
  "ETIMEDOUT",
  "57P03", // cannot_connect_now
]);

function collectCodes(error: unknown, codes: string[], seen: Set<unknown>): void {
  if (!(error instanceof Error) || seen.has(error)) {
    return;
  }

  seen.add(error);

  const code: unknown = (error as { code?: unknown }).code;

  if (typeof code === "string") {
    codes.push(code);
  }

  collectCodes(error.cause, codes, seen);

  if (error instanceof AggregateError) {
    for (const inner of error.errors) {
      collectCodes(inner, codes, seen);
    }
  }
}

function isConnectionSqlState(code: string): boolean {
  return code.length === 5 && code.startsWith("08");
}

/** True only for failures that a later connection attempt can resolve. */
export function isDatabaseUnavailable(error: unknown): boolean {
  const codes: string[] = [];
  collectCodes(error, codes, new Set());

  return codes.some((code) => UNAVAILABLE_CODES.has(code) || isConnectionSqlState(code));
}
