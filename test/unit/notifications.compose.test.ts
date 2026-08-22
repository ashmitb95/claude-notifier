import { describe, it, expect } from "vitest";
import { compose, EVENTS } from "../../src/notifications/compose";

describe("notifications/compose", () => {
  it("matches the hook composer's title format", () => {
    expect(compose({ workspace: "ws", event: EVENTS.DONE }).title).toBe("ws | ✅ finished");
  });

  it("omits the chat line when no title resolves", () => {
    expect(compose({ workspace: "ws", event: EVENTS.DONE, detail: ["ran 1 command"] }).body).toBe(
      "ran 1 command"
    );
  });
});
