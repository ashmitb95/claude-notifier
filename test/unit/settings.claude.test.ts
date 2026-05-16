import { describe, it, expect } from "vitest";
import { stripClaudeNotifierHooks } from "../../src/settings/claude";

function notifierEntry(cmd: string, matcher?: string) {
  const entry: any = { hooks: [{ type: "command", command: cmd }] };
  if (matcher !== undefined) entry.matcher = matcher;
  return entry;
}

function thirdPartyEntry() {
  return { hooks: [{ type: "command", command: "node ~/.claude/hooks/my-other-tool.js" }] };
}

describe("stripClaudeNotifierHooks", () => {
  it("removes claude-notifier entries from each hook type", () => {
    const settings = {
      hooks: {
        Stop: [notifierEntry("node ~/.claude/hooks/claude-notifier-on-stop.js")],
        PermissionRequest: [notifierEntry("node ~/.claude/hooks/claude-notifier-on-permission.js")],
        PreToolUse: [
          notifierEntry("node ~/.claude/hooks/claude-notifier-on-question.js", "AskUserQuestion"),
        ],
        Notification: [notifierEntry("node ~/.claude/hooks/claude-notifier-on-notification.js")],
        UserPromptSubmit: [notifierEntry("node ~/.claude/hooks/claude-notifier-on-prompt.js")],
      },
    };

    stripClaudeNotifierHooks(settings);

    expect(settings.hooks).toEqual({});
  });

  it("preserves third-party entries on the same hook type", () => {
    const settings = {
      hooks: {
        Stop: [notifierEntry("node ~/.claude/hooks/claude-notifier-on-stop.js"), thirdPartyEntry()],
      },
    };

    stripClaudeNotifierHooks(settings);

    expect(settings.hooks.Stop).toHaveLength(1);
    expect(settings.hooks.Stop[0]).toEqual(thirdPartyEntry());
  });

  it("deletes the per-type array when it becomes empty", () => {
    const settings = {
      hooks: {
        Stop: [notifierEntry("node ~/.claude/hooks/claude-notifier-on-stop.js")],
        PermissionRequest: [thirdPartyEntry()],
      },
    };

    stripClaudeNotifierHooks(settings);

    expect((settings.hooks as any).Stop).toBeUndefined();
    expect(settings.hooks.PermissionRequest).toHaveLength(1);
  });

  it("does NOT delete the top-level hooks object even when empty", () => {
    // Callers (setupHooks) re-populate hooks immediately; teardown handles
    // the top-level delete itself.
    const settings = {
      hooks: { Stop: [notifierEntry("node ~/.claude/hooks/claude-notifier-on-stop.js")] },
    };

    stripClaudeNotifierHooks(settings);

    expect(settings.hooks).toBeDefined();
    expect(Object.keys(settings.hooks)).toHaveLength(0);
  });

  it("safe when settings.hooks is missing", () => {
    const settings: any = {};
    expect(() => stripClaudeNotifierHooks(settings)).not.toThrow();
    expect(settings.hooks).toBeUndefined();
  });

  it("safe when a hook type is missing", () => {
    const settings = { hooks: { Stop: [thirdPartyEntry()] } };
    expect(() => stripClaudeNotifierHooks(settings)).not.toThrow();
    expect(settings.hooks.Stop).toHaveLength(1);
  });

  it("matches by command substring — any 'claude-notifier' in command is filtered", () => {
    const settings = {
      hooks: {
        Stop: [{ hooks: [{ type: "command", command: "/odd/path/claude-notifier-wrapper.sh" }] }],
      },
    };
    stripClaudeNotifierHooks(settings);
    expect((settings.hooks as any).Stop).toBeUndefined();
  });
});
