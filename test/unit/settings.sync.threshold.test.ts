import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

let tmpRoot: string;
let tmpHooksDir: string;
let configFile: string;

vi.mock("vscode", () => {
  const cfg: Record<string, unknown> = {
    "taskCompleted.level": "sound+popup",
    "taskCompleted.sound": "Hero",
    "needsPermission.level": "sound+popup",
    "needsPermission.sound": "Glass",
    "asksQuestion.level": "sound+popup",
    "asksQuestion.sound": "Funk",
    soundVolume: 1,
    minTaskDurationThreshold: 15,
  };
  return {
    workspace: {
      getConfiguration: () => ({
        get: (key: string, fallback: unknown) => (key in cfg ? cfg[key] : fallback),
      }),
    },
  };
});

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sync-threshold-test-"));
  tmpHooksDir = path.join(tmpRoot, ".claude", "hooks");
  configFile = path.join(tmpHooksDir, "claude-notifier-config.json");
  fs.mkdirSync(tmpHooksDir, { recursive: true });
  process.env.HOME = tmpRoot;
  process.env.USERPROFILE = tmpRoot;
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("syncConfig — threshold propagation", () => {
  it("writes minTaskDurationThreshold to the hook config JSON", async () => {
    vi.resetModules();
    const { syncConfig } = await import("../../src/settings/sync");
    syncConfig();
    const cfg = JSON.parse(fs.readFileSync(configFile, "utf-8"));
    expect(cfg.minTaskDurationThreshold).toBe(15);
  });

  it("clamps to 0 when value is undefined/NaN", async () => {
    vi.resetModules();
    vi.doMock("vscode", () => ({
      workspace: {
        getConfiguration: () => ({
          get: (key: string, fallback: unknown) => fallback,
        }),
      },
    }));
    const { syncConfig } = await import("../../src/settings/sync");
    syncConfig();
    const cfg = JSON.parse(fs.readFileSync(configFile, "utf-8"));
    expect(cfg.minTaskDurationThreshold).toBe(0);
    vi.doUnmock("vscode");
  });
});
