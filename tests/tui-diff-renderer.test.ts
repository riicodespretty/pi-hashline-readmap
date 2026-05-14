import { describe, expect, it } from "vitest";
import { visibleWidth } from "@earendil-works/pi-tui";
import { renderTuiDiff } from "../src/tui-diff-renderer.js";
import type { DiffData } from "../src/diff-data.js";

const theme = { fg: (_: string, text: string) => text, bold: (text: string) => text };
const diffData: DiffData = { version: 1, stats: { added: 2, removed: 1, context: 1 }, entries: [
  { kind: "context", oldLine: 1, newLine: 1, text: "one" },
  { kind: "remove", oldLine: 2, text: "two" },
  { kind: "add", newLine: 2, text: "TWO" },
  { kind: "add", newLine: 3, text: "three" },
], inlineDiffs: [{ removeLineIndex: 1, addLineIndex: 2, removeSpans: [{ kind: "remove", text: "two" }], addSpans: [{ kind: "add", text: "TWO" }] }] };

describe("renderTuiDiff", () => {
  it("renders unified, compact, split, and summary modes within width", () => {
    const wide = renderTuiDiff({ diffData, width: 120, theme, expanded: true });
    expect(wide.mode).toBe("split");
    expect(wide.lines.join("\n")).toContain("old");
    expect(wide.lines.join("\n")).toContain("new");
    const normal = renderTuiDiff({ diffData, width: 80, theme, expanded: true });
    expect(normal.mode).toBe("unified");
    expect(normal.lines[0]).toBe("↳ diff +2 -1 • 1 hunk • 1 file • unified");
    expect(normal.lines.join("\n")).toContain("▌ 2 │ TWO");
    const narrow = renderTuiDiff({ diffData, width: 28, theme, expanded: true });
    expect(narrow.mode).toBe("compact");
    expect(narrow.lines[0]).toBe("↳ diff +2 -1");
    const tiny = renderTuiDiff({ diffData, width: 10, theme, expanded: true });
    expect(tiny.mode).toBe("summary");
    expect(tiny.lines).toEqual(["↳ diff +2"]);
    for (const rendered of [wide, normal, narrow, tiny]) expect(rendered.lines.every((line) => visibleWidth(line) <= rendered.width)).toBe(true);
  });

  it("renders collapsed progressive hidden-content hints", () => {
    const collapsed = renderTuiDiff({ diffData, width: 80, theme, expanded: false });
    expect(collapsed.lines[0]).toBe("↳ diff +2 -1 • 1 hunk • 1 file • unified");
    expect(collapsed.lines[1]).toBe("… (4 more diff lines • 1 more hunk • Ctrl+O to expand)");
    expect(renderTuiDiff({ diffData, width: 36, theme, expanded: false }).lines.at(-1)).toMatch(/^… \(/);
    expect(renderTuiDiff({ diffData, width: 8, theme, expanded: false }).lines.at(-1)).toBe("…");
  });
});
