import { Router, type IRouter } from "express";
import healthRouter from "./health";
import walletsRouter from "./wallets";
import chainRouter from "./chain";
import transactionsRouter from "./transactions";
import contractsRouter from "./contracts";
import miningRouter from "./mining";
import privacyRouter from "./privacy";

const router: IRouter = Router();

router.use(healthRouter);
router.use(walletsRouter);
router.use(chainRouter);
router.use(transactionsRouter);
router.use(contractsRouter);
router.use(miningRouter);
router.use(privacyRouter);

export default router;
