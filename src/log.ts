import * as vscode from "vscode";

let channel: vscode.OutputChannel | null = null;

/**
 * Lazy-init a "Claude Notifier" output channel. Call at extension activate
 * (passing the context's subscriptions for cleanup), then `log()` anywhere.
 * No-op if not initialized — extension code paths that might run before
 * activation stay safe.
 */
export function initLogger(context: vscode.ExtensionContext): void {
  if (channel) return;
  channel = vscode.window.createOutputChannel("Claude Notifier");
  context.subscriptions.push(channel);
}

export function log(...parts: unknown[]): void {
  if (!channel) return;
  // Use local time instead of UTC
  const now = new Date();
  const ts = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join(":") + "." + String(now.getMilliseconds()).padStart(3, "0");
  const msg = parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ");
  channel.appendLine(`[${ts}] ${msg}`);
}
