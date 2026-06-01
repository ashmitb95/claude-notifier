import * as vscode from "vscode";

export interface PanelEvent {
  key: "taskCompleted" | "needsPermission" | "asksQuestion";
  label: string;
  sound: string;
}

export interface PanelState {
  muted: boolean;
  volume: number;
  threshold: number;
  events: PanelEvent[];
}

const VOLUME_PRESETS = [0, 0.25, 0.5, 0.75, 1, 1.5, 2] as const;

function commandUri(command: string, args?: unknown[]): string {
  if (!args || args.length === 0) return `command:${command}`;
  return `command:${command}?${encodeURIComponent(JSON.stringify(args))}`;
}

function volumeBar(value: number): string {
  if (value === 0) return "○○○○○○○○";
  if (value <= 0.25) return "●●○○○○○○";
  if (value <= 0.5) return "●●●●○○○○";
  if (value <= 0.75) return "●●●●●●○○";
  if (value <= 1) return "●●●●●●●●";
  if (value <= 1.5) return "●●●●●●●●+";
  return "●●●●●●●●++";
}

function volumeLabel(value: number): string {
  if (value === 0) return "0% (mute)";
  return `${Math.round(value * 100)}%`;
}

function currentPreset(volume: number): number {
  let best: number = VOLUME_PRESETS[0];
  let bestDist = Infinity;
  for (const p of VOLUME_PRESETS) {
    const d = Math.abs(p - volume);
    if (d < bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}

export function buildPanelMarkdown(state: PanelState): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = true;
  md.supportHtml = true;
  md.supportThemeIcons = true;

  const headerIcon = state.muted ? "$(mute)" : "$(unmute)";
  const headerLabel = state.muted ? "Sound OFF" : "Sound ON";
  md.appendMarkdown(`${headerIcon} **Claude Notifier — ${headerLabel}**\n\n`);
  md.appendMarkdown(`---\n\n`);

  md.appendMarkdown(`**Volume**\n\n`);
  const cur = currentPreset(state.volume);
  for (const v of VOLUME_PRESETS) {
    const marker = v === cur ? "$(check) " : "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;";
    const link = commandUri("claudeNotifier.setVolume", [v]);
    md.appendMarkdown(`${marker}[${volumeBar(v)} ${volumeLabel(v)}](${link})\n\n`);
  }

  const muteLabel = state.muted ? "Unmute" : "Mute";
  md.appendMarkdown(
    `[${state.muted ? "$(unmute)" : "$(mute)"} ${muteLabel}](${commandUri("claudeNotifier.toggleSound")})\n\n`
  );

  const thresholdText = state.threshold > 0 ? `${state.threshold}s` : "off";
  md.appendMarkdown(
    `**Min task duration:** ${thresholdText} &nbsp; [Change…](${commandUri("claudeNotifier.setThreshold")})\n\n`
  );

  md.appendMarkdown(`---\n\n`);
  md.appendMarkdown(`**Events**\n\n`);
  for (const ev of state.events) {
    const previewLink = commandUri("claudeNotifier.previewEventSound", [ev.key]);
    const pickLink = commandUri("claudeNotifier.pickEventSound", [ev.key]);
    md.appendMarkdown(
      `- **${ev.label}** — ${ev.sound} &nbsp; [$(play) Preview](${previewLink}) &nbsp; [$(chevron-right) Change](${pickLink})\n`
    );
  }
  md.appendMarkdown(`\n`);

  md.appendMarkdown(`[$(gear) Open settings](${commandUri("claudeNotifier.openSettings")})\n`);

  return md;
}
