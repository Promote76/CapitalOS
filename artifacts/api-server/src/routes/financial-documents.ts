import { Router, type IRouter } from "express";
import {
  GetFinancialDocumentParams, GetFinancialDocumentResponse, IngestFinancialDocumentBody, IngestFinancialDocumentResponse,
  ListFinancialDocumentsResponse, ListFinancialReviewQueueResponse, RequestFinancialDocumentUploadUrlBody,
  RequestFinancialDocumentUploadUrlResponse, ReviewFinancialDocumentBody, ReviewFinancialDocumentResponse,
  ReviewBankStatementTransactionBody, ReviewBankStatementTransactionParams, ReviewBankStatementTransactionResponse,
} from "@workspace/api-zod";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import { getFinancialDocument, ingestFinancialDocument, listFinancialDocuments, listFinancialReviewQueue, requestFinancialDocumentUploadUrl, reviewBankStatementTransaction, reviewFinancialDocument } from "../services/financial-documents";

const router: IRouter = Router();
router.get("/financial-documents", asyncRoute(async (_req, res) => res.json(ListFinancialDocumentsResponse.parse(await listFinancialDocuments(actorFrom(res))))));
router.post("/financial-documents/upload-url", asyncRoute(async (req, res) => res.json(RequestFinancialDocumentUploadUrlResponse.parse(await requestFinancialDocumentUploadUrl(actorFrom(res), RequestFinancialDocumentUploadUrlBody.parse(req.body))))));
router.post("/financial-documents/ingest", asyncRoute(async (req, res) => res.status(201).json(IngestFinancialDocumentResponse.parse(await ingestFinancialDocument(actorFrom(res), IngestFinancialDocumentBody.parse(req.body))))));
router.get("/financial-documents/review-queue", asyncRoute(async (_req, res) => res.json(ListFinancialReviewQueueResponse.parse(await listFinancialReviewQueue(actorFrom(res))))));
router.get("/financial-documents/:documentId", asyncRoute(async (req, res) => { const { documentId } = GetFinancialDocumentParams.parse(req.params); res.json(GetFinancialDocumentResponse.parse(await getFinancialDocument(actorFrom(res), documentId))); }));
router.post("/financial-documents/:documentId/review", asyncRoute(async (req, res) => { const { documentId } = GetFinancialDocumentParams.parse(req.params); res.json(ReviewFinancialDocumentResponse.parse(await reviewFinancialDocument(actorFrom(res), documentId, ReviewFinancialDocumentBody.parse(req.body)))); }));
router.post("/bank-statement-transactions/:transactionId/review", asyncRoute(async (req, res) => {
  const { transactionId } = ReviewBankStatementTransactionParams.parse(req.params);
  res.json(ReviewBankStatementTransactionResponse.parse(await reviewBankStatementTransaction(actorFrom(res), transactionId, ReviewBankStatementTransactionBody.parse(req.body))));
}));
export default router;