import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { registerLsTool } from "../src/ls.js";

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

describe("ls prompt loading", () => {
  it("uses the first paragraph of prompts/ls.md as the tool description", () => {
    const tool = captureTool(registerLsTool);
    expect(tool.description).toBe(firstParagraph(resolve("prompts/ls.md")));
  });

  it("documents single-directory output and routing to find/read", () => {
    const content = readFileSync(resolve("prompts/ls.md"), "utf8");

    expect(content).toContain("List one directory");
    expect(content).toContain("dotfiles are included");
    expect(content).toContain("Output is one entry per line");
    expect(content).toContain("find` for recursive discovery");
    expect(content).toContain("read` for file contents");
  });
});
