import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { fallbackMapper } from "../src/readmap/mappers/fallback.js";

describe("fallback readmap scanner", () => {
  it("replaces the grep pipeline while preserving match order, raw-line anchoring, trimming, and the 500-match cap", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "readmap-fallback-scanner-"));

    try {
      const filePath = join(tempDir, "large.txt");
      const sourcePath = join(process.cwd(), "src/readmap/mappers/fallback.ts");
      const source = await readFile(sourcePath, "utf8");

      const prefix = "x".repeat(11 * 1024 * 1024);
      const matches = Array.from({ length: 550 }, (_, index) => `\nfunction fn${index}() {}`);
      await writeFile(
        filePath,
        `${prefix}\n  function indented() {}${matches.join("")}`
      );

      const map = await fallbackMapper(filePath);

      expect(source).not.toContain("grep -n");
      expect(source).not.toContain("execAsync");
      expect(map?.symbols).toHaveLength(500);
      expect(map?.symbols.map((symbol) => symbol.name).slice(0, 3)).toEqual([
        "fn0",
        "fn1",
        "fn2",
      ]);
      expect(map?.symbols[0]).toMatchObject({ name: "fn0", startLine: 3 });
      expect(map?.symbols.at(-1)).toMatchObject({ name: "fn499" });
      expect(map?.symbols.some((symbol) => symbol.name === "indented")).toBe(false);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
