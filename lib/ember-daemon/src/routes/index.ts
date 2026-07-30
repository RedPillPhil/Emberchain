import { Router } from "express";
import healthRouter       from "./health.js";
import rpcRouter          from "./rpc.js";
import syncRouter         from "./sync.js";
import chainRouter        from "./chain.js";
import walletsRouter      from "./wallets.js";
import transactionsRouter from "./transactions.js";
import miningRouter       from "./mining.js";

const router = Router();

router.use(healthRouter);
router.use(rpcRouter);
router.use(syncRouter);
router.use(chainRouter);
router.use(walletsRouter);
router.use(transactionsRouter);
router.use(miningRouter);

export default router;
