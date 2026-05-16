import { describe, it, expect } from "vitest";
import * as path from "path";
import { cwdMatchesFolder } from "../../src/routing/cwd";

// cwdMatchesFolder uses path.sep at runtime, so test paths use path.join
// to stay platform-correct (\\ on Windows, / elsewhere).
const ROOT = path.join(path.sep, "Users", "foo", "proj");
const SRC = path.join(ROOT, "src");
const NESTED = path.join(ROOT, "src", "a", "b", "c");

describe("cwdMatchesFolder", () => {
  it("exact match", () => {
    expect(cwdMatchesFolder(ROOT, ROOT)).toBe(true);
  });

  it("cwd inside folder", () => {
    expect(cwdMatchesFolder(SRC, ROOT)).toBe(true);
  });

  it("cwd deeply nested in folder", () => {
    expect(cwdMatchesFolder(NESTED, ROOT)).toBe(true);
  });

  it("trailing separator on folder doesn't break match", () => {
    expect(cwdMatchesFolder(SRC, ROOT + path.sep)).toBe(true);
  });

  it("sibling folder is NOT a match (prefix collision avoided)", () => {
    // "<root>-other" starts with "<root>" textually but is a different dir.
    // The trailing-separator check guards this.
    expect(cwdMatchesFolder(ROOT + "-other", ROOT)).toBe(false);
  });

  it("sibling at projects level is NOT a match", () => {
    const projects = path.join(path.sep, "Users", "foo", "projects");
    const projectsOther = path.join(path.sep, "Users", "foo", "projects-other");
    expect(cwdMatchesFolder(projectsOther, projects)).toBe(false);
  });

  it("empty cwd does not match anything", () => {
    expect(cwdMatchesFolder("", ROOT)).toBe(false);
  });

  it("empty folder does not match anything", () => {
    expect(cwdMatchesFolder(ROOT, "")).toBe(false);
  });

  it("both empty is not a match", () => {
    expect(cwdMatchesFolder("", "")).toBe(false);
  });

  it("cwd is parent of folder is NOT a match", () => {
    const parent = path.join(path.sep, "Users", "foo");
    expect(cwdMatchesFolder(parent, ROOT)).toBe(false);
  });
});
