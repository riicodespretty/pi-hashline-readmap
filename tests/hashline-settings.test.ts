import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  __resetHashlineSettingsPathsForTest,
  __setHashlineSettingsPathsForTest,
  resolveHashlineJsonSettings,
} from "../src/hashline-settings.js";

const tempRoots: string[] = [];

afterEach(() => {
  __resetHashlineSettingsPathsForTest();
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function makeSettingsPair() {
  const root = mkdtempSync(join(tmpdir(), "hashline-settings-"));
  tempRoots.push(root);
  const globalSettingsPath = join(root, "home/.pi/agent/settings.json");
  const projectSettingsPath = join(root, "repo/.pi/settings.json");
  mkdirSync(join(root, "home/.pi/agent"), { recursive: true });
  mkdirSync(join(root, "repo/.pi"), { recursive: true });
  __setHashlineSettingsPathsForTest({ globalSettingsPath, projectSettingsPath });
  return { globalSettingsPath, projectSettingsPath };
}

describe("resolveHashlineJsonSettings", () => {
  it("loads only hashlineReadmap settings with project-over-global precedence", () => {
    const { globalSettingsPath, projectSettingsPath } = makeSettingsPair();
    writeFileSync(globalSettingsPath, JSON.stringify({
      grep: { maxLines: 1 },
      hashlineReadmap: {
        grep: { maxLines: 100, maxBytes: 4096 },
        mapCache: { dir: "/global-cache", enabled: true },
        bashContextGuard: { enabled: true, maxLines: 500, maxBytes: 8192, headLines: 8, tailLines: 9 },
      },
    }), "utf8");
    writeFileSync(projectSettingsPath, JSON.stringify({
      hashlineReadmap: {
        grep: { maxBytes: 2048 },
        mapCache: { dir: "/project-cache" },
        bashContextGuard: { maxBytes: 4096, tailLines: 3 },
      },
    }), "utf8");

    expect(resolveHashlineJsonSettings()).toEqual({
      settings: {
        grep: { maxLines: 100, maxBytes: 2048 },
        mapCache: { dir: "/project-cache", enabled: true },
        bashContextGuard: { enabled: true, maxLines: 500, maxBytes: 4096, headLines: 8, tailLines: 3 },
      },
      warnings: [],
    });
  });
  it("ignores malformed settings files and returns non-fatal source warnings", () => {
    const { globalSettingsPath, projectSettingsPath } = makeSettingsPair();
    writeFileSync(globalSettingsPath, "{not-json", "utf8");
    writeFileSync(projectSettingsPath, JSON.stringify({
      hashlineReadmap: { grep: { maxLines: 12 } },
    }), "utf8");

    const result = resolveHashlineJsonSettings();

    expect(result.settings.grep?.maxLines).toBe(12);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].source).toBe(globalSettingsPath);
    expect(result.warnings[0].message).toContain("Invalid JSON");
  });

  it("ignores invalid project field values instead of erasing valid global settings", () => {
    const { globalSettingsPath, projectSettingsPath } = makeSettingsPair();
    writeFileSync(globalSettingsPath, JSON.stringify({
      hashlineReadmap: {
        grep: { maxLines: 100, maxBytes: 4096 },
        mapCache: { dir: "/global-cache", enabled: true },
        bashContextGuard: { maxLines: 500, maxBytes: 8192, headLines: 8, tailLines: 9 },
      },
    }), "utf8");
    writeFileSync(projectSettingsPath, JSON.stringify({
      hashlineReadmap: {
        grep: { maxLines: "10", maxBytes: 3.14 },
        mapCache: { dir: "", enabled: "yes" },
        bashContextGuard: { enabled: 1, maxLines: 0, maxBytes: -1, headLines: 2, tailLines: 4 },
      },
    }), "utf8");

    const result = resolveHashlineJsonSettings();

    expect(result.settings.grep?.maxLines).toBe(100);
    expect(result.settings.grep?.maxBytes).toBe(4096);
    expect(result.settings.mapCache?.dir).toBe("/global-cache");
    expect(result.settings.mapCache?.enabled).toBe(true);
    expect(result.settings.bashContextGuard?.maxLines).toBe(500);
    expect(result.settings.bashContextGuard?.maxBytes).toBe(8192);
    expect(result.settings.bashContextGuard?.headLines).toBe(2);
    expect(result.settings.bashContextGuard?.tailLines).toBe(4);
    expect(result.warnings.map((w) => w.path)).toEqual(expect.arrayContaining([
      "hashlineReadmap.grep.maxLines",
      "hashlineReadmap.grep.maxBytes",
      "hashlineReadmap.mapCache.dir",
      "hashlineReadmap.mapCache.enabled",
      "hashlineReadmap.bashContextGuard.enabled",
      "hashlineReadmap.bashContextGuard.maxLines",
      "hashlineReadmap.bashContextGuard.maxBytes",
    ]));
    expect(result.warnings.every((w) => w.source === projectSettingsPath)).toBe(true);
  });
});
