const { FOCUS_SIGNAL_FILE } = require("./paths");

// POSIX single-quote escape: anything inside '...' is literal except ', which
// closes the quoted run, then we insert '\\'' (escaped quote), then reopen.
function shQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

/**
 * Build the shell snippet passed as terminal-notifier's -execute. On click:
 *   1. Write the firing cwd to FOCUS_SIGNAL_FILE so the extension's focus
 *      watcher reveals the matching Claude tab (when an extension is active
 *      in that window — graceful no-op otherwise).
 *   2. Bring the matching VS Code window forward via `code <cwd>`, falling
 *      back to a generic AppleScript activate when `code` isn't on PATH.
 *
 * Returns null when cwd is empty — callers fall back to a generic activate.
 */
function buildClickAction(cwd) {
  if (!cwd) return null;
  const cwdQ = shQuote(cwd);
  const focusQ = shQuote(FOCUS_SIGNAL_FILE);
  const focusWrite = `printf '%s' ${cwdQ} > ${focusQ}`;
  const bringForward = `{ code ${cwdQ} 2>/dev/null || osascript -e 'tell application "Visual Studio Code" to activate'; }`;
  return `${focusWrite}; ${bringForward}`;
}

/** Generic VS Code activate — no per-window precision. Used when cwd unknown. */
const GENERIC_ACTIVATE = `osascript -e 'tell application "Visual Studio Code" to activate'`;

module.exports = { buildClickAction, GENERIC_ACTIVATE };
