import * as vscode from "vscode";
import { log } from "../log";
import { CODEX_HOOKS_FILE } from "../paths";
import { setupCodexHooks } from "./codex";

/**
 * Register hooks with Codex when the user has it installed and hasn't opted
 * out. Codex will not run newly-registered hooks until the user trusts them,
 * so a first write is worth telling them about — otherwise Codex stays silent
 * with no visible reason why.
 */
export function setupCodexIfEnabled(): void {
  if (!vscode.workspace.getConfiguration("claudeNotifier").get<boolean>("codex.enabled", true)) {
    return;
  }
  let wrote = false;
  try {
    wrote = setupCodexHooks();
  } catch (err) {
    log("codex: hook registration failed:", String(err));
    return;
  }
  if (!wrote) return;

  log("codex: wrote hook registration to", CODEX_HOOKS_FILE);
  vscode.window
    .showInformationMessage(
      "Claude Notifier registered its hooks with Codex. Codex will ask you to trust them before " +
        "notifications start working.",
      "Learn more"
    )
    .then((choice) => {
      if (choice === "Learn more") {
        vscode.env.openExternal(
          vscode.Uri.parse("https://github.com/ashmitb95/claude-notifier/blob/main/docs/CODEX.md")
        );
      }
    });
}
