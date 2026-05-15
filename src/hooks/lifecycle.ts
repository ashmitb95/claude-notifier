import * as fs from "fs";
import * as path from "path";
import {
  HOOKS_DIR, SIGNAL_FILE, MUTE_FLAG, CONFIG_FILE, ACTIVE_DIR, IS_WIN,
} from "../paths";
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

  // Copy bundled hook scripts (only if changed)
  for (const hook of HOOKS) {
    const src = path.join(extensionPath, "hook", `${hook.baseName}${IS_WIN ? ".ps1" : ".js"}`);
    const dest = hookDestPath(hook);
    const srcContent = fs.readFileSync(src, "utf-8");
    let destContent = "";
    try { destContent = fs.readFileSync(dest, "utf-8"); } catch {}
    if (srcContent !== destContent) {
      fs.writeFileSync(dest, srcContent, { mode: 0o755 });
    }
  }

  // Check if our hooks are already configured with the right runner — skip if so
  const settings = readSettings();
  const hasHook = (type: string, needle: string, matcher?: string) =>
    settings.hooks?.[type]?.some((entry: any) =>
      (matcher === undefined || entry.matcher === matcher) &&
      entry.hooks?.some((h: any) => h.command?.includes(needle) && h.command?.startsWith(HOOK_RUNNER_PREFIX))
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
    try { fs.unlinkSync(file); } catch {}
  }

  // Per-PID active markers directory
  try {
    for (const name of fs.readdirSync(ACTIVE_DIR)) {
      try { fs.unlinkSync(path.join(ACTIVE_DIR, name)); } catch {}
    }
    fs.rmdirSync(ACTIVE_DIR);
  } catch {}

  // Older versions shipped a generated AppleScript shim — remove if present.
  try { fs.rmSync(path.join(HOOKS_DIR, "ClaudeNotifier.app"), { recursive: true, force: true }); } catch {}

  const settings = readSettings();
  stripClaudeNotifierHooks(settings);
  if (settings.hooks && Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }
  writeSettings(settings);
}
