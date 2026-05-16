const fs = require("fs");
const { execSync, execFileSync } = require("child_process");
const { USE_WIN, IS_LINUX, IS_MAC, PS_BIN } = require("./platform");

const TITLE = "Claude Notifier";

// PowerShell single-quoted strings escape ' as ''. Anything else is literal.
function psSingleQuoteEscape(s) {
  return String(s).replace(/'/g, "''");
}

// AppleScript double-quoted string literals: escape \ and ".
function appleScriptEscape(s) {
  return String(s).replace(/[\\"]/g, "\\$&");
}

function findTerminalNotifier() {
  if (!IS_MAC) return null;
  for (const c of ["/opt/homebrew/bin/terminal-notifier", "/usr/local/bin/terminal-notifier"]) {
    try {
      fs.accessSync(c, fs.constants.X_OK);
      return c;
    } catch {}
  }
  try {
    const out = execFileSync("/usr/bin/which", ["terminal-notifier"], { encoding: "utf-8" }).trim();
    if (out) return out;
  } catch {}
  return null;
}

/**
 * Show an OS notification. Title is always "Claude Notifier".
 *
 * On macOS: when opts.preferTerminalNotifier is true and terminal-notifier is
 * installed, use it (gives clickable notifications that focus VS Code). Else
 * falls back to osascript. Non-stop hooks set this to false because the
 * popup is short-lived and clickability matters less when the user is active.
 */
function showNotification(message, opts = {}) {
  const preferTn = !!opts.preferTerminalNotifier;
  try {
    if (USE_WIN) {
      const safeMsg = psSingleQuoteEscape(message);
      const safeTitle = psSingleQuoteEscape(TITLE);
      const ps = `Add-Type -AssemblyName System.Windows.Forms; $n=New-Object System.Windows.Forms.NotifyIcon; $n.Icon=[System.Drawing.SystemIcons]::Information; $n.Visible=$true; $n.ShowBalloonTip(3000,'${safeTitle}','${safeMsg}',[System.Windows.Forms.ToolTipIcon]::None); Start-Sleep -m 500; $n.Dispose()`;
      execSync(
        `${PS_BIN} -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(ps, "utf16le").toString("base64")}`,
        { stdio: "ignore", timeout: 5000 }
      );
    } else if (IS_LINUX) {
      // execFileSync bypasses the shell — no shell-escaping concerns for $ or `.
      execFileSync("notify-send", ["--app-name=Claude Code", TITLE, String(message)], {
        stdio: "ignore",
        timeout: 5000,
      });
    } else if (IS_MAC) {
      if (preferTn) {
        const tn = findTerminalNotifier();
        if (tn) {
          execFileSync(tn, ["-title", TITLE, "-message", String(message)], { stdio: "ignore" });
          return;
        }
      }
      // execFileSync bypasses the shell; AppleScript still needs its own \ and " escaping.
      const escaped = appleScriptEscape(message);
      execFileSync("osascript", ["-e", `display notification "${escaped}" with title "${TITLE}"`], {
        stdio: "ignore",
      });
    }
  } catch {}
}

module.exports = { showNotification, findTerminalNotifier, TITLE };
