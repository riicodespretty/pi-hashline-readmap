import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { buildPendingWritePreviewData } from "../src/pending-diff-preview.js";

describe("pending preview outside path guard", () => {
	it("skips an absolute path outside cwd", () => {
		const cwd = mkdtempSync(resolve(tmpdir(), "pi-pending-guard-cwd-"));
		const outsideDir = mkdtempSync(resolve(tmpdir(), "pi-pending-guard-outside-"));
		const outsideFile = resolve(outsideDir, "outside.txt");
		writeFileSync(outsideFile, "outside\n", "utf-8");

		const outside = buildPendingWritePreviewData({ path: outsideFile, content: "changed\n" }, cwd);

		expect(outside.type).toBe("skip");
		if (outside.type !== "skip") throw new Error("outside path unexpectedly projected");
		expect(outside.reason).toContain("workspace");
	});
});
