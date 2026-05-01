import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "@mariozechner/pi-coding-agent";
import { resolveGrepOutputBudget, parsePositiveBase10Int } from "../src/grep-budget.js";
import { __resetHashlineSettingsPathsForTest, __setHashlineSettingsPathsForTest } from "../src/hashline-settings.js";

const LINES_DEFAULT = DEFAULT_MAX_LINES; // 2000
const BYTES_DEFAULT = Math.min(DEFAULT_MAX_BYTES, 50 * 1024); // 51200
const SETTINGS_ROOTS: string[] = [];

describe("parsePositiveBase10Int", () => {
	it("accepts plain positive base-10 integer strings", () => {
		expect(parsePositiveBase10Int("1")).toBe(1);
		expect(parsePositiveBase10Int("500")).toBe(500);
		expect(parsePositiveBase10Int("32768")).toBe(32768);
	});

	it("trims surrounding whitespace before validating", () => {
		expect(parsePositiveBase10Int(" 500 ")).toBe(500);
		expect(parsePositiveBase10Int("\t42\n")).toBe(42);
	});

	it("rejects non-positive-base-10 inputs", () => {
		const rejects: Array<string | undefined> = [
			undefined,
			"",
			" ",
			"0",
			"-5",
			"+5",
			"abc",
			"3.14",
			"0x10",
			"1e3",
			"1,000",
			"1_000",
			"5 5",
		];
		for (const value of rejects) {
			expect(parsePositiveBase10Int(value)).toBeUndefined();
		}
	});
});

describe("resolveGrepOutputBudget", () => {
	const SAVED: { lines: string | undefined; bytes: string | undefined } = {
		lines: process.env.PI_HASHLINE_GREP_MAX_LINES,
		bytes: process.env.PI_HASHLINE_GREP_MAX_BYTES,
	};

	beforeEach(() => {
		const settingsRoot = mkdtempSync(join(tmpdir(), "grep-budget-settings-"));
		SETTINGS_ROOTS.push(settingsRoot);
		__setHashlineSettingsPathsForTest({
			globalSettingsPath: join(settingsRoot, "missing-global-settings.json"),
			projectSettingsPath: join(settingsRoot, "missing-project-settings.json"),
		});
		delete process.env.PI_HASHLINE_GREP_MAX_LINES;
		delete process.env.PI_HASHLINE_GREP_MAX_BYTES;
	});

	afterEach(() => {
		__resetHashlineSettingsPathsForTest();
		for (const root of SETTINGS_ROOTS.splice(0)) rmSync(root, { recursive: true, force: true });
		if (SAVED.lines === undefined) delete process.env.PI_HASHLINE_GREP_MAX_LINES;
		else process.env.PI_HASHLINE_GREP_MAX_LINES = SAVED.lines;
		if (SAVED.bytes === undefined) delete process.env.PI_HASHLINE_GREP_MAX_BYTES;
		else process.env.PI_HASHLINE_GREP_MAX_BYTES = SAVED.bytes;
	});

	it("returns current defaults when both env vars are unset", () => {
		expect(resolveGrepOutputBudget()).toEqual({
			maxLines: LINES_DEFAULT,
			maxBytes: BYTES_DEFAULT,
		});
	});

	it("uses a valid below-default lines value as-is", () => {
		process.env.PI_HASHLINE_GREP_MAX_LINES = "10";
		expect(resolveGrepOutputBudget()).toEqual({
			maxLines: 10,
			maxBytes: BYTES_DEFAULT,
		});
	});

	it("uses a valid below-default bytes value as-is", () => {
		process.env.PI_HASHLINE_GREP_MAX_BYTES = "1024";
		expect(resolveGrepOutputBudget()).toEqual({
			maxLines: LINES_DEFAULT,
			maxBytes: 1024,
		});
	});

	it("clamps above-default lines values to the default", () => {
		process.env.PI_HASHLINE_GREP_MAX_LINES = "99999";
		expect(resolveGrepOutputBudget().maxLines).toBe(LINES_DEFAULT);
	});

	it("clamps above-default bytes values to the default", () => {
		process.env.PI_HASHLINE_GREP_MAX_BYTES = "104857600"; // 100 MiB
		expect(resolveGrepOutputBudget().maxBytes).toBe(BYTES_DEFAULT);
	});

	it.each(["abc", "-5", "0", "3.14", "", " ", "0x10", "1e3", "1,000", "+5"])(
		"falls back to defaults for invalid value %j",
		(raw) => {
			process.env.PI_HASHLINE_GREP_MAX_LINES = raw;
			process.env.PI_HASHLINE_GREP_MAX_BYTES = raw;
			expect(resolveGrepOutputBudget()).toEqual({
				maxLines: LINES_DEFAULT,
				maxBytes: BYTES_DEFAULT,
			});
		},
	);

	it("treats the two env vars independently", () => {
		process.env.PI_HASHLINE_GREP_MAX_LINES = "50";
		expect(resolveGrepOutputBudget()).toEqual({
			maxLines: 50,
			maxBytes: BYTES_DEFAULT,
		});
	});

	it("re-reads env on each call (no memoization)", () => {
		expect(resolveGrepOutputBudget().maxLines).toBe(LINES_DEFAULT);
		process.env.PI_HASHLINE_GREP_MAX_LINES = "7";
		expect(resolveGrepOutputBudget().maxLines).toBe(7);
		delete process.env.PI_HASHLINE_GREP_MAX_LINES;
		expect(resolveGrepOutputBudget().maxLines).toBe(LINES_DEFAULT);
	});

	it("equals default when value equals default exactly", () => {
		process.env.PI_HASHLINE_GREP_MAX_LINES = String(LINES_DEFAULT);
		process.env.PI_HASHLINE_GREP_MAX_BYTES = String(BYTES_DEFAULT);
		expect(resolveGrepOutputBudget()).toEqual({
			maxLines: LINES_DEFAULT,
			maxBytes: BYTES_DEFAULT,
		});
	});
	it("uses JSON grep budgets with env override precedence", () => {
		const root = mkdtempSync(join(tmpdir(), "grep-json-budget-"));
		SETTINGS_ROOTS.push(root);
		const globalSettingsPath = join(root, "home/.pi/agent/settings.json");
		const projectSettingsPath = join(root, "repo/.pi/settings.json");
		mkdirSync(join(root, "home/.pi/agent"), { recursive: true });
		mkdirSync(join(root, "repo/.pi"), { recursive: true });
		writeFileSync(globalSettingsPath, JSON.stringify({ hashlineReadmap: { grep: { maxLines: 100, maxBytes: 4096 } } }), "utf8");
		writeFileSync(projectSettingsPath, JSON.stringify({ hashlineReadmap: { grep: { maxBytes: 2048 } } }), "utf8");
		__setHashlineSettingsPathsForTest({ globalSettingsPath, projectSettingsPath });

		expect(resolveGrepOutputBudget()).toEqual({ maxLines: 100, maxBytes: 2048 });
		process.env.PI_HASHLINE_GREP_MAX_LINES = "7";
		expect(resolveGrepOutputBudget()).toEqual({ maxLines: 7, maxBytes: 2048 });
		process.env.PI_HASHLINE_GREP_MAX_LINES = "99999";
		expect(resolveGrepOutputBudget().maxLines).toBe(LINES_DEFAULT);
	});
});
