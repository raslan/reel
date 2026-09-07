import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";

export interface Roots {
  /** Absolute path of the libraries root (contains the library folders). */
  libraries: string;
  /** Absolute path of the writable data dir (holds reel.db). */
  data: string;
}

/**
 * Resolve the libraries and data roots. No env vars by design:
 * - explicit opts (tests/dev harnesses) win;
 * - else /libraries if present, else ./libraries (created);
 * - else /data if present and writable, else ./data (created).
 * Throws if no writable data root can be established.
 */
export async function resolveRoots(
  opts?: { libraries?: string; data?: string },
): Promise<Roots> {
  if (opts?.libraries && opts?.data) {
    await mkdir(opts.data, { recursive: true });
    return { libraries: opts.libraries, data: opts.data };
  }

  let libraries = "/libraries";
  try {
    await access(libraries, constants.R_OK);
  } catch {
    libraries = join(process.cwd(), "libraries");
    await mkdir(libraries, { recursive: true });
  }

  let data = join(process.cwd(), "data");
  try {
    await access("/data", constants.W_OK);
    data = "/data";
  } catch {
    // /data not available — fall back to ./data
  }
  await mkdir(data, { recursive: true });
  try {
    await access(data, constants.W_OK);
  } catch {
    throw new Error(`No writable data root (tried /data and ${data})`);
  }

  return { libraries, data };
}
