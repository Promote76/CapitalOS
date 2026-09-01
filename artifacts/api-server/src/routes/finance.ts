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
} from "../services/household-finance";

const router: IRouter = Router();

router.get("/budget", asyncRoute(async (_req, res) => {
  res.json(GetBudgetResponse.parse(await getBudget()));
}));

router.get("/cash-flow", asyncRoute(async (_req, res) => {
  res.json(GetCashFlowResponse.parse(await getCashFlow()));
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

router.get("/bills", asyncRoute(async (_req, res) => {
  res.json(ListBillsResponse.parse((await getFinanceLists()).bills));
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
  res.json(ListUpcomingExpensesResponse.parse((await getFinanceLists()).upcomingExpenses));
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
  res.json(ListIncomeSourcesResponse.parse((await getFinanceLists()).incomeSources));
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
  res.json(GetSafeToDeployResponse.parse(await getSafeToDeploy()));
}));

router.get("/finance-insights", asyncRoute(async (_req, res) => {
  res.json(GetFinanceInsightsResponse.parse(await getFinanceInsights()));
}));

router.get("/finance-snapshots", asyncRoute(async (_req, res) => {
  res.json(await getFinanceSnapshots());
}));

router.get("/banking/status", asyncRoute(async (_req, res) => {
  res.json(GetBankingStatusResponse.parse(getBankingStatus()));
}));

export default router;