import { describe, it, expect } from "vitest";
import { buildCodexHooksFile, codexHooks, stripCodexNotifierHooks } from "../../src/hooks/codex";

function ourEntry(baseName: string) {
  return {
    hooks: [{ type: "command", command: `node ~/.claude/hooks/${baseName}.js --agent codex` }],
  };
}

function thirdPartyEntry() {
  return { hooks: [{ type: "command", command: "node ~/.codex/hooks/my-other-tool.js" }] };
}

describe("codexHooks", () => {
  it("covers every event Codex supports and excludes the ones it doesn't", () => {
    const events = codexHooks().map((h) => h.codexType);
    expect(events).toEqual(["Stop", "PermissionRequest", "UserPromptSubmit", "SubagentStop"]);
  });

  it("omits asksQuestion, which has no Codex equivalent", () => {
    expect(codexHooks().some((h) => h.eventKey === "asksQuestion")).toBe(false);
  });
});

describe("stripCodexNotifierHooks", () => {
  it("removes our entries and drops the emptied event keys", () => {
    const file: any = {
      hooks: {
        Stop: [ourEntry("claude-notifier-on-stop")],
        SubagentStop: [ourEntry("claude-notifier-on-subagent-stop")],
      },
    };
    stripCodexNotifierHooks(file);
    expect(file.hooks).toEqual({});
  });

  it("preserves third-party entries on the same event", () => {
    const file: any = {
      hooks: { Stop: [ourEntry("claude-notifier-on-stop"), thirdPartyEntry()] },
    };
    stripCodexNotifierHooks(file);
    expect(file.hooks.Stop).toEqual([thirdPartyEntry()]);
  });

  it("leaves a file with no hooks object alone", () => {
    const file: any = { somethingElse: 1 };
    stripCodexNotifierHooks(file);
    expect(file).toEqual({ somethingElse: 1 });
  });
});

describe("buildCodexHooksFile", () => {
  it("registers one entry per supported event", () => {
    const file = buildCodexHooksFile({});
    expect(Object.keys(file.hooks!).sort()).toEqual([
      "PermissionRequest",
      "Stop",
      "SubagentStop",
      "UserPromptSubmit",
    ]);
    for (const groups of Object.values(file.hooks!)) {
      expect(groups).toHaveLength(1);
      expect(groups[0].hooks![0].command).toContain("--agent codex");
    }
  });

  it("is idempotent — rebuilding from its own output does not duplicate entries", () => {
    const once = buildCodexHooksFile({});
    const twice = buildCodexHooksFile(once);
    expect(twice).toEqual(once);
  });

  it("preserves unrelated top-level keys and third-party hooks", () => {
    const existing: any = {
      someOtherSetting: true,
      hooks: { Stop: [thirdPartyEntry()], PostToolUse: [thirdPartyEntry()] },
    };
    const file = buildCodexHooksFile(existing);

    expect(file.someOtherSetting).toBe(true);
    expect(file.hooks!.PostToolUse).toEqual([thirdPartyEntry()]);
    // Third-party Stop hook survives alongside ours.
    expect(file.hooks!.Stop).toHaveLength(2);
    expect(file.hooks!.Stop[1]).toEqual(thirdPartyEntry());
  });

  it("does not mutate the input", () => {
    const existing: any = { hooks: { Stop: [thirdPartyEntry()] } };
    const snapshot = JSON.parse(JSON.stringify(existing));
    buildCodexHooksFile(existing);
    expect(existing).toEqual(snapshot);
  });

  it("keeps our entry first for each event so Codex's index-based trust keys stay stable", () => {
    const withThirdParty = buildCodexHooksFile({
      hooks: { Stop: [thirdPartyEntry()] },
    });
    expect(withThirdParty.hooks!.Stop[0].hooks![0].command).toContain("claude-notifier-on-stop");
    expect(withThirdParty.hooks!.Stop[1]).toEqual(thirdPartyEntry());
  });

  it("caps the hook timeout so a wedged hook cannot stall a Codex turn", () => {
    const file = buildCodexHooksFile({});
    for (const groups of Object.values(file.hooks!)) {
      expect(groups[0].hooks![0].timeout).toBe(10);
    }
  });
});
