const fs = require("fs");
const path = require("path");

const IS_WIN = process.platform === "win32";
const IS_WSL =
  !IS_WIN &&
  process.platform === "linux" &&
  (() => {
    try {
      return fs.readFileSync("/proc/version", "utf-8").toLowerCase().includes("microsoft");
    } catch {
      return false;
    }
  })();
const USE_WIN = IS_WIN || IS_WSL;

// Where powershell.exe lives when it is not on PATH. /c/... covers the older
// WSL1-style mount root.
const WSL_PS_CANDIDATES = [
  "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
  "/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
];

function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

/**
 * Pick the PowerShell binary to spawn under WSL.
 *
 * Bare "powershell.exe" only resolves when /etc/wsl.conf leaves
 * interop.appendWindowsPath enabled. With `appendWindowsPath = false` the
 * Windows entries are stripped from PATH, so the spawn fails with ENOENT — and
 * because both call sites use stdio:"ignore" inside a try/catch (_lib/notify.js
 * and _lib/play.js), every sound and popup then fails silently with nothing to
 * debug. Interop itself still works in that configuration, so an absolute path
 * does fire; fall back to one.
 *
 * Exported for tests. Production reads the PS_BIN constant below.
 */
function resolveWslPowerShell(pathEnv, exists = fileExists, candidates = WSL_PS_CANDIDATES) {
  for (const dir of String(pathEnv || "").split(path.delimiter)) {
    if (dir && exists(path.join(dir, "powershell.exe"))) return "powershell.exe";
  }
  for (const candidate of candidates) {
    if (exists(candidate)) return candidate;
  }
  // Nothing found: keep the previous behaviour rather than inventing a path.
  return "powershell.exe";
}

const PS_BIN = IS_WSL ? resolveWslPowerShell(process.env.PATH) : "powershell";
const IS_LINUX = !IS_WIN && !IS_WSL && process.platform === "linux";
const IS_MAC = process.platform === "darwin";

module.exports = {
  IS_WIN,
  IS_WSL,
  USE_WIN,
  PS_BIN,
  IS_LINUX,
  IS_MAC,
  resolveWslPowerShell,
  WSL_PS_CANDIDATES,
};
