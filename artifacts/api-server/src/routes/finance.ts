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

router.get("/upcoming-expenses", asyncRoute(async (_req, res) => {
  res.json(ListUpcomingExpensesResponse.parse((await getFinanceLists()).upcomingExpenses));
}));

router.get("/income", asyncRoute(async (_req, res) => {
  res.json(ListIncomeSourcesResponse.parse((await getFinanceLists()).incomeSources));
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