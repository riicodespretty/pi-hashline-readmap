import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { NU_GUIDELINES, NU_PTC } from "../src/nu.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("NU_GUIDELINES", () => {
  const allText = NU_GUIDELINES.join("\n");

  it("contains routing guidance for both nu and bash", () => {
    expect(allText).toContain("bash");
    expect(allText).toContain("nu");
  });

  it("includes file exploration patterns", () => {
    expect(allText).toContain("ls");
    expect(allText).toContain("where");
    expect(allText).toContain("sort-by");
  });

  it("includes structured data access patterns", () => {
    expect(allText).toContain("open");
    expect(allText).toContain("get");
  });

  it("includes system inspection patterns", () => {
    expect(allText).toContain("ps");
    expect(allText).toContain("sys mem");
  });

  it("includes key syntax reference", () => {
    expect(allText).toContain("length");
    expect(allText).toContain("math sum");
    expect(allText).toContain("group-by");
    expect(allText).toContain("first");
  });

  it("includes routing table with task-to-tool mappings", () => {
    expect(allText).toContain("Run tests");
    expect(allText).toContain("package.json");
  });
});

describe("NU_PTC", () => {
  it("is callable and read-only", () => {
    expect(NU_PTC.callable).toBe(true);
    expect(NU_PTC.readOnly).toBe(true);
  });

  it("has pythonName 'nu'", () => {
    expect(NU_PTC.pythonName).toBe("nu");
  });

  it("has read-only policy", () => {
    expect(NU_PTC.policy).toBe("read-only");
  });

  it("is opt-in by default", () => {
    expect(NU_PTC.defaultExposure).toBe("opt-in");
  });
});

describe("registerNuTool", () => {
  it("is exported as a function", async () => {
    const { registerNuTool } = await import("../src/nu.js");
    expect(typeof registerNuTool).toBe("function");
  });
});

describe("tool registration includes PTC metadata", () => {
  it("tool definition includes ptc: NU_PTC", () => {
    const src = readFileSync(resolve(__dirname, "../src/nu.ts"), "utf-8");
    expect(src).toMatch(/ptc:\s*NU_PTC/);
    expect(src).toContain("pi.registerTool(tool)");
  });
});
