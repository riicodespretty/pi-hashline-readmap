import { computeLineHash, escapeControlCharsForDisplay } from "./hashline.js";

export interface PtcLine {
  line: number;
  hash: string;
  anchor: string;
  raw: string;
  display: string;
}

export interface PtcWarning {
  code: string;
  message: string;
}

export function buildPtcLine(line: number, raw: string): PtcLine {
  const hash = computeLineHash(line, raw);
  return {
    line,
    hash,
    anchor: `${line}:${hash}`,
    raw,
    display: escapeControlCharsForDisplay(raw),
  };
}

export function buildPtcLines(startLine: number, rawLines: string[]): PtcLine[] {
  return rawLines.map((raw, index) => buildPtcLine(startLine + index, raw));
}
