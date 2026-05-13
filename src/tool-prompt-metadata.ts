import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";

export interface ToolPromptMetadata {
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
}

export function loadPrompt(promptUrl: URL): string {
  return readFileSync(promptUrl, "utf-8")
    .replaceAll("{{DEFAULT_MAX_LINES}}", String(DEFAULT_MAX_LINES))
    .replaceAll("{{DEFAULT_MAX_BYTES}}", formatSize(DEFAULT_MAX_BYTES))
    .trim();
}

export function firstPromptParagraph(prompt: string): string {
  return prompt.split(/\n\s*\n/, 1)[0]?.trim() ?? prompt;
}

export function defineToolPromptMetadata(options: {
  promptUrl: URL;
  promptSnippet: string;
  promptGuidelines: string[];
}): ToolPromptMetadata {
  const prompt = loadPrompt(options.promptUrl);
  return {
    description: firstPromptParagraph(prompt),
    promptSnippet: options.promptSnippet,
    promptGuidelines: options.promptGuidelines,
  };
}
