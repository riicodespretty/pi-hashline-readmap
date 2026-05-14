import { visibleWidth } from "@earendil-works/pi-tui";
import type { DiffData, DiffEntry, DiffSpan } from "./diff-data.js";
import { clampLineToWidth, clampLinesToWidth, normalizeWidth, type RendererTheme } from "./tui-render-utils.js";

export type TuiDiffMode = "split" | "unified" | "compact" | "summary";
export type RenderTuiDiffInput = { diffData: DiffData; width: number; theme: RendererTheme; expanded: boolean };
export type RenderTuiDiffOutput = { mode: TuiDiffMode; width: number; lines: string[] };

function chooseMode(width: number): TuiDiffMode { return width >= 100 ? "split" : width >= 50 ? "unified" : width >= 24 ? "compact" : "summary"; }
function hunkCount(data: DiffData): number { return Math.max(1, data.blockRanges?.length ?? (data.entries.some((e) => e.kind === "add" || e.kind === "remove") ? 1 : 0)); }
function compactHeader(data: DiffData): string { return `↳ diff +${data.stats.added} -${data.stats.removed}`; }
function header(data: DiffData, mode: TuiDiffMode, width: number): string {
  if (mode === "summary" && width <= 10) return `↳ diff +${data.stats.added}`;
  const full = `${compactHeader(data)} • ${hunkCount(data)} hunk • 1 file • ${mode === "split" ? "split" : "unified"}`;
  return visibleWidth(full) <= width ? full : clampLineToWidth(compactHeader(data), width);
}
function lineNo(entry: DiffEntry): string { return String(entry.kind === "add" ? entry.newLine : entry.kind === "remove" ? entry.oldLine : entry.kind === "context" ? entry.newLine : ""); }
function textOf(entry: DiffEntry): string { return "text" in entry ? entry.text : ""; }
function tint(theme: RendererTheme, entry: DiffEntry, text: string): string { return entry.kind === "add" ? theme.fg("success", text) : entry.kind === "remove" ? theme.fg("error", text) : theme.fg("toolOutput", text); }
function spans(theme: RendererTheme, spans: DiffSpan[] | undefined, fallback: string): string { return spans?.map((s) => s.kind === "add" ? theme.fg("success", s.text) : s.kind === "remove" ? theme.fg("error", s.text) : s.text).join("") ?? fallback; }
function inlineText(input: RenderTuiDiffInput, index: number, entry: DiffEntry): string {
  const pair = input.diffData.inlineDiffs?.find((d) => entry.kind === "remove" ? d.removeLineIndex === index : entry.kind === "add" ? d.addLineIndex === index : false);
  if (!pair) return textOf(entry);
  return entry.kind === "remove" ? spans(input.theme, pair.removeSpans, textOf(entry)) : entry.kind === "add" ? spans(input.theme, pair.addSpans, textOf(entry)) : textOf(entry);
}
function unifiedRows(input: RenderTuiDiffInput): string[] { return input.diffData.entries.map((e, i) => e.kind === "meta" ? null : tint(input.theme, e, `▌ ${lineNo(e)} │ ${inlineText(input, i, e)}`)).filter((row): row is string => row !== null); }
function compactRows(input: RenderTuiDiffInput): string[] { return input.diffData.entries.map((e, i) => e.kind === "add" || e.kind === "remove" ? tint(input.theme, e, `▌ ${lineNo(e)} ${inlineText(input, i, e)}`) : null).filter((row): row is string => row !== null); }
function splitRows(input: RenderTuiDiffInput, width: number): string[] {
  const pane = Math.max(10, Math.floor((width - 3) / 2));
  const rows = [`${"old".padEnd(pane)} │ new`];
  for (const [i, e] of input.diffData.entries.entries()) {
    if (e.kind === "remove") rows.push(`${clampLineToWidth(`▌ ${e.oldLine} │ ${inlineText(input, i, e)}`, pane)} │ ${""}`);
    else if (e.kind === "add") rows.push(`${"".padEnd(pane)} │ ${clampLineToWidth(`▌ ${e.newLine} │ ${inlineText(input, i, e)}`, pane)}`);
    else if (e.kind === "context") rows.push(`${clampLineToWidth(`  ${e.oldLine} │ ${e.text}`, pane)} │ ${clampLineToWidth(`  ${e.newLine} │ ${e.text}`, pane)}`);
  }
  return rows;
}
function hiddenHint(hiddenLines: number, hiddenHunks: number, width: number): string {
  const forms = [`… (${hiddenLines} more diff lines • ${hiddenHunks} more hunk${hiddenHunks === 1 ? "" : "s"} • Ctrl+O to expand)`, `… (${hiddenLines} more lines • ${hiddenHunks} hunks)`, `… (+${hiddenLines} • +${hiddenHunks}h)`, "…"];
  return forms.find((f) => visibleWidth(f) <= width) ?? "…";
}
export function renderTuiDiff(input: RenderTuiDiffInput): RenderTuiDiffOutput {
  const width = normalizeWidth(input.width);
  const mode = chooseMode(width);
  const lines = [header(input.diffData, mode, width)];
  if (!input.expanded) return { mode, width, lines: clampLinesToWidth([...lines, hiddenHint(input.diffData.entries.length, hunkCount(input.diffData), width)], width) };
  if (mode === "summary") return { mode, width, lines: clampLinesToWidth(lines, width) };
  const rows = mode === "split" ? splitRows(input, width) : mode === "compact" ? compactRows(input) : unifiedRows(input);
  return { mode, width, lines: clampLinesToWidth([...lines, ...rows], width) };
}
