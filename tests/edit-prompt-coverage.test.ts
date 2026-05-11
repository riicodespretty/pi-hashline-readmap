import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("prompts/edit.md coverage", () => {
  it("documents recovery, variants, replace safety, anchor sources, and validation warnings", () => {
    const content = readFileSync(resolve("prompts/edit.md"), "utf8");

    expect(content).toContain("hash mismatch");
    expect(content).toContain(">>>");
    expect(content).toContain("set_line");
    expect(content).toContain("replace_lines");
    expect(content).toContain("insert_after");
    expect(content).toContain("replace_symbol");
    expect(content).toContain("replace");
    expect(content.toLowerCase()).toContain("escape hatch");
    expect(content).toContain("exact-only");
    expect(content).toContain("fuzzy: true");
    expect(content).toContain("read");
    expect(content).toContain("grep");
    expect(content).toContain("ast_search");
    expect(content).toContain("write");
    expect(content).toContain("current session");
    expect(content).toContain("whitespace-only");
    expect(content).toContain("`replace`-only");
    expect(content).toContain("anchored edits");
    expect(content).toContain("file-not-read");
    expect(content).toContain("syntax-regression");
    expect(content.split("\n").length).toBeGreaterThanOrEqual(70);
  });
});
