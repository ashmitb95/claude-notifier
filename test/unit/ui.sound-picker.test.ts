import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/notifications/sound", () => ({
  MACOS_SOUNDS: { Hero: "/x/Hero.aiff", Glass: "/x/Glass.aiff" },
  WIN_SOUNDS: { tada: "/x/tada.wav", ding: "/x/ding.wav" },
  LINUX_SOUNDS: { Hero: "/x/hero.oga", Glass: "/x/glass.oga" },
  playLocalSound: vi.fn(),
}));

import { listPresetsForPlatform, EVENT_KEYS } from "../../src/ui/sound-picker";

describe("sound-picker — preset listings", () => {
  it("returns macOS presets on darwin", () => {
    expect(listPresetsForPlatform("darwin")).toEqual(["Hero", "Glass"]);
  });

  it("returns Windows presets on win32", () => {
    expect(listPresetsForPlatform("win32")).toEqual(["tada", "ding"]);
  });

  it("returns Linux presets on linux", () => {
    expect(listPresetsForPlatform("linux")).toEqual(["Hero", "Glass"]);
  });

  it("exports the canonical event keys", () => {
    expect(EVENT_KEYS).toEqual(["taskCompleted", "needsPermission", "asksQuestion"]);
  });
});
