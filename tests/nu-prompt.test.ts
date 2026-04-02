import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("prompts/nu.md", () => {
  it("exists and contains structured exploration description", () => {
    const content = readFileSync(resolve(__dirname, "../prompts/nu.md"), "utf-8");
    expect(content).toContain("Nushell");
    expect(content).toContain("structured");
    expect(content).toContain("bash");
  });

  it("mentions exploration and investigation use case", () => {
    const content = readFileSync(resolve(__dirname, "../prompts/nu.md"), "utf-8");
    expect(content).toContain("exploration");
  });
});
