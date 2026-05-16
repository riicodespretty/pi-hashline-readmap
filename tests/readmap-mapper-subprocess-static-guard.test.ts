import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const mapperFiles = [
  "src/readmap/mappers/python.ts",
  "src/readmap/mappers/go.ts",
  "src/readmap/mappers/json.ts",
  "src/readmap/mappers/fallback.ts",
  "src/readmap/mappers/ctags.ts",
];

describe("readmap mapper subprocess static guard", () => {
  it("keeps mapper files from using shell subprocess APIs", async () => {
    for (const file of mapperFiles) {
      const source = await readFile(file, "utf8");

      expect(source, file).not.toContain('import { exec } from "node:child_process"');
      expect(source, file).not.toContain('from "node:child_process"');
      expect(source, file).not.toContain("promisify(exec)");
      expect(source, file).not.toContain("execAsync(");
      expect(source, file).not.toMatch(/spawn\([^\n]*shell:\s*true/s);
      expect(source, file).not.toMatch(/`[^`]*\$\{filePath\}[^`]*`/);
    }
  });
});
