import { describe, expect, it } from "vitest";
import { registerGrepTool } from "../src/grep.js";
import { registerSgTool } from "../src/sg.js";

const theme = { fg: (_: string, text: string) => text, bold: (text: string) => text };
function capture(register: (pi: any, options?: any) => any): any { let registered: any; register({ registerTool(def: any) { registered = def; } }, {}); return registered; }
function textOf(component: any): string { return component?.text ?? component?.render?.(80)?.join("\n") ?? ""; }

describe("search TUI renderers", () => {
  it("renders compact grep summaries and expanded details", () => {
    const grep = capture(registerGrepTool as any);
    expect(textOf(grep.renderCall({ pattern: "diffData", path: "src" }, theme))).toBe("grep /diffData/ in src");
    const result = { content: [{ type: "text", text: "src/a.ts:1:abc|diffData" }], details: { ptcValue: { tool: "grep", summary: false, totalMatches: 1, records: [{ path: `${process.cwd()}/src/a.ts`, kind: "match" }] } } };
    expect(textOf(grep.renderResult(result, {}, theme, { cwd: process.cwd() }))).toBe("↳ 1 match returned • Ctrl+O to expand");
    expect(textOf(grep.renderResult(result, { expanded: true }, theme, { expanded: true, cwd: process.cwd() }))).toContain("src/a.ts (1)");
  });

  it("renders compact ast_search summaries", () => {
    const sg = capture(registerSgTool as any);
    expect(textOf(sg.renderCall({ pattern: "console.log($A)", path: "src", lang: "typescript" }, theme))).toBe("ast_search /console.log($A)/ in src (typescript)");
    const result = { content: [{ type: "text", text: "src/a.ts\n1:abc|console.log(a)" }], details: { ptcValue: { tool: "ast_search", files: [{ path: `${process.cwd()}/src/a.ts`, lines: [{ line: 1 }] }] } } };
    expect(textOf(sg.renderResult(result, {}, theme, { cwd: process.cwd() }))).toBe("↳ 1 match in 1 file • Ctrl+O to expand");
  });


  it("uses summary grammar for pending and error states", () => {
    const grep = capture(registerGrepTool as any);
    const sg = capture(registerSgTool as any);
    const failed = { isError: true, content: [{ type: "text", text: "first line\nfull detail" }] };

    expect(textOf(grep.renderResult({ content: [] }, {}, theme, { isPartial: true }))).toBe("↳ pending search");
    expect(textOf(grep.renderResult(failed, {}, theme, {}))).toBe("↳ first line");
    expect(textOf(grep.renderResult(failed, { expanded: true }, theme, { expanded: true }))).toContain("full detail");

    expect(textOf(sg.renderResult({ content: [] }, {}, theme, { isPartial: true }))).toBe("↳ pending search");
    expect(textOf(sg.renderResult(failed, {}, theme, {}))).toBe("↳ first line");
    expect(textOf(sg.renderResult(failed, { expanded: true }, theme, { expanded: true }))).toContain("full detail");
  });
});
