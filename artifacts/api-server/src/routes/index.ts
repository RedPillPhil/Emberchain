import { Router, type IRouter } from "express";
import healthRouter from "./health";
import walletsRouter from "./wallets";
import chainRouter from "./chain";
import transactionsRouter from "./transactions";
import contractsRouter from "./contracts";
import miningRouter from "./mining";
import privacyRouter from "./privacy";
import exchangeRouter from "./exchange";
import rpcRouter from "./rpc";

const router: IRouter = Router();

router.use(healthRouter);
router.use(walletsRouter);
router.use(chainRouter);
router.use(transactionsRouter);
router.use(contractsRouter);
router.use(miningRouter);
router.use(privacyRouter);
router.use(exchangeRouter);
router.use(rpcRouter);

export default router;
