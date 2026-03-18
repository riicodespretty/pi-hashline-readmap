import type { PtcLine } from "./ptc-value.js";

export interface GrepOutputRecord extends PtcLine {
  path: string;
  kind: "match" | "context";
}

export type GrepOutputEntry =
  | { kind: "match" | "context"; line: PtcLine }
  | { kind: "separator"; text: string };

export interface GrepOutputGroup {
  displayPath: string;
  absolutePath: string;
  matchCount: number;
  entries: GrepOutputEntry[];
}

export interface BuildGrepOutputInput {
  summary: boolean;
  totalMatches: number;
  groups: GrepOutputGroup[];
  limit?: number;
  records: GrepOutputRecord[];
}

export interface GrepOutputResult {
  text: string;
  ptcValue: {
    tool: "grep";
    summary: boolean;
    totalMatches: number;
    records: GrepOutputRecord[];
  };
}

function renderEntry(displayPath: string, entry: GrepOutputEntry): string {
  if (entry.kind === "separator") return entry.text;
  const marker = entry.kind === "match" ? ">>" : "  ";
  return `${displayPath}:${marker}${entry.line.anchor}|${entry.line.display}`;
}

export function buildGrepOutput(input: BuildGrepOutputInput): GrepOutputResult {
  const header = `[${input.totalMatches} matches in ${input.groups.length} files]`;
  let text: string;

  if (input.summary) {
    const fileLines = [...input.groups]
      .sort((a, b) => b.matchCount - a.matchCount)
      .map((group) => `${group.absolutePath}: ${group.matchCount} matches`);
    text = [header, ...fileLines].join("\n");
  } else {
    const blocks: string[] = [header];
    for (const group of input.groups) {
      blocks.push(`--- ${group.displayPath} (${group.matchCount} matches) ---`);
      for (const entry of group.entries) {
        blocks.push(renderEntry(group.displayPath, entry));
      }
    }
    text = blocks.join("\n");
  }

  if (input.limit !== undefined && input.totalMatches === input.limit) {
    text += `\n\n[Results truncated at ${input.limit} matches — refine pattern or increase limit]`;
  }

  return {
    text,
    ptcValue: {
      tool: "grep",
      summary: input.summary,
      totalMatches: input.totalMatches,
      records: input.records,
    },
  };
}
