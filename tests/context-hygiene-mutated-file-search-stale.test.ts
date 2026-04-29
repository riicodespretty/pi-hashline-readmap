import { describe, expect, it } from "vitest";
import {
  buildAstSearchRehydrateDescriptor,
  buildContextHygieneMetadata,
  buildFileResource,
  buildSymbolResource,
  buildGrepRehydrateDescriptor,
  createContextHygieneTracker,
} from "../src/context-hygiene.js";

describe("context hygiene mutated-file search invalidation", () => {
  it("reports older same-file grep and ast_search contexts stale after an edit mutation", () => {
    const tracker = createContextHygieneTracker();
    const fileResource = buildFileResource("src/grep.ts");
    const grepRehydrate = buildGrepRehydrateDescriptor({ pattern: "needle", path: "src" });
    const astRehydrate = buildAstSearchRehydrateDescriptor({ pattern: "console.log($A)", lang: "typescript", path: "src" });

    tracker.record(buildContextHygieneMetadata({ tool: "grep", classification: "search-context", resources: [fileResource], rehydrate: grepRehydrate }), { resultId: "grep-file" });
    tracker.record(buildContextHygieneMetadata({ tool: "ast_search", classification: "search-context", resources: [fileResource], rehydrate: astRehydrate }), { resultId: "ast-file" });
    tracker.record(buildContextHygieneMetadata({ tool: "edit", classification: "mutation", resources: [fileResource] }), { resultId: "edit-file" });

    const report = tracker.generateReport();
    expect(report.staleCandidates).toHaveLength(1);
    expect(report.staleCandidates[0]).toMatchObject({ resourceKey: "file:src/grep.ts", staleEventIds: [1, 2], mutationEventId: 3, reason: "mutation-after-read" });
    expect(report.mutationAfterRead).toEqual([]);
    expect(report.staleCandidates[0].staleResults).toEqual([
      { status: "stale", originalTool: "grep", originalClassification: "search-context", originalEventId: 1, originalResultId: "grep-file", staleResourceKeys: ["file:src/grep.ts"], invalidatingMutationEventId: 3, invalidatingMutationResultId: "edit-file", reason: "mutation-after-read", rehydrate: grepRehydrate },
      { status: "stale", originalTool: "ast_search", originalClassification: "search-context", originalEventId: 2, originalResultId: "ast-file", staleResourceKeys: ["file:src/grep.ts"], invalidatingMutationEventId: 3, invalidatingMutationResultId: "edit-file", reason: "mutation-after-read", rehydrate: astRehydrate },
    ]);
  });

  it("reports prior same-file grep and ast_search contexts stale after a write mutation", () => {
    const tracker = createContextHygieneTracker();
    const fileResource = buildFileResource("src/sg.ts");

    tracker.record(buildContextHygieneMetadata({ tool: "grep", classification: "search-context", resources: [fileResource] }), { resultId: "grep-before-write" });
    tracker.record(buildContextHygieneMetadata({ tool: "ast_search", classification: "search-context", resources: [fileResource] }), { resultId: "ast-before-write" });
    tracker.record(buildContextHygieneMetadata({ tool: "write", classification: "mutation", resources: [fileResource] }), { resultId: "write-file" });

    const report = tracker.generateReport();
    expect(report.staleCandidates).toHaveLength(1);
    expect(report.staleCandidates[0]).toMatchObject({ resourceKey: "file:src/sg.ts", staleEventIds: [1, 2], mutationEventId: 3 });
    expect(report.staleCandidates[0].staleResults.map((record) => record.originalTool)).toEqual(["grep", "ast_search"]);
  });

  it("does not stale search contexts for unrelated files", () => {
    const tracker = createContextHygieneTracker();
    const fileResource = buildFileResource("src/grep.ts");
    const otherResource = buildFileResource("src/other.ts");

    tracker.record(buildContextHygieneMetadata({ tool: "grep", classification: "search-context", resources: [otherResource] }), { resultId: "grep-other" });
    tracker.record(buildContextHygieneMetadata({ tool: "edit", classification: "mutation", resources: [fileResource] }), { resultId: "edit-file" });

    expect(tracker.generateReport().staleCandidates).toEqual([]);
  });

  it("uses file resources for search invalidation even when symbol resources are present", () => {
    const tracker = createContextHygieneTracker();
    const fileResource = buildFileResource("src/grep.ts");
    const symbolResource = buildSymbolResource("src/grep.ts", "runSearch", "function");

    tracker.record(
      buildContextHygieneMetadata({
        tool: "ast_search",
        classification: "search-context",
        resources: [symbolResource, fileResource],
      }),
      { resultId: "ast-with-symbol" },
    );
    tracker.record(buildContextHygieneMetadata({ tool: "edit", classification: "mutation", resources: [fileResource] }), { resultId: "edit-file" });

    const report = tracker.generateReport();
    expect(report.staleCandidates).toHaveLength(1);
    expect(report.staleCandidates[0].staleResults[0]).toMatchObject({ originalTool: "ast_search", originalClassification: "search-context", originalResultId: "ast-with-symbol", staleResourceKeys: ["file:src/grep.ts"] });
  });

  it("uses deterministic hybrid multi-file staling for search artifacts", () => {
    const tracker = createContextHygieneTracker();
    const fileResource = buildFileResource("src/grep.ts");
    const otherResource = buildFileResource("src/other.ts");

    tracker.record(buildContextHygieneMetadata({ tool: "grep", classification: "search-context", resources: [fileResource, otherResource] }), { resultId: "grep-multifile" });
    tracker.record(buildContextHygieneMetadata({ tool: "edit", classification: "mutation", resources: [fileResource] }), { resultId: "edit-file" });

    const report = tracker.generateReport();
    expect(report.staleCandidates).toHaveLength(1);
    expect(report.staleCandidates[0]).toMatchObject({ resourceKey: "file:src/grep.ts", staleEventIds: [1], mutationEventId: 2 });
    expect(report.staleCandidates[0].staleResults[0].staleResourceKeys).toEqual(["file:src/grep.ts"]);
    expect(report.staleCandidates[0].staleResults[0]).toMatchObject({
      status: "stale",
      originalTool: "grep",
      originalClassification: "search-context",
      originalEventId: 1,
      originalResultId: "grep-multifile",
      invalidatingMutationEventId: 2,
      invalidatingMutationResultId: "edit-file",
      reason: "mutation-after-read",
    });
  });
});
