import express, { type Express } from "express";
import cors from "cors";
import { type IncomingMessage, type ServerResponse } from "node:http";
import { pinoHttp } from "pino-http";
import { logger } from "./lib/logger";
import router from "./routes";

const app: Express = express();

app.use(pinoHttp({
  logger,
  serializers: {
    req(req: IncomingMessage) { return { id: (req as IncomingMessage & { id?: string }).id, method: req.method, url: req.url?.split("?")[0] }; },
    res(res: ServerResponse) { return { statusCode: res.statusCode }; },
  },
}));
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

// In Replit's production proxy the artifact is served at /chain-node, so the
// full path arrives as /chain-node/api/... — strip the prefix so routes resolve.
const ARTIFACT_PREFIX = "/chain-node";
app.use((req, _res, next) => {
  if (req.url.startsWith(ARTIFACT_PREFIX + "/") || req.url === ARTIFACT_PREFIX) {
    req.url = req.url.slice(ARTIFACT_PREFIX.length) || "/";
  }
  next();
});

app.use("/api", router);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, "Unhandled API error");
  if (!res.headersSent) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal server error" });
  }
});

// Simple root — identifies this as the chain node when accessed directly
app.get("/", (_req, res) => {
  res.json({ service: "Emberchain Node", description: "Standalone blockchain node service. Use /api/rpc for JSON-RPC, /api/sync for peer sync." });
});

export default app;
