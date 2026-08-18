import * as fs from "fs";
import { CODEX_DIR, CODEX_HOOKS_FILE } from "../paths";
import { HOOKS, hookDestPath } from "./registry";
import { hookCmd } from "./cmd";

export const CODEX_AGENT = "codex";

/** Marker identifying our entries inside a hooks.json we do not own. */
const OURS = "claude-notifier-on-";

/**
 * Codex runs command hooks synchronously and waits for them, with a default
 * timeout of 600s. Ours only write a signal file and return, so a short cap
 * bounds how long a wedged hook could stall a turn.
 */
const HOOK_TIMEOUT_SEC = 10;

type CodexHookEntry = { type: string; command?: string; [k: string]: unknown };
type CodexGroup = { matcher?: string; hooks?: CodexHookEntry[] };
type CodexHooksFile = { hooks?: Record<string, CodexGroup[]>; [k: string]: unknown };

/** Hooks that map onto a Codex event. Codex has no AskUserQuestion analog. */
export function codexHooks() {
  return HOOKS.filter((hook) => hook.codexType);
}

function isOurs(group: CodexGroup): boolean {
  return (
    group.hooks?.some((h) => typeof h.command === "string" && h.command.includes(OURS)) ?? false
  );
}

function readHooksFile(): CodexHooksFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(CODEX_HOOKS_FILE, "utf-8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Strip our entries from a parsed hooks.json, leaving anything the user or
 * another tool registered. Mutates `file` in place.
 */
export function stripCodexNotifierHooks(file: CodexHooksFile): void {
  if (!file.hooks || typeof file.hooks !== "object") return;
  for (const event of Object.keys(file.hooks)) {
    const groups = file.hooks[event];
    if (!Array.isArray(groups)) continue;
    const kept = groups.filter((group) => !isOurs(group));
    if (kept.length === 0) {
      delete file.hooks[event];
    } else {
      file.hooks[event] = kept;
    }
  }
}

/** The hooks.json content we want on disk, given whatever is already there. */
export function buildCodexHooksFile(existing: CodexHooksFile): CodexHooksFile {
  const file: CodexHooksFile = { ...existing };
  file.hooks = { ...(existing.hooks ?? {}) };
  stripCodexNotifierHooks(file);

  for (const hook of codexHooks()) {
    const event = hook.codexType as string;
    const entry: CodexGroup = {
      hooks: [
        {
          type: "command",
          command: hookCmd(hookDestPath(hook), CODEX_AGENT),
          timeout: HOOK_TIMEOUT_SEC,
        },
      ],
    };
    // Ours goes first: Codex derives a hook's trust key from its index within
    // the event, so leading position keeps that key stable when another tool
    // appends its own hooks later.
    file.hooks[event] = [entry, ...(file.hooks[event] ?? [])];
  }
  return file;
}

/**
 * Register our hooks in ~/.codex/hooks.json. No-ops when Codex is not
 * installed, so users without Codex never get a ~/.codex directory.
 *
 * Returns true when the file was written (first install or a changed command),
 * which is the caller's cue that Codex will ask the user to trust the hooks.
 */
export function setupCodexHooks(): boolean {
  if (!fs.existsSync(CODEX_DIR)) return false;

  const existing = readHooksFile();
  const desired = buildCodexHooksFile(existing);
  const next = JSON.stringify(desired, null, 2) + "\n";

  let current = "";
  try {
    current = fs.readFileSync(CODEX_HOOKS_FILE, "utf-8");
  } catch {}
  if (current === next) return false;

  fs.writeFileSync(CODEX_HOOKS_FILE, next);
  return true;
}

/** Remove our entries, deleting the file if nothing else is left in it. */
export function teardownCodexHooks(): void {
  if (!fs.existsSync(CODEX_HOOKS_FILE)) return;
  const file = readHooksFile();
  stripCodexNotifierHooks(file);

  const empty =
    Object.keys(file).length === 0 ||
    (Object.keys(file).length === 1 && Object.keys(file.hooks ?? {}).length === 0);
  try {
    if (empty) {
      fs.unlinkSync(CODEX_HOOKS_FILE);
    } else {
      fs.writeFileSync(CODEX_HOOKS_FILE, JSON.stringify(file, null, 2) + "\n");
    }
  } catch {}
}
