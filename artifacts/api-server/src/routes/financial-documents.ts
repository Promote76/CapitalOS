import { Router, type IRouter } from "express";
import {
  GetFinancialDocumentParams, GetFinancialDocumentResponse, IngestFinancialDocumentBody, IngestFinancialDocumentResponse,
  ListFinancialDocumentsResponse, ListFinancialReviewQueueResponse, RequestFinancialDocumentUploadUrlBody,
  RequestFinancialDocumentUploadUrlResponse, ReviewFinancialDocumentBody, ReviewFinancialDocumentResponse,
  ReviewBankStatementTransactionBody, ReviewBankStatementTransactionParams, ReviewBankStatementTransactionResponse,
  DecideBankStatementTransactionCategoryBody, DecideBankStatementTransactionCategoryParams, DecideBankStatementTransactionCategoryResponse,
  PreviewBankStatementTransactionMatchParams, PreviewBankStatementTransactionMatchResponse,
  ImportBankStatementTransactionBody, ImportBankStatementTransactionHeader, ImportBankStatementTransactionParams, ImportBankStatementTransactionResponse,
  LinkBankStatementTransactionBody, LinkBankStatementTransactionHeader, LinkBankStatementTransactionParams, LinkBankStatementTransactionResponse,
  UnlinkBankStatementTransactionBody, UnlinkBankStatementTransactionHeader, UnlinkBankStatementTransactionParams, UnlinkBankStatementTransactionResponse,
  ReverseBankStatementTransactionImportBody, ReverseBankStatementTransactionImportHeader, ReverseBankStatementTransactionImportParams, ReverseBankStatementTransactionImportResponse,
  GetBankStatementTransactionInclusionParams, GetBankStatementTransactionInclusionResponse,
  ReconcileBankStatementTransactionInclusionBody, ReconcileBankStatementTransactionInclusionHeader, ReconcileBankStatementTransactionInclusionParams, ReconcileBankStatementTransactionInclusionResponse,
  DecideFinancialDocumentTypeBody, DecideFinancialDocumentTypeParams, DecideFinancialDocumentTypeResponse,
  RunFinancialDocumentTypeDetectionBody, RunFinancialDocumentTypeDetectionParams, RunFinancialDocumentTypeDetectionResponse,
  ReviewFinancialDocumentIdentityBody, ReviewFinancialDocumentIdentityParams, ReviewFinancialDocumentIdentityResponse,
  LinkFinancialDocumentBusinessBody, LinkFinancialDocumentBusinessParams, LinkFinancialDocumentBusinessResponse,
  DeleteFinancialDocumentEvidenceBody, DeleteFinancialDocumentEvidenceParams, DeleteFinancialDocumentEvidenceResponse,
  GetFinancialDocumentDeletionPreflightParams, GetFinancialDocumentDeletionPreflightResponse,
  GetFinancialEvidenceResetPreflightResponse, ResetFinancialEvidenceBody, ResetFinancialEvidenceResponse,
} from "@workspace/api-zod";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import { decideBankStatementTransactionCategory, decideFinancialDocumentType, getBankStatementTransactionInclusion, getFinancialDocument, importBankStatementTransaction, ingestFinancialDocument, linkBankStatementTransaction, linkFinancialDocumentBusiness, listFinancialDocuments, listFinancialReviewQueue, previewBankStatementTransactionMatch, reconcileBankStatementTransactionInclusion, requestFinancialDocumentUploadUrl, reverseBankStatementTransactionImport, reviewBankStatementTransaction, reviewFinancialDocument, reviewFinancialDocumentIdentity, runFinancialDocumentTypeDetection, unlinkBankStatementTransaction } from "../services/financial-documents";
import { deleteFinancialDocumentEvidence, getFinancialDocumentDeletionPreflight, getFinancialEvidenceResetPreflight, resetFinancialEvidence } from "../services/financial-evidence-deletion";

const router: IRouter = Router();
router.get("/financial-documents", asyncRoute(async (_req, res) => res.json(ListFinancialDocumentsResponse.parse(await listFinancialDocuments(actorFrom(res))))));
router.post("/financial-documents/upload-url", asyncRoute(async (req, res) => res.json(RequestFinancialDocumentUploadUrlResponse.parse(await requestFinancialDocumentUploadUrl(actorFrom(res), RequestFinancialDocumentUploadUrlBody.parse(req.body))))));
router.post("/financial-documents/ingest", asyncRoute(async (req, res) => res.status(201).json(IngestFinancialDocumentResponse.parse(await ingestFinancialDocument(actorFrom(res), IngestFinancialDocumentBody.parse(req.body))))));
router.get("/financial-documents/review-queue", asyncRoute(async (_req, res) => res.json(ListFinancialReviewQueueResponse.parse(await listFinancialReviewQueue(actorFrom(res))))));
router.get("/financial-documents/deletion-preflight", asyncRoute(async (_req, res) => {
  res.json(GetFinancialEvidenceResetPreflightResponse.parse(await getFinancialEvidenceResetPreflight(actorFrom(res))));
}));
router.post("/financial-documents/reset", asyncRoute(async (req, res) => {
  res.json(ResetFinancialEvidenceResponse.parse(await resetFinancialEvidence(actorFrom(res), ResetFinancialEvidenceBody.parse(req.body))));
}));
router.get("/financial-documents/:documentId/deletion-preflight", asyncRoute(async (req, res) => {
  const { documentId } = GetFinancialDocumentDeletionPreflightParams.parse(req.params);
  res.json(GetFinancialDocumentDeletionPreflightResponse.parse(await getFinancialDocumentDeletionPreflight(actorFrom(res), documentId)));
}));
router.post("/financial-documents/:documentId/delete-evidence", asyncRoute(async (req, res) => {
  const { documentId } = DeleteFinancialDocumentEvidenceParams.parse(req.params);
  res.json(DeleteFinancialDocumentEvidenceResponse.parse(await deleteFinancialDocumentEvidence(actorFrom(res), documentId, DeleteFinancialDocumentEvidenceBody.parse(req.body))));
}));
router.get("/financial-documents/:documentId", asyncRoute(async (req, res) => { const { documentId } = GetFinancialDocumentParams.parse(req.params); res.json(GetFinancialDocumentResponse.parse(await getFinancialDocument(actorFrom(res), documentId))); }));
router.post("/financial-documents/:documentId/review", asyncRoute(async (req, res) => { const { documentId } = GetFinancialDocumentParams.parse(req.params); res.json(ReviewFinancialDocumentResponse.parse(await reviewFinancialDocument(actorFrom(res), documentId, ReviewFinancialDocumentBody.parse(req.body)))); }));
router.post("/financial-documents/:documentId/detect-type", asyncRoute(async (req, res) => {
  const { documentId } = RunFinancialDocumentTypeDetectionParams.parse(req.params);
  res.json(RunFinancialDocumentTypeDetectionResponse.parse(await runFinancialDocumentTypeDetection(actorFrom(res), documentId, RunFinancialDocumentTypeDetectionBody.parse(req.body))));
}));
router.post("/financial-documents/:documentId/type-decision", asyncRoute(async (req, res) => {
  const { documentId } = DecideFinancialDocumentTypeParams.parse(req.params);
  res.json(DecideFinancialDocumentTypeResponse.parse(await decideFinancialDocumentType(actorFrom(res), documentId, DecideFinancialDocumentTypeBody.parse(req.body))));
}));
router.post("/financial-documents/:documentId/identity-review", asyncRoute(async (req, res) => {
  const { documentId } = ReviewFinancialDocumentIdentityParams.parse(req.params);
  res.json(ReviewFinancialDocumentIdentityResponse.parse(await reviewFinancialDocumentIdentity(actorFrom(res), documentId, ReviewFinancialDocumentIdentityBody.parse(req.body))));
}));
router.post("/financial-documents/:documentId/business-link", asyncRoute(async (req, res) => {
  const params = LinkFinancialDocumentBusinessParams.parse(req.params);
  res.json(LinkFinancialDocumentBusinessResponse.parse(await linkFinancialDocumentBusiness(actorFrom(res), params.documentId, LinkFinancialDocumentBusinessBody.parse(req.body))));
}));
router.post("/bank-statement-transactions/:transactionId/review", asyncRoute(async (req, res) => {
  const { transactionId } = ReviewBankStatementTransactionParams.parse(req.params);
  res.json(ReviewBankStatementTransactionResponse.parse(await reviewBankStatementTransaction(actorFrom(res), transactionId, ReviewBankStatementTransactionBody.parse(req.body))));
}));
router.post("/bank-statement-transactions/:transactionId/category-decision", asyncRoute(async (req, res) => {
  const { transactionId } = DecideBankStatementTransactionCategoryParams.parse(req.params);
  res.json(DecideBankStatementTransactionCategoryResponse.parse(await decideBankStatementTransactionCategory(actorFrom(res), transactionId, DecideBankStatementTransactionCategoryBody.parse(req.body))));
}));
router.get("/bank-statement-transactions/:transactionId/inclusion", asyncRoute(async (req, res) => {
  const { transactionId } = GetBankStatementTransactionInclusionParams.parse(req.params);
  res.json(GetBankStatementTransactionInclusionResponse.parse(await getBankStatementTransactionInclusion(actorFrom(res), transactionId)));
}));
router.post("/bank-statement-transactions/:transactionId/inclusion/reconcile", asyncRoute(async (req, res) => {
  const { transactionId } = ReconcileBankStatementTransactionInclusionParams.parse(req.params); const body = bodyWithHeader(ReconcileBankStatementTransactionInclusionBody.parse(req.body), req.headers, ReconcileBankStatementTransactionInclusionHeader);
  res.json(ReconcileBankStatementTransactionInclusionResponse.parse(await reconcileBankStatementTransactionInclusion(actorFrom(res), transactionId, body)));
}));
router.post("/bank-statement-transactions/:transactionId/match-preview", asyncRoute(async (req, res) => {
  const { transactionId } = PreviewBankStatementTransactionMatchParams.parse(req.params);
  res.json(PreviewBankStatementTransactionMatchResponse.parse(await previewBankStatementTransactionMatch(actorFrom(res), transactionId)));
}));
function bodyWithHeader<T extends { idempotencyKey: string }>(body: T, headers: unknown, schema: { parse(value: unknown): { "Idempotency-Key": string } }) {
  const incoming = headers as Record<string, string | string[] | undefined>;
  const header = schema.parse({ "Idempotency-Key": incoming["idempotency-key"] ?? incoming["Idempotency-Key"] })["Idempotency-Key"];
  if (header !== body.idempotencyKey) throw new Error("Idempotency-Key header must match request body");
  return body;
}
router.post("/bank-statement-transactions/:transactionId/import", asyncRoute(async (req, res) => {
  const { transactionId } = ImportBankStatementTransactionParams.parse(req.params); const body = bodyWithHeader(ImportBankStatementTransactionBody.parse(req.body), req.headers, ImportBankStatementTransactionHeader);
  res.status(201).json(ImportBankStatementTransactionResponse.parse(await importBankStatementTransaction(actorFrom(res), transactionId, body)));
}));
router.post("/bank-statement-transactions/:transactionId/link", asyncRoute(async (req, res) => {
  const { transactionId } = LinkBankStatementTransactionParams.parse(req.params); const body = bodyWithHeader(LinkBankStatementTransactionBody.parse(req.body), req.headers, LinkBankStatementTransactionHeader);
  res.json(LinkBankStatementTransactionResponse.parse(await linkBankStatementTransaction(actorFrom(res), transactionId, body)));
}));
router.post("/bank-statement-transactions/:transactionId/unlink", asyncRoute(async (req, res) => {
  const { transactionId } = UnlinkBankStatementTransactionParams.parse(req.params); const body = bodyWithHeader(UnlinkBankStatementTransactionBody.parse(req.body), req.headers, UnlinkBankStatementTransactionHeader);
  res.json(UnlinkBankStatementTransactionResponse.parse(await unlinkBankStatementTransaction(actorFrom(res), transactionId, body)));
}));
router.post("/bank-statement-transactions/:transactionId/reverse", asyncRoute(async (req, res) => {
  const { transactionId } = ReverseBankStatementTransactionImportParams.parse(req.params); const body = bodyWithHeader(ReverseBankStatementTransactionImportBody.parse(req.body), req.headers, ReverseBankStatementTransactionImportHeader);
  res.json(ReverseBankStatementTransactionImportResponse.parse(await reverseBankStatementTransactionImport(actorFrom(res), transactionId, body)));
}));
export default router;