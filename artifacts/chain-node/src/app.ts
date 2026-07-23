import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger";
import router from "./routes";

const app: Express = express();

app.use(pinoHttp({
  logger,
  serializers: {
    req(req) { return { id: req.id, method: req.method, url: req.url?.split("?")[0] }; },
    res(res) { return { statusCode: res.statusCode }; },
  },
}));
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Simple root — identifies this as the chain node when accessed directly
app.get("/", (_req, res) => {
  res.json({ service: "Emberchain Node", description: "Standalone blockchain node service. Use /api/rpc for JSON-RPC, /api/sync for peer sync." });
});

export default app;
