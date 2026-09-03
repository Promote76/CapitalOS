import { Router, type IRouter } from "express";
import {
  UpdateFinancingCreditProfileBody,
  UpdateFinancingDocumentBody,
  CreateFinancingLiabilityBody,
  CreateFinancingOfferBody,
  CreateFinancingPipelineEventBody,
  CreateFinancingScenarioBody,
  GetFinancingSnapshotResponse,
  UpdateFinancingCreditProfileResponse,
  UpdateFinancingDocumentResponse,
  CreateFinancingLiabilityResponse,
  CreateFinancingOfferResponse,
  CreateFinancingPipelineEventResponse,
  CreateFinancingScenarioResponse,
} from "@workspace/api-zod";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import {
  createFinancingLiability,
  createFinancingOffer,
  createFinancingScenario,
  createPipelineEvent,
  getFinancingSnapshot,
  updateFinancingCreditProfile,
  updateFinancingDocument,
} from "../services/financing";

const router: IRouter = Router();
const idempotencyKey = (req: Parameters<Parameters<typeof router.post>[1]>[0]) => req.header("Idempotency-Key") ?? "";
const pathId = (value: string | string[]) => Array.isArray(value) ? value[0] : value;

router.get("/financing", asyncRoute(async (_req, res) => {
  res.json(GetFinancingSnapshotResponse.parse(await getFinancingSnapshot(actorFrom(res))));
}));

router.post("/financing/liabilities", asyncRoute(async (req, res) => {
  const body = CreateFinancingLiabilityBody.parse(req.body);
  res.status(201).json(CreateFinancingLiabilityResponse.parse(await createFinancingLiability(actorFrom(res), {
    ...body,
    businessEntityId: body.businessEntityId ?? undefined,
    creditLimit: body.creditLimit ?? undefined,
    notes: body.notes ?? undefined,
    termMonths: body.termMonths ?? undefined,
    remainingTermMonths: body.remainingTermMonths ?? undefined,
  }, idempotencyKey(req))));
}));

router.patch("/financing/credit-profile", asyncRoute(async (req, res) => {
  const body = UpdateFinancingCreditProfileBody.parse(req.body);
  res.json(UpdateFinancingCreditProfileResponse.parse(await updateFinancingCreditProfile(actorFrom(res), {
    ...body,
    scoreAsOf: body.scoreAsOf ?? undefined,
    notes: body.notes ?? undefined,
  }, idempotencyKey(req))));
}));

router.post("/financing/scenarios", asyncRoute(async (req, res) => {
  const body = CreateFinancingScenarioBody.parse(req.body);
  res.status(201).json(CreateFinancingScenarioResponse.parse(await createFinancingScenario(actorFrom(res), {
    ...body,
    propertyCandidateId: body.propertyCandidateId ?? undefined,
  }, idempotencyKey(req))));
}));

router.post("/financing/offers", asyncRoute(async (req, res) => {
  const body = CreateFinancingOfferBody.parse(req.body);
  res.status(201).json(CreateFinancingOfferResponse.parse(await createFinancingOffer(actorFrom(res), {
    ...body,
    propertyCandidateId: body.propertyCandidateId ?? undefined,
    lenderLabel: body.lenderLabel ?? undefined,
    expirationDate: body.expirationDate ?? undefined,
    notes: body.notes ?? undefined,
  }, idempotencyKey(req))));
}));

router.post("/financing/pipeline/events", asyncRoute(async (req, res) => {
  const body = CreateFinancingPipelineEventBody.parse(req.body);
  res.status(201).json(CreateFinancingPipelineEventResponse.parse(await createPipelineEvent(actorFrom(res), {
    ...body,
    note: body.note ?? undefined,
  }, idempotencyKey(req))));
}));

router.patch("/financing/documents/:documentId", asyncRoute(async (req, res) => {
  const documentId = pathId(req.params.documentId);
  const body = UpdateFinancingDocumentBody.parse(req.body);
  res.json(UpdateFinancingDocumentResponse.parse(await updateFinancingDocument(actorFrom(res), documentId, {
    ...body,
    notes: body.notes ?? undefined,
  }, idempotencyKey(req))));
}));

export default router;