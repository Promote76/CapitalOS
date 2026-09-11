import { Router, type IRouter } from "express";
import { assertPermission } from "../domain/governance";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import { listSecFilings, retrieveSecFiling, reviewSecFiling } from "../services/sec-research";
import { RetrieveSecFilingBody, ReviewSecFilingBody } from "@workspace/api-zod";

const router: IRouter = Router();
router.get("/research/sec/filings", asyncRoute(async (_req, res) => {
  const actor = actorFrom(res); assertPermission(actor.role, "read");
  res.json(await listSecFilings(actor));
}));
router.post("/research/sec/filings", asyncRoute(async (req, res) => {
  const actor = actorFrom(res); assertPermission(actor.role, "contribute");
  const body = RetrieveSecFilingBody.parse(req.body);
  const result = await retrieveSecFiling(actor, body);
  res.status(result.alreadyCollected ? 200 : 201).json(result);
}));
router.post("/research/sec/filings/:filingId/review", asyncRoute(async (req, res) => {
  const actor = actorFrom(res); assertPermission(actor.role, "approve");
  const body = ReviewSecFilingBody.parse(req.body);
  res.json(await reviewSecFiling(actor, String(req.params.filingId), body.disposition));
}));
export default router;