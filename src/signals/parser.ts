export interface ParsedSignal {
  reason: string;
  /** Session id from Claude Code; null when absent (older hooks or v1 format). */
  sessionId: string | null;
  cwd: string;
}

/**
 * Signal formats written by hook scripts:
 *
 * v2 (current): "<reason> <ts> <session_id|-> <cwd?>"
 *   session_id is "-" when missing; cwd is optional.
 *
 * v1 (legacy): "<reason> <ts> <cwd?>"
 *   No session_id. Still parsed for hooks deployed by an older extension
 *   version. The third token disambiguates: if it parses as a base-10
 *   integer-only timestamp-shape it's v1's cwd-start; if it's a token
 *   with no path separator and no dot it's v2's session_id. We pick a
 *   simpler heuristic: a session id is a single token with no path
 *   separator (/ or \\); a cwd contains a path separator.
 *
 * Both formats: cwd may contain spaces and is the rest of the line after
 * the leading tokens.
 */
export function parseSignal(content: string): ParsedSignal {
  const parts = content.split(" ");
  const reason = parts[0] ?? "";
  const third = parts[2];

  // v2 detection: third token is "-" or a token without path separators.
  // v1: third token starts the cwd (which contains / or \\, or is missing).
  const isV2 =
    third !== undefined &&
    third !== "" &&
    (third === "-" || (!third.includes("/") && !third.includes("\\")));

  if (isV2) {
    const sessionId = third === "-" ? null : (third ?? null);
    const cwd = parts.slice(3).join(" ");
    return { reason, sessionId, cwd };
  }

  // v1 fallback: "<reason> <ts> <cwd?>"
  const firstSpace = content.indexOf(" ");
  const secondSpace = firstSpace >= 0 ? content.indexOf(" ", firstSpace + 1) : -1;
  const cwd = secondSpace >= 0 ? content.slice(secondSpace + 1) : "";
  return { reason, sessionId: null, cwd };
}
