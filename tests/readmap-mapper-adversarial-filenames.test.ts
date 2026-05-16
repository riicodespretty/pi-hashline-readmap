import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ctagsMapper } from "../src/readmap/mappers/ctags.js";
import { fallbackMapper } from "../src/readmap/mappers/fallback.js";
import { goMapper } from "../src/readmap/mappers/go.js";
import { jsonMapper } from "../src/readmap/mappers/json.js";
import { pythonMapper } from "../src/readmap/mappers/python.js";

type MapperCase = {
  name: string;
  extension: string;
  content: string;
  mapper: (filePath: string) => Promise<unknown>;
};

const mapperCases: MapperCase[] = [
  {
    name: "python",
    extension: ".py",
    content: "def hello():\n    return 'world'\n",
    mapper: pythonMapper,
  },
  {
    name: "go",
    extension: ".go",
    content: "package main\n\nfunc main() {}\n",
    mapper: goMapper,
  },
  {
    name: "json",
    extension: ".json",
    content: '{"hello":"world"}\n',
    mapper: jsonMapper,
  },
  {
    name: "fallback",
    extension: ".txt",
    content: "function hello() {}\n",
    mapper: fallbackMapper,
  },
  {
    name: "ctags",
    extension: ".rb",
    content: "def hello\nend\n",
    mapper: ctagsMapper,
  },
];

const hostileFragments = [
  'double"quote',
  "single'quote",
  "semicolon;touch pwn",
  "command$(touch pwn)",
  "backtick`touch pwn`",
  "newline\ntouch pwn",
  "unicode\u00A0touch\u00A0pwn",
];

describe("readmap mapper adversarial filenames", () => {
  it("does not execute shell syntax from hostile filenames across mapper entry points", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "readmap-adversarial-filenames-"));
    const originalCwd = process.cwd();

    try {
      process.chdir(tempDir);

      for (const mapperCase of mapperCases) {
        for (const fragment of hostileFragments) {
          const fileName = `${mapperCase.name}-${fragment}${mapperCase.extension}`;
          await writeFile(fileName, mapperCase.content);

          await mapperCase.mapper(fileName);

          expect(existsSync("pwn"), `${mapperCase.name}: ${JSON.stringify(fragment)}`).toBe(false);
        }
      }
    } finally {
      process.chdir(originalCwd);
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
