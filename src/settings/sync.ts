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

export const DEFAULT_REMOTE_AUDIO_PORT = 47291;

export function getRemoteAudio(): { enabled: boolean; port: number } {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    return {
      enabled: config.remoteAudio?.enabled === true,
      port: config.remoteAudio?.port ?? DEFAULT_REMOTE_AUDIO_PORT,
    };
  } catch {
    return { enabled: false, port: DEFAULT_REMOTE_AUDIO_PORT };
  }
}

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
        label: cfg.get<string>(`${hook.eventKey}.label`, hook.defaultLabel),
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
    showChatTitle: cfg.get<boolean>("showChatTitle", true),
    showDetail: cfg.get<boolean>("showDetail", true),
    remoteAudio: {
      enabled: cfg.get<boolean>("remoteAudio.enabled", false),
      port: cfg.get<number>("remoteAudio.port", DEFAULT_REMOTE_AUDIO_PORT),
    },
  };
  try {
    fs.mkdirSync(HOOKS_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
  } catch {}
}

export function getEventConfig(eventKey: string): {
  level: string;
  sound: string;
  label: string;
} {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    return {
      level: config[eventKey]?.level ?? LEVELS.SOUND_POPUP,
      sound: config[eventKey]?.sound ?? "",
      label: config[eventKey]?.label ?? "",
    };
  } catch {
    return { level: LEVELS.SOUND_POPUP, sound: "", label: "" };
  }
}

/** Notification body parts the user has left enabled. Both default on. */
export function getBodyParts(): { chatTitle: boolean; detail: boolean } {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    return {
      chatTitle: config.showChatTitle !== false,
      detail: config.showDetail !== false,
    };
  } catch {
    return { chatTitle: true, detail: true };
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

export function getAutoMuteWhenFocused(): boolean {
  return (
    vscode.workspace.getConfiguration("claudeNotifier").get<boolean>("autoMuteWhenFocused") === true
  );
}

export function getMinTaskDurationThreshold(): number {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    return clampThreshold(config.minTaskDurationThreshold ?? DEFAULT_THRESHOLD);
  } catch {
    return DEFAULT_THRESHOLD;
  }
}
