import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const MAPPER_DIR = "src/readmap/mappers";
const ALLOWED_HELPER = "_subprocess-utils.ts";

async function mapperFiles(): Promise<string[]> {
  const entries = await readdir(MAPPER_DIR);
  return entries
    .filter((entry) => entry.endsWith(".ts"))
    .filter((entry) => entry !== ALLOWED_HELPER)
    .map((entry) => join(MAPPER_DIR, entry));
}

function shellSubprocessFindings(source: string): string[] {
  const findings: string[] = [];

  if (source.includes('import { exec } from "node:child_process"')) {
    findings.push("direct exec import");
  }
  if (source.includes('from "node:child_process"')) {
    findings.push("direct child_process import");
  }
  if (source.includes("promisify(exec)")) {
    findings.push("promisify(exec)");
  }
  if (source.includes("execAsync(")) {
    findings.push("execAsync call");
  }
  if (/spawn\([^\n]*shell:\s*true/s.test(source)) {
    findings.push("spawn shell:true");
  }
  if (/`[^`]*\$\{filePath\}[^`]*`/.test(source)) {
    findings.push("filePath template interpolation");
  }

  return findings;
}

describe("readmap mapper subprocess static guard", () => {
  it("keeps mapper files from using shell subprocess APIs", async () => {
    for (const file of await mapperFiles()) {
      const source = await readFile(file, "utf8");
      expect(shellSubprocessFindings(source), file).toEqual([]);
    }
  });

  it("flags seeded vulnerable subprocess patterns", () => {
    const vulnerable = String.raw`
      import { exec } from "node:child_process";
      const execAsync = promisify(exec);
      await execAsync(` + "`wc -l < \"${filePath}\"`" + `);
      spawn("grep", [filePath], { shell: true });
    `;

    expect(shellSubprocessFindings(vulnerable)).toEqual([
      "direct exec import",
      "direct child_process import",
      "promisify(exec)",
      "execAsync call",
      "spawn shell:true",
      "filePath template interpolation",
    ]);
  });

  it("allows argv-only helper usage", () => {
    const safe = `
      import { execFileSafe } from "./_subprocess-utils.js";
      await execFileSafe("python3", [SCRIPT_PATH, filePath], { timeout: 10_000 });
    `;

    expect(shellSubprocessFindings(safe)).toEqual([]);
});
});
