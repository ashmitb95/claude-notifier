const fs = require("fs");
const { SIGNAL_FILE } = require("./paths");

/**
 * Write a signal for the extension to consume.
 *
 * Format v2 (current): "<reason> <ts> <session_id|-> <cwd?>"
 *   session_id is a single token (no whitespace); "-" when absent.
 *   cwd is optional — Stop includes it for per-window routing; others omit it.
 *
 * Format v1 (legacy): "<reason> <ts> <cwd?>"
 *   Still accepted by the parser for back-compat with older deployed hooks.
 *   New writes always use v2.
 */
function writeSignal(reason, sessionId, cwd) {
  try {
    const ts = Date.now();
    // Session id may contain anything Claude Code chooses to send. Strip
    // whitespace defensively so the space-delimited signal format stays
    // parseable. Empty/missing → "-".
    const sid = sessionId ? String(sessionId).replace(/\s+/g, "") : "-";
    const safeSid = sid || "-";
    const payload = cwd ? `${reason} ${ts} ${safeSid} ${cwd}` : `${reason} ${ts} ${safeSid}`;
    fs.writeFileSync(SIGNAL_FILE, payload);
  } catch {}
}

module.exports = { writeSignal };
