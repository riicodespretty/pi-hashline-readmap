import { describe, it, expect } from "vitest";
import init from "../index.js";

function createHarness() {
  const handlers: Record<string, Function> = {};

  init(
    {
      registerTool() {},
      on(event: string, handler: Function) {
        handlers[event] = handler;
      },
      events: { emit() {}, on() {} },
    } as any,
  );

  return handlers;
}

function makeToolCall(toolName: string, toolCallId: string, input: Record<string, unknown>) {
  return {
    type: "tool_call" as const,
    toolName,
    toolCallId,
    input,
  };
}

function makeToolResult(toolName: string, toolCallId: string, input: Record<string, unknown>, text: string) {
  return {
    type: "tool_result" as const,
    toolName,
    toolCallId,
    input,
    content: [{ type: "text" as const, text }],
    isError: false,
    details: undefined,
  };
}

describe("doom loop detection — repeated subsequences", () => {
  it("appends a warning for [A,B,C][A,B,C][A,B,C]", async () => {
    const handlers = createHarness();
    const sequence = [
      { toolName: "read", input: { path: "src/read.ts" }, text: "read-a" },
      { toolName: "grep", input: { pattern: "hashline", path: "src" }, text: "grep-b" },
      { toolName: "read", input: { path: "src/edit.ts" }, text: "read-c" },
    ];

    let loopedResult: any;
    for (let repeat = 0; repeat < 3; repeat++) {
      for (const [index, entry] of sequence.entries()) {
        const toolCallId = `repeat-${repeat}-${index}`;
        await handlers.tool_call(makeToolCall(entry.toolName, toolCallId, entry.input), {});
        const result = await handlers.tool_result(
          makeToolResult(entry.toolName, toolCallId, entry.input, entry.text),
          {},
        );
        if (repeat === 2 && index === sequence.length - 1) {
          loopedResult = result;
        }
      }
    }

    expect(loopedResult).toBeDefined();
    expect(loopedResult.content[0].text).toContain("read-c");
    expect(loopedResult.content[0].text).toContain("You appear to be stuck. Try a different approach.");
  });
});
