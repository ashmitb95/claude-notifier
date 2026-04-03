import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

// ---- Paths ----------------------------------------------------------------

const HOME      = process.env.HOME || process.env.USERPROFILE || "~";
const CLAUDE_DIR   = path.join(HOME, ".claude");
const HOOKS_DIR    = path.join(CLAUDE_DIR, "hooks");
const SETTINGS_FILE = path.join(CLAUDE_DIR, "settings.json");
const CONFIG_FILE  = path.join(HOOKS_DIR, "claude-notifier-config.json");
const MUTE_FLAG    = path.join(HOOKS_DIR, "claude-notifier-muted");
const SIGNAL_FILE  = path.join(HOOKS_DIR, "claude-signal");

// ---- Platform -------------------------------------------------------------

const IS_WIN            = process.platform === "win32";
const HOOK_EXT          = IS_WIN ? ".ps1" : ".js";
const HOOK_RUNNER_PREFIX = IS_WIN ? "powershell" : "node";

function hookCmd(hookPath: string): string {
  if (IS_WIN) {
    return `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${hookPath}"`;
  }
  return `node "${hookPath}"`;
}

// ---- Notification levels --------------------------------------------------

const LEVELS = {
  SOUND_POPUP: "sound+popup",
  SOUND:       "sound",
  POPUP:       "popup",
  OFF:         "off",
} as const;

type Level = typeof LEVELS[keyof typeof LEVELS];

// ---- Hook definitions -----------------------------------------------------
// Add a new entry here to register a new hook. Everything else adapts automatically.

interface HookDef {
  file: string;          // filename in /hook/ and ~/.claude/hooks/
  type: string;          // Claude Code hook type key (settings.json)
  matcher?: string;      // optional PreToolUse matcher
  eventKey: string;      // claudeNotifier.<eventKey>.level / .sound in VS Code settings
  defaultSound: string;  // fallback sound preset
}

const HOOKS: HookDef[] = [
  {
    file:         `claude-notifier-on-stop${HOOK_EXT}`,
    type:         "Stop",
    eventKey:     "taskCompleted",
    defaultSound: "Hero",
  },
  {
    file:         `claude-notifier-on-permission${HOOK_EXT}`,
    type:         "PermissionRequest",
    eventKey:     "needsPermission",
    defaultSound: "Glass",
  },
  {
    file:         `claude-notifier-on-question${HOOK_EXT}`,
    type:         "PreToolUse",
    matcher:      "AskUserQuestion",
    eventKey:     "asksQuestion",
    defaultSound: "Funk",
  },
];

// Hook types that may appear in settings.json (used for cleanup)
const ALL_HOOK_TYPES = ["Stop", "PermissionRequest", "PreToolUse", "Notification"] as const;

// ---- Signal map -----------------------------------------------------------
// Maps the signal reason written by hook scripts to a VS Code notification.

interface SignalEvent {
  eventKey: string;
  message:  string;
}

const SIGNAL_MAP: Record<string, SignalEvent> = {
  input:    { eventKey: "needsPermission", message: "Claude needs your permission."      },
  question: { eventKey: "asksQuestion",    message: "Claude is asking you a question."   },
  done:     { eventKey: "taskCompleted",   message: "Claude has finished the task."      },
};

// ---- State ----------------------------------------------------------------

let statusBarItem: vscode.StatusBarItem;
let watcher: fs.FSWatcher | null = null;
let soundEnabled = true;

// ---- Remote audio ---------------------------------------------------------

function playRemoteSound() {
  // In remote sessions, webview audio is blocked by Electron's autoplay policy.
  // Use the terminal bell instead — VS Code forwards BEL to the local client.
  const bellConfig = vscode.workspace.getConfiguration("terminal.integrated");
  if (!bellConfig.get<boolean>("enableBell")) {
    bellConfig.update("enableBell", true, vscode.ConfigurationTarget.Global);
  }
  vscode.commands.executeCommand("workbench.action.terminal.sendSequence", { text: "\u0007" });
}

// ---- Activation -----------------------------------------------------------

export function activate(context: vscode.ExtensionContext) {
  setupHooks(context);
  syncConfig();

  soundEnabled = !fs.existsSync(MUTE_FLAG);

  if (!fs.existsSync(SIGNAL_FILE)) {
    fs.writeFileSync(SIGNAL_FILE, "");
  }

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = "claudeNotifier.toggleSound";
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  const toggleCmd = vscode.commands.registerCommand("claudeNotifier.toggleSound", () => {
    soundEnabled = !soundEnabled;
    if (soundEnabled) {
      try { fs.unlinkSync(MUTE_FLAG); } catch {}
    } else {
      fs.writeFileSync(MUTE_FLAG, "");
    }
    updateStatusBar();
    vscode.window.showInformationMessage(`Claude Notifier sound: ${soundEnabled ? "ON" : "OFF"}`);
  });
  context.subscriptions.push(toggleCmd);

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
}

function updateStatusBar() {
  statusBarItem.text    = soundEnabled ? "$(unmute) Claude" : "$(mute) Claude";
  statusBarItem.tooltip = `Claude Notifier — sound ${soundEnabled ? "on" : "off"} (click to toggle)`;
}

// ---- Config sync ----------------------------------------------------------
// Writes VS Code settings to disk so hook scripts can read them at runtime.

function syncConfig() {
  const cfg = vscode.workspace.getConfiguration("claudeNotifier");
  const config = Object.fromEntries(
    HOOKS.map((hook) => [
      hook.eventKey,
      {
        level: cfg.get<string>(`${hook.eventKey}.level`, LEVELS.SOUND_POPUP),
        sound: cfg.get<string>(`${hook.eventKey}.sound`, hook.defaultSound),
      },
    ])
  );
  try {
    fs.mkdirSync(HOOKS_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
  } catch {}
}

function getEventLevel(eventKey: string): Level {
  return vscode.workspace
    .getConfiguration("claudeNotifier")
    .get<Level>(`${eventKey}.level`, LEVELS.SOUND_POPUP);
}

// ---- Signal handling ------------------------------------------------------

function handleSignal() {
  let content = "";
  try {
    content = fs.readFileSync(SIGNAL_FILE, "utf-8").trim();
  } catch {
    return;
  }

  const reason = content.split(" ")[0];
  const event  = SIGNAL_MAP[reason];
  if (!event) return;

  const level    = getEventLevel(event.eventKey);
  const isRemote = !!vscode.env.remoteName;

  if (isRemote && (level === LEVELS.SOUND_POPUP || level === LEVELS.SOUND)) {
    playRemoteSound();
  }
  if (level === LEVELS.SOUND_POPUP || level === LEVELS.POPUP) {
    vscode.window.showInformationMessage(event.message);
  }
}

// ---- Hook lifecycle -------------------------------------------------------

function setupHooks(context: vscode.ExtensionContext) {
  fs.mkdirSync(HOOKS_DIR, { recursive: true });

  // Copy bundled hook scripts to ~/.claude/hooks/ (only if changed)
  for (const hook of HOOKS) {
    const src  = path.join(context.extensionPath, "hook", hook.file);
    const dest = path.join(HOOKS_DIR, hook.file);
    const srcContent = fs.readFileSync(src, "utf-8");
    let destContent  = "";
    try { destContent = fs.readFileSync(dest, "utf-8"); } catch {}
    if (srcContent !== destContent) {
      fs.writeFileSync(dest, srcContent, { mode: 0o755 });
    }
  }

  const settings = readSettings();

  // Skip settings.json write if all hooks are already registered with the correct runner
  const allConfigured = HOOKS.every((hook) =>
    settings.hooks?.[hook.type]?.some((entry: any) =>
      entry.hooks?.some((h: any) =>
        h.command?.includes(hook.file) && h.command?.startsWith(HOOK_RUNNER_PREFIX)
      )
    )
  );
  if (allConfigured) return;

  if (!settings.hooks) settings.hooks = {};

  // Remove stale claude-notifier entries before re-registering
  for (const hookType of ALL_HOOK_TYPES) {
    if (settings.hooks[hookType]) {
      settings.hooks[hookType] = settings.hooks[hookType].filter(
        (entry: any) => !entry.hooks?.some((h: any) => h.command?.includes("claude-notifier"))
      );
      if (settings.hooks[hookType].length === 0) delete settings.hooks[hookType];
    }
  }

  // Register each hook
  for (const hook of HOOKS) {
    const dest  = path.join(HOOKS_DIR, hook.file);
    const entry: any = { hooks: [{ type: "command", command: hookCmd(dest) }] };
    if (hook.matcher) entry.matcher = hook.matcher;
    if (!settings.hooks[hook.type]) settings.hooks[hook.type] = [];
    settings.hooks[hook.type].push(entry);
  }

  writeSettings(settings);
}

function teardownHooks() {
  // Remove all hook files (current platform + legacy cross-platform variants)
  const legacyNames = [
    "claude-notifier-on-stop",
    "claude-notifier-on-permission",
    "claude-notifier-on-question",
    "claude-notifier-on-notification",
  ];
  const legacyFiles = legacyNames.flatMap((name) =>
    [".js", ".ps1", ".sh"].map((ext) => path.join(HOOKS_DIR, `${name}${ext}`))
  );
  const activeFiles = HOOKS.map((hook) => path.join(HOOKS_DIR, hook.file));

  for (const file of [SIGNAL_FILE, MUTE_FLAG, CONFIG_FILE, ...activeFiles, ...legacyFiles]) {
    try { fs.unlinkSync(file); } catch {}
  }

  const settings = readSettings();
  for (const hookType of ALL_HOOK_TYPES) {
    if (settings.hooks?.[hookType]) {
      settings.hooks[hookType] = settings.hooks[hookType].filter(
        (entry: any) => !entry.hooks?.some((h: any) => h.command?.includes("claude-notifier"))
      );
      if (settings.hooks[hookType].length === 0) delete settings.hooks[hookType];
    }
  }
  if (settings.hooks && Object.keys(settings.hooks).length === 0) delete settings.hooks;
  writeSettings(settings);
}

// ---- Settings helpers -----------------------------------------------------

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

// ---- Deactivation ---------------------------------------------------------

export function deactivate() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  teardownHooks();
}
