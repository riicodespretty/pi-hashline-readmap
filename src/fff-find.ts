import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import path from "node:path";
import { defineToolPromptMetadata } from "./tool-prompt-metadata.js";
import { buildPtcError } from "./ptc-value.js";
import { coerceObviousBase10Int } from "./coerce-obvious-int.js";
import { clampLineToWidth, clampLinesToWidth, isRendererExpanded, renderToolLabel, summaryLine } from "./tui-render-utils.js";

/* ------------------------------------------------------------------ */
/*  Prompt metadata (same as stock find.ts)                           */
/* ------------------------------------------------------------------ */
const FIND_PROMPT_METADATA = defineToolPromptMetadata({
	promptUrl: new URL("../prompts/find.md", import.meta.url),
	promptSnippet: "Find files recursively by name, respecting gitignore",
	promptGuidelines: [
		"Use find for recursive file-name discovery; use ls for one directory.",
		"Use find path plus basename pattern rather than shell find commands.",
		"Use find filters and sorting before limit for newest/largest file queries.",
	],
});

export const FIND_PTC = {
	callable: true,
	enabled: true,
	policy: "read-only" as const,
	readOnly: true,
	pythonName: "find",
	defaultExposure: "safe-by-default" as const,
};

export interface FindEntry {
	path: string;
	type: "file" | "dir";
}

export interface FindPtcValue {
	tool: "find";
	pattern: string;
	totalEntries: number;
	truncated: boolean;
	entries: FindEntry[];
}

interface FffFindToolOptions {
	getFinder: (cwd: string) => Promise<any>;
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

function buildFffFindQuery(params: { path?: string; pattern: string }, cwd: string): string {
	const parts: string[] = [];
	if (params.path) {
		const constraint = normalizePathConstraint(params.path, cwd);
		if (constraint) parts.push(constraint);
	}
	parts.push(params.pattern);
	return parts.join(" ");
}

/* ------------------------------------------------------------------ */
/*  Output formatting (mirrors stock find.ts's format style)          */
/* ------------------------------------------------------------------ */
function formatOutput(entries: FindEntry[], totalCount: number, truncated: boolean, pattern: string): string {
	const lines: string[] = [];
	for (const entry of entries) {
		lines.push(entry.path);
	}
	const header = truncated
		? `[Found ${totalCount} matches, showing first ${entries.length}]`
		: `[Found ${totalCount} matches]`;
	return `${header}\n${lines.join("\n")}`;
}

/* ------------------------------------------------------------------ */
/*  Registration                                                      */
/* ------------------------------------------------------------------ */
export function registerFffFindTool(pi: ExtensionAPI, options: FffFindToolOptions) {
	const tool: Parameters<ExtensionAPI["registerTool"]>[0] & { ptc: typeof FIND_PTC } = {
		name: "find",
		label: "find",
		description: FIND_PROMPT_METADATA.description,
		promptSnippet: FIND_PROMPT_METADATA.promptSnippet,
		promptGuidelines: FIND_PROMPT_METADATA.promptGuidelines,
		ptc: FIND_PTC,
		parameters: Type.Object(
			{
				pattern: Type.String({ description: "Glob or basename pattern" }),
				path: Type.Optional(Type.String({ description: "Search root" })),
				limit: Type.Optional(Type.Number({ description: "Max entries" })),
				type: Type.Optional(
					Type.Union(
						[Type.Literal("file"), Type.Literal("dir"), Type.Literal("any")],
						{ description: "Entry type filter" },
					),
				),
				maxDepth: Type.Optional(Type.Number({ description: "Max directory depth" })),
				regex: Type.Optional(
					Type.Boolean({ description: "Treat pattern as regex" }),
				),
			},
			{ required: ["pattern"] },
		),
		async execute(
			_toolCallId: string,
			params: {
				pattern: string;
				path?: string;
				limit?: number;
				type?: "file" | "dir" | "any";
				maxDepth?: number;
				regex?: boolean;
			},
			_signal: AbortSignal | undefined,
			_onUpdate: any,
			ctx: any,
		) {
			const cwd: string = ctx?.cwd ?? process.cwd();
			const limit = params.limit ?? 1000;
			const type = params.type ?? "file";
			const pattern = params.pattern;

			const maxDepthCoerced = coerceObviousBase10Int(params.maxDepth, "maxDepth");
			if (!maxDepthCoerced.ok) {
				return { content: [{ type: "text" as const, text: `Error: ${maxDepthCoerced.message}` }], isError: true, details: { ptcValue: { tool: "find" as const, ok: false, path: params.path ?? cwd, error: buildPtcError("invalid-params-combo", maxDepthCoerced.message) } } };
			}
			if (maxDepthCoerced.value !== undefined && maxDepthCoerced.value < 0) {
				return { content: [{ type: "text" as const, text: `Error: Invalid maxDepth: ${maxDepthCoerced.value}` }], isError: true, details: { ptcValue: { tool: "find" as const, ok: false, path: params.path ?? cwd, error: buildPtcError("invalid-params-combo", `Invalid maxDepth: ${maxDepthCoerced.value}`) } } };
			}

			// Get FFF finder
			const finder = await options.getFinder(cwd);
			const query = buildFffFindQuery({ path: params.path, pattern }, cwd);

			// FFF fileSearch is fuzzy by default. When regex=true, pass mode.
			// FFF's fileSearch doesn't support mode parameter directly — it's always fuzzy.
			// For exact/regex matching, FFF's built-in smart matching handles it.
			const searchOpts: any = {
				pageSize: limit,
				maxThreads: 0,
			};

			let results: any[];

			if (type === "any") {
				// Mixed search: files + directories interleaved by score
				const mixedResult = finder.mixedSearch(query, searchOpts);
				if (mixedResult.ok) {
					results = mixedResult.value.items.map((i: any) => ({
						path: i.item.relativePath,
						type: i.type === "file" ? "file" as const : "dir" as const,
					}));
				} else {
					results = [];
				}
			} else if (type === "dir") {
				const dirResult = finder.directorySearch(query, searchOpts);
				results = dirResult.ok ? dirResult.value.items.map((i: any) => ({ path: i.relativePath, type: "dir" as const })) : [];
			} else {
				// file search — use fileSearch for fuzzy/glob, filter with regex if needed
				const fileResult = finder.fileSearch(query, searchOpts);
				if (fileResult.ok) {
					let items = fileResult.value.items as any[];
					if (params.regex) {
						// When regex is set, filter the fuzzy results against the basename
						let re: RegExp;
						try {
							re = new RegExp(pattern);
						} catch {
							return { content: [{ type: "text" as const, text: `Error: invalid regex '${pattern}'` }], isError: true, details: { ptcValue: { tool: "find" as const, ok: false, path: params.path ?? cwd, error: buildPtcError("invalid-params-combo", `invalid regex '${pattern}'`) } } };
						}
						items = items.filter((i: any) => re.test(i.fileName));
					}
					results = items.map((i: any) => ({ path: i.relativePath, type: "file" as const }));
				} else {
					results = [];
				}
			}

			const totalCount = results.length;
			const truncated = totalCount > limit;
			const displayed = truncated ? results.slice(0, limit) : results;

			const outputText = formatOutput(displayed, totalCount, truncated, pattern);
			const ptcValue: FindPtcValue = {
				tool: "find",
				pattern,
				totalEntries: totalCount,
				truncated,
				entries: displayed,
			};

			return {
				content: [{ type: "text" as const, text: outputText }],
				details: { ptcValue },
			};
		},
		renderCall(args: any, theme: any, context: any = {}) {
			const { pattern, path: p } = args as { pattern: string; path?: string };
			const target = p ? `${pattern} in ${p}` : pattern;
			return new Text(clampLineToWidth(`${renderToolLabel(theme, "find")} ${theme.fg("muted", target)}`, context.width), 0, 0);
		},
		renderResult(result: any, options: any, theme: any, context: any = {}) {
			const expanded = isRendererExpanded(options, context);
			const width = context.width ?? options?.width;
			const output = result.content[0]?.type === "text" ? (result.content[0] as { type: "text"; text: string }).text : "";
			if (result.isError || context.isError) {
				const firstLine = output.split("\n")[0] || "error";
				const body = expanded && output ? output : firstLine;
				return new Text(clampLinesToWidth(summaryLine(body).split("\n"), width).join("\n"), 0, 0);
			}
			const ptcValue = result.details?.ptcValue as { totalEntries?: number } | undefined;
			const total = ptcValue?.totalEntries ?? output.split("\n").filter((l: string) => l.length > 0 && !l.startsWith("[")).length;
			if (total === 0) return new Text(summaryLine("no results"), 0, 0);
			let text = summaryLine(`${total} ${total === 1 ? "result" : "results"} returned`, { hidden: !!output && !expanded });
			if (expanded && output) text += `\n${output}`;
			return new Text(clampLinesToWidth(text.split("\n"), width).join("\n"), 0, 0);
		},
	};

	pi.registerTool(tool);
	return tool;
}
