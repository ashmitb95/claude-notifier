import { describe, it, expect, afterEach } from "vitest";

// isInsideCmux() reads process.env at call time, so a single import is fine.
const { isInsideCmux } = await import("../../hook/_lib/cmux");

const VAR = "CMUX_CLAUDE_HOOK_CMUX_BIN";
const ORIG = process.env[VAR];

function restore() {
  if (ORIG === undefined) delete process.env[VAR];
  else process.env[VAR] = ORIG;
}

describe("hook/_lib/cmux — isInsideCmux", () => {
  afterEach(restore);

  it("true when CMUX_CLAUDE_HOOK_CMUX_BIN is set (cmux injected its hooks)", () => {
    process.env[VAR] = "/Applications/cmux.app/Contents/Resources/bin/cmux";
    expect(isInsideCmux()).toBe(true);
  });

  it("false when CMUX_CLAUDE_HOOK_CMUX_BIN is unset", () => {
    delete process.env[VAR];
    expect(isInsideCmux()).toBe(false);
  });

  it("false when the var is empty (a bare cmux pane with hooks disabled)", () => {
    process.env[VAR] = "";
    expect(isInsideCmux()).toBe(false);
  });
});
