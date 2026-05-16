import * as fs from "fs";
import * as path from "path";
import { HOOKS_DIR, SIGNAL_FILE, MUTE_FLAG, CONFIG_FILE, ACTIVE_DIR, IS_WIN } from "../paths";
import { HOOKS, hookDestPath } from "./registry";
import { hookCmd } from "./cmd";
import { readSettings, writeSettings, stripClaudeNotifierHooks } from "../settings/claude";

const HOOK_RUNNER_PREFIX = IS_WIN ? "powershell" : "node";

/**
 * Install hooks: copy bundled hook scripts to ~/.claude/hooks/ and register
 * them in ~/.claude/settings.json. Idempotent — if all three are already
 * registered with the correct runner, skip the settings.json write.
 *
 * Takes `extensionPath` (not the full ExtensionContext) so this module is
 * usable from uninstall.ts, which runs outside the extension host.
 */
export function setupHooks(extensionPath: string): void {
  fs.mkdirSync(HOOKS_DIR, { recursive: true });

  // Copy shared hook library FIRST so the newly-slim hook scripts never run
  // without their `_lib/` available. On macOS/Linux/WSL the hook scripts
  // `require("./_lib/*.js")`; on Windows they `. _lib.ps1`. Bundled by .vsix.
  copyHookLib(extensionPath);

  // Copy bundled hook scripts (only if changed)
  for (const hook of HOOKS) {
    const src = path.join(extensionPath, "hook", `${hook.baseName}${IS_WIN ? ".ps1" : ".js"}`);
    const dest = hookDestPath(hook);
    const srcContent = fs.readFileSync(src, "utf-8");
    let destContent = "";
    try {
      destContent = fs.readFileSync(dest, "utf-8");
    } catch {}
    if (srcContent !== destContent) {
      fs.writeFileSync(dest, srcContent, { mode: 0o755 });
    }
  }

  // Check if our hooks are already configured with the right runner — skip if so
  const settings = readSettings();
  const hasHook = (type: string, needle: string, matcher?: string) =>
    settings.hooks?.[type]?.some(
      (entry: any) =>
        (matcher === undefined || entry.matcher === matcher) &&
        entry.hooks?.some(
          (h: any) => h.command?.includes(needle) && h.command?.startsWith(HOOK_RUNNER_PREFIX)
        )
    );

  const allConfigured = HOOKS.every((hook) => hasHook(hook.type, hook.baseName, hook.matcher));
  if (allConfigured) {
    return; // Already configured with correct runner, don't touch settings.json
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  // Remove stale claude-notifier entries (preserves third-party hooks)
  stripClaudeNotifierHooks(settings);

  // Register each hook from the registry
  for (const hook of HOOKS) {
    const entry: any = { hooks: [{ type: "command", command: hookCmd(hookDestPath(hook)) }] };
    if (hook.matcher) {
      entry.matcher = hook.matcher;
    }
    if (!settings.hooks[hook.type]) {
      settings.hooks[hook.type] = [];
    }
    settings.hooks[hook.type].push(entry);
  }

  writeSettings(settings);
}

function copyHookLib(extensionPath: string): void {
  // Bundled WAVs are common to both platforms — system sounds are still
  // primary, these only play when the configured file is missing.
  copyBundledSounds(extensionPath);

  if (IS_WIN) {
    syncFile(path.join(extensionPath, "hook", "_lib.ps1"), path.join(HOOKS_DIR, "_lib.ps1"));
    return;
  }
  const libSrcDir = path.join(extensionPath, "hook", "_lib");
  const libDestDir = path.join(HOOKS_DIR, "_lib");
  fs.mkdirSync(libDestDir, { recursive: true });
  for (const entry of fs.readdirSync(libSrcDir)) {
    if (!entry.endsWith(".js")) continue;
    syncFile(path.join(libSrcDir, entry), path.join(libDestDir, entry));
  }
}

function copyBundledSounds(extensionPath: string): void {
  const srcDir = path.join(extensionPath, "media", "sounds");
  const destDir = path.join(HOOKS_DIR, "_lib", "sounds");
  fs.mkdirSync(destDir, { recursive: true });
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(srcDir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.endsWith(".wav")) continue;
    syncBinaryFile(path.join(srcDir, entry), path.join(destDir, entry));
  }
}

function syncBinaryFile(src: string, dest: string): void {
  // Same idempotent-copy semantics as syncFile, but for binary content.
  // Compares byte-for-byte to avoid rewriting unchanged WAVs.
  const srcContent = fs.readFileSync(src);
  let destContent: Buffer | null = null;
  try {
    destContent = fs.readFileSync(dest);
  } catch {}
  if (!destContent || !srcContent.equals(destContent)) {
    fs.writeFileSync(dest, srcContent);
  }
}

function syncFile(src: string, dest: string): void {
  const srcContent = fs.readFileSync(src, "utf-8");
  let destContent = "";
  try {
    destContent = fs.readFileSync(dest, "utf-8");
  } catch {}
  if (srcContent !== destContent) {
    fs.writeFileSync(dest, srcContent);
  }
}

/**
 * Full uninstall: remove hook files (including legacy/cross-platform
 * variants), state files, PID-marker directory, legacy shim artifacts, and
 * strip claude-notifier entries from settings.json. Called by
 * uninstall.ts when the extension is uninstalled.
 */
export function teardownHooks(): void {
  const legacyNames = [
    "claude-notifier-on-stop",
    "claude-notifier-on-permission",
    "claude-notifier-on-question",
    "claude-notifier-on-notification",
    "claude-notifier-on-prompt",
  ];
  const legacyHookFiles = legacyNames.flatMap((name) =>
    [".js", ".ps1", ".sh"].map((ext) => path.join(HOOKS_DIR, `${name}${ext}`))
  );

  const filesToRemove = [
    SIGNAL_FILE,
    MUTE_FLAG,
    CONFIG_FILE,
    path.join(HOOKS_DIR, "notifier-target"),
    path.join(HOOKS_DIR, ".claude-notifier-stamp"),
    ...legacyHookFiles,
  ];

  for (const file of filesToRemove) {
    try {
      fs.unlinkSync(file);
    } catch {}
  }

  // Per-PID active markers directory
  try {
    for (const name of fs.readdirSync(ACTIVE_DIR)) {
      try {
        fs.unlinkSync(path.join(ACTIVE_DIR, name));
      } catch {}
    }
    fs.rmdirSync(ACTIVE_DIR);
  } catch {}

  // Shared hook library: _lib/*.js + _lib/sounds/*.wav (mac/linux/wsl) and
  // _lib.ps1 (win). Recursive remove handles the nested sounds/ directory.
  try {
    fs.unlinkSync(path.join(HOOKS_DIR, "_lib.ps1"));
  } catch {}
  try {
    fs.rmSync(path.join(HOOKS_DIR, "_lib"), { recursive: true, force: true });
  } catch {}

  // Older versions shipped a generated AppleScript shim — remove if present.
  try {
    fs.rmSync(path.join(HOOKS_DIR, "ClaudeNotifier.app"), { recursive: true, force: true });
  } catch {}

  const settings = readSettings();
  stripClaudeNotifierHooks(settings);
  if (settings.hooks && Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }
  writeSettings(settings);
}
