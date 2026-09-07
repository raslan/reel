import { describe, expect, test } from "bun:test";
import { access, constants, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveRoots } from "../config";

describe("resolveRoots", () => {
  test("explicit opts win and the data dir is created", async () => {
    const base = await mkdtemp(join(tmpdir(), "reel-roots-"));
    try {
      const lib = join(base, "lib");
      const data = join(base, "data", "nested");
      await mkdir(lib, { recursive: true });
      const roots = await resolveRoots({ libraries: lib, data });
      expect(roots.libraries).toBe(lib);
      expect(roots.data).toBe(data);
      await access(data, constants.W_OK); // exists and writable
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("explicit opts work even when the data dir is deeply nested and missing", async () => {
    const base = await mkdtemp(join(tmpdir(), "reel-roots-"));
    try {
      const lib = join(base, "lib");
      await mkdir(lib, { recursive: true });
      const roots = await resolveRoots({ libraries: lib, data: join(base, "a", "b", "c") });
      expect(roots.data).toBe(join(base, "a", "b", "c"));
      await access(roots.data, constants.W_OK);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
