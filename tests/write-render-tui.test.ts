import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { registerWriteTool } from "../src/write.js";

const theme = { fg: (_: string, text: string) => text, bold: (text: string) => text };
function textOf(component: any): string { return component?.text ?? component?.render?.(120)?.join("\n") ?? ""; }
function tool(): any { let registered: any; registerWriteTool({ registerTool(def: any) { registered = def; } } as any, {} as any); return registered; }

describe("write TUI renderer", () => {
  it("shows created and overwritten state before final diff without mutating details", () => {
    const t = tool();
    expect(textOf(t.renderCall({ path: "tmp/file.txt", content: "one\ntwo\nthree" }, theme, {}))).toBe("write tmp/file.txt (3 lines • 13 B)");
    const baseDiffData = { version: 1, stats: { added: 3, removed: 0, context: 0 }, entries: [{ kind: "add", newLine: 1, text: "one" }, { kind: "add", newLine: 2, text: "two" }, { kind: "add", newLine: 3, text: "three" }] };
    const created: any = { content: [{ type: "text", text: "1:abc|one\n2:def|two\n3:aaa|three" }], details: { writeState: "created", diffData: baseDiffData, ptcValue: { tool: "write", diffData: { sentinel: true } } } };
    const before = JSON.stringify(created.details);
    const rendered = textOf(t.renderResult(created, { expanded: true, width: 80 }, theme, { expanded: true, width: 80 }));
    expect(rendered.split("\n")[0]).toBe("↳ created");
    expect(rendered).toContain("↳ diff +3 -0 • 1 hunk • 1 file • unified");
    expect(rendered).toContain("▌+ 1 │ one");
    expect(JSON.stringify(created.details)).toBe(before);

    const overwritten: any = { content: created.content, details: { ...created.details, writeState: "overwritten" } };
    expect(textOf(t.renderResult(overwritten, {}, theme, {}))).toBe("↳ overwritten • Ctrl+O to expand");
  });


  it("keeps write error summaries visible and expands details", () => {
    const t = tool();
    const failed: any = { isError: true, content: [{ type: "text", text: "Permission denied\nfull detail" }], details: { ptcValue: { ok: false } } };
    expect(textOf(t.renderResult(failed, {}, theme, {}))).toBe("↳ Permission denied");
    expect(textOf(t.renderResult(failed, { expanded: true }, theme, { expanded: true }))).toContain("full detail");
  });

  it("uses the same visual grammar for pending write previews", () => {
    const cwd = mkdtempSync(resolve(tmpdir(), "pi-write-render-"));
    writeFileSync(resolve(cwd, "old.txt"), "old\n", "utf-8");
    const t = tool();
    const createContext: any = { cwd, state: {}, invalidate: vi.fn(), expanded: true };
    const first = t.renderCall({ path: "new.txt", content: "one\ntwo" }, theme, createContext);
    const second = t.renderCall({ path: "new.txt", content: "one\ntwo" }, theme, { ...createContext, lastComponent: first });
    expect(textOf(second)).toContain("↳ pending create");
    expect(textOf(second)).toContain("↳ diff +2 -0");

    const overwriteContext: any = { cwd, state: {}, invalidate: vi.fn(), expanded: true };
    const third = t.renderCall({ path: "old.txt", content: "old\nnew" }, theme, overwriteContext);
    const fourth = t.renderCall({ path: "old.txt", content: "old\nnew" }, theme, { ...overwriteContext, lastComponent: third });
    expect(textOf(fourth)).toContain("↳ pending overwrite");
  });
});
