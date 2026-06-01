import { describe, it, expect, vi } from "vitest";

vi.mock("vscode", () => ({
  MarkdownString: class {
    value = "";
    isTrusted = false;
    supportHtml = false;
    supportThemeIcons = false;
    appendMarkdown(s: string) {
      this.value += s;
      return this;
    }
  },
}));

import { buildPanelMarkdown, PanelState } from "../../src/ui/panel-markdown";

const baseState: PanelState = {
  muted: false,
  volume: 1,
  threshold: 0,
  events: [
    { key: "taskCompleted", label: "Task completed", sound: "Hero" },
    { key: "needsPermission", label: "Permission", sound: "Glass" },
    { key: "asksQuestion", label: "Question", sound: "Funk" },
  ],
};

describe("buildPanelMarkdown", () => {
  it("sets isTrusted, supportHtml, supportThemeIcons", () => {
    const md = buildPanelMarkdown(baseState);
    expect(md.isTrusted).toBe(true);
    expect(md.supportHtml).toBe(true);
    expect(md.supportThemeIcons).toBe(true);
  });

  it("includes a setVolume command link for each preset (0/25/50/75/100/150/200)", () => {
    const md = buildPanelMarkdown(baseState).value;
    for (const v of [0, 0.25, 0.5, 0.75, 1, 1.5, 2]) {
      expect(md).toContain(`command:claudeNotifier.setVolume?${encodeURIComponent(JSON.stringify([v]))}`);
    }
  });

  it("marks the current volume preset with a check icon", () => {
    const md = buildPanelMarkdown({ ...baseState, volume: 1 }).value;
    expect(md).toMatch(/\$\(check\)[^\n]*100%/);
  });

  it("shows muted state when muted=true", () => {
    const md = buildPanelMarkdown({ ...baseState, muted: true }).value;
    expect(md).toContain("$(mute)");
    expect(md).toContain("Sound OFF");
  });

  it("shows current threshold value", () => {
    const md = buildPanelMarkdown({ ...baseState, threshold: 15 }).value;
    expect(md).toContain("15s");
  });

  it("shows '(off)' when threshold is 0", () => {
    const md = buildPanelMarkdown({ ...baseState, threshold: 0 }).value;
    expect(md).toMatch(/Min task duration[^\n]*off/i);
  });

  it("renders a row per event with preview + change links", () => {
    const md = buildPanelMarkdown(baseState).value;
    for (const ev of baseState.events) {
      expect(md).toContain(ev.label);
      expect(md).toContain(ev.sound);
      expect(md).toContain(
        `command:claudeNotifier.previewEventSound?${encodeURIComponent(JSON.stringify([ev.key]))}`
      );
      expect(md).toContain(
        `command:claudeNotifier.pickEventSound?${encodeURIComponent(JSON.stringify([ev.key]))}`
      );
    }
  });

  it("includes the openSettings command", () => {
    const md = buildPanelMarkdown(baseState).value;
    expect(md).toContain("command:claudeNotifier.openSettings");
  });

  it("includes the setThreshold command", () => {
    const md = buildPanelMarkdown(baseState).value;
    expect(md).toContain("command:claudeNotifier.setThreshold");
  });

  it("does not duplicate the mute toggle in the panel body", () => {
    // Mute is handled by clicking the status bar item itself; the panel body
    // doesn't surface a separate toggle. The header still reflects the state.
    const md = buildPanelMarkdown(baseState).value;
    expect(md).not.toContain("command:claudeNotifier.toggleSound");
  });
});
