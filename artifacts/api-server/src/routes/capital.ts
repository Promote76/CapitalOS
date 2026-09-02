import { Router, type IRouter } from "express";
import {
  CreateContributionBody,
  CreateContributionHeader,
  CreateContributionResponse,
  CreateTransferBody,
  CreateTransferHeader,
  CreateTransferResponse,
  GetPortfolioResponse,
  ListAccountsResponse,
  ListContributionsResponse,
  ListGoalsResponse,
  PreviewAllocationImpactBody,
  PreviewAllocationImpactResponse,
  UpdateAllocationResponse,
} from "@workspace/api-zod";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import {
  createTransfer,
  getAccounts,
  getContributions,
  getGoals,
  getPortfolio,
  previewAllocation,
  recordContribution,
  updateAllocation,
} from "../services/capital-os";

const router: IRouter = Router();

router.get("/accounts", asyncRoute(async (_req, res) => {
  res.json(ListAccountsResponse.parse(await getAccounts(actorFrom(res))));
}));

router.get("/goals", asyncRoute(async (_req, res) => {
  res.json(ListGoalsResponse.parse(await getGoals()));
}));

router.get("/contributions", asyncRoute(async (_req, res) => {
  res.json(ListContributionsResponse.parse(await getContributions()));
}));

router.post("/contributions", asyncRoute(async (req, res) => {
  const body = CreateContributionBody.parse(req.body);
  const headers = CreateContributionHeader.parse({ "Idempotency-Key": req.header("Idempotency-Key") });
  res.status(201).json(CreateContributionResponse.parse(await recordContribution(actorFrom(res), body, headers["Idempotency-Key"])));
}));

router.post("/transfers", asyncRoute(async (req, res) => {
  const body = CreateTransferBody.parse(req.body);
  const headers = CreateTransferHeader.parse({ "Idempotency-Key": req.header("Idempotency-Key") });
  res.status(201).json(CreateTransferResponse.parse(await createTransfer(actorFrom(res), body, headers["Idempotency-Key"])));
}));

router.post("/allocations/impact", asyncRoute(async (req, res) => {
  const body = PreviewAllocationImpactBody.parse(req.body);
  res.json(PreviewAllocationImpactResponse.parse(await previewAllocation(body)));
}));

router.put("/allocations", asyncRoute(async (req, res) => {
  const body = PreviewAllocationImpactBody.parse(req.body);
  res.json(UpdateAllocationResponse.parse(await updateAllocation(actorFrom(res), body)));
}));

router.get("/portfolio", asyncRoute(async (_req, res) => {
  res.json(GetPortfolioResponse.parse(await getPortfolio()));
}));

export default router;