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
  const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  const msg = parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ");
  channel.appendLine(`[${ts}] ${msg}`);
}
