import { describe, it, expect } from "vitest";

const { compose, EVENTS } = await import("../../hook/_lib/compose");

describe("hook/_lib/compose", () => {
  it("builds a title from workspace and event", () => {
    const { title } = compose({ workspace: "claude-notifier", event: EVENTS.DONE });
    expect(title).toBe("claude-notifier | ✅ finished");
  });

  it("falls back to the default title with no workspace", () => {
    expect(compose({ workspace: "", event: EVENTS.DONE }).title).toBe("Claude Notifier");
  });

  it("puts the chat title in bullets above a blank line", () => {
    const { body } = compose({
      workspace: "ws",
      event: EVENTS.DONE,
      chatTitle: "Review two new contributor PRs",
      detail: ["ran 5 commands"],
    });
    expect(body).toBe("• Review two new contributor PRs •\n\nran 5 commands");
  });

  it("caps the chat title at 36 when two detail lines are present", () => {
    const { body } = compose({
      workspace: "ws",
      event: EVENTS.DONE,
      chatTitle: "Optimize Stellaris empire build and tech progression",
      detail: ["ran 5 commands", "subagents: read 12 files"],
    });
    const first = body.split("\n")[0];
    expect(first.length).toBeLessThanOrEqual(40);
    expect(first.endsWith("… •")).toBe(true);
  });

  it("allows a longer chat title when only one detail line is present", () => {
    const { body } = compose({
      workspace: "ws",
      event: EVENTS.DONE,
      chatTitle: "Optimize Stellaris empire build and tech progression",
      detail: ["ran 5 commands"],
    });
    expect(body.split("\n")[0]).toBe("• Optimize Stellaris empire build and tech progression •");
  });

  it("omits the chat line entirely when no title resolves", () => {
    const { body } = compose({ workspace: "ws", event: EVENTS.DONE, detail: ["ran 5 commands"] });
    expect(body).toBe("ran 5 commands");
  });

  it("falls back to the plain sentence when there is no detail", () => {
    const { body } = compose({
      workspace: "ws",
      event: EVENTS.DONE,
      chatTitle: "Some chat",
      fallback: "Claude has finished the task.",
    });
    expect(body).toBe("• Some chat •\n\nClaude has finished the task.");
  });
});

describe("hook/_lib/compose — safeCompose", () => {
  it("composes normally when the builder succeeds", async () => {
    const { safeCompose, compose, EVENTS } = await import("../../hook/_lib/compose");
    const got = safeCompose("ws", EVENTS.DONE, "Claude has finished the task.", () => ({
      chatTitle: "Some chat",
      detail: ["ran 1 command"],
    }));
    expect(got).toEqual(
      compose({
        workspace: "ws",
        event: EVENTS.DONE,
        chatTitle: "Some chat",
        detail: ["ran 1 command"],
        fallback: "Claude has finished the task.",
      })
    );
  });

  it("degrades to the pre-rework notification when a resolver throws", async () => {
    const { safeCompose, EVENTS } = await import("../../hook/_lib/compose");
    expect(
      safeCompose("ws", EVENTS.DONE, "Claude has finished the task.", () => {
        throw new Error("transcript blew up");
      })
    ).toEqual({ title: "ws", body: "Claude has finished the task." });
  });

  it("uses the default title when the workspace is unknown too", async () => {
    const { safeCompose, EVENTS } = await import("../../hook/_lib/compose");
    expect(
      safeCompose("", EVENTS.DONE, "Claude has finished the task.", () => {
        throw new Error("boom");
      })
    ).toEqual({ title: "Claude Notifier", body: "Claude has finished the task." });
  });

  it("tolerates a builder that returns nothing", async () => {
    const { safeCompose, EVENTS } = await import("../../hook/_lib/compose");
    expect(
      safeCompose("ws", EVENTS.DONE, "Claude has finished the task.", () => undefined)
    ).toEqual({ title: "ws | ✅ finished", body: "Claude has finished the task." });
  });
});

describe("hook/_lib/compose — eventLabel", () => {
  it("falls back to the built-in default when nothing is configured", async () => {
    const { eventLabel, EVENTS } = await import("../../hook/_lib/compose");
    expect(eventLabel(undefined, EVENTS.DONE)).toBe("✅ finished");
    expect(eventLabel(null, EVENTS.DONE)).toBe("✅ finished");
  });

  it("uses the configured label verbatim", async () => {
    const { eventLabel, EVENTS } = await import("../../hook/_lib/compose");
    expect(eventLabel("🎉 all done", EVENTS.DONE)).toBe("🎉 all done");
  });

  it("treats an empty label as a deliberate opt-out", async () => {
    const { eventLabel, EVENTS } = await import("../../hook/_lib/compose");
    expect(eventLabel("", EVENTS.DONE)).toBe("");
    expect(eventLabel("   ", EVENTS.DONE)).toBe("");
  });

  it("collapses whitespace and clamps a pasted paragraph", async () => {
    const { eventLabel, EVENTS } = await import("../../hook/_lib/compose");
    expect(eventLabel("done\nwith\ttabs", EVENTS.DONE)).toBe("done with tabs");
    const long = eventLabel("x".repeat(80), EVENTS.DONE);
    expect(long.length).toBeLessThanOrEqual(24);
  });

  it("drops the separator when the label is empty", async () => {
    const { compose } = await import("../../hook/_lib/compose");
    expect(compose({ workspace: "my-app", event: "" }).title).toBe("my-app");
    expect(compose({ workspace: "my-app", event: "✅ finished" }).title).toBe(
      "my-app | ✅ finished"
    );
  });
});

describe("hook/_lib/compose — visibility flags", () => {
  it("defaults both parts on when unconfigured", async () => {
    const { wantsChatTitle, wantsDetail } = await import("../../hook/_lib/compose");
    expect(wantsChatTitle(undefined)).toBe(true);
    expect(wantsDetail(undefined)).toBe(true);
    expect(wantsChatTitle({})).toBe(true);
    expect(wantsDetail({})).toBe(true);
  });

  it("honours an explicit opt-out", async () => {
    const { wantsChatTitle, wantsDetail } = await import("../../hook/_lib/compose");
    expect(wantsChatTitle({ showChatTitle: false })).toBe(false);
    expect(wantsDetail({ showDetail: false })).toBe(false);
  });

  it("keeps the parts independent", async () => {
    const { wantsChatTitle, wantsDetail } = await import("../../hook/_lib/compose");
    expect(wantsChatTitle({ showDetail: false })).toBe(true);
    expect(wantsDetail({ showChatTitle: false })).toBe(true);
  });

  it("falls back to the plain sentence when both are off", async () => {
    const { compose, EVENTS } = await import("../../hook/_lib/compose");
    const { title, body } = compose({
      workspace: "ws",
      event: EVENTS.DONE,
      chatTitle: "",
      detail: [],
      fallback: "Claude has finished the task.",
    });
    expect(title).toBe("ws | ✅ finished");
    expect(body).toBe("Claude has finished the task.");
  });
});
