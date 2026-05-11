import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

async function getSgTool() {
  const { registerSgTool } = await import("../src/sg.js");
  let captured: any = null;
  const mockPi = { registerTool(def: any) { captured = def; } };
  registerSgTool(mockPi as any);
  if (!captured) throw new Error("sg tool was not registered");
  return captured;
}

describe("sg prompt loading", () => {
  it("uses the first prompt paragraph as the exact ast_search description", async () => {
    const tool = await getSgTool();
    expect(tool.description).toBe(
      "AST-aware structural code search. Use when text search is too broad or brittle and you need code shape, such as calls, imports, declarations, or JSX. Returns matches grouped by file with edit-ready hashline anchors.",
    );
  });

  it("keeps structural-search contract details in prompts/sg.md", () => {
    const content = readFileSync(resolve(root, "prompts/sg.md"), "utf8");
    expect(content).toContain("code shape");
    expect(content).toContain("grouped by file");
    expect(content).toContain("hashline anchors");
    expect(content).toContain("$NAME");
    expect(content).toContain("$_");
    expect(content).toContain("$$$ARGS");
    expect(content).toContain("parsed as code, not text");
  });
});
