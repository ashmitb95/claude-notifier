import { describe, it, expect } from "vitest";
import { cwdMatchesFolder } from "../../src/routing/cwd";

describe("cwdMatchesFolder", () => {
  it("exact match", () => {
    expect(cwdMatchesFolder("/Users/foo/proj", "/Users/foo/proj")).toBe(true);
  });

  it("cwd inside folder", () => {
    expect(cwdMatchesFolder("/Users/foo/proj/src", "/Users/foo/proj")).toBe(true);
  });

  it("cwd deeply nested in folder", () => {
    expect(cwdMatchesFolder("/Users/foo/proj/src/a/b/c", "/Users/foo/proj")).toBe(true);
  });

  it("trailing separator on folder doesn't break match", () => {
    expect(cwdMatchesFolder("/Users/foo/proj/src", "/Users/foo/proj/")).toBe(true);
  });

  it("sibling folder is NOT a match (prefix collision avoided)", () => {
    // "/Users/foo/proj-other" starts with "/Users/foo/proj" textually but is
    // a different directory. The trailing-separator check guards this.
    expect(cwdMatchesFolder("/Users/foo/proj-other", "/Users/foo/proj")).toBe(false);
  });

  it("sibling at root is NOT a match", () => {
    expect(cwdMatchesFolder("/Users/foo/projects-other", "/Users/foo/projects")).toBe(false);
  });

  it("empty cwd does not match anything", () => {
    expect(cwdMatchesFolder("", "/Users/foo/proj")).toBe(false);
  });

  it("empty folder does not match anything", () => {
    expect(cwdMatchesFolder("/Users/foo/proj", "")).toBe(false);
  });

  it("both empty is not a match", () => {
    expect(cwdMatchesFolder("", "")).toBe(false);
  });

  it("cwd is parent of folder is NOT a match", () => {
    expect(cwdMatchesFolder("/Users/foo", "/Users/foo/proj")).toBe(false);
  });
});
