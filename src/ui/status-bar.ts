import * as fs from "fs";
import * as vscode from "vscode";
import { MUTE_FLAG } from "../paths";

let statusBarItem: vscode.StatusBarItem;
let soundEnabled = true;

export function createStatusBar(context: vscode.ExtensionContext): void {
  soundEnabled = !fs.existsSync(MUTE_FLAG);

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = "claudeNotifier.toggleSound";
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
}

export function toggleSound(): void {
  soundEnabled = !soundEnabled;
  if (soundEnabled) {
    try {
      fs.unlinkSync(MUTE_FLAG);
    } catch {}
  } else {
    fs.writeFileSync(MUTE_FLAG, "");
  }
  updateStatusBar();
  vscode.window.showInformationMessage(`Claude Notifier sound: ${soundEnabled ? "ON" : "OFF"}`);
}

function updateStatusBar(): void {
  statusBarItem.text = soundEnabled ? "$(unmute) Claude" : "$(mute) Claude";
  statusBarItem.tooltip = `Claude Notifier — sound ${soundEnabled ? "on" : "off"} (click to toggle)`;
}
