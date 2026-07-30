/**
 * Minimal pino-compatible logger stub for the standalone executable build.
 * Replaces pino at bundle time via esbuild alias so there are no worker-thread
 * issues in the pkg binary. Output goes directly to stdout/stderr.
 */

type Level = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

function fmt(level: Level, obj: unknown, msg?: string): void {
  const ts  = new Date().toISOString().slice(11, 23);
  const label = level.toUpperCase().padEnd(5);
  const text  = msg ?? (typeof obj === "string" ? obj : "");
  const extra = (msg && obj && typeof obj === "object") ? ` ${JSON.stringify(obj)}` : "";
  const out = `[${ts}] ${label} ${text}${extra}`;
  if (level === "error" || level === "fatal" || level === "warn") {
    console.error(out);
  } else {
    console.log(out);
  }
}

function makeLogger(defaultBindings: Record<string, unknown> = {}) {
  const logger = {
    trace: (obj: unknown, msg?: string) => fmt("trace", obj, msg),
    debug: (obj: unknown, msg?: string) => fmt("debug", obj, msg),
    info:  (obj: unknown, msg?: string) => fmt("info",  obj, msg),
    warn:  (obj: unknown, msg?: string) => fmt("warn",  obj, msg),
    error: (obj: unknown, msg?: string) => fmt("error", obj, msg),
    fatal: (obj: unknown, msg?: string) => fmt("fatal", obj, msg),
    child: (bindings: Record<string, unknown>) =>
      makeLogger({ ...defaultBindings, ...bindings }),
  };
  return logger;
}

// Default export — pino() call returns a logger instance
const pino: any = (opts?: unknown) => makeLogger();
pino.default     = pino;
export default pino;
export const logger = makeLogger();
