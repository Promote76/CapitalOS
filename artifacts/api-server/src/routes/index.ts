import { Router, type IRouter } from "express";
import healthRouter from "./health";
import householdRouter from "./household";
import dashboardRouter from "./dashboard";
import capitalRouter from "./capital";
import planningRouter from "./planning";
import governanceRouter from "./governance";
import blockchainRouter from "./blockchain";
import reportsRouter from "./reports";

const router: IRouter = Router();

router.use(healthRouter);
router.use(householdRouter);
router.use(dashboardRouter);
router.use(capitalRouter);
router.use(planningRouter);
router.use(governanceRouter);
router.use(blockchainRouter);
router.use(reportsRouter);

export default router;
