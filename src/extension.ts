import * as fs from "fs";
import * as vscode from "vscode";
import { ACTIVE_DIR, OWN_PID_FILE } from "./paths";
import { syncConfig } from "./settings/sync";
import { setupHooks } from "./hooks/lifecycle";
import { initDiscovery, installTerminalNotifierFlow } from "./notifications/terminal-notifier";
import { writeOwnPidFile, cleanStalePidFiles } from "./routing/cwd";
import { startFocusSignalWatcher } from "./routing/focus";
import { startSignalWatcher } from "./signals/dispatch";
import { createStatusBar, toggleSound } from "./ui/status-bar";
import { initLogger, log } from "./log";

export function activate(context: vscode.ExtensionContext) {
  initLogger(context);
  log("activate: extensionPath=", context.extensionPath);
  setupHooks(context.extensionPath);
  syncConfig();
  initDiscovery();

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
  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => writeOwnPidFile()));

  createStatusBar(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("claudeNotifier.toggleSound", toggleSound),
    vscode.commands.registerCommand(
      "claudeNotifier.installTerminalNotifier",
      installTerminalNotifierFlow
    ),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("claudeNotifier")) {
        syncConfig();
      }
    }),
    startSignalWatcher(),
    startFocusSignalWatcher()
  );
}

export function deactivate() {
  // Drop only this window's PID marker. Leave hook scripts and settings.json
  // entries in place so Claude Code outside VS Code (terminal, desktop app)
  // still gets sound + notification via the hook's terminal-fallback path.
  // Full teardown happens on extension uninstall via uninstall.ts.
  try {
    fs.unlinkSync(OWN_PID_FILE);
  } catch {}
}
