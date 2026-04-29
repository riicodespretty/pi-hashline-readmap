import { describe, expect, it } from "vitest";
import {
  buildContextHygieneMetadata,
  buildFileResource,
  buildReadRehydrateDescriptor,
  createContextHygieneTracker,
  renderStaleContextPlaceholder,
} from "../src/context-hygiene.js";

describe("context hygiene mutated-file read invalidation", () => {
  it("reports an older same-file read context stale after an edit mutation", () => {
    const tracker = createContextHygieneTracker();
    const fileResource = buildFileResource("src/read.ts");
    const readRehydrate = buildReadRehydrateDescriptor({ path: "src/read.ts", symbol: "buildReadOutput" });

    tracker.record(buildContextHygieneMetadata({ tool: "read", classification: "read-context", resources: [fileResource], rehydrate: readRehydrate }), { resultId: "read-before" });
    tracker.record(buildContextHygieneMetadata({ tool: "edit", classification: "mutation", resources: [fileResource] }), { resultId: "edit-file" });

    const report = tracker.generateReport();
    expect(report.staleCandidates).toHaveLength(1);
    expect(report.staleCandidates[0]).toMatchObject({ resourceKey: "file:src/read.ts", staleEventIds: [1], mutationEventId: 2, reason: "mutation-after-read" });
    expect(report.staleCandidates[0].staleResults).toEqual([
      {
        status: "stale",
        originalTool: "read",
        originalClassification: "read-context",
        originalEventId: 1,
        originalResultId: "read-before",
        staleResourceKeys: ["file:src/read.ts"],
        invalidatingMutationEventId: 2,
        invalidatingMutationResultId: "edit-file",
        reason: "mutation-after-read",
        rehydrate: readRehydrate,
      },
    ]);
    expect(renderStaleContextPlaceholder(report.staleCandidates[0].staleResults[0])).toBe("[Stale read context: file content changed after this result. Re-run read to refresh.]");
  });

  it("reports an older same-file read context stale after a write mutation", () => {
    const tracker = createContextHygieneTracker();
    const fileResource = buildFileResource("src/write.ts");

    tracker.record(buildContextHygieneMetadata({ tool: "read", classification: "read-context", resources: [fileResource] }), { resultId: "read-before-write" });
    tracker.record(buildContextHygieneMetadata({ tool: "write", classification: "mutation", resources: [fileResource] }), { resultId: "write-file" });

    const report = tracker.generateReport();
    expect(report.staleCandidates).toHaveLength(1);
    expect(report.staleCandidates[0]).toMatchObject({ resourceKey: "file:src/write.ts", staleEventIds: [1], mutationEventId: 2 });
    expect(report.staleCandidates[0].staleResults[0]).toMatchObject({ originalTool: "read", originalClassification: "read-context", originalResultId: "read-before-write", invalidatingMutationResultId: "write-file" });
  });

  it("does not stale read contexts for unrelated files", () => {
    const tracker = createContextHygieneTracker();
    const fileResource = buildFileResource("src/read.ts");
    const otherResource = buildFileResource("src/other.ts");

    tracker.record(buildContextHygieneMetadata({ tool: "read", classification: "read-context", resources: [otherResource] }), { resultId: "read-other" });
    tracker.record(buildContextHygieneMetadata({ tool: "edit", classification: "mutation", resources: [fileResource] }), { resultId: "edit-file" });

    const staleResultIds = tracker.generateReport().staleCandidates.flatMap((candidate) => candidate.staleResults.map((record) => record.originalResultId));
    expect(staleResultIds).not.toContain("read-other");
    expect(tracker.generateReport().staleCandidates).toHaveLength(0);
  });

  it("does not stale reads recorded after an earlier same-file mutation", () => {
    const tracker = createContextHygieneTracker();
    const fileResource = buildFileResource("src/read.ts");

    tracker.record(buildContextHygieneMetadata({ tool: "edit", classification: "mutation", resources: [fileResource] }), { resultId: "edit-before" });
    tracker.record(buildContextHygieneMetadata({ tool: "read", classification: "read-context", resources: [fileResource] }), { resultId: "read-after" });

    expect(tracker.generateReport().staleCandidates).toEqual([]);
  });
});
