import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { ensureHashInit, computeLineHash } from "../src/hashline.js";
import { registerEditTool } from "../src/edit.js";

function getTextContent(result: any): string {
  return result.content?.find((item: any) => item.type === "text")?.text ?? "";
}

describe("edit read-before-edit guard", () => {
  it("returns a soft error when the file was not read in this session", async () => {
    await ensureHashInit();

    const dir = mkdtempSync(resolve(tmpdir(), "pi-edit-unread-"));
    const filePath = resolve(dir, "sample.ts");
    writeFileSync(filePath, "const value = 1;\n", "utf-8");

    const firstLine = readFileSync(filePath, "utf-8").trimEnd();
    const anchor = `1:${computeLineHash(1, firstLine)}`;

    let capturedTool: any;
    registerEditTool(
      {
        registerTool(def: any) {
          capturedTool = def;
        },
      } as any,
      {
        wasReadInSession: () => false,
      },
    );

    const result = await capturedTool.execute(
      "test-call",
      {
        path: filePath,
        edits: [{ set_line: { anchor, new_text: "const value = 2;" } }],
      },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    const text = getTextContent(result);
    expect(result.isError).toBe(true);
    expect(text).toContain(`You must read ${filePath} before editing it.`);
    expect(text).toContain(`Call read(${JSON.stringify(filePath)}) first.`);
    expect(text).toContain(
      "edit requires fresh LINE:HASH anchors from a recent read so the hashes match the current file contents.",
    );
    expect(readFileSync(filePath, "utf-8")).toBe("const value = 1;\n");
  });
});
