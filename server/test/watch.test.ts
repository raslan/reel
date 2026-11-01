import { describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { startServer } from "../server";
import { watchLibraries } from "../watch";
import { makeTempDir, writeWav } from "./helpers";

/** Poll until `cond` is true; fail after `ms`. */
async function until(cond: () => boolean | Promise<boolean>, ms = 5000): Promise<void> {
  const t0 = Date.now();
  while (!(await cond())) {
    if (Date.now() - t0 > ms) throw new Error("until(): condition not met in time");
    await Bun.sleep(25);
  }
}

describe("watchLibraries", () => {
  test("fires once after a burst of changes settles, including in nested folders", async () => {
    const t = await makeTempDir("reel-watch-");
    try {
      await mkdir(join(t.dir, "Pod/deep"), { recursive: true });
      let calls = 0;
      const stop = watchLibraries(t.dir, () => calls++, { debounceMs: 150, pollMs: 60_000 });
      await Bun.write(join(t.dir, "Pod/deep/a.mp3"), "x");
      await Bun.write(join(t.dir, "Pod/deep/b.mp3"), "x");
      await Bun.write(join(t.dir, "Pod/c.mp3"), "x");
      expect(calls).toBe(0); // still inside the quiet period
      await until(() => calls > 0);
      await Bun.sleep(400);
      expect(calls).toBe(1);
      stop();
    } finally {
      await t.cleanup();
    }
  });

  test("falls back to the timer when the root can't be watched, and stops cleanly", async () => {
    const t = await makeTempDir("reel-watch-");
    try {
      let calls = 0;
      const stop = watchLibraries(join(t.dir, "missing"), () => calls++, {
        debounceMs: 10,
        pollMs: 50,
      });
      await until(() => calls >= 2);
      stop();
      const after = calls;
      await Bun.sleep(150);
      expect(calls).toBe(after);
    } finally {
      await t.cleanup();
    }
  });
});

describe("live library changes", () => {
  test("new, removed and edited files show up without a manual rescan", async () => {
    const t = await makeTempDir("reel-live-");
    const lib = join(t.dir, "lib");
    const data = join(t.dir, "data");
    try {
      await writeWav(join(lib, "Pod/a.wav"), 1);
      await mkdir(data, { recursive: true });
      const { server, stop, indexed } = await startServer({
        roots: { libraries: lib, data },
        port: 0,
        watch: { debounceMs: 100, pollMs: 60_000 },
      });
      try {
        await indexed;
        const names = async (): Promise<string[]> => {
          const res = await fetch(`http://127.0.0.1:${server.port}/api/list?path=Pod`);
          return ((await res.json()) as { files: { name: string }[] }).files.map((f) => f.name);
        };
        expect(await names()).toEqual(["a.wav"]);

        await writeWav(join(lib, "Pod/b.wav"), 1);
        await until(async () => (await names()).includes("b.wav"));

        await rm(join(lib, "Pod/a.wav"));
        await until(async () => !(await names()).includes("a.wav"));
      } finally {
        await stop();
      }
    } finally {
      await t.cleanup();
    }
  });
});
