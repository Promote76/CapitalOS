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
import treasuryRouter from "./treasury";
import accountingRouter from "./accounting";
import operationsRouter from "./operations";
import businessRouter from "./business";

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
router.use(treasuryRouter);
router.use(accountingRouter);
router.use(operationsRouter);
router.use(businessRouter);

export default router;
