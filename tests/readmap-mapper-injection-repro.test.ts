import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { pythonMapper } from "../src/readmap/mappers/python.js";

describe("readmap mapper subprocess command injection reproduction", () => {
  it("does not execute shell command substitution in Python filenames", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "readmap-injection-repro-"));
    const originalCwd = process.cwd();

    try {
      process.chdir(tempDir);
      const maliciousPath = "evil$(touch pwn).py";
      await writeFile(maliciousPath, "def hello():\n    return 'world'\n");

      await pythonMapper(maliciousPath);

      expect(existsSync("pwn")).toBe(false);
    } finally {
      process.chdir(originalCwd);
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
