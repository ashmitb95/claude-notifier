import * as net from "net";
import * as vscode from "vscode";
import { getRemoteAudio } from "../settings/sync";

/**
 * Remote-audio mode: push a notification event to the local cn-daemon so the
 * sound plays on the client machine, over the SSH reverse forward. Mirrors the
 * hook-side push in hook/_lib/remote-audio.js. The extension is long-running,
 * so this is a plain async fire-and-forget — a connection failure (daemon down
 * / not forwarded) is swallowed.
 *
 * @returns true if remote-audio is enabled (caller skips the terminal-bell
 *   fallback); false if disabled (caller falls back to playRemoteSound).
 */
export function pushRemoteAudio(reason: string, soundName: string, volume: number): boolean {
  const ra = getRemoteAudio();
  if (!ra.enabled) return false;
  try {
    const sock = net.connect(ra.port, "127.0.0.1", () => {
      sock.write(JSON.stringify({ reason, sound: soundName, volume }) + "\n");
      sock.end();
    });
    sock.on("error", () => {});
    sock.setTimeout(2000, () => sock.destroy());
  } catch {
    /* daemon unreachable — stay silent rather than throw */
  }
  return true;
}

export function playRemoteSound(): void {
  // In remote sessions, webview audio is blocked by Electron's autoplay policy.
  // Use a dedicated pseudo-terminal output stream instead. Terminal.sendText
  // (and the sendSequence command) writes to the foreground program's input,
  // where BEL is indistinguishable from Ctrl+G and can trigger TUI shortcuts.
  // `terminal.integrated.enableBell` now only drives the *visual* bell; the
  // audible bell lives under `accessibility.signals.terminalBell.sound`, so
  // enable both or no sound is produced.
  const bellConfig = vscode.workspace.getConfiguration("terminal.integrated");
  if (!bellConfig.get<boolean>("enableBell")) {
    bellConfig.update("enableBell", true, vscode.ConfigurationTarget.Global);
  }
  const signalConfig = vscode.workspace.getConfiguration("accessibility.signals");
  if (signalConfig.get<{ sound?: string }>("terminalBell")?.sound !== "on") {
    signalConfig.update("terminalBell", { sound: "on" }, vscode.ConfigurationTarget.Global);
  }

  const writeEmitter = new vscode.EventEmitter<string>();
  const closeEmitter = new vscode.EventEmitter<void | number>();
  let closeTimer: NodeJS.Timeout | undefined;
  let disposed = false;

  const disposeEmitters = () => {
    if (disposed) return;
    disposed = true;
    if (closeTimer) clearTimeout(closeTimer);
    writeEmitter.dispose();
    closeEmitter.dispose();
  };

  const pty: vscode.Pseudoterminal = {
    onDidWrite: writeEmitter.event,
    onDidClose: closeEmitter.event,
    open: () => {
      // Pseudoterminal output goes to the terminal renderer, which is the
      // correct place to interpret BEL as a bell rather than terminal input.
      writeEmitter.fire("\u0007");
      closeTimer = setTimeout(() => {
        closeEmitter.fire(0);
        disposeEmitters();
      }, 250);
    },
    close: disposeEmitters,
  };

  const terminal = vscode.window.createTerminal({
    name: "Claude Notifier Bell",
    pty,
    isTransient: true,
  });
  // Preserve editor focus. The transient terminal is closed as soon as the
  // renderer has received the BEL.
  terminal.show(true);
}
