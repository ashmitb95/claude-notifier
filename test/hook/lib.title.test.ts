import { describe, it, expect } from "vitest";

const { titleForCwd, DEFAULT_TITLE } = await import("../../hook/_lib/title");

describe("hook/_lib/title — titleForCwd", () => {
  it("uses the leaf directory name of a POSIX cwd", () => {
    expect(titleForCwd("/Users/foo/projects/my-app")).toBe("my-app");
  });

  it("uses the leaf directory name of a Windows cwd", () => {
    expect(titleForCwd("C:\\Users\\foo\\projects\\my-app")).toBe("my-app");
  });

  it("ignores a trailing separator", () => {
    expect(titleForCwd("/Users/foo/my-app/")).toBe("my-app");
    expect(titleForCwd("C:\\Users\\foo\\my-app\\")).toBe("my-app");
  });

  it("falls back to the default title when there is no usable leaf", () => {
    expect(titleForCwd("")).toBe(DEFAULT_TITLE);
    expect(titleForCwd(undefined)).toBe(DEFAULT_TITLE);
    expect(titleForCwd(null)).toBe(DEFAULT_TITLE);
    expect(titleForCwd("/")).toBe(DEFAULT_TITLE);
  });

  it("keeps names with spaces and punctuation intact", () => {
    expect(titleForCwd("/Users/foo/it's a project")).toBe("it's a project");
  });
});
