import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface HashlineJsonSettings {
  grep?: { maxLines?: number; maxBytes?: number };
  mapCache?: { dir?: string; enabled?: boolean };
  bashContextGuard?: {
    enabled?: boolean;
    maxLines?: number;
    maxBytes?: number;
    headLines?: number;
    tailLines?: number;
  };
}

export interface HashlineSettingsWarning {
  source: string;
  message: string;
  path?: string;
}

export interface HashlineSettingsResult {
  settings: HashlineJsonSettings;
  warnings: HashlineSettingsWarning[];
}

let pathOverride: { globalSettingsPath?: string; projectSettingsPath?: string } | null = null;

export function __setHashlineSettingsPathsForTest(paths: { globalSettingsPath?: string; projectSettingsPath?: string }): void {
  pathOverride = { ...paths };
}

export function __resetHashlineSettingsPathsForTest(): void {
  pathOverride = null;
}

function defaultGlobalSettingsPath(): string {
  return join(homedir(), ".pi/agent/settings.json");
}

function defaultProjectSettingsPath(): string {
  return join(process.cwd(), ".pi/settings.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveIntegerNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function invalidWarning(source: string, path: string): HashlineSettingsWarning {
  return { source, path, message: `Invalid hashline setting at ${path}` };
}

function validatePositiveIntField(
  raw: Record<string, unknown>,
  key: string,
  path: string,
  source: string,
  warnings: HashlineSettingsWarning[],
): number | undefined {
  if (!(key in raw)) return undefined;
  const value = raw[key];
  if (isPositiveIntegerNumber(value)) return value;
  warnings.push(invalidWarning(source, path));
  return undefined;
}

function validateBooleanField(
  raw: Record<string, unknown>,
  key: string,
  path: string,
  source: string,
  warnings: HashlineSettingsWarning[],
): boolean | undefined {
  if (!(key in raw)) return undefined;
  const value = raw[key];
  if (typeof value === "boolean") return value;
  warnings.push(invalidWarning(source, path));
  return undefined;
}

function validateBlock(raw: unknown, source: string): HashlineSettingsResult {
  const out: HashlineJsonSettings = {};
  const warnings: HashlineSettingsWarning[] = [];
  if (!isRecord(raw)) return { settings: out, warnings };
  if (isRecord(raw.grep)) {
    const grep: NonNullable<HashlineJsonSettings["grep"]> = {};
    const maxLines = validatePositiveIntField(raw.grep, "maxLines", "hashlineReadmap.grep.maxLines", source, warnings);
    if (maxLines !== undefined) grep.maxLines = maxLines;
    const maxBytes = validatePositiveIntField(raw.grep, "maxBytes", "hashlineReadmap.grep.maxBytes", source, warnings);
    if (maxBytes !== undefined) grep.maxBytes = maxBytes;
    if (Object.keys(grep).length > 0) out.grep = grep;
  }
  if (isRecord(raw.mapCache)) {
    const mapCache: NonNullable<HashlineJsonSettings["mapCache"]> = {};
    if ("dir" in raw.mapCache) {
      if (typeof raw.mapCache.dir === "string" && raw.mapCache.dir.length > 0) mapCache.dir = raw.mapCache.dir;
      else warnings.push(invalidWarning(source, "hashlineReadmap.mapCache.dir"));
    }
    const enabled = validateBooleanField(raw.mapCache, "enabled", "hashlineReadmap.mapCache.enabled", source, warnings);
    if (enabled !== undefined) mapCache.enabled = enabled;
    if (Object.keys(mapCache).length > 0) out.mapCache = mapCache;
  }
  if (isRecord(raw.bashContextGuard)) {
    const bash: NonNullable<HashlineJsonSettings["bashContextGuard"]> = {};
    const enabled = validateBooleanField(raw.bashContextGuard, "enabled", "hashlineReadmap.bashContextGuard.enabled", source, warnings);
    if (enabled !== undefined) bash.enabled = enabled;
    const maxLines = validatePositiveIntField(raw.bashContextGuard, "maxLines", "hashlineReadmap.bashContextGuard.maxLines", source, warnings);
    if (maxLines !== undefined) bash.maxLines = maxLines;
    const maxBytes = validatePositiveIntField(raw.bashContextGuard, "maxBytes", "hashlineReadmap.bashContextGuard.maxBytes", source, warnings);
    if (maxBytes !== undefined) bash.maxBytes = maxBytes;
    const headLines = validatePositiveIntField(raw.bashContextGuard, "headLines", "hashlineReadmap.bashContextGuard.headLines", source, warnings);
    if (headLines !== undefined) bash.headLines = headLines;
    const tailLines = validatePositiveIntField(raw.bashContextGuard, "tailLines", "hashlineReadmap.bashContextGuard.tailLines", source, warnings);
    if (tailLines !== undefined) bash.tailLines = tailLines;
    if (Object.keys(bash).length > 0) out.bashContextGuard = bash;
  }
  return { settings: out, warnings };
}

function readSettingsFile(path: string): HashlineSettingsResult {
  if (!existsSync(path)) return { settings: {}, warnings: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    const block = isRecord(parsed) ? parsed.hashlineReadmap : undefined;
    return validateBlock(block, path);
  } catch (error) {
    return {
      settings: {},
      warnings: [{
        source: path,
        message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      }],
    };
  }
}

function mergeSettings(base: HashlineJsonSettings, override: HashlineJsonSettings): HashlineJsonSettings {
  return {
    grep: { ...(base.grep ?? {}), ...(override.grep ?? {}) },
    mapCache: { ...(base.mapCache ?? {}), ...(override.mapCache ?? {}) },
    bashContextGuard: { ...(base.bashContextGuard ?? {}), ...(override.bashContextGuard ?? {}) },
  };
}

export function resolveHashlineJsonSettings(): HashlineSettingsResult {
  const globalPath = pathOverride?.globalSettingsPath ?? defaultGlobalSettingsPath();
  const projectPath = pathOverride?.projectSettingsPath ?? defaultProjectSettingsPath();
  const globalResult = readSettingsFile(globalPath);
  const projectResult = readSettingsFile(projectPath);
  return {
    settings: mergeSettings(globalResult.settings, projectResult.settings),
    warnings: [...globalResult.warnings, ...projectResult.warnings],
  };
}
