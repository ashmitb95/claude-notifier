const fs = require("fs");
const { SIGNAL_FILE } = require("./paths");

/**
 * Write a signal for the extension to consume.
 *
 * Format v2 (current): "<reason> <ts> <session_id|-> [<pid_chain_csv>] <cwd?>"
 *   session_id is a single token (no whitespace); "-" when absent.
 *   pid_chain_csv is comma-separated ancestor PIDs; omitted when absent.
 *   The parser distinguishes pid_chain from cwd by shape: digits+commas vs
 *   the path separator in cwd. Stop hooks emit pid_chain on macOS/Linux to
 *   support click-to-focus the originating terminal or editor tab.
 *
 * Format v1 (legacy): "<reason> <ts> <cwd?>"
 *   Still accepted by the parser for back-compat with older deployed hooks.
 *   New writes always use v2.
 */
function writeSignal(reason, sessionId, cwd, pidChain) {
  try {
    const ts = Date.now();
    const sid = sessionId ? String(sessionId).replace(/\s+/g, "") : "-";
    const safeSid = sid || "-";
    const hasChain = Array.isArray(pidChain) && pidChain.length > 0;
    const chainCsv = hasChain ? pidChain.filter((n) => Number.isInteger(n) && n > 0).join(",") : "";
    const middle = chainCsv ? ` ${chainCsv}` : "";
    const payload = cwd
      ? `${reason} ${ts} ${safeSid}${middle} ${cwd}`
      : `${reason} ${ts} ${safeSid}${middle}`;
    fs.writeFileSync(SIGNAL_FILE, payload);
  } catch {}
}

module.exports = { writeSignal };
