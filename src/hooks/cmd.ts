import { IS_WIN } from "../paths";

/**
 * Shell command that runs a hook script. `agent` is appended for agents other
 * than Claude Code so the script can word its notifications correctly.
 *
 * Codex pins hook trust to a hash of this string, so it must stay byte-stable
 * across extension upgrades — see docs/CODEX.md.
 */
export function hookCmd(hookPath: string, agent?: string): string {
  const arg = agent ? ` --agent ${agent}` : "";
  if (IS_WIN) {
    return `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${hookPath}"${arg}`;
  }
  return `node "${hookPath}"${arg}`;
}
