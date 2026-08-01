import express, { type Express } from "express";
import cors from "cors";
import compression from "compression";
import { type IncomingMessage, type ServerResponse } from "node:http";
import { pinoHttp } from "pino-http";
import path from "path";
import router from "./routes";
import dexOrdersRouter from "./routes/dex-orders";
import { logger } from "./lib/logger";
import { explorerHtml } from "./explorer-html";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req: IncomingMessage) {
        return {
          id: (req as IncomingMessage & { id?: string }).id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res: ServerResponse) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// Gzip all JSON/text responses — reduces wire size significantly for order-book
// and trade-history payloads.  Mounted before routes so every response is covered.
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount dex-orders at root-level too so the Replit dev proxy works regardless
// of how many path segments it strips (some environments strip /api-server/api,
// others strip only /api-server).
app.use(dexOrdersRouter);
app.use("/api", router);

// ── Desktop-app mode ───────────────────────────────────────────────────────────
// When the Electron wrapper sets WALLET_STATIC_DIR, serve the bundled wallet UI
// from that directory and fall back to index.html for client-side routes.
const walletStaticDir = process.env.WALLET_STATIC_DIR;
if (walletStaticDir) {
  app.use(express.static(walletStaticDir));
  // SPA catch-all: any non-API GET returns index.html so wouter routing works
  app.get(/^(?!\/api)/, (_req, res) => {
    res.sendFile(path.join(walletStaticDir, "index.html"));
  });
} else {
  // ── Standalone-node mode — serve the block explorer SPA at / ─────────────────
  app.get("/", (req, res) => {
    const host = req.headers.host ?? "localhost:8545";
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(explorerHtml(host));
  });
} // end else (standalone-node mode)

export default app;
