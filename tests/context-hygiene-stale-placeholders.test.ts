import { describe, expect, it } from "vitest";
import { buildStaleContextRecord, renderStaleContextPlaceholder } from "../src/context-hygiene.js";

describe("context hygiene stale placeholders", () => {
  it("renders deterministic stale placeholders for read grep and ast_search records", () => {
    const records = [
      buildStaleContextRecord({
        originalTool: "read",
        originalResultId: "read-result-1",
        staleResourceKeys: ["file:src/read.ts"],
        invalidatingMutationEventId: 7,
        invalidatingMutationResultId: "edit-result-1",
      }),
      buildStaleContextRecord({
        originalTool: "grep",
        originalResultId: "grep-result-1",
        staleResourceKeys: ["file:src/grep.ts"],
        invalidatingMutationEventId: 8,
        invalidatingMutationResultId: "write-result-1",
      }),
      buildStaleContextRecord({
        originalTool: "ast_search",
        originalResultId: "sg-result-1",
        staleResourceKeys: ["file:src/sg.ts"],
        invalidatingMutationEventId: 9,
      }),
    ];

    const firstRender = records.map(renderStaleContextPlaceholder);
    const secondRender = records.map(renderStaleContextPlaceholder);

    expect(firstRender).toEqual([
      "[Stale read context: file content changed after this result. Re-run read to refresh.]",
      "[Stale grep context: matched file content changed after this result. Re-run grep to refresh.]",
      "[Stale ast_search context: matched file content changed after this result. Re-run ast_search to refresh.]",
    ]);
    expect(secondRender).toEqual(firstRender);

    for (const placeholder of firstRender) {
      expect(placeholder.toLowerCase()).toContain("stale");
      expect(placeholder.toLowerCase()).not.toContain("retired");
      expect(placeholder).not.toContain("read-result-1");
      expect(placeholder).not.toContain("grep-result-1");
      expect(placeholder).not.toContain("sg-result-1");
      expect(placeholder).not.toMatch(/\b\d{4}-\d{2}-\d{2}\b/);
      expect(placeholder).not.toMatch(/\bmutation event\b/i);
    }
  });
});
