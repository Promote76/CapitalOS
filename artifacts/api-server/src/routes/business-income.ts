import { Router, type IRouter } from "express";
import {
  ApproveBusinessOwnerDrawBody,
  ApproveBusinessOwnerDrawParams,
  ApproveBusinessOwnerDrawResponse,
  CreateBusinessCashPositionBody,
  CreateBusinessCashPositionResponse,
  CreateBusinessOwnerDrawBody,
  CreateBusinessOwnerDrawResponse,
  CreateBusinessProfitLossBody,
  CreateBusinessProfitLossResponse,
  CreateBusinessSettlementBody,
  CreateBusinessSettlementResponse,
  IngestBusinessIncomeDocumentBody,
  IngestBusinessIncomeDocumentResponse,
  RequestBusinessIncomeDocumentUploadUrlBody,
  RequestBusinessIncomeDocumentUploadUrlResponse,
  GetBusinessIncomeIntelligenceResponse,
  MatchBusinessSettlementCashParams,
  MatchBusinessSettlementCashResponse,
  ReconcileBusinessIncomePeriodBody,
  ReconcileBusinessIncomePeriodResponse,
} from "@workspace/api-zod";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import {
  approveOwnerDrawProposal,
  createBusinessCashPosition,
  createOwnerDrawProposal,
  createProfitLossDocument,
  createSettlementDocument,
  getBusinessIncomeIntelligence,
  matchBusinessSettlementCash,
  reconcileBusinessIncomePeriod,
  ingestBusinessIncomeDocument,
  requestBusinessIncomeDocumentUploadUrl,
} from "../services/business-income";

const router: IRouter = Router();

router.get("/business/income-intelligence", asyncRoute(async (_req, res) => {
  res.json(GetBusinessIncomeIntelligenceResponse.parse(await getBusinessIncomeIntelligence(actorFrom(res))));
}));

router.post("/business/income/documents/upload-url", asyncRoute(async (req, res) => {
  const body = RequestBusinessIncomeDocumentUploadUrlBody.parse(req.body);
  res.json(RequestBusinessIncomeDocumentUploadUrlResponse.parse(await requestBusinessIncomeDocumentUploadUrl(actorFrom(res), body)));
}));

router.post("/business/income/documents/ingest", asyncRoute(async (req, res) => {
  const body = IngestBusinessIncomeDocumentBody.parse(req.body);
  res.status(201).json(IngestBusinessIncomeDocumentResponse.parse(await ingestBusinessIncomeDocument(actorFrom(res), body)));
}));

router.post("/business/income/settlements", asyncRoute(async (req, res) => {
  const body = CreateBusinessSettlementBody.parse(req.body);
  res.status(201).json(CreateBusinessSettlementResponse.parse(await createSettlementDocument(actorFrom(res), body)));
}));

router.post("/business/income/profit-loss", asyncRoute(async (req, res) => {
  const body = CreateBusinessProfitLossBody.parse(req.body);
  res.status(201).json(CreateBusinessProfitLossResponse.parse(await createProfitLossDocument(actorFrom(res), body)));
}));

router.post("/business/income/reconcile", asyncRoute(async (req, res) => {
  const body = ReconcileBusinessIncomePeriodBody.parse(req.body);
  res.status(201).json(ReconcileBusinessIncomePeriodResponse.parse(await reconcileBusinessIncomePeriod(actorFrom(res), body)));
}));

router.post("/business/income/settlements/:settlementId/cash-match", asyncRoute(async (req, res) => {
  const params = MatchBusinessSettlementCashParams.parse(req.params);
  res.json(MatchBusinessSettlementCashResponse.parse(await matchBusinessSettlementCash(actorFrom(res), params.settlementId)));
}));

router.post("/business/income/cash-position", asyncRoute(async (req, res) => {
  const body = CreateBusinessCashPositionBody.parse(req.body);
  res.status(201).json(CreateBusinessCashPositionResponse.parse(await createBusinessCashPosition(actorFrom(res), body)));
}));

router.post("/business/income/owner-draws", asyncRoute(async (req, res) => {
  const body = CreateBusinessOwnerDrawBody.parse(req.body);
  res.status(201).json(CreateBusinessOwnerDrawResponse.parse(await createOwnerDrawProposal(actorFrom(res), body)));
}));

router.post("/business/income/owner-draws/:proposalId/approve", asyncRoute(async (req, res) => {
  const params = ApproveBusinessOwnerDrawParams.parse(req.params);
  const body = ApproveBusinessOwnerDrawBody.parse(req.body);
  res.json(ApproveBusinessOwnerDrawResponse.parse(await approveOwnerDrawProposal(actorFrom(res), params.proposalId, body)));
}));

export default router;