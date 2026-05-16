import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("Go mapper subprocess usage", () => {
  it("does not use shell command strings", async () => {
    const source = await readFile("src/readmap/mappers/go.ts", "utf8");

    expect(source).not.toContain('import { exec } from "node:child_process"');
    expect(source).not.toContain("promisify(exec)");
    expect(source).not.toContain("execAsync(");
    expect(source).not.toContain('wc -l < "${filePath}"');
    expect(source).not.toContain('"${GO_BINARY}" "${filePath}"');
    expect(source).toContain("execFileSafe(");
    expect(source).toContain("countLinesWcStyle(filePath, signal)");
  });
});
