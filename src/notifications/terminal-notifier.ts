import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { execFileSync } from "child_process";
import { IS_MAC } from "../paths";

// terminal-notifier is the only way to get clickable macOS notifications that
// focus VS Code instead of Script Editor. We use -execute (not -activate)
// because -activate is broken on recent macOS, and we run the `code` CLI so
// the specific workspace window comes forward — no osascript on the click
// path means no Script Editor flash.
let terminalNotifierPath: string | null = null;
let codeCliPath: string | null = null;

export function getTerminalNotifierPath(): string | null {
  return terminalNotifierPath;
}

export function getCodeCliPath(): string | null {
  return codeCliPath;
}

export function findTerminalNotifier(): string | null {
  if (!IS_MAC) return null;
  for (const candidate of [
    "/opt/homebrew/bin/terminal-notifier",
    "/usr/local/bin/terminal-notifier",
  ]) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {}
  }
  try {
    const found = execFileSync("/usr/bin/which", ["terminal-notifier"], {
      encoding: "utf-8",
    }).trim();
    if (found) return found;
  } catch {}
  return null;
}

export function findCodeCli(): string | null {
  try {
    const candidate = path.join(vscode.env.appRoot, "bin", "code");
    fs.accessSync(candidate, fs.constants.X_OK);
    return candidate;
  } catch {
    return null;
  }
}

/** Discover terminal-notifier and code CLI on activation. */
export function initDiscovery(): void {
  terminalNotifierPath = findTerminalNotifier();
  codeCliPath = findCodeCli();
}

/**
 * Bootstrap: install terminal-notifier via Homebrew so macOS notifications
 * can route clicks back to VS Code. The osascript fallback works without it
 * but its clicks open Script Editor instead.
 */
export function installTerminalNotifierFlow(): void {
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
    try {
      fs.accessSync(c, fs.constants.X_OK);
      brew = c;
      break;
    } catch {}
  }
  if (!brew) {
    vscode.window
      .showWarningMessage(
        "Homebrew not found. Install Homebrew first (https://brew.sh), then re-run this command.",
        "Open brew.sh"
      )
      .then((pick) => {
        if (pick === "Open brew.sh") vscode.env.openExternal(vscode.Uri.parse("https://brew.sh"));
      });
    return;
  }
  // Run interactively in a terminal so the user sees output and any prompts.
  const terminal = vscode.window.createTerminal({
    name: "Claude Notifier — install terminal-notifier",
  });
  terminal.show();
  terminal.sendText(
    `${brew} install terminal-notifier && echo "" && echo "✓ Done. Run 'Developer: Reload Window' to enable clickable notifications."`
  );
}
