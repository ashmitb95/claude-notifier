import * as fs from "fs";
import * as path from "path";
import { SETTINGS_FILE } from "../paths";
import { ALL_HOOK_TYPES } from "../hooks/registry";

export function readSettings(): any {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

export function writeSettings(settings: any): void {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n");
}

/**
 * Filter out all claude-notifier hook entries from settings.json (any hook
 * type). Mutates `settings` in place. Removes empty per-type arrays but does
 * NOT delete the top-level `hooks` object — caller decides (setup wants to
 * keep it for re-population, teardown wants to delete if empty).
 */
export function stripClaudeNotifierHooks(settings: any): void {
  for (const hookType of ALL_HOOK_TYPES) {
    if (settings.hooks?.[hookType]) {
      settings.hooks[hookType] = settings.hooks[hookType].filter(
        (entry: any) => !entry.hooks?.some((h: any) => h.command?.includes("claude-notifier"))
      );
      if (settings.hooks[hookType].length === 0) {
        delete settings.hooks[hookType];
      }
    }
  }
}
