import * as z from "zod";

/** Search results returned when the client doesn't ask for a specific number. */
const DEFAULT_SEARCH_LIMIT = 500;
/** Hard cap so one request can't ask for the whole index. */
const MAX_SEARCH_LIMIT = 2000;

/** `?path=` where a missing value means the library root. */
export const folderQuery = z.object({ path: z.string().default("") });

/** A file path that must be present: favorites body/query and the peaks query. */
export const filePath = z.object({ path: z.string().min(1, "path is required") });

export const searchQuery = z.object({
  q: z
    .string()
    .default("")
    .transform((s) => s.trim()),
  folder: z
    .string()
    .optional()
    .transform((s) => s?.trim() || undefined),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .default(DEFAULT_SEARCH_LIMIT)
    .transform((n) => Math.min(n, MAX_SEARCH_LIMIT)),
});

/**
 * A folder path that is safe to store: relative, at least one segment, no
 * empty / `.` / `..` segments. The root ("") is not renameable.
 */
export const folderAliasPath = z
  .string()
  .min(1, "path is required")
  .max(500, "path is too long")
  .refine(
    // Empty is reported by `.min(1)`; don't pile a second issue on it.
    (p) =>
      p === "" ||
      (!p.startsWith("/") &&
        !p.endsWith("/") &&
        p.split("/").every((s) => s !== "" && s !== "." && s !== "..")),
    "invalid folder path",
  );

export const folderAliasBody = z.object({
  path: folderAliasPath,
  name: z.string().trim().min(1, "name is required").max(120, "name is too long"),
});

export const folderAliasQuery = z.object({ path: folderAliasPath });
