export interface ParsedSignal {
  reason: string;
  /** Session id from Claude Code; null when absent (older hooks or v1 format). */
  sessionId: string | null;
  cwd: string;
  /**
   * Ancestor PID chain captured by the Stop hook on macOS/Linux. Used to
   * identify the originating integrated terminal when a notification is
   * clicked. Null when absent (Windows, non-Stop hooks, or older deployments).
   */
  pidChain: number[] | null;
}

const PID_CHAIN_RE = /^[0-9]+(,[0-9]+)*$/;

/**
 * Signal formats written by hook scripts:
 *
 * v2 (current): "<reason> <ts> <session_id|-> [<pid_chain_csv>] <cwd?>"
 *   session_id is "-" when missing; cwd is optional.
 *   pid_chain_csv is comma-separated ancestor PIDs; the parser distinguishes
 *   it from cwd by shape (digits+commas vs path separator). When absent the
 *   field is omitted entirely.
 *
 * v1 (legacy): "<reason> <ts> <cwd?>"
 *   No session_id. Still parsed for hooks deployed by an older extension
 *   version.
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
    const fourth = parts[3];
    let pidChain: number[] | null = null;
    let cwdStart = 3;
    if (fourth !== undefined && PID_CHAIN_RE.test(fourth)) {
      pidChain = fourth.split(",").map((s) => Number.parseInt(s, 10));
      cwdStart = 4;
    }
    const cwd = parts.slice(cwdStart).join(" ");
    return { reason, sessionId, cwd, pidChain };
  }

  // v1 fallback: "<reason> <ts> <cwd?>"
  const firstSpace = content.indexOf(" ");
  const secondSpace = firstSpace >= 0 ? content.indexOf(" ", firstSpace + 1) : -1;
  const cwd = secondSpace >= 0 ? content.slice(secondSpace + 1) : "";
  return { reason, sessionId: null, cwd, pidChain: null };
}
