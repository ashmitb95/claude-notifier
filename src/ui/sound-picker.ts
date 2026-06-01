import * as vscode from "vscode";
import { MACOS_SOUNDS, WIN_SOUNDS, LINUX_SOUNDS, playLocalSound } from "../notifications/sound";
import { getEventConfig, getSoundVolume } from "../settings/sync";

export const EVENT_KEYS = ["taskCompleted", "needsPermission", "asksQuestion"] as const;
export type EventKey = (typeof EVENT_KEYS)[number];

const EVENT_LABELS: Record<EventKey, string> = {
  taskCompleted: "Task completed",
  needsPermission: "Permission",
  asksQuestion: "Question",
};

const DEFAULT_MAC: Record<EventKey, string> = {
  taskCompleted: "/System/Library/Sounds/Hero.aiff",
  needsPermission: "/System/Library/Sounds/Glass.aiff",
  asksQuestion: "/System/Library/Sounds/Funk.aiff",
};

const DEFAULT_WIN: Record<EventKey, string> = {
  taskCompleted: "C:\\Windows\\Media\\tada.wav",
  needsPermission: "C:\\Windows\\Media\\Windows Notify.wav",
  asksQuestion: "C:\\Windows\\Media\\Windows Notify.wav",
};

export function listPresetsForPlatform(platform: NodeJS.Platform): string[] {
  if (platform === "win32") return Object.keys(WIN_SOUNDS);
  if (platform === "linux") return Object.keys(LINUX_SOUNDS);
  return Object.keys(MACOS_SOUNDS);
}

function isEventKey(value: unknown): value is EventKey {
  return typeof value === "string" && (EVENT_KEYS as readonly string[]).includes(value);
}

async function pickEventKey(prompt: string): Promise<EventKey | undefined> {
  const pick = await vscode.window.showQuickPick(
    EVENT_KEYS.map((k) => ({ label: EVENT_LABELS[k], description: k, key: k })),
    { title: prompt, placeHolder: "Which event?" }
  );
  return pick?.key;
}

export function previewEventSound(eventKey: EventKey): void {
  const cfg = getEventConfig(eventKey);
  const volume = getSoundVolume();
  playLocalSound(cfg.sound, DEFAULT_MAC[eventKey], DEFAULT_WIN[eventKey], volume);
}

export async function previewEventSoundCommand(arg?: unknown): Promise<void> {
  const key = isEventKey(arg) ? arg : await pickEventKey("Preview Sound");
  if (!key) return;
  previewEventSound(key);
}

export async function pickEventSoundCommand(arg?: unknown): Promise<void> {
  const key = isEventKey(arg) ? arg : await pickEventKey("Choose Sound");
  if (!key) return;

  const presets = listPresetsForPlatform(process.platform);
  const current = getEventConfig(key).sound;
  const volume = getSoundVolume();

  const items = presets.map((name) => ({
    label: name,
    description: name === current ? "(current)" : undefined,
    name,
  }));

  const qp = vscode.window.createQuickPick<(typeof items)[number]>();
  qp.title = `Choose sound for ${EVENT_LABELS[key]}`;
  qp.placeholder = "Arrow keys preview each sound; Enter to confirm";
  qp.items = items;
  qp.activeItems = items.filter((i) => i.name === current);

  qp.onDidChangeActive((active) => {
    const item = active[0];
    if (!item) return;
    playLocalSound(item.name, DEFAULT_MAC[key], DEFAULT_WIN[key], volume);
  });

  const picked = await new Promise<string | undefined>((resolve) => {
    qp.onDidAccept(() => {
      const item = qp.selectedItems[0];
      resolve(item?.name);
      qp.hide();
    });
    qp.onDidHide(() => resolve(undefined));
    qp.show();
  });

  if (picked && picked !== current) {
    await vscode.workspace
      .getConfiguration("claudeNotifier")
      .update(`${key}.sound`, picked, vscode.ConfigurationTarget.Global);
  }
}
