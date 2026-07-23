import { Router, type IRouter } from "express";
import { proxyToNode, proxyToMiningNode } from "../lib/chain-proxy";
import healthRouter from "./health";
import contractsRouter from "./contracts";  // registers /wallets/:address/tokens FIRST
import privacyRouter from "./privacy";
import exchangeRouter from "./exchange";
import onrampRouter from "./onramp";
import communityRouter from "./community";
import bridgeRouter from "./bridge";

const router: IRouter = Router();

// ── Routes handled locally by api-server ──────────────────────────────────────

router.use(healthRouter);
router.use(contractsRouter);   // includes /wallets/:address/tokens, /tokens/*, /contracts/*
router.use(privacyRouter);
router.use(exchangeRouter);
router.use(onrampRouter);
router.use(communityRouter);
router.use(bridgeRouter);

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
// chain routes
router.get("/chain/status",                   proxyToNode);
router.get("/chain/blocks",                   proxyToNode);
router.get("/chain/blocks/:number",           proxyToNode);
// mining routes — routed to the dedicated mining node (duckdns in production)
// so miner floods never touch the local chain-node that serves the wallet.
router.get("/mining/status",                  proxyToMiningNode);
router.post("/mining/start",                  proxyToMiningNode);
router.post("/mining/stop",                   proxyToMiningNode);
router.get("/mining/template",                proxyToMiningNode);
router.post("/mining/submit",                 proxyToMiningNode);
router.post("/mining/share",                  proxyToMiningNode);
// wallet routes (excluding /wallets/:address/tokens handled by contractsRouter above)
router.post("/wallets",                       proxyToNode);
router.get("/wallets",                        proxyToNode);
router.get("/wallets/:address",               proxyToNode);
// transaction routes
router.post("/transactions",                  proxyToNode);
router.get("/transactions",                   proxyToNode);
router.get("/transactions/:hash",             proxyToNode);

export default router;
