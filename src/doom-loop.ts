export const MAX_RECENT_TOOL_CALLS = 24;
export const DOOM_LOOP_WARNING = "[Warning: You appear to be stuck. Try a different approach.]";

export interface RecordedToolCall {
  toolCallId: string;
  fingerprint: string;
}

export interface DoomLoopState {
  recentCalls: RecordedToolCall[];
  warnedToolCallIds: Set<string>;
}

export function createDoomLoopState(): DoomLoopState {
  return {
    recentCalls: [],
    warnedToolCallIds: new Set<string>(),
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

export function makeToolFingerprint(toolName: string, input: Record<string, unknown>): string {
  return `${toolName}:${stableStringify(input)}`;
}

function sameFingerprints(left: RecordedToolCall[], right: RecordedToolCall[]): boolean {
  return left.length === right.length && left.every((call, index) => call.fingerprint === right[index]?.fingerprint);
}

function hasIdenticalTail(calls: RecordedToolCall[]): boolean {
  if (calls.length < 3) {
    return false;
  }

  const last = calls[calls.length - 1]?.fingerprint;
  return calls[calls.length - 2]?.fingerprint === last && calls[calls.length - 3]?.fingerprint === last;
}

function hasRepeatedSubsequenceTail(calls: RecordedToolCall[]): boolean {
  const maxWindowSize = Math.floor(calls.length / 3);
  for (let windowSize = 2; windowSize <= maxWindowSize; windowSize++) {
    const newest = calls.slice(-windowSize);
    const middle = calls.slice(-windowSize * 2, -windowSize);
    const oldest = calls.slice(-windowSize * 3, -windowSize * 2);
    if (sameFingerprints(newest, middle) && sameFingerprints(middle, oldest)) {
      return true;
    }
  }
  return false;
}

export function recordToolCall(
  state: DoomLoopState,
  toolName: string,
  toolCallId: string,
  input: Record<string, unknown>,
): void {
  state.recentCalls.push({
    toolCallId,
    fingerprint: makeToolFingerprint(toolName, input),
  });

  if (state.recentCalls.length > MAX_RECENT_TOOL_CALLS) {
    state.recentCalls.splice(0, state.recentCalls.length - MAX_RECENT_TOOL_CALLS);
  }

  if (hasIdenticalTail(state.recentCalls) || hasRepeatedSubsequenceTail(state.recentCalls)) {
    state.warnedToolCallIds.add(toolCallId);
  }
}

export function consumeDoomLoopWarning(state: DoomLoopState, toolCallId: string): boolean {
  if (!state.warnedToolCallIds.has(toolCallId)) {
    return false;
  }
  state.warnedToolCallIds.delete(toolCallId);
  return true;
}

export function appendDoomLoopWarning(text: string): string {
  if (!text) {
    return DOOM_LOOP_WARNING;
  }
  return text.includes(DOOM_LOOP_WARNING) ? text : `${text}\n\n${DOOM_LOOP_WARNING}`;
}
