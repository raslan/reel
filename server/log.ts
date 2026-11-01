type Level = "info" | "warn" | "error";

/** One JSON object per line, so logs stay greppable and machine-parseable. */
export function log(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}

/** Log fields for a caught value (any thrown thing, not just Error). */
export function errFields(err: unknown): Record<string, unknown> {
  return err instanceof Error
    ? { error: err.message, stack: err.stack }
    : { error: String(err) };
}
