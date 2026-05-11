import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { registerFindTool } from "../src/find.js";

function firstParagraph(path: string): string {
  const content = readFileSync(path, "utf8").trim();
  return content.split(/\n\s*\n/, 1)[0]?.trim() ?? content;
}

function captureTool(register: (pi: any) => void) {
  let tool: any;
  register({
    registerTool(def: any) {
      tool = def;
    },
  });
  return tool;
}

describe("find prompt loading", () => {
  it("uses the first paragraph of prompts/find.md as the tool description", () => {
    const tool = captureTool(registerFindTool);
    expect(tool.description).toBe(firstParagraph(resolve("prompts/find.md")));
  });

  it("documents basename matching, filters, sorting, and limit order", () => {
    const content = readFileSync(resolve("prompts/find.md"), "utf8");

    expect(content).toContain("regex: true");
    expect(content).toContain("basename");
    expect(content).toContain("modified strictly after");
    expect(content).toContain("Filtering and sorting happen before `limit`");
    expect(content).toContain("minSize");
    expect(content).toContain("maxSize");
  });
});
