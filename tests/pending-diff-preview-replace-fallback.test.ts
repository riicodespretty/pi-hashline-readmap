import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { buildPendingEditPreviewData } from "../src/pending-diff-preview.js";

function makeFixture(content: string): { cwd: string; filePath: string } {
	const cwd = mkdtempSync(resolve(tmpdir(), "pi-pending-replace-fallback-"));
	const filePath = resolve(cwd, "sample.ts");
	writeFileSync(filePath, content, "utf-8");
	return { cwd, filePath };
}

describe("pending edit replace fallback", () => {
	it("skips ambiguous replace text", async () => {
		const { cwd, filePath } = makeFixture("const value = 1;\nconst other = 2;\n");

		const ambiguous = await buildPendingEditPreviewData({
			path: filePath,
			edits: [{ replace: { old_text: "const", new_text: "let" } }],
		}, cwd);

		expect(ambiguous.type).toBe("skip");
		if (ambiguous.type !== "skip") throw new Error("ambiguous replace unexpectedly projected");
		expect(ambiguous.reason).toContain("not unique");
	});
});
