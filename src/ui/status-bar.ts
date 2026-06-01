import * as fs from "fs";
import * as vscode from "vscode";
import { MUTE_FLAG } from "../paths";
import { buildPanelMarkdown, PanelEvent } from "./panel-markdown";

let statusBarItem: vscode.StatusBarItem;
let soundEnabled = true;
let configListener: vscode.Disposable | null = null;

const EVENT_DEFS: Array<{ key: PanelEvent["key"]; label: string }> = [
  { key: "taskCompleted", label: "Task completed" },
  { key: "needsPermission", label: "Permission" },
  { key: "asksQuestion", label: "Question" },
];

export function createStatusBar(context: vscode.ExtensionContext): void {
  soundEnabled = !fs.existsSync(MUTE_FLAG);

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  // Click toggles mute; hover opens the rich panel for every other action.
  // (A command must be assigned for the hover tooltip to fire — see #75909.)
  statusBarItem.command = "claudeNotifier.toggleSound";
  refresh();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  configListener = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("claudeNotifier")) refresh();
  });
  context.subscriptions.push(configListener);
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
  refresh();
}

export async function setVolume(volume: number): Promise<void> {
  await vscode.workspace
    .getConfiguration("claudeNotifier")
    .update("soundVolume", volume, vscode.ConfigurationTarget.Global);
}

export async function setThreshold(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("claudeNotifier");
  const current = cfg.get<number>("minTaskDurationThreshold", 0);
  const input = await vscode.window.showInputBox({
    title: "Minimum task duration threshold",
    prompt: "Suppress notifications for tasks shorter than this many seconds. 0 to disable.",
    value: String(current),
    validateInput: (v) => {
      if (v.trim() === "") return "Enter a number of seconds (0 to disable).";
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 3600) return "Must be between 0 and 3600.";
      return null;
    },
  });
  if (input === undefined) return;
  await cfg.update("minTaskDurationThreshold", Number(input), vscode.ConfigurationTarget.Global);
}

export async function openSettings(): Promise<void> {
  await vscode.commands.executeCommand(
    "workbench.action.openSettings",
    "@ext:singularityinc.claude-notifier"
  );
}

function refresh(): void {
  const cfg = vscode.workspace.getConfiguration("claudeNotifier");
  const events: PanelEvent[] = EVENT_DEFS.map(({ key, label }) => ({
    key,
    label,
    sound: cfg.get<string>(`${key}.sound`, ""),
  }));
  statusBarItem.text = soundEnabled ? "$(unmute) Claude" : "$(mute) Claude";
  statusBarItem.tooltip = buildPanelMarkdown({
    muted: !soundEnabled,
    volume: cfg.get<number>("soundVolume", 1),
    threshold: cfg.get<number>("minTaskDurationThreshold", 0),
    events,
  });
}
