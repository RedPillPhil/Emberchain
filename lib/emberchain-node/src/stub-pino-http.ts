/**
 * Minimal pino-http stub for the standalone executable build.
 * pino-http is an Express middleware that attaches a pino logger to each
 * request. In standalone mode we don't need per-request structured logs,
 * so this stub is a no-op middleware that just calls next().
 */

// Express-compatible no-op middleware
const pinoHttp: any = (_opts?: unknown) =>
  (_req: unknown, _res: unknown, next: () => void) => next();

// pino-http attaches these symbols to req/res — expose them so any code that
// reads them gets undefined rather than a crash.
pinoHttp.startTime   = Symbol("startTime");
pinoHttp.logger      = null;

export default pinoHttp;
