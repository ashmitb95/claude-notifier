import * as path from "path";
import { HOOK_EXT, HOOKS_DIR } from "../paths";

export interface HookDef {
  /** Base filename without extension. */
  baseName: string;
  /** Claude Code hook type key in settings.json. */
  type: string;
  /** Optional matcher for PreToolUse hooks. */
  matcher?: string;
  /** Key for VS Code config (claudeNotifier.<eventKey>.level/.sound). */
  eventKey: string;
  /** Default sound preset. */
  defaultSound: string;
}

export const HOOKS: HookDef[] = [
  {
    baseName: "claude-notifier-on-stop",
    type: "Stop",
    eventKey: "taskCompleted",
    defaultSound: "Hero",
  },
  {
    baseName: "claude-notifier-on-permission",
    type: "PermissionRequest",
    eventKey: "needsPermission",
    defaultSound: "Glass",
  },
  {
    baseName: "claude-notifier-on-question",
    type: "PreToolUse",
    matcher: "AskUserQuestion",
    eventKey: "asksQuestion",
    defaultSound: "Funk",
  },
  {
    // Coordination-only hook: tells the extension's stage state machine to
    // advance when the user submits a new prompt. No user-visible behavior
    // — no sound, no notification, no settings knobs. eventKey/defaultSound
    // unused for this hook but kept non-empty so generic registry loops
    // (syncConfig, etc.) don't choke on undefined values.
    baseName: "claude-notifier-on-prompt",
    type: "UserPromptSubmit",
    eventKey: "userPromptSubmit",
    defaultSound: "",
  },
];

export function hookFileName(hook: HookDef): string {
  return `${hook.baseName}${HOOK_EXT}`;
}

export function hookDestPath(hook: HookDef): string {
  return path.join(HOOKS_DIR, hookFileName(hook));
}

/** Hook types that may appear in settings.json (used for cleanup). */
export const ALL_HOOK_TYPES = [
  "Stop",
  "PermissionRequest",
  "PreToolUse",
  "Notification",
  "UserPromptSubmit",
] as const;
