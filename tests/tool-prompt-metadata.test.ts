import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize } from "@earendil-works/pi-coding-agent";

type ToolDefinition = {
  name: string;
  description?: unknown;
  promptSnippet?: unknown;
  promptGuidelines?: unknown;
};

function createMockPi() {
  return {
    registerTool: vi.fn(),
    events: { emit: vi.fn(), on: vi.fn() },
    on: vi.fn(),
  };
}

function firstParagraph(promptPath: string): string {
  return readFileSync(resolve(promptPath), "utf8")
    .replaceAll("{{DEFAULT_MAX_LINES}}", String(DEFAULT_MAX_LINES))
    .replaceAll("{{DEFAULT_MAX_BYTES}}", formatSize(DEFAULT_MAX_BYTES))
    .trim()
    .split(/\n\s*\n/, 1)[0]
    ?.trim() ?? "";
}

function assertPromptMetadata(tool: ToolDefinition, promptPath: string, toolName: string) {
  expect(tool.description).toBe(firstParagraph(promptPath));
  expect(tool.description).not.toContain("\n\n");

  expect(typeof tool.promptSnippet).toBe("string");
  expect((tool.promptSnippet as string).length).toBeGreaterThan(0);

  expect(Array.isArray(tool.promptGuidelines)).toBe(true);
  const guidelines = tool.promptGuidelines as string[];
  expect(guidelines.length).toBeGreaterThan(0);
  for (const guideline of guidelines) {
    expect(typeof guideline).toBe("string");
    expect(guideline.length).toBeGreaterThan(0);
    expect(guideline.toLowerCase()).toContain(toolName.toLowerCase());
    expect(guideline).not.toMatch(/\bthis tool\b/i);
  }
}

describe("stock pi prompt metadata", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("node:child_process");
  });

  it("exposes snippets, flat guidelines, and first-paragraph descriptions for hashline tools", async () => {
    const pi = createMockPi();

    const { registerReadTool } = await import("../src/read.js");
    const { registerEditTool } = await import("../src/edit.js");
    const { registerGrepTool } = await import("../src/grep.js");
    const { registerFindTool } = await import("../src/find.js");
    const { registerLsTool } = await import("../src/ls.js");
    const { registerWriteTool } = await import("../src/write.js");
    const { registerSgTool } = await import("../src/sg.js");

    const tools = [
      { tool: registerReadTool(pi as any), promptPath: "prompts/read.md", toolName: "read" },
      { tool: registerEditTool(pi as any), promptPath: "prompts/edit.md", toolName: "edit" },
      { tool: registerGrepTool(pi as any), promptPath: "prompts/grep.md", toolName: "grep" },
      { tool: registerFindTool(pi as any), promptPath: "prompts/find.md", toolName: "find" },
      { tool: registerLsTool(pi as any), promptPath: "prompts/ls.md", toolName: "ls" },
      { tool: registerWriteTool(pi as any), promptPath: "prompts/write.md", toolName: "write" },
      { tool: registerSgTool(pi as any), promptPath: "prompts/sg.md", toolName: "ast_search" },
    ];

    for (const { tool, promptPath, toolName } of tools) {
      assertPromptMetadata(tool, promptPath, toolName);
    }
  });

  it("keeps nu metadata consistent with stock pi's flat prompt surface", async () => {
    vi.doMock("node:child_process", async () => {
      const actual = await vi.importActual<any>("node:child_process");
      return {
        ...actual,
        execFileSync: vi.fn(() => Buffer.from("0.111.0\n")),
      };
    });

    const { registerNuTool } = await import("../src/nu.js");
    const pi = createMockPi();
    const tool = registerNuTool(pi as any);

    expect(tool).not.toBe(false);
    assertPromptMetadata(tool as ToolDefinition, "prompts/nu.md", "nu");
  });
});
