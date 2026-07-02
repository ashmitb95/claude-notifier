const fs = require("fs");
const path = require("path");
const { ACTIVE_DIR } = require("./paths");

function cwdInsideFolder(cwd, folder) {
  if (!cwd || !folder) return false;
  // On Windows, paths are case-insensitive — normalize for parity with
  // cwdMatchesFolder() in src/routing/cwd.ts.
  const isWindows = process.platform === "win32";
  const normalize = (p) => (isWindows ? p.toLowerCase() : p);
  const normCwd = normalize(cwd);
  const normFolder = normalize(folder);
  if (normCwd === normFolder) return true;
  const sep = path.sep;
  return normCwd.startsWith(normFolder.endsWith(sep) ? normFolder : normFolder + sep);
}

/**
 * Returns true if any live extension owns this cwd — i.e. some VS Code window
 * has a workspace folder that contains the firing cwd. When false, the hook
 * falls through to terminal-fallback notifications.
 *
 * Backwards-compat: an empty marker file means a pre-cwd-routing extension is
 * running; defer to it for any signal until its window reloads.
 */
function extensionOwnsCwd(cwd) {
  let entries;
  try {
    entries = fs.readdirSync(ACTIVE_DIR);
  } catch {
    return false;
  }
  for (const name of entries) {
    const pid = parseInt(name, 10);
    if (!Number.isFinite(pid)) continue;
    try {
      process.kill(pid, 0);
    } catch {
      continue;
    }
    let folders = "";
    try {
      folders = fs.readFileSync(path.join(ACTIVE_DIR, name), "utf-8");
    } catch {}
    if (!folders.trim()) return true;
    for (const folder of folders
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)) {
      if (cwdInsideFolder(cwd, folder)) return true;
    }
  }
  return false;
}

module.exports = { extensionOwnsCwd, cwdInsideFolder };
