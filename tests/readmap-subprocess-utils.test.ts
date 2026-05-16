import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { countLinesWcStyle } from "../src/readmap/mappers/_subprocess-utils.js";

describe("readmap mapper subprocess utilities", () => {
  it("counts lines with wc -l newline semantics", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "readmap-line-count-"));

    try {
      const empty = join(tempDir, "empty.txt");
      const noTrailingNewline = join(tempDir, "one-line-no-newline.txt");
      const oneTrailingNewline = join(tempDir, "one-line-with-newline.txt");
      const threeNewlines = join(tempDir, "three-newlines.txt");

      await writeFile(empty, "");
      await writeFile(noTrailingNewline, "one line");
      await writeFile(oneTrailingNewline, "one line\n");
      await writeFile(threeNewlines, "a\nb\nc\n");

      await expect(countLinesWcStyle(empty)).resolves.toBe(0);
      await expect(countLinesWcStyle(noTrailingNewline)).resolves.toBe(0);
      await expect(countLinesWcStyle(oneTrailingNewline)).resolves.toBe(1);
      await expect(countLinesWcStyle(threeNewlines)).resolves.toBe(3);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
