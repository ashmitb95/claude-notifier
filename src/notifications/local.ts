import * as vscode from "vscode";
import { exec } from "child_process";
import { IS_WIN, IS_MAC, FOCUS_SIGNAL_FILE } from "../paths";
import { getTerminalNotifierPath, getCodeCliPath } from "./terminal-notifier";
import { getWorkspaceTitle } from "./title";

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function showLocalNotification(message: string, cwd?: string): void {
  // Title the notification with the workspace name so notifications from
  // parallel projects are distinguishable in Notification Center / the tray.
  const title = getWorkspaceTitle(cwd);
  if (IS_WIN) {
    const safeMsg = message.replace(/'/g, "''");
    const safeTitle = title.replace(/'/g, "''");
    const ps = `Add-Type -AssemblyName System.Windows.Forms; $n=New-Object System.Windows.Forms.NotifyIcon; $n.Icon=[System.Drawing.SystemIcons]::Information; $n.Visible=$true; $n.ShowBalloonTip(3000,'${safeTitle}','${safeMsg}',[System.Windows.Forms.ToolTipIcon]::None); Start-Sleep -m 500; $n.Dispose()`;
    exec(
      `powershell -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(ps, "utf16le").toString("base64")}`,
      { timeout: 5000 }
    );
  } else if (IS_MAC && getTerminalNotifierPath()) {
    const tn = getTerminalNotifierPath()!;
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
    const codeCli = getCodeCliPath();
    // The click pipeline: terminal-notifier's -execute runs a shell snippet
    // that (a) drops the originating cwd into FOCUS_SIGNAL_FILE so the
    // extension watcher can reveal the matching Claude tab, and (b) brings
    // the VS Code window forward via the code CLI (or osascript fallback).
    const focusWrite = cwd
      ? `printf '%s' ${shellQuote(cwd)} > ${shellQuote(FOCUS_SIGNAL_FILE)}`
      : "";
    const bringForward =
      codeCli && folder
        ? `${shellQuote(codeCli)} ${shellQuote(folder)}`
        : `osascript -e 'tell application "Visual Studio Code" to activate'`;
    const executeCmd = focusWrite ? `${focusWrite}; ${bringForward}` : bringForward;
    const args = ["-title", title, "-message", message, "-execute", executeCmd];
    exec(`${shellQuote(tn)} ${args.map(shellQuote).join(" ")}`);
  } else {
    // AppleScript needs its own \ and " escaping; the whole script is then
    // shell-quoted, so an apostrophe in the workspace name is safe too.
    const escape = (s: string) => s.replace(/[\\"]/g, "\\$&");
    const script = `display notification "${escape(message)}" with title "${escape(title)}"`;
    exec(`osascript -e ${shellQuote(script)}`);
  }
}
