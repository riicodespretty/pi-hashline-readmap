import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { registerWriteTool } from "../src/write.js";

function getWriteTool(): any {
	let tool: any;
	registerWriteTool({ registerTool(def: any) { tool = def; } } as any);
	if (!tool) throw new Error("write tool was not registered");
	return tool;
}

function textOf(component: any): string {
	return component?.text ?? component?.render?.(120)?.join("\n") ?? "";
}

const theme = {
	fg: (_style: string, text: string) => text,
	bold: (text: string) => text,
};

describe("write renderCall pending diff preview", () => {
	it("renders a pending overwrite preview", () => {
		const cwd = mkdtempSync(resolve(tmpdir(), "pi-write-pending-success-"));
		writeFileSync(resolve(cwd, "sample.txt"), "old value\n", "utf-8");
		const tool = getWriteTool();
		const context: any = { argsComplete: false, executionStarted: false, cwd, state: {}, invalidate: vi.fn(), lastComponent: undefined };

		const rendered = tool.renderCall({ path: "sample.txt", content: "new value\n" }, theme, context);
		const text = textOf(rendered);

		expect(text).toContain("pending overwrite");
		expect(text).toContain("-1 old value");
		expect(text).toContain("+1 new value");
	});
});
