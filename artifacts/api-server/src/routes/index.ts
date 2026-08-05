import { Router, type IRouter, type Request, type Response } from "express";
import { proxyToNode, proxyReadToNode, proxyWriteToNode, proxyToLocalMining, proxyToLocalMiningRead } from "../lib/chain-proxy";
import { getMiningStatusCached } from "../lib/mining-status-cache";
import { getChainStatusCached } from "../lib/chain-status-cache";
import { getWalletCached } from "../lib/wallet-read-cache";
import healthRouter from "./health";
import contractsRouter from "./contracts";  // registers /wallets/:address/tokens FIRST
import privacyRouter from "./privacy";
import exchangeRouter from "./exchange";
import onrampRouter from "./onramp";
import communityRouter from "./community";
import bridgeRouter from "./bridge";
import dexOrdersRouter from "./dex-orders";
import tokenLaunchRouter from "./token-launch";
import mmoRouter from "./mmo";
import adminCleanupRouter from "./admin-cleanup";
import miningStatsRouter from "./mining-stats";
import chainInvadersRouter from "./chain-invaders";

const router: IRouter = Router();

// ── Root liveness probe ────────────────────────────────────────────────────────
// Replit's platform pings GET /api (the artifact base path) as a continuous
// liveness check, separate from the startup healthcheck at /api/healthz.
// Without this, Express returns 404 which the platform treats as unhealthy
// and eventually triggers a service restart.
router.get("/", (_req, res) => res.json({ status: "ok" }));

// ── Routes handled locally by api-server ──────────────────────────────────────

router.use(healthRouter);
router.use(contractsRouter);   // includes /wallets/:address/tokens, /tokens/*, /contracts/*
router.use(privacyRouter);
router.use(exchangeRouter);
router.use(onrampRouter);
router.use(communityRouter);
router.use(bridgeRouter);
router.use(dexOrdersRouter);
router.use(tokenLaunchRouter);
router.use("/mmo", mmoRouter);
router.use(adminCleanupRouter);
router.use(miningStatsRouter);
router.use(chainInvadersRouter);

// ── Block any attempt to reach chain-node internal endpoints via api-server ───
// Even though api-server doesn't proxy /internal/*, explicitly 404 these so
// that a misconfigured client or routing layer can't inadvertently reach them.
router.all("/internal/{*path}", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ── Proxy: forward chain-node routes straight through ─────────────────────────
//
// External callers (MetaMask, miners, peer nodes, desktop wallet) continue to
// use /api/rpc, /api/sync/*, /api/chain/*, /api/mining/*, /api/wallets, and
// /api/transactions — api-server forwards these to chain-node unchanged.
//
// NOTE: /wallets/:address/tokens is registered in contractsRouter above and
//       will be matched before the /wallets/:address proxy rule because Express
//       routes are evaluated in registration order and `:address` only captures
//       a single path segment (it does NOT match the extra /tokens suffix).

router.post("/rpc",                           proxyToNode);
router.get("/rpc",                            proxyToNode);
// sync routes (enumerate explicitly — Express 5 requires named wildcards)
router.get("/sync/status",                    proxyToNode);
router.get("/sync/snapshot",                  proxyToNode);
router.get("/sync/blocks",                    proxyToNode);
router.get("/sync/peers",                     proxyToNode);
router.post("/sync/peers",                    proxyToNode);
router.post("/sync/submit-block",             proxyToNode);
// chain routes — /chain/status is served from a background cache (see chain-status-cache.ts)
router.get("/chain/status", (_req: Request, res: Response) => {
  getChainStatusCached().then((data) => res.json(data)).catch(() =>
    res.status(503).json({ error: "Chain status unavailable" })
  );
});
router.get("/chain/blocks",                   proxyReadToNode);
router.get("/chain/blocks/:number",           proxyReadToNode);
// mining routes — proxied to local chain-node (server-side proxy, not redirect)
// Using proxyToLocalMining instead of redirect: the browser cannot follow a
// 307 to localhost:8082 in Replit. Server-side proxy also ensures share
// submissions hit the same node that mines blocks (correct proportional accounting).
//
// /mining/status is served from a local background-polling cache.
// The mining node (duckdns) is under heavy miner load; proxying every
// browser-tab request directly to it causes timeouts.  The cache polls
// READ_NODE_URL every 15 s and answers all browser requests instantly.
router.get("/mining/status", (_req: Request, res: Response) => {
  getMiningStatusCached().then((data) => res.json(data)).catch(() =>
    res.status(503).json({ error: "Mining status unavailable" })
  );
});
router.post("/mining/start",                  proxyToLocalMining);
router.post("/mining/stop",                   proxyToLocalMining);
router.get("/mining/template",                proxyToLocalMiningRead);
router.post("/mining/submit",                 proxyToLocalMining);
router.post("/mining/share",                  proxyToLocalMining);
// wallet routes (excluding /wallets/:address/tokens handled by contractsRouter above)
// POST stays on main node (create/register wallet); GETs go to read replica
router.post("/wallets",                       proxyWriteToNode);
router.get("/wallets",                        proxyReadToNode);
router.get("/wallets/:address", async (req: Request, res: Response) => {
  try {
    const data = await getWalletCached(req.params["address"] ?? "");
    res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("HTTP 404")) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }
    res.status(503).json({ error: "Wallet unavailable" });
  }
});
// transaction routes
// POST goes to the canonical write node; GETs go to read replica
router.post("/transactions",                  proxyWriteToNode);
router.get("/transactions",                   proxyReadToNode);
router.get("/transactions/:hash",             proxyReadToNode);

export default router;
