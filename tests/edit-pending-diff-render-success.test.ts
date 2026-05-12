import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { registerEditTool } from "../src/edit.js";

function getEditTool(): any {
	let tool: any;
	registerEditTool({ registerTool(def: any) { tool = def; } } as any);
	if (!tool) throw new Error("edit tool was not registered");
	return tool;
}

function textOf(component: any): string {
	return component?.text ?? component?.render?.(120)?.join("\n") ?? "";
}

const theme = {
	fg: (_style: string, text: string) => text,
	bold: (text: string) => text,
};

describe("edit renderCall pending diff preview", () => {
	it("renders a pending edit preview", async () => {
		const cwd = mkdtempSync(resolve(tmpdir(), "pi-edit-pending-success-"));
		const filePath = resolve(cwd, "sample.ts");
		writeFileSync(filePath, "const unique = 1;\n", "utf-8");
		const tool = getEditTool();
		const context: any = { argsComplete: false, executionStarted: false, cwd, state: {}, invalidate: vi.fn(), lastComponent: undefined };
		const args = { path: filePath, edits: [{ replace: { old_text: "const unique = 1;", new_text: "const unique = 2;" } }] };

		const first = tool.renderCall(args, theme, context);
		await Promise.resolve();
		const second = tool.renderCall(args, theme, { ...context, lastComponent: first });
		const rendered = textOf(second);

		expect(rendered).toContain("pending edit");
		expect(rendered).toContain("-1 const unique = 1;");
		expect(rendered).toContain("+1 const unique = 2;");
	});
});
