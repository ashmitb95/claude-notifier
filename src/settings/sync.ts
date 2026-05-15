import * as fs from "fs";
import * as vscode from "vscode";
import { HOOKS_DIR, CONFIG_FILE } from "../paths";
import { HOOKS } from "../hooks/registry";
import { LEVELS } from "../signals/types";

export function syncConfig(): void {
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

export function getEventConfig(eventKey: string): { level: string; sound: string } {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    return {
      level: config[eventKey]?.level ?? LEVELS.SOUND_POPUP,
      sound: config[eventKey]?.sound ?? "",
    };
  } catch {
    return { level: LEVELS.SOUND_POPUP, sound: "" };
  }
}

export function getEventLevel(eventKey: string): string {
  return getEventConfig(eventKey).level;
}
