import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Database } from "bun:sqlite";
import { openDb, setEnabledLibraries } from "../db";
import type { Roots } from "../config";
import { createBus, type EventBus } from "../events";
import { PeaksService } from "../peaks";
import type { Hono } from "hono";
import type { Server } from "bun";
import { createApp } from "../app";
import { rescanLibrary, type WalkDiff } from "../index";

/** Temp dir with cleanup. */
export async function makeTempDir(prefix: string): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

/** Create a file tree under `base` from a map of relative path → text content. */
export async function makeTempTree(base: string, files: Record<string, string>): Promise<void> {
  for (const [rel, content] of Object.entries(files)) {
    const p = join(base, rel);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, content);
  }
}

/** Write a valid PCM16 mono WAV (sine tone) — ffprobe/ffmpeg can decode it. */
export async function writeWav(path: string, seconds: number, sampleRate = 8000, freq = 440): Promise<void> {
  const n = Math.floor(seconds * sampleRate);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / sampleRate) * 12000), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.concat([header, data]));
}

/**
 * Minimal stack: temp libraries+data dirs, open db.
 * Grows with the stack — Task 6 adds `bus`, Task 7 adds `peaks`,
 * Task 8 adds the `makeStack` HTTP factory. Each addition lands in the
 * task that creates the module it imports, so the import graph always resolves.
 */
export interface StackLite {
  db: Database;
  roots: Roots;
  bus: EventBus;
  peaks: PeaksService;
  stopPeaks: () => Promise<void>;
  cleanup: () => Promise<void>;
}

export async function makeStackLite(opts?: {
  files?: Record<string, string>;
  enabled?: string[];
}): Promise<StackLite> {
  const { dir: lib, cleanup: libCleanup } = await makeTempDir("reel-lib-");
  const { dir: data, cleanup: dataCleanup } = await makeTempDir("reel-data-");
  if (opts?.files) await makeTempTree(lib, opts.files);
  const db = openDb(join(data, "reel.db"));
  const roots: Roots = { libraries: lib, data };
  const bus = createBus();
  const peaks = new PeaksService(db, roots, bus);
  if (opts?.enabled) setEnabledLibraries(db, opts.enabled);
  return {
    db,
    roots,
    bus,
    peaks,
    stopPeaks: () => peaks.stop(),
    cleanup: async () => {
      db.close();
      await libCleanup();
      await dataCleanup();
    },
  };
}

export interface Stack extends StackLite {
  app: Hono;
  server: Server<unknown>;
  base: string;
  rescan: (library: string) => Promise<WalkDiff>;
}

/* ---------- API response shapes (mirror the JSON contracts) ---------- */

export interface LibraryInfo {
  name: string;
  path: string;
  audioFiles: number;
  enabled: boolean;
}

export interface FileEntry {
  name: string;
  path: string;
  duration: number | null;
  size: number;
}

export interface SearchBody {
  files: { name: string; path: string; duration: number | null }[];
  total: number;
}

export interface FavoritesBody {
  paths: string[];
}
export interface ListBody {
  folders: { name: string; path: string }[];
  files: FileEntry[];
}

export interface LibrariesBody {
  libraries: LibraryInfo[];
}

/** Parse a Response body as JSON with the expected shape. */
export async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/** Full HTTP stack: Hono app behind Bun.serve on a random port. */
export async function makeStack(opts?: {
  files?: Record<string, string>;
  enabled?: string[];
}): Promise<Stack> {
  const lite = await makeStackLite(opts);
  const rescan = (lib: string) => rescanLibrary(lite.db, lite.roots, lib);
  const app = createApp({
    db: lite.db,
    roots: lite.roots,
    bus: lite.bus,
    peaks: lite.peaks,
    rescan,
  });
  const server = Bun.serve({ port: 0, fetch: app.fetch });
  return {
    ...lite,
    app,
    server,
    base: `http://127.0.0.1:${server.port}`,
    rescan,
    cleanup: async () => {
      server.stop(true);
      await lite.cleanup();
    },
  };
}

/** Resolve when the bus emits `event` for `path`. Subscribe before triggering the work. */
export function waitForEvent(s: StackLite, path: string, event: string): Promise<void> {
  return new Promise((resolve) => {
    const off = s.bus.subscribe((e, data) => {
      if (e === event && (data as { path: string } | undefined)?.path === path) {
        off();
        resolve();
      }
    });
  });
}
