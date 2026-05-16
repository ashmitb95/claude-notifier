const fs = require("fs");
const path = require("path");
const { ACTIVE_DIR } = require("./paths");

function cwdInsideFolder(cwd, folder) {
  if (!cwd || !folder) return false;
  if (cwd === folder) return true;
  const sep = path.sep;
  return cwd.startsWith(folder.endsWith(sep) ? folder : folder + sep);
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
