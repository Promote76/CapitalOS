import { Router, type IRouter } from "express";
import householdRouter from "./household";
import dashboardRouter from "./dashboard";
import capitalRouter from "./capital";
import planningRouter from "./planning";
import governanceRouter from "./governance";
import blockchainRouter from "./blockchain";
import reportsRouter from "./reports";
import financeRouter from "./finance";
import intelligenceRouter from "./intelligence";
import strategyLabRouter from "./strategy-lab";
import microLiveRouter from "./micro-live";

const router: IRouter = Router();

router.use(householdRouter);
router.use(dashboardRouter);
router.use(capitalRouter);
router.use(planningRouter);
router.use(governanceRouter);
router.use(blockchainRouter);
router.use(reportsRouter);
router.use(financeRouter);
router.use(intelligenceRouter);
router.use(strategyLabRouter);
router.use(microLiveRouter);

export default router;
