import type { ExtensionAPI, ToolRenderResultOptions } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text } from "@earendil-works/pi-tui";
import path from "node:path";
import { defineToolPromptMetadata } from "./tool-prompt-metadata.js";
import { readFile } from "node:fs/promises";
import { normalizeToLF, stripBom } from "./edit-diff";
import { ensureHashInit, escapeControlCharsForDisplay } from "./hashline";
import { buildPtcError, buildPtcLine } from "./ptc-value.js";
import { throwIfAborted } from "./runtime";
import { buildGrepOutput } from "./grep-output.js";
import { buildGrepRehydrateDescriptor } from "./context-hygiene.js";
import { getOrGenerateMap } from "./map-cache.js";
import { scopeGrepGroupsToSymbols } from "./grep-symbol-scope.js";
import { formatGrepCallText, formatGrepResultText } from "./grep-render-helpers.js";
import { coerceObviousBase10Int } from "./coerce-obvious-int.js";
import { clampLineToWidth, clampLinesToWidth, isRendererExpanded, renderToolLabel, summaryLine } from "./tui-render-utils.js";

/* ------------------------------------------------------------------ */
/*  Prompt metadata (same as stock grep.ts)                           */
/* ------------------------------------------------------------------ */
const GREP_PROMPT_METADATA = defineToolPromptMetadata({
	promptUrl: new URL("../prompts/grep.md", import.meta.url),
	promptSnippet: "Search file contents and return edit-ready hashline anchors",
	promptGuidelines: [
		"Use grep for text search across files instead of bash grep or rg.",
		"Use grep summary mode when you only need matching files or counts.",
		"Use ast_search instead of grep when the query depends on code structure.",
	],
});

/* ------------------------------------------------------------------ */
/*  Schema                                                            */
/* ------------------------------------------------------------------ */
const grepSchema = Type.Object({
	pattern: Type.String({ description: "Pattern to search" }),
	path: Type.Optional(Type.String({ description: "Search path" })),
	glob: Type.Optional(Type.String({ description: "Glob filter" })),
	ignoreCase: Type.Optional(Type.Boolean({ description: "Ignore case" })),
	literal: Type.Optional(Type.Boolean({ description: "Treat pattern literally" })),
	context: Type.Optional(
		Type.Union([
			Type.Number({ description: "Context lines" }),
			Type.String({ description: "Context lines" }),
		]),
	),
	limit: Type.Optional(
		Type.Union([
			Type.Number({ description: "Max matches" }),
			Type.String({ description: "Max matches" }),
		]),
	),
	summary: Type.Optional(Type.Boolean({ description: "Return per-file counts" })),
	scope: Type.Optional(
		Type.Literal("symbol", {
			description: "Scope matches to symbols",
		}),
	),
	scopeContext: Type.Optional(
		Type.Union([
			Type.Number({ description: "Symbol context lines" }),
			Type.String({ description: "Symbol context lines" }),
		]),
	),
});

interface GrepParams {
	pattern: string;
	path?: string;
	glob?: string;
	ignoreCase?: boolean;
	literal?: boolean;
	context?: number | string;
	limit?: number | string;
	summary?: boolean;
	scope?: "symbol";
	scopeContext?: number | string;
}

interface GrepOutputLine {
	kind: "match" | "context" | "separator";
	displayPath: string;
	lineNumber: number;
	text: string;
}

interface GrepOutputFile {
	path: string;
	matchCount: number;
	lines: GrepOutputLine[];
}

interface GrepOutputIR {
	totalMatches: number;
	files: GrepOutputFile[];
}

interface FffGrepToolOptions {
	getFinder: (cwd: string) => Promise<any>;
	onFileAnchored?: (absolutePath: string) => void;
	astSearchGuideline?: string;
}

/* ------------------------------------------------------------------ */
/*  Query building (mirrors fff's query.ts)                           */
/* ------------------------------------------------------------------ */
function normalizePathConstraint(pc: string, cwd: string): string | null {
	let trimmed = pc.trim();
	if (!trimmed) return trimmed;
	if (path.isAbsolute(trimmed)) {
		const rel = path.relative(cwd, trimmed).replaceAll(path.sep, "/");
		if (rel === "") return null;
		if (rel.startsWith("../") || rel === ".." || path.isAbsolute(rel)) {
			throw new Error(`Path constraint must be relative to the workspace: ${pc}`);
		}
		trimmed = rel;
	}
	if (trimmed === "." || trimmed === "./") return null;
	if (trimmed.startsWith("./")) trimmed = trimmed.slice(2);
	const recursiveDir = trimmed.match(/^(.*)\/\*\*(?:\/\*)?$/);
	if (recursiveDir) {
		const dir = recursiveDir[1];
		if (dir && !/[*?[{]/.test(dir)) return `${dir}/`;
	}
	if (trimmed.startsWith("/") || trimmed.endsWith("/")) return trimmed;
	if (/[*?[{]/.test(trimmed)) return trimmed;
	const lastSegment = trimmed.split("/").pop() ?? "";
	if (/\.[a-zA-Z][a-zA-Z0-9]{0,9}$/.test(lastSegment)) return trimmed;
	return `${trimmed}/`;
}

function buildFffQuery(params: { path?: string; glob?: string; pattern: string }, cwd: string): string {
	const parts: string[] = [];
	if (params.path) {
		// Absolute paths are passed through — FFF's parser handles them.
		// For relative paths, normalize to match FFF's constraint syntax.
		if (path.isAbsolute(params.path)) {
			parts.push(params.path);
		} else {
			const constraint = normalizePathConstraint(params.path, cwd);
			if (constraint) parts.push(constraint);
		}
	}
	if (params.glob) {
		parts.push(params.glob);
	}
	parts.push(params.pattern);
	return parts.join(" ");
}

/* ------------------------------------------------------------------ */
/*  PTC records from FFF GrepMatch → hashline IR                      */
/* ------------------------------------------------------------------ */
function buildGrepIRFromFffMatches(
	items: any[],
	toAbsolutePath: (rel: string) => string,
	cwd: string,
): { ir: GrepOutputIR; recordsMap: Map<string, any>; absoluteMatches: Array<{ path: string; line: number; raw: string; hash: string; anchor: string; display: string; kind: string }> } {
	const filesMap = new Map<string, GrepOutputFile>();
	const recordsMap = new Map<string, any>();
	const absoluteMatches: Array<any> = [];
	let totalMatches = 0;

	for (const match of items) {
		const relPath = match.relativePath;
		const absPath = toAbsolutePath(relPath);
		const lineNum = match.lineNumber;
		const content = match.lineContent ?? "";

		// Build hashline anchor for the match line
		const ptc = buildPtcLine(lineNum, content);
		const renderedDisplay = escapeControlCharsForDisplay(content);
		const renderedLine = `${relPath}:>>${ptc.anchor}|${renderedDisplay}`;

		// Build file group
		if (!filesMap.has(relPath)) {
			filesMap.set(relPath, { path: absPath, matchCount: 0, lines: [] });
		}
		const file = filesMap.get(relPath)!;
		file.matchCount++;
		file.lines.push({
			kind: "match",
			displayPath: relPath,
			lineNumber: lineNum,
			text: renderedLine,
		});

		recordsMap.set(renderedLine, {
			path: absPath,
			line: ptc.line,
			hash: ptc.hash,
			anchor: ptc.anchor,
			kind: "match",
			raw: ptc.raw,
			display: ptc.display,
		});

		absoluteMatches.push({ path: absPath, line: ptc.line, hash: ptc.hash, anchor: ptc.anchor, raw: ptc.raw, display: ptc.display, kind: "match" });
		totalMatches++;

		// Add context lines
		if (match.contextBefore) {
			for (let i = 0; i < match.contextBefore.length; i++) {
				const ctxLineNum = lineNum - match.contextBefore.length + i;
				const ctxContent = match.contextBefore[i] ?? "";
				const ctxPtc = buildPtcLine(ctxLineNum, ctxContent);
				const ctxRenderedLine = `${relPath}:  ${ctxPtc.anchor}|${escapeControlCharsForDisplay(ctxContent)}`;
				file.lines.push({
					kind: "context",
					displayPath: relPath,
					lineNumber: ctxLineNum,
					text: ctxRenderedLine,
				});
				recordsMap.set(ctxRenderedLine, {
					path: absPath,
					line: ctxPtc.line,
					hash: ctxPtc.hash,
					anchor: ctxPtc.anchor,
					kind: "context",
					raw: ctxPtc.raw,
					display: ctxPtc.display,
				});
			}
		}
		if (match.contextAfter) {
			for (let i = 0; i < match.contextAfter.length; i++) {
				const ctxLineNum = lineNum + i + 1;
				const ctxContent = match.contextAfter[i] ?? "";
				const ctxPtc = buildPtcLine(ctxLineNum, ctxContent);
				const ctxRenderedLine = `${relPath}:  ${ctxPtc.anchor}|${escapeControlCharsForDisplay(ctxContent)}`;
				file.lines.push({
					kind: "context",
					displayPath: relPath,
					lineNumber: ctxLineNum,
					text: ctxRenderedLine,
				});
				recordsMap.set(ctxRenderedLine, {
					path: absPath,
					line: ctxPtc.line,
					hash: ctxPtc.hash,
					anchor: ctxPtc.anchor,
					kind: "context",
					raw: ctxPtc.raw,
					display: ctxPtc.display,
				});
			}
		}
	}

	return {
		ir: { totalMatches, files: [...filesMap.values()] },
		recordsMap,
		absoluteMatches,
	};
}

/* ------------------------------------------------------------------ */
/*  Deduplicate adjacent context lines                                */
/* ------------------------------------------------------------------ */
const LINE_NUM_RE = /(?:>>|  )(\d+):/;

function deduplicateContext(lines: GrepOutputLine[]): GrepOutputLine[] {
	if (lines.length === 0) return lines;
	const byLineNum = new Map<number, GrepOutputLine>();
	for (const line of lines) {
		const match = line.text.match(LINE_NUM_RE);
		if (!match) continue;
		const lineNum = Number.parseInt(match[1], 10);
		const existing = byLineNum.get(lineNum);
		if (!existing || (line.kind === "match" && existing.kind === "context")) {
			byLineNum.set(lineNum, line);
		}
	}
	const sorted = [...byLineNum.entries()].sort(([a], [b]) => a - b);
	const result: GrepOutputLine[] = [];
	for (let i = 0; i < sorted.length; i++) {
		if (i > 0 && sorted[i][0] > sorted[i - 1][0] + 1) {
			result.push({ kind: "separator", displayPath: "", lineNumber: 0, text: "--" });
		}
		result.push(sorted[i][1]);
	}
	return result;
}

/* ------------------------------------------------------------------ */
/*  Truncation — same thresholds as stock grep.ts                     */
/* ------------------------------------------------------------------ */
const GREP_TRUNCATION_THRESHOLD = 50;
const GREP_MAX_MATCHES_PER_FILE = 10;

function truncateGrepIR(ir: GrepOutputIR): GrepOutputIR {
	if (ir.totalMatches <= GREP_TRUNCATION_THRESHOLD) return ir;
	const files = ir.files.map((file) => {
		let matchesSeen = 0;
		const keptLines: GrepOutputLine[] = [];
		let truncatedCount = 0;
		for (const line of file.lines) {
			if (line.kind === "match") {
				matchesSeen++;
				if (matchesSeen <= GREP_MAX_MATCHES_PER_FILE) {
					keptLines.push(line);
				} else {
					truncatedCount++;
				}
			} else if (matchesSeen <= GREP_MAX_MATCHES_PER_FILE) {
				keptLines.push(line);
			}
		}
		if (truncatedCount > 0) {
			keptLines.push({
				kind: "separator",
				displayPath: "",
				lineNumber: 0,
				text: `... +${truncatedCount} more matches`,
			});
		}
		return { ...file, matchCount: matchesSeen, lines: keptLines };
	});
	return { totalMatches: ir.totalMatches, files };
}

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Direct file search for absolute paths outside FFF index           */
/* ------------------------------------------------------------------ */
async function searchFileDirect(
	params: { pattern: string; path?: string; literal?: boolean; ignoreCase?: boolean; context?: number | string; limit?: number | string; summary?: boolean; scope?: string; scopeContext?: number | string },
	cwd: string,
	signal: AbortSignal | undefined,
): Promise<{ content: { type: "text"; text: string }[]; details: { ptcValue: any } }> {
	const { readFile: fsReadFile } = await import("node:fs/promises");
	throwIfAborted(signal);

	let raw: string;
	try {
		raw = await fsReadFile(params.path!, "utf-8");
	} catch {
		return { content: [{ type: "text", text: "" }], details: { ptcValue: { tool: "grep", ok: true, summary: !!params.summary, totalMatches: 0, records: [] } } };
	}
	throwIfAborted(signal);

	const lines = raw.split("\n");
	const pattern = params.pattern;
	let re: RegExp;
	try {
		const flags = params.ignoreCase ? "gi" : "g";
		re = params.literal ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags) : new RegExp(pattern, flags);
	} catch {
		return { content: [{ type: "text", text: "" }], details: { ptcValue: { tool: "grep", ok: true, summary: !!params.summary, totalMatches: 0, records: [] } } };
	}

	const relPath = path.relative(cwd, params.path!) || params.path!;
	const absPath = params.path!;
	const matchLines: Array<{ line: number; text: string }> = [];
	for (let i = 0; i < lines.length; i++) {
		throwIfAborted(signal);
		if (re.test(lines[i])) {
			matchLines.push({ line: i + 1, text: lines[i] });
		}
	}

	const records: any[] = [];
	const renderedLines: string[] = [];
	for (const m of matchLines) {
		const built = buildPtcLine(m.line, m.text);
		const rendered = `${relPath}:>>${built.anchor}|${escapeControlCharsForDisplay(m.text)}`;
		renderedLines.push(rendered);
		records.push({ path: absPath, line: built.line, hash: built.hash, anchor: built.anchor, kind: "match", raw: built.raw, display: built.display });
	}

	return {
		content: [{ type: "text" as const, text: renderedLines.join("\n") }],
		details: {
			ptcValue: {
				tool: "grep",
				ok: true,
				summary: !!params.summary,
				totalMatches: matchLines.length,
				records,
			},
		},
	};
}
/*  Registration                                                      */
/* ------------------------------------------------------------------ */
export function registerFffGrepTool(pi: ExtensionAPI, options: FffGrepToolOptions) {
	const ptc = {
		callable: true,
		enabled: true,
		policy: "read-only" as const,
		readOnly: true,
		pythonName: "grep",
		defaultExposure: "safe-by-default" as const,
	};

	const tool = {
		name: "grep",
		label: "grep",
		description: GREP_PROMPT_METADATA.description,
		parameters: grepSchema,
		ptc,
		promptSnippet: GREP_PROMPT_METADATA.promptSnippet,
		promptGuidelines: options.astSearchGuideline
			? [GREP_PROMPT_METADATA.promptGuidelines[0], options.astSearchGuideline]
			: GREP_PROMPT_METADATA.promptGuidelines,
		async execute(toolCallId: string, params: any, signal: AbortSignal | undefined, onUpdate: any, ctx: any) {
			await ensureHashInit();
			throwIfAborted(signal);
			const rawParams = params as GrepParams;

			// Coerce context/limit
			const context = coerceObviousBase10Int(rawParams.context, "context");
			if (!context.ok) return { content: [{ type: "text" as const, text: context.message }], isError: true, details: { ptcValue: { tool: "grep", ok: false, error: buildPtcError("invalid-params-combo", context.message) } } };
			const limit = coerceObviousBase10Int(rawParams.limit, "limit");
			if (!limit.ok) return { content: [{ type: "text" as const, text: limit.message }], isError: true, details: { ptcValue: { tool: "grep", ok: false, error: buildPtcError("invalid-limit", limit.message) } } };
			const scopeContext = coerceObviousBase10Int(rawParams.scopeContext, "scopeContext");
			if (!scopeContext.ok) return { content: [{ type: "text" as const, text: scopeContext.message }], isError: true, details: { ptcValue: { tool: "grep", ok: false, error: buildPtcError("invalid-params-combo", scopeContext.message) } } };
			if (scopeContext.value !== undefined && rawParams.scope !== "symbol") {
				return { content: [{ type: "text" as const, text: 'scopeContext requires scope: "symbol"' }], isError: true, details: { ptcValue: { tool: "grep", ok: false, error: buildPtcError("invalid-params-combo", 'scopeContext requires scope: "symbol"') } } };
			}
			if (scopeContext.value !== undefined && scopeContext.value < 0) {
				return { content: [{ type: "text" as const, text: `Invalid scopeContext: ${scopeContext.value}` }], isError: true, details: { ptcValue: { tool: "grep", ok: false, error: buildPtcError("invalid-params-combo", `Invalid scopeContext: ${scopeContext.value}`) } } };
			}

			const cwd: string = ctx?.cwd ?? process.cwd();

			// Handle absolute paths: convert to relative for FFF if inside workspace,
			// otherwise fall back to direct file read + regex search.
			if (rawParams.path && path.isAbsolute(rawParams.path)) {
				const rel = path.relative(cwd, rawParams.path);
				if (!rel.startsWith("..")) {
					// Inside workspace — use relative path for FFF
					rawParams = { ...rawParams, path: rel };
				} else {
					// Outside workspace — read file directly
					const directResult = await searchFileDirect(rawParams, cwd, signal);
					// Notify onFileAnchored so context hygiene works
					if (!rawParams.summary && options.onFileAnchored) {
						const p = directResult.details?.ptcValue as any;
						if (p?.records?.length) {
							const anchoredPaths = new Set(p.records.map((r: any) => r.path));
							for (const abs of anchoredPaths) options.onFileAnchored(abs);
						}
					}
					return directResult;
				}
			}

			const p: GrepParams = {
				...rawParams,
				context: context.value,
				limit: limit.value,
				scopeContext: scopeContext.value,
			};

			// Determine mode and options BEFORE building query (effectivePattern needed by buildFffQuery)
			const mode = rawParams.literal ? "plain" as const : "regex" as const;
			const wantIgnoreCase = rawParams.ignoreCase === true;
			// When ignoreCase is set, lowercase the pattern so FFF's smartCase
			// (always active) matches case-insensitively.
			const effectivePattern = wantIgnoreCase ? rawParams.pattern.toLowerCase() : rawParams.pattern;

			// Get FFF finder and run grep
			const finder = await options.getFinder(cwd);
			const query = buildFffQuery({ path: rawParams.path, glob: rawParams.glob, pattern: effectivePattern }, cwd);

			const fffOpts: any = {
				mode,
				smartCase: true,
				beforeContext: typeof p.context === "number" ? p.context : 0,
				afterContext: typeof p.context === "number" ? p.context : 0,
				pageSize: typeof p.limit === "number" && p.limit > 0
				? Math.min(p.limit, GREP_TRUNCATION_THRESHOLD)
				: GREP_TRUNCATION_THRESHOLD,
				maxMatchesPerFile: GREP_MAX_MATCHES_PER_FILE,
				classifyDefinitions: false,
			};

			const result = finder.grep(query, fffOpts);
			if (!result.ok) {
				return { content: [{ type: "text" as const, text: `Grep error: ${result.error}` }], isError: true, details: { ptcValue: { tool: "grep" as const, ok: false, error: buildPtcError("fff-error", result.error), summary: false, totalMatches: 0, records: [] } } };
			}
			const grepResult = result.value;
			if (!grepResult.items?.length) {
				return { content: [{ type: "text" as const, text: "" }], details: { ptcValue: { tool: "grep" as const, ok: true, summary: !!p.summary, totalMatches: 0, records: [] } } };
			}

			const items = grepResult.items as any[];
			const toAbsolutePath = (rel: string): string => path.resolve(cwd, rel);

			// Build hashline IR from structured FFF results
			const { ir: grepIR, recordsMap, absoluteMatches } = buildGrepIRFromFffMatches(items, toAbsolutePath, cwd);

			// Deduplicate context lines within each file
			for (const file of grepIR.files) {
				file.lines = deduplicateContext(file.lines);
			}

			// Re-sort lines within each file by line number (FFF may not guarantee order)
			for (const file of grepIR.files) {
				file.lines.sort((a, b) => a.lineNumber - b.lineNumber);
			}

			// Truncation
			const truncatedIR = truncateGrepIR(grepIR);
			const summary = p.summary;
			const effectiveLimit = typeof p.limit === "number" ? p.limit : 100;

			const outputIR = summary
				? { ...truncatedIR, files: truncatedIR.files.map((f) => ({ ...f, path: toAbsolutePath(f.path) })) }
				: truncatedIR;

			let renderedGroups: any[] = outputIR.files.map((file) => ({
				displayPath: file.path,
				absolutePath: summary ? file.path : toAbsolutePath(file.path),
				matchCount: file.matchCount,
				entries: file.lines.map((line) => {
					if (line.kind === "separator") {
						return { kind: "separator" as const, text: line.text };
					}
					const record = recordsMap.get(line.text);
					if (!record) throw new Error(`Missing grep record for rendered line: ${line.text}`);
					return { kind: record.kind, line: { line: record.line, hash: record.hash, anchor: record.anchor, raw: record.raw, display: record.display } };
				}),
			}));

			let ptcRecords: any[] = absoluteMatches;
			let scopeWarnings: any[] = [];

			if (p.scope === "symbol" && !summary) {
				throwIfAborted(signal);
				const fileLinesByPath = new Map<string, string[]>();
				const fileMapsByPath = new Map<string, any>();
				for (const group of renderedGroups) {
					throwIfAborted(signal);
					fileMapsByPath.set(group.absolutePath, await getOrGenerateMap(group.absolutePath));
					// Read file lines for symbol boundary detection (same pattern as stock grep)
					try {
						const raw = await readFile(group.absolutePath, "utf8");
						fileLinesByPath.set(group.absolutePath, normalizeToLF(stripBom(raw).text).split("\n"));
					} catch {
						// file not readable — continue without line data
					}
				}
				const scoped = scopeGrepGroupsToSymbols({
					groups: renderedGroups,
					fileLinesByPath,
					fileMapsByPath,
					contextLines: typeof p.context === "number" ? p.context : 0,
					scopeContext: typeof p.scopeContext === "number" ? p.scopeContext : undefined,
				});
				renderedGroups = scoped.groups;
				scopeWarnings = scoped.warnings;
				ptcRecords = renderedGroups.flatMap((group: any) =>
					group.entries.flatMap((entry: any) =>
						entry.kind === "separator" ? [] : [{ path: group.absolutePath, kind: entry.kind, line: entry.line.line, hash: entry.line.hash, anchor: entry.line.anchor, raw: entry.line.raw, display: entry.line.display }],
					),
				);
			}

			const builtOutput = buildGrepOutput({
				summary: !!summary,
				totalMatches: grepIR.totalMatches,
				groups: renderedGroups,
				limit: effectiveLimit,
				records: ptcRecords,
				scopeMode: p.scope === "symbol" && !summary ? "symbol" : undefined,
				scopeWarnings,
				passthroughLines: [],
				rehydrate: buildGrepRehydrateDescriptor({
					pattern: p.pattern,
					path: p.path,
					glob: p.glob,
					literal: p.literal,
					ignoreCase: p.ignoreCase,
					context: p.context,
					summary: p.summary,
					scope: p.scope,
					scopeContext: p.scopeContext,
				}),
			});

			// Notify onFileAnchored for context hygiene
			if (!summary && ptcRecords.length > 0) {
				const anchoredPaths = new Set(ptcRecords.map((r: any) => r.path));
				for (const absolutePath of anchoredPaths) {
					options.onFileAnchored?.(absolutePath);
				}
			}

			return {
				content: [{ type: "text" as const, text: builtOutput.text }],
				details: {
					ptcValue: builtOutput.ptcValue,
					contextHygiene: builtOutput.contextHygiene,
				},
			};
		},
		renderCall(args: any, theme: any, ...rest: any[]) {
			const context = rest[0] ?? {};
			const { pattern, suffix } = formatGrepCallText(args);
			let text = `${renderToolLabel(theme, "grep")} ${theme.fg("accent", `/${pattern}/`)}`;
			if (suffix) text += theme.fg("dim", ` in ${suffix}`);
			return new Text(clampLineToWidth(text, context.width), 0, 0);
		},
		renderResult(result: any, options: ToolRenderResultOptions, theme: any, ...rest: any[]) {
			const context: { isPartial?: boolean; isError?: boolean; expanded?: boolean; cwd?: string; width?: number } = rest[0] ?? options ?? {};
			const isPartial = context.isPartial ?? (options as any)?.isPartial ?? false;
			const isError = context.isError ?? false;
			const expanded = isRendererExpanded(options as any, context as any);
			const cwd = context.cwd ?? process.cwd();
			const width = (context as any).width ?? (options as any)?.width;
			if (isPartial) return new Text(clampLinesToWidth([summaryLine("pending search")], width).join("\n"), 0, 0);
			const content = result.content?.[0];
			const textContent = content?.type === "text" ? content.text : "";
			if (isError || result.isError) {
				const firstLine = textContent.split("\n")[0] || "Error";
				const body = expanded && textContent ? textContent : firstLine;
				return new Text(clampLinesToWidth(summaryLine(body).split("\n"), width).join("\n"), 0, 0);
			}
			const ptcValue = (result.details as any)?.ptcValue as { tool: string; summary: boolean; totalMatches: number; records: Array<{ path: string; kind: string }> } | undefined;
			const hasBinaryWarning = textContent.includes("appears to be a binary file");
			const fileSet = new Set<string>();
			for (const r of ptcValue?.records ?? []) {
				if (r.path) fileSet.add(r.path);
			}
			const info = formatGrepResultText({
				totalMatches: ptcValue?.totalMatches ?? 0,
				summary: ptcValue?.summary ?? false,
				records: ptcValue?.records ?? [],
				fileCount: fileSet.size,
				hasBinaryWarning,
			});
			if (info.noMatches && !hasBinaryWarning) return new Text(summaryLine("no matches"), 0, 0);
			const matchCount = ptcValue?.totalMatches ?? 0;
			const matchWord = matchCount === 1 ? "match" : "matches";
			let text = summaryLine(`${matchCount} ${matchWord} returned`, { hidden: !!textContent && !expanded });
			for (const badge of info.badges) text += theme.fg(badge.startsWith("⚠") ? "warning" : "dim", `  ${badge}`);
			if (expanded && ptcValue?.records) {
				const fileCounts = new Map<string, number>();
				for (const r of ptcValue.records) if (r.path && r.kind === "match") fileCounts.set(r.path, (fileCounts.get(r.path) ?? 0) + 1);
				for (const [filePath, count] of [...fileCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
					const display = path.relative(cwd, filePath) || filePath;
					text += "\n" + theme.fg("dim", `  ${display} (${count})`);
				}
				if (fileCounts.size > 20) text += "\n" + theme.fg("muted", `  … and ${fileCounts.size - 20} more files`);
			}
			return new Text(clampLinesToWidth(text.split("\n"), width).join("\n"), 0, 0);
		},
	} satisfies Parameters<ExtensionAPI["registerTool"]>[0] & { ptc: typeof ptc };

	pi.registerTool(tool);
	return tool;
}
