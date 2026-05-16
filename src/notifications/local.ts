import * as vscode from "vscode";
import { exec } from "child_process";
import { IS_WIN, IS_MAC } from "../paths";
import { getTerminalNotifierPath, getCodeCliPath } from "./terminal-notifier";

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function showLocalNotification(message: string): void {
  if (IS_WIN) {
    const safeMsg = message.replace(/'/g, "''");
    const ps = `Add-Type -AssemblyName System.Windows.Forms; $n=New-Object System.Windows.Forms.NotifyIcon; $n.Icon=[System.Drawing.SystemIcons]::Information; $n.Visible=$true; $n.ShowBalloonTip(3000,'Claude Notifier','${safeMsg}',[System.Windows.Forms.ToolTipIcon]::None); Start-Sleep -m 500; $n.Dispose()`;
    exec(
      `powershell -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(ps, "utf16le").toString("base64")}`,
      { timeout: 5000 }
    );
  } else if (IS_MAC && getTerminalNotifierPath()) {
    const tn = getTerminalNotifierPath()!;
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
    const codeCli = getCodeCliPath();
    const executeCmd =
      codeCli && folder
        ? `${shellQuote(codeCli)} ${shellQuote(folder)}`
        : `osascript -e 'tell application "Visual Studio Code" to activate'`;
    const args = ["-title", "Claude Notifier", "-message", message, "-execute", executeCmd];
    exec(`${shellQuote(tn)} ${args.map(shellQuote).join(" ")}`);
  } else {
    const safeMsg = message.replace(/[\\"]/g, "\\$&");
    exec(`osascript -e 'display notification "${safeMsg}" with title "Claude Notifier"'`);
  }
}
