import * as fs from "fs";
import * as vscode from "vscode";
import { HOOKS_DIR, CONFIG_FILE } from "../paths";
import { HOOKS } from "../hooks/registry";
import { LEVELS } from "../signals/types";

export const DEFAULT_VOLUME = 1;
export const MIN_VOLUME = 0;
export const MAX_VOLUME = 2;

export function clampVolume(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v)) return DEFAULT_VOLUME;
  if (v < MIN_VOLUME) return MIN_VOLUME;
  if (v > MAX_VOLUME) return MAX_VOLUME;
  return v;
}

export const MIN_THRESHOLD = 0;
export const MAX_THRESHOLD = 3600;
export const DEFAULT_THRESHOLD = 0;

export function clampThreshold(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v) || v < MIN_THRESHOLD) return DEFAULT_THRESHOLD;
  if (v > MAX_THRESHOLD) return MAX_THRESHOLD;
  return v;
}

export function syncConfig(): void {
  const cfg = vscode.workspace.getConfiguration("claudeNotifier");
  const events = Object.fromEntries(
    HOOKS.map((hook) => [
      hook.eventKey,
      {
        level: cfg.get<string>(`${hook.eventKey}.level`, LEVELS.SOUND_POPUP),
        sound: cfg.get<string>(`${hook.eventKey}.sound`, hook.defaultSound),
      },
    ])
  );
  const config = {
    ...events,
    soundVolume: clampVolume(cfg.get<number>("soundVolume", DEFAULT_VOLUME)),
    minTaskDurationThreshold: clampThreshold(
      cfg.get<number>("minTaskDurationThreshold", DEFAULT_THRESHOLD)
    ),
    suppressSubagentInteractions: cfg.get<boolean>("suppressSubagentInteractions", true),
  };
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

export function getSoundVolume(): number {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    return clampVolume(config.soundVolume ?? DEFAULT_VOLUME);
  } catch {
    return DEFAULT_VOLUME;
  }
}

export function getMinTaskDurationThreshold(): number {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    return clampThreshold(config.minTaskDurationThreshold ?? DEFAULT_THRESHOLD);
  } catch {
    return DEFAULT_THRESHOLD;
  }
}
