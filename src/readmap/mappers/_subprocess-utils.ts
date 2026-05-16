import { execFile, type ExecFileOptionsWithStringEncoding } from "node:child_process";
import { readFile } from "node:fs/promises";

export interface ExecFileSafeOptions {
  cwd?: string;
  signal?: AbortSignal;
  timeout?: number;
  maxBuffer?: number;
}

export interface ExecFileSafeResult {
  stdout: string;
  stderr: string;
}

export function execFileSafe(
  command: string,
  args: string[],
  options: ExecFileSafeOptions = {}
): Promise<ExecFileSafeResult> {
  return new Promise((resolve, reject) => {
    const execOptions: ExecFileOptionsWithStringEncoding = {
      ...options,
      encoding: "utf8",
    };

    execFile(command, args, execOptions, (error, stdout, stderr) => {
      if (error) {
        (error as NodeJS.ErrnoException & { stdout?: string; stderr?: string }).stdout = stdout;
        (error as NodeJS.ErrnoException & { stdout?: string; stderr?: string }).stderr = stderr;
        reject(error);
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

export async function countLinesWcStyle(
  filePath: string,
  signal?: AbortSignal
): Promise<number> {
  const buffer = await readFile(filePath, { signal });
  let lines = 0;

  for (const byte of buffer) {
    if (byte === 0x0a) {
      lines += 1;
    }
  }

  return lines;
}
