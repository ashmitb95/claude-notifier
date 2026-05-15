#!/usr/bin/env node
// Claude Notifier — Stop hook script (v3)
// Writes a "done" signal for the VSCode extension to debounce. When no
// extension is active (terminal-only), plays sound/notification directly as
// a fallback. Each active extension window writes a PID marker file into
// claude-notifier-active.d/; the hook only defers when a marker names a
// live process, so a crashed extension doesn't silence terminal fallback.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const HOOKS_DIR = path.join(process.env.HOME || process.env.USERPROFILE || "~", ".claude", "hooks");
const MUTE_FLAG = path.join(HOOKS_DIR, "claude-notifier-muted");
const SIGNAL_FILE = path.join(HOOKS_DIR, "claude-signal");
const ACTIVE_DIR = path.join(HOOKS_DIR, "claude-notifier-active.d");

// Walk the parent PID chain so the extension can match this hook's invocation
// to a specific vscode.window.Terminal (whose processId is the shell pid —
// one of our ancestors). macOS/Linux only; Windows skips and gets no per-tab
// focus (just window focus).
function getAncestorPids() {
  if (process.platform === "win32") return [];
  const chain = [];
  let pid = process.ppid;
  while (pid && pid > 1 && chain.length < 20) {
    chain.push(pid);
    try {
      const out = require("child_process").execFileSync("/bin/ps", ["-o", "ppid=", "-p", String(pid)], { encoding: "utf-8" }).trim();
      const next = parseInt(out, 10);
      if (!next || Number.isNaN(next) || next === pid) break;
      pid = next;
    } catch { break; }
  }
  return chain;
}

function findTerminalNotifier() {
  if (process.platform !== "darwin") return null;
  for (const c of ["/opt/homebrew/bin/terminal-notifier", "/usr/local/bin/terminal-notifier"]) {
    try { fs.accessSync(c, fs.constants.X_OK); return c; } catch {}
  }
  try {
    const out = require("child_process").execFileSync("/usr/bin/which", ["terminal-notifier"], { encoding: "utf-8" }).trim();
    if (out) return out;
  } catch {}
  return null;
}

function cwdInsideFolder(cwd, folder) {
  if (!cwd || !folder) return false;
  if (cwd === folder) return true;
  const sep = path.sep;
  return cwd.startsWith(folder.endsWith(sep) ? folder : folder + sep);
}

// Returns true if any live extension owns this cwd (i.e. its window has a
// matching workspace folder). When no extension claims the cwd — for example
// a Claude session running in a terminal that's not inside any open VS Code
// workspace — we fall through to terminal-fallback notifications.
function extensionOwnsCwd(cwd) {
  let entries;
  try { entries = fs.readdirSync(ACTIVE_DIR); } catch { return false; }
  for (const name of entries) {
    const pid = parseInt(name, 10);
    if (!Number.isFinite(pid)) continue;
    try { process.kill(pid, 0); } catch { continue; }
    let folders = "";
    try { folders = fs.readFileSync(path.join(ACTIVE_DIR, name), "utf-8"); } catch {}
    // Backwards-compat: empty PID file means a pre-cwd-routing extension is
    // running. Defer to it for any signal — once that window reloads, the
    // file gets a workspace list and proper routing kicks in.
    if (!folders.trim()) return true;
    for (const folder of folders.split("\n").map((s) => s.trim()).filter(Boolean)) {
      if (cwdInsideFolder(cwd, folder)) return true;
    }
  }
  return false;
}
const IS_WIN = process.platform === "win32";
const IS_WSL = !IS_WIN && process.platform === "linux" && (() => {
  try { return fs.readFileSync("/proc/version", "utf-8").toLowerCase().includes("microsoft"); } catch { return false; }
})();
const USE_WIN = IS_WIN || IS_WSL;
const PS_BIN = IS_WSL ? "powershell.exe" : "powershell";
const IS_LINUX = !IS_WIN && !IS_WSL && process.platform === "linux";

const MACOS_SOUNDS = {
  Basso: "/System/Library/Sounds/Basso.aiff", Blow: "/System/Library/Sounds/Blow.aiff",
  Bottle: "/System/Library/Sounds/Bottle.aiff", Frog: "/System/Library/Sounds/Frog.aiff",
  Funk: "/System/Library/Sounds/Funk.aiff", Glass: "/System/Library/Sounds/Glass.aiff",
  Hero: "/System/Library/Sounds/Hero.aiff", Morse: "/System/Library/Sounds/Morse.aiff",
  Ping: "/System/Library/Sounds/Ping.aiff", Pop: "/System/Library/Sounds/Pop.aiff",
  Purr: "/System/Library/Sounds/Purr.aiff", Sosumi: "/System/Library/Sounds/Sosumi.aiff",
  Submarine: "/System/Library/Sounds/Submarine.aiff", Tink: "/System/Library/Sounds/Tink.aiff",
};
const WIN_SOUNDS = {
  "Windows Notify": "C:\\Windows\\Media\\Windows Notify.wav", "tada": "C:\\Windows\\Media\\tada.wav",
  "chimes": "C:\\Windows\\Media\\chimes.wav", "chord": "C:\\Windows\\Media\\chord.wav",
  "ding": "C:\\Windows\\Media\\ding.wav", "notify": "C:\\Windows\\Media\\notify.wav",
  "ringin": "C:\\Windows\\Media\\ringin.wav", "Windows Background": "C:\\Windows\\Media\\Windows Background.wav",
};
const LINUX_SOUNDS_DIR = "/usr/share/sounds/freedesktop/stereo";
const LINUX_SOUNDS = {
  Basso:     `${LINUX_SOUNDS_DIR}/dialog-warning.oga`,
  Blow:      `${LINUX_SOUNDS_DIR}/service-logout.oga`,
  Bottle:    `${LINUX_SOUNDS_DIR}/bell.oga`,
  Frog:      `${LINUX_SOUNDS_DIR}/message-new-instant.oga`,
  Funk:      `${LINUX_SOUNDS_DIR}/message-new-instant.oga`,
  Glass:     `${LINUX_SOUNDS_DIR}/bell.oga`,
  Hero:      `${LINUX_SOUNDS_DIR}/complete.oga`,
  Morse:     `${LINUX_SOUNDS_DIR}/message.oga`,
  Ping:      `${LINUX_SOUNDS_DIR}/message.oga`,
  Pop:       `${LINUX_SOUNDS_DIR}/dialog-information.oga`,
  Purr:      `${LINUX_SOUNDS_DIR}/service-login.oga`,
  Sosumi:    `${LINUX_SOUNDS_DIR}/dialog-warning.oga`,
  Submarine: `${LINUX_SOUNDS_DIR}/alarm-clock-elapsed.oga`,
  Tink:      `${LINUX_SOUNDS_DIR}/bell.oga`,
};

function resolveSound(name, defaultMac, defaultWin) {
  if (USE_WIN) return WIN_SOUNDS[name] || defaultWin;
  if (IS_LINUX) return LINUX_SOUNDS[name] || `${LINUX_SOUNDS_DIR}/complete.oga`;
  return MACOS_SOUNDS[name] || defaultMac;
}

function readConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(HOOKS_DIR, "claude-notifier-config.json"), "utf-8")); }
  catch { return null; }
}

let raw = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let input = {};
  try { input = JSON.parse(raw); } catch { process.exit(0); }

  if (input.stop_hook_active) process.exit(0);
  if (fs.existsSync(MUTE_FLAG)) process.exit(0);

  const cwd = (input && input.cwd) || process.cwd() || "";

  // Write signal for the VSCode extension (which debounces "done" signals
  // and routes them to the matching window via cwd). Format:
  //   done <ts> <ancestor_pids_csv|-> <session_id|-> <cwd>
  // ancestor pids let the extension identify which integrated terminal fired
  // this hook; session_id lets it focus the specific Claude Code editor tab.
  try {
    const pids = getAncestorPids();
    const pidField = pids.length > 0 ? pids.join(",") : "-";
    const sid = (input && input.session_id) ? String(input.session_id).replace(/\s+/g, "") : "-";
    fs.writeFileSync(SIGNAL_FILE, `done ${Date.now()} ${pidField} ${sid} ${cwd}`);
  } catch {}

  // If a VSCode window owns this cwd, the extension handles sound/notification
  // with debounce. Otherwise (terminal Claude or unrelated workspace) we play
  // directly here.
  if (extensionOwnsCwd(cwd)) process.exit(0);

  const config = readConfig();
  const eventCfg = config?.taskCompleted ?? {};
  const level = eventCfg.level ?? "sound+popup";

  if (level === "off") process.exit(0);

  const sound = resolveSound(eventCfg.sound, "/System/Library/Sounds/Hero.aiff", "C:\\Windows\\Media\\tada.wav");

  if (level === "sound+popup" || level === "sound") {
    try {
      if (USE_WIN) {
        const ps = `$s='${sound}'; if(Test-Path $s){(New-Object Media.SoundPlayer $s).PlaySync()}else{[console]::Beep(800,300)}`;
        execSync(`${PS_BIN} -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(ps, "utf16le").toString("base64")}`, { stdio: "ignore", timeout: 5000 });
      } else if (IS_LINUX) {
        execSync(`paplay "${sound}" 2>/dev/null || aplay "${sound}" 2>/dev/null`, { stdio: "ignore", timeout: 5000 });
      } else {
        execSync(`afplay "${sound}"`, { stdio: "ignore" });
      }
    } catch {}
  }

  if (level === "sound+popup" || level === "popup") {
    try {
      if (USE_WIN) {
        const ps = `Add-Type -AssemblyName System.Windows.Forms; $n=New-Object System.Windows.Forms.NotifyIcon; $n.Icon=[System.Drawing.SystemIcons]::Information; $n.Visible=$true; $n.ShowBalloonTip(3000,'Claude Notifier','Claude has finished the task.',[System.Windows.Forms.ToolTipIcon]::None); Start-Sleep -m 500; $n.Dispose()`;
        execSync(`${PS_BIN} -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(ps, "utf16le").toString("base64")}`, { stdio: "ignore", timeout: 5000 });
      } else if (IS_LINUX) {
        execSync(`notify-send "Claude Notifier" "Claude has finished the task." 2>/dev/null`, { stdio: "ignore", timeout: 5000 });
      } else {
        const tn = findTerminalNotifier();
        if (tn) {
          require("child_process").execFileSync(tn, [
            "-title", "Claude Notifier",
            "-message", "Claude has finished the task.",
          ], { stdio: "ignore" });
        } else {
          execSync(`osascript -e 'display notification "Claude has finished the task." with title "Claude Notifier"'`, { stdio: "ignore" });
        }
      }
    } catch {}
  }

  process.exit(0);
});
