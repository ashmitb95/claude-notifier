import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { exec, execFileSync } from "child_process";

const HOME = process.env.HOME || process.env.USERPROFILE || "~";
const CLAUDE_DIR = path.join(HOME, ".claude");
const HOOKS_DIR = path.join(CLAUDE_DIR, "hooks");
const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";
const HOOK_EXT = IS_WIN ? ".ps1" : ".js";
const STOP_HOOK = path.join(HOOKS_DIR, `claude-notifier-on-stop${HOOK_EXT}`);
const PERMISSION_HOOK = path.join(HOOKS_DIR, `claude-notifier-on-permission${HOOK_EXT}`);
const QUESTION_HOOK = path.join(HOOKS_DIR, `claude-notifier-on-question${HOOK_EXT}`);
const MUTE_FLAG = path.join(HOOKS_DIR, "claude-notifier-muted");
const SIGNAL_FILE = path.join(HOOKS_DIR, "claude-signal");
// Directory of per-PID marker files. Hooks treat the extension as active if
// any marker inside corresponds to a live PID. Using a directory (instead of a
// single flag file) lets multiple VSCode windows coexist and survives crashes:
// stale markers get cleaned up on next activate and ignored via PID liveness.
const ACTIVE_DIR = path.join(HOOKS_DIR, "claude-notifier-active.d");
const OWN_PID_FILE = path.join(ACTIVE_DIR, String(process.pid));
const CONFIG_FILE = path.join(HOOKS_DIR, "claude-notifier-config.json");
const SETTINGS_FILE = path.join(CLAUDE_DIR, "settings.json");
// Per-window focus channel: terminal-notifier's click action writes
// "<ts> <cwd>" here, and the extension whose workspace matches the cwd
// focuses the terminal that fired the most recent Stop signal.
const FOCUS_SIGNAL_FILE = path.join(HOOKS_DIR, "claude-notifier-focus-signal");

const MACOS_SOUNDS: Record<string, string> = {
  Basso: "/System/Library/Sounds/Basso.aiff", Blow: "/System/Library/Sounds/Blow.aiff",
  Bottle: "/System/Library/Sounds/Bottle.aiff", Frog: "/System/Library/Sounds/Frog.aiff",
  Funk: "/System/Library/Sounds/Funk.aiff", Glass: "/System/Library/Sounds/Glass.aiff",
  Hero: "/System/Library/Sounds/Hero.aiff", Morse: "/System/Library/Sounds/Morse.aiff",
  Ping: "/System/Library/Sounds/Ping.aiff", Pop: "/System/Library/Sounds/Pop.aiff",
  Purr: "/System/Library/Sounds/Purr.aiff", Sosumi: "/System/Library/Sounds/Sosumi.aiff",
  Submarine: "/System/Library/Sounds/Submarine.aiff", Tink: "/System/Library/Sounds/Tink.aiff",
};
const WIN_SOUNDS: Record<string, string> = {
  "Windows Notify": "C:\\Windows\\Media\\Windows Notify.wav", "tada": "C:\\Windows\\Media\\tada.wav",
  "chimes": "C:\\Windows\\Media\\chimes.wav", "chord": "C:\\Windows\\Media\\chord.wav",
  "ding": "C:\\Windows\\Media\\ding.wav", "notify": "C:\\Windows\\Media\\notify.wav",
  "ringin": "C:\\Windows\\Media\\ringin.wav", "Windows Background": "C:\\Windows\\Media\\Windows Background.wav",
};

function playLocalSound(soundName: string, defaultMac: string, defaultWin: string) {
  if (IS_WIN) {
    const soundPath = WIN_SOUNDS[soundName] || defaultWin;
    const ps = `$s='${soundPath}'; if(Test-Path $s){(New-Object Media.SoundPlayer $s).PlaySync()}else{[console]::Beep(800,300)}`;
    exec(`powershell -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(ps, "utf16le").toString("base64")}`, { timeout: 5000 });
  } else {
    const soundPath = MACOS_SOUNDS[soundName] || defaultMac;
    exec(`afplay "${soundPath}"`);
  }
}

// terminal-notifier is the only way to get clickable macOS notifications that
// focus VS Code instead of Script Editor. We use -execute (not -activate)
// because -activate is broken on recent macOS, and we run the `code` CLI so
// the specific workspace window comes forward — no osascript on the click
// path means no Script Editor flash. See issue #12.
let terminalNotifierPath: string | null = null;
let codeCliPath: string | null = null;

function findTerminalNotifier(): string | null {
  if (!IS_MAC) return null;
  for (const candidate of ["/opt/homebrew/bin/terminal-notifier", "/usr/local/bin/terminal-notifier"]) {
    try { fs.accessSync(candidate, fs.constants.X_OK); return candidate; } catch {}
  }
  try {
    const found = execFileSync("/usr/bin/which", ["terminal-notifier"], { encoding: "utf-8" }).trim();
    if (found) return found;
  } catch {}
  return null;
}

function findCodeCli(): string | null {
  try {
    const candidate = path.join(vscode.env.appRoot, "bin", "code");
    fs.accessSync(candidate, fs.constants.X_OK);
    return candidate;
  } catch { return null; }
}

function showLocalNotification(message: string) {
  if (IS_WIN) {
    const safeMsg = message.replace(/'/g, "''");
    const ps = `Add-Type -AssemblyName System.Windows.Forms; $n=New-Object System.Windows.Forms.NotifyIcon; $n.Icon=[System.Drawing.SystemIcons]::Information; $n.Visible=$true; $n.ShowBalloonTip(3000,'Claude Notifier','${safeMsg}',[System.Windows.Forms.ToolTipIcon]::None); Start-Sleep -m 500; $n.Dispose()`;
    exec(`powershell -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(ps, "utf16le").toString("base64")}`, { timeout: 5000 });
  } else if (IS_MAC && terminalNotifierPath) {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
    // Write a focus-signal first (so the right window's extension can focus
    // its matched terminal), then activate VS Code. Both effects are
    // independent; the `code` activation brings the window forward and the
    // signal fs.watch fires `terminal.show()` inside that window.
    const activateCmd = codeCliPath && folder
      ? `${shellQuote(codeCliPath)} ${shellQuote(folder)}`
      : `osascript -e 'tell application "Visual Studio Code" to activate'`;
    const focusPayload = `${Date.now()} ${folder}`;
    const focusCmd = `/bin/echo ${shellQuote(focusPayload)} > ${shellQuote(FOCUS_SIGNAL_FILE)}`;
    const executeCmd = folder ? `${focusCmd} && ${activateCmd}` : activateCmd;
    const args = [
      "-title", "Claude Notifier",
      "-message", message,
      "-execute", executeCmd,
    ];
    exec(`${shellQuote(terminalNotifierPath)} ${args.map(shellQuote).join(" ")}`);
  } else {
    const safeMsg = message.replace(/[\\"]/g, "\\$&");
    exec(`osascript -e 'display notification "${safeMsg}" with title "Claude Notifier"'`);
  }
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function hookCmd(hookPath: string): string {
  if (IS_WIN) {
    return `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${hookPath}"`;
  }
  return `node "${hookPath}"`;
}

const ALL_HOOK_TYPES = ["Stop", "PermissionRequest", "PreToolUse", "Notification"] as const;

let statusBarItem: vscode.StatusBarItem;
let watcher: fs.FSWatcher | null = null;
let focusWatcher: fs.FSWatcher | null = null;
let soundEnabled = true;
let doneDebounceTimer: ReturnType<typeof setTimeout> | null = null;
// Terminal that fired the most recent "done" signal in this window. Used by
// the focus-signal handler to route click-to-tab focus.
let lastDoneTerminal: vscode.Terminal | null = null;
// Session id of the most recent Stop signal received in this window. Used as
// the focus target for the Claude Code extension's panel.
let lastDoneSessionId: string | null = null;

function isPidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function getOwnWorkspaceFolders(): string[] {
  return (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
}

function writeOwnPidFile() {
  try {
    const folders = getOwnWorkspaceFolders().join("\n");
    fs.writeFileSync(OWN_PID_FILE, folders);
  } catch {}
}

function cwdMatchesFolder(cwd: string, folder: string): boolean {
  if (!cwd || !folder) return false;
  if (cwd === folder) return true;
  return cwd.startsWith(folder.endsWith(path.sep) ? folder : folder + path.sep);
}

function cleanStalePidFiles() {
  try {
    for (const name of fs.readdirSync(ACTIVE_DIR)) {
      const pid = parseInt(name, 10);
      if (!Number.isFinite(pid) || !isPidAlive(pid)) {
        try { fs.unlinkSync(path.join(ACTIVE_DIR, name)); } catch {}
      }
    }
  } catch {}
}

async function findTerminalByAncestors(ancestorPids: number[]): Promise<vscode.Terminal | null> {
  for (const term of vscode.window.terminals) {
    try {
      const pid = await term.processId;
      if (pid && ancestorPids.includes(pid)) return term;
    } catch {}
  }
  return null;
}

async function handleFocusSignal() {
  let content = "";
  try { content = fs.readFileSync(FOCUS_SIGNAL_FILE, "utf-8").trim(); } catch { return; }
  // Format: "<ts> <cwd...>"
  const firstSpace = content.indexOf(" ");
  const cwd = firstSpace >= 0 ? content.slice(firstSpace + 1) : "";
  if (!cwd) return;
  const folders = getOwnWorkspaceFolders();
  if (folders.length > 0 && !folders.some((f) => cwdMatchesFolder(cwd, f))) return;
  if (lastDoneTerminal) {
    try { lastDoneTerminal.show(); return; } catch {}
  }
  // Focus the Claude Code editor tab for the session that just finished.
  // claude-vscode.editor.open(sessionId) reveals the existing panel if the
  // session id is open; we only call it when we have a session id to avoid
  // creating a new empty panel.
  if (lastDoneSessionId) {
    try {
      await vscode.commands.executeCommand("claude-vscode.editor.open", lastDoneSessionId);
    } catch {}
  }
}

function playRemoteSound() {
  // In remote sessions, webview audio is blocked by Electron's autoplay policy.
  // Use the terminal bell instead — VS Code forwards BEL to the local client.
  // Ensure terminal bell is enabled in VS Code settings.
  const bellConfig = vscode.workspace.getConfiguration("terminal.integrated");
  if (!bellConfig.get<boolean>("enableBell")) {
    bellConfig.update("enableBell", true, vscode.ConfigurationTarget.Global);
  }
  vscode.commands.executeCommand("workbench.action.terminal.sendSequence", {
    text: "\u0007",
  });
}

export function activate(context: vscode.ExtensionContext) {
  setupHooks(context);
  syncConfig();
  terminalNotifierPath = findTerminalNotifier();
  codeCliPath = findCodeCli();

  // Register this window as an active instance so hook scripts defer
  // "done" sound/notification to the extension (which debounces). The PID
  // file's content is the workspace folder — hooks use it to route Stop
  // signals to the right window, and the extension uses its own folder list
  // to filter incoming signals.
  try {
    fs.mkdirSync(ACTIVE_DIR, { recursive: true });
    cleanStalePidFiles();
    writeOwnPidFile();
  } catch {}

  // Workspace folder set can change at runtime — keep PID file fresh.
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => writeOwnPidFile())
  );

  soundEnabled = !fs.existsSync(MUTE_FLAG);

  if (!fs.existsSync(SIGNAL_FILE)) {
    fs.writeFileSync(SIGNAL_FILE, "");
  }
  if (!fs.existsSync(FOCUS_SIGNAL_FILE)) {
    fs.writeFileSync(FOCUS_SIGNAL_FILE, "");
  }

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "claudeNotifier.toggleSound";
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  const toggleCmd = vscode.commands.registerCommand(
    "claudeNotifier.toggleSound",
    () => {
      soundEnabled = !soundEnabled;
      if (soundEnabled) {
        try { fs.unlinkSync(MUTE_FLAG); } catch {}
      } else {
        fs.writeFileSync(MUTE_FLAG, "");
      }
      updateStatusBar();
      vscode.window.showInformationMessage(
        `Claude Notifier sound: ${soundEnabled ? "ON" : "OFF"}`
      );
    }
  );
  context.subscriptions.push(toggleCmd);

  const installCmd = vscode.commands.registerCommand(
    "claudeNotifier.installTerminalNotifier",
    () => installTerminalNotifierFlow()
  );
  context.subscriptions.push(installCmd);

  const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("claudeNotifier")) {
      syncConfig();
    }
  });
  context.subscriptions.push(configListener);

  watcher = fs.watch(SIGNAL_FILE, (eventType) => {
    if (eventType === "change") {
      handleSignal();
    }
  });
  context.subscriptions.push({ dispose: () => watcher?.close() });

  focusWatcher = fs.watch(FOCUS_SIGNAL_FILE, (eventType) => {
    if (eventType === "change") {
      handleFocusSignal();
    }
  });
  context.subscriptions.push({ dispose: () => focusWatcher?.close() });
}

function updateStatusBar() {
  statusBarItem.text = soundEnabled ? "$(unmute) Claude" : "$(mute) Claude";
  statusBarItem.tooltip = `Claude Notifier — sound ${soundEnabled ? "on" : "off"} (click to toggle)`;
}

function syncConfig() {
  const cfg = vscode.workspace.getConfiguration("claudeNotifier");
  const config = {
    taskCompleted: {
      level: cfg.get<string>("taskCompleted.level", "sound+popup"),
      sound: cfg.get<string>("taskCompleted.sound", "Hero"),
    },
    needsPermission: {
      level: cfg.get<string>("needsPermission.level", "sound+popup"),
      sound: cfg.get<string>("needsPermission.sound", "Glass"),
    },
    asksQuestion: {
      level: cfg.get<string>("asksQuestion.level", "sound+popup"),
      sound: cfg.get<string>("asksQuestion.sound", "Funk"),
    },
  };
  try {
    fs.mkdirSync(HOOKS_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
  } catch {}
}

function getEventConfig(eventKey: string): { level: string; sound: string } {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    return {
      level: config[eventKey]?.level ?? "sound+popup",
      sound: config[eventKey]?.sound ?? "",
    };
  } catch {
    return { level: "sound+popup", sound: "" };
  }
}

function getEventLevel(eventKey: string): string {
  return getEventConfig(eventKey).level;
}

function handleSignal() {
  let content = "";
  try {
    content = fs.readFileSync(SIGNAL_FILE, "utf-8").trim();
  } catch {
    return;
  }

  // Signal formats (Stop hook is v3; question/input still write v1):
  //   v3: "done <ts> <pids_csv|-> <session_id|-> <cwd...>"
  //   v1: "<reason> <ts> <cwd...>" or "<reason> <ts>"
  // Detect v3 by checking whether parts[2] is digits-CSV or "-" (PID field).
  const parts = content.split(" ");
  const reason = parts[0] ?? "";
  const maybePids = parts[2];
  const hasPidsField = maybePids === "-" || /^[0-9]+(,[0-9]+)*$/.test(maybePids ?? "");
  const ancestorPids = hasPidsField && maybePids !== "-"
    ? maybePids!.split(",").map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n))
    : [];
  const sessionId = hasPidsField && parts[3] && parts[3] !== "-" ? parts[3] : null;
  const cwdStart = hasPidsField ? 4 : 2;
  const cwd = parts.slice(cwdStart).join(" ");

  // Each window only handles signals fired from inside its own workspace.
  // Signals without a cwd (older hook scripts) fall through to all windows
  // for backwards compatibility.
  if (cwd) {
    const folders = getOwnWorkspaceFolders();
    if (folders.length > 0 && !folders.some((f) => cwdMatchesFolder(cwd, f))) {
      return;
    }
  }

  if (reason === "done") {
    lastDoneSessionId = sessionId;
    if (ancestorPids.length > 0) {
      findTerminalByAncestors(ancestorPids).then((t) => { lastDoneTerminal = t; });
    } else {
      lastDoneTerminal = null;
    }
  }

  if (reason === "done") {
    // Debounce "done" signals — Claude fires Stop hooks between subtasks.
    // Only notify after N ms of silence (no new signals).
    const debounceMs = vscode.workspace
      .getConfiguration("claudeNotifier")
      .get<number>("doneDebounceMs", 2000);
    if (doneDebounceTimer) clearTimeout(doneDebounceTimer);
    doneDebounceTimer = setTimeout(() => {
      doneDebounceTimer = null;
      showNotification("done");
    }, debounceMs);
  } else {
    // "question" and "input" signals are immediate — user action is needed.
    // Cancel any pending "done" notification (the stop after a question is expected).
    if (doneDebounceTimer) {
      clearTimeout(doneDebounceTimer);
      doneDebounceTimer = null;
    }
    if (reason === "input" || reason === "question") {
      showNotification(reason);
    }
  }
}

function showNotification(reason: string) {
  // Architecture note: "question" and "input" local sounds are played by their
  // respective hook scripts (PreToolUse / PermissionRequest) — not the extension.
  // Only "done" local sounds are played here, because the extension debounces them.
  const isRemote = !!vscode.env.remoteName;

  if (reason === "input") {
    const level = getEventLevel("needsPermission");
    if (isRemote && (level === "sound+popup" || level === "sound")) {
      playRemoteSound();
    }
    if (level === "sound+popup" || level === "popup") {
      vscode.window.showInformationMessage("Claude needs your permission.");
    }
  } else if (reason === "question") {
    const level = getEventLevel("asksQuestion");
    if (isRemote && (level === "sound+popup" || level === "sound")) {
      playRemoteSound();
    }
    if (level === "sound+popup" || level === "popup") {
      vscode.window.showInformationMessage("Claude is asking you a question.");
    }
  } else if (reason === "done") {
    const level = getEventLevel("taskCompleted");
    if (level === "sound+popup" || level === "sound") {
      if (isRemote) {
        playRemoteSound();
      } else {
        const cfg = getEventConfig("taskCompleted");
        playLocalSound(cfg.sound, "/System/Library/Sounds/Hero.aiff", "C:\\Windows\\Media\\tada.wav");
      }
    }
    if (level === "sound+popup" || level === "popup") {
      vscode.window.showInformationMessage("Claude has finished the task.");
      if (!isRemote) {
        showLocalNotification("Claude has finished the task.");
      }
    }
  }
}

// Bootstrap: install terminal-notifier via Homebrew so macOS notifications
// can route clicks back to VS Code. The osascript fallback works without it
// but its clicks open Script Editor (issue #12).
function installTerminalNotifierFlow() {
  if (!IS_MAC) {
    vscode.window.showInformationMessage("terminal-notifier is macOS-only.");
    return;
  }
  const existing = findTerminalNotifier();
  if (existing) {
    terminalNotifierPath = existing;
    vscode.window.showInformationMessage(`terminal-notifier already installed at ${existing}.`);
    return;
  }
  let brew: string | null = null;
  for (const c of ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"]) {
    try { fs.accessSync(c, fs.constants.X_OK); brew = c; break; } catch {}
  }
  if (!brew) {
    vscode.window.showWarningMessage(
      "Homebrew not found. Install Homebrew first (https://brew.sh), then re-run this command.",
      "Open brew.sh"
    ).then((pick) => {
      if (pick === "Open brew.sh") vscode.env.openExternal(vscode.Uri.parse("https://brew.sh"));
    });
    return;
  }
  // Run interactively in a terminal so the user sees output and any prompts.
  const terminal = vscode.window.createTerminal({ name: "Claude Notifier — install terminal-notifier" });
  terminal.show();
  terminal.sendText(`${brew} install terminal-notifier && echo "" && echo "✓ Done. Run 'Developer: Reload Window' to enable clickable notifications."`);
}

// --- Hook lifecycle ---

function setupHooks(context: vscode.ExtensionContext) {
  fs.mkdirSync(HOOKS_DIR, { recursive: true });

  // Copy bundled hook scripts (only if changed)
  for (const [bundled, dest] of [
    [`claude-notifier-on-stop${HOOK_EXT}`, STOP_HOOK],
    [`claude-notifier-on-permission${HOOK_EXT}`, PERMISSION_HOOK],
    [`claude-notifier-on-question${HOOK_EXT}`, QUESTION_HOOK],
  ]) {
    const src = path.join(context.extensionPath, "hook", bundled);
    const srcContent = fs.readFileSync(src, "utf-8");
    let destContent = "";
    try { destContent = fs.readFileSync(dest, "utf-8"); } catch {}
    if (srcContent !== destContent) {
      fs.writeFileSync(dest, srcContent, { mode: 0o755 });
    }
  }

  // Check if our hooks are already configured with the right runner — skip if so
  const settings = readSettings();
  const expectedPrefix = IS_WIN ? "powershell" : "node";
  const hasHook = (type: string, needle: string, matcher?: string) =>
    settings.hooks?.[type]?.some((entry: any) =>
      (matcher === undefined || entry.matcher === matcher) &&
      entry.hooks?.some((h: any) => h.command?.includes(needle) && h.command?.startsWith(expectedPrefix))
    );

  if (
    hasHook("Stop", "claude-notifier-on-stop") &&
    hasHook("PermissionRequest", "claude-notifier-on-permission") &&
    hasHook("PreToolUse", "claude-notifier-on-question", "AskUserQuestion")
  ) {
    return; // Already configured with correct runner, don't touch settings.json
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  // Remove stale claude-notifier entries
  for (const hookType of ALL_HOOK_TYPES) {
    if (settings.hooks[hookType]) {
      settings.hooks[hookType] = settings.hooks[hookType].filter(
        (entry: any) => !entry.hooks?.some((h: any) => h.command?.includes("claude-notifier"))
      );
      if (settings.hooks[hookType].length === 0) {
        delete settings.hooks[hookType];
      }
    }
  }

  // Stop hook — task completed
  if (!settings.hooks.Stop) settings.hooks.Stop = [];
  settings.hooks.Stop.push({
    hooks: [{ type: "command", command: hookCmd(STOP_HOOK) }],
  });

  // PermissionRequest hook — needs permission
  if (!settings.hooks.PermissionRequest) settings.hooks.PermissionRequest = [];
  settings.hooks.PermissionRequest.push({
    hooks: [{ type: "command", command: hookCmd(PERMISSION_HOOK) }],
  });

  // PreToolUse hook — question asked
  if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];
  settings.hooks.PreToolUse.push({
    matcher: "AskUserQuestion",
    hooks: [{ type: "command", command: hookCmd(QUESTION_HOOK) }],
  });

  writeSettings(settings);
}

function teardownHooks() {
  for (const file of [STOP_HOOK, PERMISSION_HOOK, QUESTION_HOOK, SIGNAL_FILE, FOCUS_SIGNAL_FILE, MUTE_FLAG, CONFIG_FILE]) {
    try { fs.unlinkSync(file); } catch {}
  }
  try { fs.rmdirSync(ACTIVE_DIR); } catch {}
  // Clean up artifacts from older shim-based versions if present.
  try { fs.rmSync(path.join(HOOKS_DIR, "ClaudeNotifier.app"), { recursive: true, force: true }); } catch {}
  try { fs.unlinkSync(path.join(HOOKS_DIR, "notifier-target")); } catch {}
  // Clean up legacy and cross-platform hook files
  for (const name of ["claude-notifier-on-stop", "claude-notifier-on-permission", "claude-notifier-on-question", "claude-notifier-on-notification"]) {
    for (const ext of [".js", ".ps1", ".sh"]) {
      try { fs.unlinkSync(path.join(HOOKS_DIR, `${name}${ext}`)); } catch {}
    }
  }

  const settings = readSettings();
  for (const hookType of ALL_HOOK_TYPES) {
    if (settings.hooks?.[hookType]) {
      settings.hooks[hookType] = settings.hooks[hookType].filter(
        (entry: any) => !entry.hooks?.some((h: any) => h.command?.includes("claude-notifier"))
      );
      if (settings.hooks[hookType].length === 0) {
        delete settings.hooks[hookType];
      }
    }
  }
  if (settings.hooks && Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }
  writeSettings(settings);
}

function readSettings(): any {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeSettings(settings: any) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n");
}

export function deactivate() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  if (focusWatcher) {
    focusWatcher.close();
    focusWatcher = null;
  }
  // Drop only this window's PID marker. Leave hook scripts and settings.json
  // entries in place so Claude Code outside VS Code (terminal, desktop app)
  // still gets sound + notification via the hook's terminal-fallback path.
  // Full teardown happens on extension uninstall via uninstall.ts.
  try { fs.unlinkSync(OWN_PID_FILE); } catch {}
}
