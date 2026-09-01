import { Router, type IRouter } from "express";
import { GetBlockchainStatusResponse } from "@workspace/api-zod";
import { asyncRoute } from "../middleware/errors";
import { getBlockchainStatus } from "../services/capital-os";

const router: IRouter = Router();

router.get("/blockchain/status", asyncRoute(async (_req, res) => {
  res.json(GetBlockchainStatusResponse.parse(getBlockchainStatus()));
}));

export default router;