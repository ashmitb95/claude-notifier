import { describe, it, expect } from "vitest";

const { getAncestorPids } = await import("../../hook/_lib/pid");

describe("hook/_lib/pid — getAncestorPids", () => {
  it("returns an array", () => {
    const chain = getAncestorPids();
    expect(Array.isArray(chain)).toBe(true);
  });

  it("contains only positive integers", () => {
    const chain = getAncestorPids();
    for (const pid of chain) {
      expect(Number.isInteger(pid)).toBe(true);
      expect(pid).toBeGreaterThan(1);
    }
  });

  it("respects the depth cap", () => {
    const chain = getAncestorPids(3);
    expect(chain.length).toBeLessThanOrEqual(3);
  });

  it("does not contain duplicates", () => {
    const chain = getAncestorPids();
    expect(new Set(chain).size).toBe(chain.length);
  });

  it("returns [] on Windows", () => {
    if (process.platform !== "win32") return;
    expect(getAncestorPids()).toEqual([]);
  });
});
