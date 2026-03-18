import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
} from "@mariozechner/pi-coding-agent";
import { buildPtcLines, renderPtcLines, type PtcLine, type PtcWarning } from "./ptc-value.js";

export interface ReadSymbolMetadata {
  query: string;
  name: string;
  kind: string;
  parentName?: string;
  startLine: number;
  endLine: number;
}

export interface ReadTruncationMetadata {
  outputLines: number;
  totalLines: number;
  outputBytes: number;
  totalBytes: number;
}

export interface ReadMapMetadata {
  requested: boolean;
  appended: boolean;
  text?: string | null;
}

export interface ReadContinuationMetadata {
  nextOffset: number;
}

export interface ReadOutputInput {
  path: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  selectedLines: string[];
  warnings?: PtcWarning[];
  truncation?: ReadTruncationMetadata | null;
  continuation?: ReadContinuationMetadata | null;
  symbol?: ReadSymbolMetadata | null;
  map?: ReadMapMetadata;
}

export interface ReadOutputResult {
  text: string;
  lines: PtcLine[];
  ptcValue: {
    tool: "read";
    path: string;
    range: {
      startLine: number;
      endLine: number;
      totalLines: number;
    };
    warnings: PtcWarning[];
    truncation: ReadTruncationMetadata | null;
    symbol: ReadSymbolMetadata | null;
    map: {
      requested: boolean;
      appended: boolean;
    };
    lines: PtcLine[];
  };
}

export function buildReadOutput(input: ReadOutputInput): ReadOutputResult {
  const lines = buildPtcLines(input.startLine, input.selectedLines);
  const warnings = input.warnings ?? [];
  const renderedLines = renderPtcLines(lines);
  const truncated = truncateHead(renderedLines, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  let text = input.truncation ? truncated.content : renderedLines;

  if (input.truncation) {
    text += `\n\n[Output truncated: showing ${input.truncation.outputLines} of ${input.totalLines} lines (${formatSize(input.truncation.outputBytes)} of ${formatSize(input.truncation.totalBytes)}). Use offset=${input.startLine + input.truncation.outputLines} to continue.]`;
  } else if (input.continuation) {
    text += `\n\n[Showing lines ${input.startLine}-${input.endLine} of ${input.totalLines}. Use offset=${input.continuation.nextOffset} to continue.]`;
  }

  if (input.map?.appended && input.map.text) {
    text += `\n\n${input.map.text}`;
  }

  if (input.symbol) {
    const parentInfo = input.symbol.parentName ? ` in ${input.symbol.parentName}` : "";
    text = `[Symbol: ${input.symbol.name} (${input.symbol.kind})${parentInfo}, lines ${input.symbol.startLine}-${input.symbol.endLine} of ${input.totalLines}]\n\n${text}`;
  }

  if (warnings.length) {
    text = `${warnings.map((warning) => warning.message).join("\n\n")}\n\n${text}`;
  }

  return {
    text,
    lines,
    ptcValue: {
      tool: "read",
      path: input.path,
      range: {
        startLine: input.startLine,
        endLine: input.endLine,
        totalLines: input.totalLines,
      },
      warnings,
      truncation: input.truncation ?? null,
      symbol: input.symbol ?? null,
      map: {
        requested: input.map?.requested ?? false,
        appended: input.map?.appended ?? false,
      },
      lines,
    },
  };
}
