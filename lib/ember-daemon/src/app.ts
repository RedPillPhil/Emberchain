import express, { type Express } from "express";
import cors from "cors";
import { type IncomingMessage, type ServerResponse } from "node:http";
import { pinoHttp } from "pino-http";
import { logger } from "./lib/logger.js";
import router from "./routes/index.js";

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

// No path-prefix stripping needed — this is a standalone node, not a Replit artifact
app.use("/api", router);

app.get("/", (_req, res) => {
  res.json({
    service: "Emberchain Node",
    version: "1.0.0",
    description: "Standalone blockchain daemon. Use /api/rpc for JSON-RPC (MetaMask compatible), /api/sync for peer sync.",
  });
});

export default app;
