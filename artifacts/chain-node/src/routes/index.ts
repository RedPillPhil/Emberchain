import { Router } from "express";
import healthRouter from "./health";
import rpcRouter from "./rpc";
import syncRouter from "./sync";
import chainRouter from "./chain";
import walletsRouter from "./wallets";
import transactionsRouter from "./transactions";
import miningRouter from "./mining";
import internalRouter from "./internal";
import { requireInternalAuth } from "../lib/internal-auth";

const router = Router();

router.use(healthRouter);
router.use(rpcRouter);
router.use(syncRouter);
router.use(chainRouter);
router.use(walletsRouter);
router.use(transactionsRouter);
router.use(miningRouter);
// All /api/internal/* routes require service-to-service auth (shared bearer secret).
router.use("/internal", requireInternalAuth, internalRouter);

export default router;
