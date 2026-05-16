import { describe, it, expect } from "vitest";
import * as path from "path";
import { HOOKS, hookFileName, hookDestPath, ALL_HOOK_TYPES } from "../../src/hooks/registry";
import { HOOK_EXT, HOOKS_DIR } from "../../src/paths";

describe("HOOKS registry", () => {
  it("declares exactly the four hook scripts the extension ships", () => {
    expect(HOOKS).toHaveLength(4);
    expect(HOOKS.map((h) => h.baseName)).toEqual([
      "claude-notifier-on-stop",
      "claude-notifier-on-permission",
      "claude-notifier-on-question",
      "claude-notifier-on-prompt",
    ]);
  });

  it("maps each script to its Claude Code hook type", () => {
    const byBase = Object.fromEntries(HOOKS.map((h) => [h.baseName, h]));
    expect(byBase["claude-notifier-on-stop"].type).toBe("Stop");
    expect(byBase["claude-notifier-on-permission"].type).toBe("PermissionRequest");
    expect(byBase["claude-notifier-on-question"].type).toBe("PreToolUse");
    expect(byBase["claude-notifier-on-prompt"].type).toBe("UserPromptSubmit");
  });

  it("the question hook carries the AskUserQuestion matcher", () => {
    const question = HOOKS.find((h) => h.baseName === "claude-notifier-on-question")!;
    expect(question.matcher).toBe("AskUserQuestion");
  });

  it("only the question hook has a matcher", () => {
    const withMatcher = HOOKS.filter((h) => h.matcher !== undefined);
    expect(withMatcher).toHaveLength(1);
    expect(withMatcher[0].baseName).toBe("claude-notifier-on-question");
  });

  it("event keys match settings schema", () => {
    const eventKeys = HOOKS.map((h) => h.eventKey).sort();
    expect(eventKeys).toEqual([
      "asksQuestion",
      "needsPermission",
      "taskCompleted",
      "userPromptSubmit",
    ]);
  });

  it("hookFileName appends the platform-correct extension", () => {
    for (const hook of HOOKS) {
      expect(hookFileName(hook)).toBe(`${hook.baseName}${HOOK_EXT}`);
    }
  });

  it("hookDestPath is HOOKS_DIR + filename", () => {
    for (const hook of HOOKS) {
      expect(hookDestPath(hook)).toBe(path.join(HOOKS_DIR, hookFileName(hook)));
    }
  });
});

describe("ALL_HOOK_TYPES", () => {
  it("includes every type the extension might write to settings.json", () => {
    expect([...ALL_HOOK_TYPES].sort()).toEqual([
      "Notification",
      "PermissionRequest",
      "PreToolUse",
      "Stop",
      "UserPromptSubmit",
    ]);
  });

  it("is a superset of HOOKS-registry types", () => {
    // The extension may need to clean up a hook type that's no longer in
    // active use (Notification today). Cleanup loop in
    // stripClaudeNotifierHooks must cover it.
    const activeTypes = new Set(HOOKS.map((h) => h.type));
    for (const t of activeTypes) {
      expect((ALL_HOOK_TYPES as readonly string[]).includes(t)).toBe(true);
    }
  });
});
