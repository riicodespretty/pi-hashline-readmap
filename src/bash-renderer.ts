import { createBashTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import { clampLineToWidth, clampLinesToWidth, isRendererExpanded, renderToolLabel, summaryLine } from "./tui-render-utils.js";

type BuiltInFactory = (cwd: string) => any;

const BASH_DESCRIPTION = "Run shell commands for tests, builds, git, package managers, and external CLIs.";
const BASH_PARAMETERS = Type.Object({
  command: Type.String({ description: "Shell command to run" }),
  timeout: Type.Optional(Type.Number({ description: "Timeout seconds" })),
});

export function registerBashRendererTool(pi: Pick<ExtensionAPI, "registerTool">, options: { cwd?: string; createBuiltInBashTool?: BuiltInFactory } = {}): any {
  const cache = new Map<string, any>();
  const createBuiltInBashTool = options.createBuiltInBashTool ?? ((cwd: string) => createBashTool(cwd));
  const getBuiltIn = (cwd: string) => {
    let tool = cache.get(cwd);
    if (!tool) {
      tool = createBuiltInBashTool(cwd);
      cache.set(cwd, tool);
    }
    return tool;
  };
  const tool = {
    name: "bash",
    label: "bash",
    description: BASH_DESCRIPTION,
    parameters: BASH_PARAMETERS,
    async execute(toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: any, ctx: any = {}) {
      const cwd = ctx?.cwd ?? options.cwd ?? process.cwd();
      return getBuiltIn(cwd).execute(toolCallId, params, signal, onUpdate);
    },
    renderCall(args: any, theme: any, context: any = {}) {
      const raw = String(args?.command ?? "");
      const command = raw.split("\n")[0] + (raw.includes("\n") ? " …" : "");
      return new Text(clampLineToWidth(`${renderToolLabel(theme, "bash")} ${theme.fg("muted", command)}`, context.width), 0, 0);
    },
    renderResult(result: any, optionsArg: any, _theme: any, context: any = {}) {
      const expanded = isRendererExpanded(optionsArg, context);
      const width = context.width ?? optionsArg?.width;
      const text = result.content?.find((item: any) => item.type === "text")?.text ?? "";
      if (result.isError || context.isError) {
        const first = text.split("\n")[0] || "command failed";
        const body = expanded && text ? text : first;
        return new Text(clampLinesToWidth([summaryLine(body)], width).join("\n"), 0, 0);
      }
      if (!text.trim()) return new Text(summaryLine("command completed (no output)"), 0, 0);
      const lineCount = text.split("\n").filter(Boolean).length;
      let rendered = summaryLine(`${lineCount} ${lineCount === 1 ? "line" : "lines"} returned`, { hidden: !expanded });
      if (expanded) rendered += `\n${text}`;
      return new Text(clampLinesToWidth(rendered.split("\n"), width).join("\n"), 0, 0);
    },
  };
  pi.registerTool(tool as any);
  return tool;
}
