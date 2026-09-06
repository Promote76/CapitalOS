import { Router, type IRouter } from "express";
import {
  CreateManualFinancialAccountBody,
  CreateManualFinancialAccountResponse,
  GetBankingStatusResponse,
  GetBudgetResponse,
  GetCashFlowResponse,
  GetFinanceInsightsResponse,
  GetSafeToDeployResponse,
  ImportFinancialAccountCsvBody,
  ImportFinancialAccountCsvResponse,
  CreateManualFinanceTransactionBody,
  CreateManualFinanceTransactionResponse,
  CreateBillBody,
  CreateBillResponse,
  UpdateBillBody,
  UpdateBillResponse,
  PauseBillResponse,
  ResumeBillResponse,
  CreateUpcomingExpenseBody,
  CreateUpcomingExpenseResponse,
  UpdateUpcomingExpenseBody,
  UpdateUpcomingExpenseResponse,
  PauseUpcomingExpenseResponse,
  ResumeUpcomingExpenseResponse,
  CreateIncomeSourceBody,
  CreateIncomeSourceResponse,
  UpdateIncomeSourceBody,
  UpdateIncomeSourceResponse,
  PauseIncomeSourceResponse,
  ResumeIncomeSourceResponse,
  ListBillsResponse,
  ListFinancialAccountsResponse,
  ListIncomeSourcesResponse,
  ListUpcomingExpensesResponse,
  ReviewFinancialTransactionBody,
  ListTransactionReviewQueueResponse,
  ReviewFinancialTransactionResponse,
  ListReadOnlyBankConnectionsResponse,
  CreateReadOnlyBankConnectionBody,
  CreateReadOnlyBankConnectionResponse,
  LinkReadOnlyBankAccountBody,
  LinkReadOnlyBankAccountResponse,
  SyncReadOnlyBankConnectionResponse,
  RevokeReadOnlyBankConnectionResponse,
  ExportReadOnlyBankConnectionResponse,
  DeleteReadOnlyBankConnectionDataResponse,
  GetBudgetPlanningPeriodResponse,
  CreateBudgetPlanningCategoryBody,
  CreateBudgetPlanningCategoryResponse,
  UpdateBudgetPlanningCategoryBody,
  UpdateBudgetPlanningCategoryResponse,
  ApproveBudgetPlanningPeriodBody,
  ApproveBudgetPlanningPeriodResponse,
  ReorderBudgetPlanningCategoriesBody,
  CloseBudgetPlanningPeriodBody,
  CloseBudgetPlanningPeriodResponse,
  ListBudgetPlanningHistoryResponse,
  GetBudgetPlanningComparisonResponse,
  GetBudgetPlanningCategoryContributionDetailResponse,
  CopyBudgetPlanningPeriodResponse,
  ReorderBudgetPlanningCategoriesResponse,
  GetBudgetPlanningChangeHistoryResponse,
} from "@workspace/api-zod";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import { getBankingStatus } from "../adapters/banking";
import {
  createManualFinancialAccount,
  getBudget,
  getCashFlow,
  getFinanceInsights,
  getFinanceLists,
  getFinanceSnapshots,
  getFinancialAccounts,
  getSafeToDeploy,
  importFinanceCsv,
  createManualFinanceTransaction,
  createBill,
  updateBill,
  pauseBill,
  resumeBill,
  deleteBill,
  createUpcomingExpense,
  updateUpcomingExpense,
  pauseUpcomingExpense,
  resumeUpcomingExpense,
  deleteUpcomingExpense,
  createIncomeSource,
  updateIncomeSource,
  pauseIncomeSource,
  resumeIncomeSource,
  deleteIncomeSource,
  getTransactionReviewQueue,
  reviewFinancialTransaction,
  listReadOnlyBankConnections,
  createReadOnlyBankConnection,
  linkReadOnlyBankAccount,
  syncReadOnlyBankConnection,
  revokeReadOnlyBankConnection,
  exportReadOnlyBankConnection,
  deleteReadOnlyBankConnectionData,
  getBudgetPlanningPeriod,
  createBudgetPlanningCategory,
  updateBudgetPlanningCategory,
  approveBudgetPlanningPeriod,
  copyBudgetPlanningPeriod,
  reorderBudgetPlanningCategories,
  closeBudgetPlanningPeriod,
  getBudgetPlanningHistory,
  getBudgetPlanningComparison,
  getBudgetPlanningCategoryContributionDetail,
  getBudgetPlanningChangeHistory,
} from "../services/household-finance";

const router: IRouter = Router();

router.get("/budget", asyncRoute(async (_req, res) => {
  res.json(GetBudgetResponse.parse(await getBudget(actorFrom(res))));
}));

router.get("/budget-planning-periods/:month", asyncRoute(async (req, res) => {
  const month = Array.isArray(req.params.month) ? req.params.month[0] : req.params.month;
  res.json(GetBudgetPlanningPeriodResponse.parse(await getBudgetPlanningPeriod(actorFrom(res), month)));
}));

router.post("/budget-planning-periods/:periodId/categories", asyncRoute(async (req, res) => {
  const periodId = Array.isArray(req.params.periodId) ? req.params.periodId[0] : req.params.periodId;
  const body = CreateBudgetPlanningCategoryBody.parse(req.body);
  res.status(201).json(CreateBudgetPlanningCategoryResponse.parse(await createBudgetPlanningCategory(actorFrom(res), periodId, body.version, body)));
}));

router.patch("/budget-planning-periods/:periodId/categories/:categoryId", asyncRoute(async (req, res) => {
  const periodId = Array.isArray(req.params.periodId) ? req.params.periodId[0] : req.params.periodId;
  const categoryId = Array.isArray(req.params.categoryId) ? req.params.categoryId[0] : req.params.categoryId;
  const body = UpdateBudgetPlanningCategoryBody.parse(req.body);
  res.json(UpdateBudgetPlanningCategoryResponse.parse(await updateBudgetPlanningCategory(actorFrom(res), periodId, categoryId, body.version, body)));
}));

router.post("/budget-planning-periods/:periodId/approve", asyncRoute(async (req, res) => {
  const periodId = Array.isArray(req.params.periodId) ? req.params.periodId[0] : req.params.periodId;
  const body = ApproveBudgetPlanningPeriodBody.parse(req.body);
  const key = req.header("Idempotency-Key");
  res.json(ApproveBudgetPlanningPeriodResponse.parse(await approveBudgetPlanningPeriod(actorFrom(res), periodId, body.version, key ?? "")));
}));

router.post("/budget-planning-periods/:month/copy-forward", asyncRoute(async (req, res) => {
  const month = Array.isArray(req.params.month) ? req.params.month[0] : req.params.month;
  res.json(CopyBudgetPlanningPeriodResponse.parse(await copyBudgetPlanningPeriod(actorFrom(res), month, req.header("Idempotency-Key") ?? "")));
}));

router.post("/budget-planning-periods/:periodId/reorder", asyncRoute(async (req, res) => {
  const periodId = Array.isArray(req.params.periodId) ? req.params.periodId[0] : req.params.periodId;
  const body = ReorderBudgetPlanningCategoriesBody.parse(req.body);
  res.json(ReorderBudgetPlanningCategoriesResponse.parse(await reorderBudgetPlanningCategories(actorFrom(res), periodId, body.version, body.categoryIds)));
}));

router.post("/budget-planning-periods/:periodId/close", asyncRoute(async (req, res) => {
  const periodId = Array.isArray(req.params.periodId) ? req.params.periodId[0] : req.params.periodId;
  const body = CloseBudgetPlanningPeriodBody.parse(req.body);
  res.json(CloseBudgetPlanningPeriodResponse.parse(await closeBudgetPlanningPeriod(actorFrom(res), periodId, body.version, req.header("Idempotency-Key") ?? "")));
}));

router.get("/budget-planning-periods", asyncRoute(async (_req, res) => {
  res.json(ListBudgetPlanningHistoryResponse.parse(await getBudgetPlanningHistory(actorFrom(res))));
}));

router.get("/budget-planning-periods/:periodId/change-history", asyncRoute(async (req, res) => {
  const periodId = Array.isArray(req.params.periodId) ? req.params.periodId[0] : req.params.periodId;
  res.json(GetBudgetPlanningChangeHistoryResponse.parse(await getBudgetPlanningChangeHistory(actorFrom(res), periodId)));
}));

router.get("/budget-planning-comparison/:month", asyncRoute(async (req, res) => {
  const month = Array.isArray(req.params.month) ? req.params.month[0] : req.params.month;
  res.json(GetBudgetPlanningComparisonResponse.parse(await getBudgetPlanningComparison(actorFrom(res), month)));
}));

router.get("/budget-planning-periods/:periodId/categories/:categoryId/contributions", asyncRoute(async (req, res) => {
  const periodId = Array.isArray(req.params.periodId) ? req.params.periodId[0] : req.params.periodId;
  const categoryId = Array.isArray(req.params.categoryId) ? req.params.categoryId[0] : req.params.categoryId;
  res.json(GetBudgetPlanningCategoryContributionDetailResponse.parse(await getBudgetPlanningCategoryContributionDetail(actorFrom(res), periodId, categoryId)));
}));

router.get("/cash-flow", asyncRoute(async (_req, res) => {
  res.json(GetCashFlowResponse.parse(await getCashFlow(actorFrom(res))));
}));

router.get("/financial-accounts", asyncRoute(async (_req, res) => {
  res.json(ListFinancialAccountsResponse.parse(await getFinancialAccounts(actorFrom(res))));
}));

router.post("/financial-accounts", asyncRoute(async (req, res) => {
  const body = CreateManualFinancialAccountBody.parse(req.body);
  res.status(201).json(CreateManualFinancialAccountResponse.parse(await createManualFinancialAccount(actorFrom(res), body)));
}));

router.post("/financial-accounts/:accountId/import-csv", asyncRoute(async (req, res) => {
  const accountId = Array.isArray(req.params.accountId) ? req.params.accountId[0] : req.params.accountId;
  const body = ImportFinancialAccountCsvBody.parse(req.body);
  res.json(ImportFinancialAccountCsvResponse.parse(await importFinanceCsv(actorFrom(res), accountId, body.csv)));
}));

router.get("/financial-transactions/review-queue", asyncRoute(async (_req, res) => {
  res.json(ListTransactionReviewQueueResponse.parse(await getTransactionReviewQueue(actorFrom(res))));
}));

router.post("/financial-transactions/:transactionId/review", asyncRoute(async (req, res) => {
  const transactionId = Array.isArray(req.params.transactionId) ? req.params.transactionId[0] : req.params.transactionId;
  const body = ReviewFinancialTransactionBody.parse(req.body);
  res.json(ReviewFinancialTransactionResponse.parse(await reviewFinancialTransaction(actorFrom(res), transactionId, body)));
}));

router.post("/financial-accounts/:accountId/transactions", asyncRoute(async (req, res) => {
  const accountId = Array.isArray(req.params.accountId) ? req.params.accountId[0] : req.params.accountId;
  const body = CreateManualFinanceTransactionBody.parse(req.body);
  res.status(201).json(CreateManualFinanceTransactionResponse.parse(
    await createManualFinanceTransaction(actorFrom(res), accountId, {
      ...body,
      transactionDate: body.transactionDate.toISOString().slice(0, 10),
    }),
  ));
}));

router.get("/bills", asyncRoute(async (_req, res) => {
  res.json(ListBillsResponse.parse((await getFinanceLists(actorFrom(res))).bills));
}));

router.post("/bills", asyncRoute(async (req, res) => {
  const body = CreateBillBody.parse(req.body);
  res.status(201).json(CreateBillResponse.parse(await createBill(actorFrom(res), { ...body, dueDate: body.dueDate.toISOString().slice(0, 10) })));
}));

router.patch("/bills/:billId", asyncRoute(async (req, res) => {
  const billId = Array.isArray(req.params.billId) ? req.params.billId[0] : req.params.billId;
  const body = UpdateBillBody.parse(req.body);
  res.json(UpdateBillResponse.parse(await updateBill(actorFrom(res), billId, {
    billName: body.billName,
    dueDate: body.dueDate?.toISOString().slice(0, 10),
    expectedAmount: body.expectedAmount,
    status: body.status,
    essential: body.essential,
    autoPay: body.autoPay,
  })));
}));

router.post("/bills/:billId/pause", asyncRoute(async (req, res) => {
  const billId = Array.isArray(req.params.billId) ? req.params.billId[0] : req.params.billId;
  res.json(PauseBillResponse.parse(await pauseBill(actorFrom(res), billId)));
}));

router.post("/bills/:billId/resume", asyncRoute(async (req, res) => {
  const billId = Array.isArray(req.params.billId) ? req.params.billId[0] : req.params.billId;
  res.json(ResumeBillResponse.parse(await resumeBill(actorFrom(res), billId)));
}));

router.delete("/bills/:billId", asyncRoute(async (req, res) => {
  const billId = Array.isArray(req.params.billId) ? req.params.billId[0] : req.params.billId;
  await deleteBill(actorFrom(res), billId);
  res.status(204).send();
}));

router.get("/upcoming-expenses", asyncRoute(async (_req, res) => {
  res.json(ListUpcomingExpensesResponse.parse((await getFinanceLists(actorFrom(res))).upcomingExpenses));
}));

router.post("/upcoming-expenses", asyncRoute(async (req, res) => {
  const body = CreateUpcomingExpenseBody.parse(req.body);
  res.status(201).json(CreateUpcomingExpenseResponse.parse(await createUpcomingExpense(actorFrom(res), { ...body, expectedDate: body.expectedDate.toISOString().slice(0, 10) })));
}));

router.patch("/upcoming-expenses/:expenseId", asyncRoute(async (req, res) => {
  const expenseId = Array.isArray(req.params.expenseId) ? req.params.expenseId[0] : req.params.expenseId;
  const body = UpdateUpcomingExpenseBody.parse(req.body);
  res.json(UpdateUpcomingExpenseResponse.parse(await updateUpcomingExpense(actorFrom(res), expenseId, {
    name: body.name,
    estimatedAmount: body.estimatedAmount,
    expectedDate: body.expectedDate?.toISOString().slice(0, 10),
    priority: body.priority,
    required: body.required,
    fundedAmount: body.fundedAmount,
  })));
}));

router.post("/upcoming-expenses/:expenseId/pause", asyncRoute(async (req, res) => {
  const expenseId = Array.isArray(req.params.expenseId) ? req.params.expenseId[0] : req.params.expenseId;
  res.json(PauseUpcomingExpenseResponse.parse(await pauseUpcomingExpense(actorFrom(res), expenseId)));
}));

router.post("/upcoming-expenses/:expenseId/resume", asyncRoute(async (req, res) => {
  const expenseId = Array.isArray(req.params.expenseId) ? req.params.expenseId[0] : req.params.expenseId;
  res.json(ResumeUpcomingExpenseResponse.parse(await resumeUpcomingExpense(actorFrom(res), expenseId)));
}));

router.delete("/upcoming-expenses/:expenseId", asyncRoute(async (req, res) => {
  const expenseId = Array.isArray(req.params.expenseId) ? req.params.expenseId[0] : req.params.expenseId;
  await deleteUpcomingExpense(actorFrom(res), expenseId);
  res.status(204).send();
}));

router.get("/income", asyncRoute(async (_req, res) => {
  res.json(ListIncomeSourcesResponse.parse((await getFinanceLists(actorFrom(res))).incomeSources));
}));

router.post("/income", asyncRoute(async (req, res) => {
  const body = CreateIncomeSourceBody.parse(req.body);
  res.status(201).json(CreateIncomeSourceResponse.parse(await createIncomeSource(actorFrom(res), { ...body, nextPayDate: body.nextPayDate.toISOString().slice(0, 10) })));
}));

router.patch("/income/:incomeId", asyncRoute(async (req, res) => {
  const incomeId = Array.isArray(req.params.incomeId) ? req.params.incomeId[0] : req.params.incomeId;
  const body = UpdateIncomeSourceBody.parse(req.body);
  res.json(UpdateIncomeSourceResponse.parse(await updateIncomeSource(actorFrom(res), incomeId, {
    name: body.name,
    sourceType: body.sourceType,
    expectedMonthly: body.expectedMonthly,
    cadence: body.cadence,
    nextPayDate: body.nextPayDate?.toISOString().slice(0, 10),
  })));
}));

router.post("/income/:incomeId/pause", asyncRoute(async (req, res) => {
  const incomeId = Array.isArray(req.params.incomeId) ? req.params.incomeId[0] : req.params.incomeId;
  res.json(PauseIncomeSourceResponse.parse(await pauseIncomeSource(actorFrom(res), incomeId)));
}));

router.post("/income/:incomeId/resume", asyncRoute(async (req, res) => {
  const incomeId = Array.isArray(req.params.incomeId) ? req.params.incomeId[0] : req.params.incomeId;
  res.json(ResumeIncomeSourceResponse.parse(await resumeIncomeSource(actorFrom(res), incomeId)));
}));

router.delete("/income/:incomeId", asyncRoute(async (req, res) => {
  const incomeId = Array.isArray(req.params.incomeId) ? req.params.incomeId[0] : req.params.incomeId;
  await deleteIncomeSource(actorFrom(res), incomeId);
  res.status(204).send();
}));

router.get("/safe-to-deploy", asyncRoute(async (_req, res) => {
  res.json(GetSafeToDeployResponse.parse(await getSafeToDeploy(actorFrom(res))));
}));

router.get("/finance-insights", asyncRoute(async (_req, res) => {
  res.json(GetFinanceInsightsResponse.parse(await getFinanceInsights(actorFrom(res))));
}));

router.get("/finance-snapshots", asyncRoute(async (_req, res) => {
  res.json(await getFinanceSnapshots(actorFrom(res)));
}));

router.get("/banking/status", asyncRoute(async (_req, res) => {
  res.json(GetBankingStatusResponse.parse(getBankingStatus()));
}));

router.get("/banking/connections", asyncRoute(async (_req, res) => {
  res.json(ListReadOnlyBankConnectionsResponse.parse(await listReadOnlyBankConnections(actorFrom(res))));
}));

router.post("/banking/connections", asyncRoute(async (req, res) => {
  const body = CreateReadOnlyBankConnectionBody.parse(req.body);
  res.status(201).json(CreateReadOnlyBankConnectionResponse.parse(await createReadOnlyBankConnection(actorFrom(res), body)));
}));

router.post("/banking/connections/:connectionId/link-account", asyncRoute(async (req, res) => {
  const connectionId = Array.isArray(req.params.connectionId) ? req.params.connectionId[0] : req.params.connectionId;
  const body = LinkReadOnlyBankAccountBody.parse(req.body);
  res.json(LinkReadOnlyBankAccountResponse.parse(await linkReadOnlyBankAccount(
    actorFrom(res),
    connectionId,
    body.accountId,
    body.providerAccountRef,
  )));
}));

router.post("/banking/connections/:connectionId/sync", asyncRoute(async (req, res) => {
  const connectionId = Array.isArray(req.params.connectionId) ? req.params.connectionId[0] : req.params.connectionId;
  res.json(SyncReadOnlyBankConnectionResponse.parse(await syncReadOnlyBankConnection(actorFrom(res), connectionId)));
}));

router.post("/banking/connections/:connectionId/revoke", asyncRoute(async (req, res) => {
  const connectionId = Array.isArray(req.params.connectionId) ? req.params.connectionId[0] : req.params.connectionId;
  res.json(RevokeReadOnlyBankConnectionResponse.parse(await revokeReadOnlyBankConnection(actorFrom(res), connectionId)));
}));

router.get("/banking/connections/:connectionId/export", asyncRoute(async (req, res) => {
  const connectionId = Array.isArray(req.params.connectionId) ? req.params.connectionId[0] : req.params.connectionId;
  res.json(ExportReadOnlyBankConnectionResponse.parse(await exportReadOnlyBankConnection(actorFrom(res), connectionId)));
}));

router.delete("/banking/connections/:connectionId/data", asyncRoute(async (req, res) => {
  const connectionId = Array.isArray(req.params.connectionId) ? req.params.connectionId[0] : req.params.connectionId;
  res.json(DeleteReadOnlyBankConnectionDataResponse.parse(await deleteReadOnlyBankConnectionData(actorFrom(res), connectionId)));
}));

export default router;