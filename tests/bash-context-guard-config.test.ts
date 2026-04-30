import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  BASH_CONTEXT_GUARD_DEFAULT_HEAD_LINES,
  BASH_CONTEXT_GUARD_DEFAULT_MAX_BYTES,
  BASH_CONTEXT_GUARD_DEFAULT_MAX_LINES,
  BASH_CONTEXT_GUARD_DEFAULT_TAIL_LINES,
  resolveBashContextGuardConfig,
} from "../src/rtk/bash-context-guard.js";

describe("resolveBashContextGuardConfig", () => {
  const saved = {
    enabled: process.env.PI_HASHLINE_BASH_CONTEXT_GUARD,
    maxLines: process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_LINES,
    maxBytes: process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_BYTES,
    headLines: process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_HEAD_LINES,
    tailLines: process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_TAIL_LINES,
  };

  beforeEach(() => {
    delete process.env.PI_HASHLINE_BASH_CONTEXT_GUARD;
    delete process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_LINES;
    delete process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_BYTES;
    delete process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_HEAD_LINES;
    delete process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_TAIL_LINES;
  });

  afterEach(() => {
    if (saved.enabled === undefined) delete process.env.PI_HASHLINE_BASH_CONTEXT_GUARD;
    else process.env.PI_HASHLINE_BASH_CONTEXT_GUARD = saved.enabled;
    if (saved.maxLines === undefined) delete process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_LINES;
    else process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_LINES = saved.maxLines;
    if (saved.maxBytes === undefined) delete process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_BYTES;
    else process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_BYTES = saved.maxBytes;
    if (saved.headLines === undefined) delete process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_HEAD_LINES;
    else process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_HEAD_LINES = saved.headLines;
    if (saved.tailLines === undefined) delete process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_TAIL_LINES;
    else process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_TAIL_LINES = saved.tailLines;
  });

  it("uses conservative defaults when env vars are unset", () => {
    expect(resolveBashContextGuardConfig()).toEqual({
      enabled: true,
      maxLines: 2000,
      maxBytes: 51200,
      headLines: 80,
      tailLines: 120,
    });
    expect(BASH_CONTEXT_GUARD_DEFAULT_MAX_LINES).toBe(2000);
    expect(BASH_CONTEXT_GUARD_DEFAULT_MAX_BYTES).toBe(51200);
    expect(BASH_CONTEXT_GUARD_DEFAULT_HEAD_LINES).toBe(80);
    expect(BASH_CONTEXT_GUARD_DEFAULT_TAIL_LINES).toBe(120);
  });

  it("uses valid below-default positive base-10 env values", () => {
    process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_LINES = "25";
    process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_BYTES = "1024";
    process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_HEAD_LINES = "3";
    process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_TAIL_LINES = "7";

    expect(resolveBashContextGuardConfig()).toEqual({
      enabled: true,
      maxLines: 25,
      maxBytes: 1024,
      headLines: 3,
      tailLines: 7,
    });
  });

  it("trims surrounding whitespace before parsing env values", () => {
    process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_LINES = " 25 ";
    process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_BYTES = "\t1024\n";

    expect(resolveBashContextGuardConfig().maxLines).toBe(25);
    expect(resolveBashContextGuardConfig().maxBytes).toBe(1024);
  });

  it("falls back to defaults for invalid env values", () => {
    for (const raw of ["abc", "", " ", "0", "-1", "+1", "3.14", "0x10", "1e3", "1,000", "1_000"]) {
      process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_LINES = raw;
      process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_BYTES = raw;
      process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_HEAD_LINES = raw;
      process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_TAIL_LINES = raw;

      expect(resolveBashContextGuardConfig()).toEqual({
        enabled: true,
        maxLines: 2000,
        maxBytes: 51200,
        headLines: 80,
        tailLines: 120,
      });
    }
  });

  it("clamps above-default env values to defaults", () => {
    process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_LINES = "99999";
    process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_BYTES = "104857600";
    process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_HEAD_LINES = "999";
    process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_TAIL_LINES = "999";

    expect(resolveBashContextGuardConfig()).toEqual({
      enabled: true,
      maxLines: 2000,
      maxBytes: 51200,
      headLines: 80,
      tailLines: 120,
    });
  });

  it("disables the guard only when PI_HASHLINE_BASH_CONTEXT_GUARD is exactly 0", () => {
    process.env.PI_HASHLINE_BASH_CONTEXT_GUARD = "0";
    expect(resolveBashContextGuardConfig().enabled).toBe(false);

    process.env.PI_HASHLINE_BASH_CONTEXT_GUARD = "false";
    expect(resolveBashContextGuardConfig().enabled).toBe(true);
  });

  it("re-reads env on every call", () => {
    expect(resolveBashContextGuardConfig().maxLines).toBe(2000);
    process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_LINES = "9";
    expect(resolveBashContextGuardConfig().maxLines).toBe(9);
    delete process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_LINES;
    expect(resolveBashContextGuardConfig().maxLines).toBe(2000);
  });
});
