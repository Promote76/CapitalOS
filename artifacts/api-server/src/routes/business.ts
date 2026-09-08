import { Router, type IRouter } from "express";
import {
  CreateBusinessDistributionBody,
  CreateBusinessDistributionHeader,
  CreateBusinessDistributionResponse,
  CreateBusinessEntityBody,
  CreateBusinessEntityResponse,
  ResolveCompatibleTruckingBusinessBody,
  ResolveCompatibleTruckingBusinessResponse,
  CreateBusinessExpenseBody,
  CreateBusinessExpenseResponse,
  CreateBusinessRevenueBody,
  CreateBusinessRevenueResponse,
  GetBusinessOverviewResponse,
  ListBusinessEntitiesResponse,
  UpdateBusinessEntityBody,
  UpdateBusinessEntityParams,
  UpdateBusinessEntityResponse,
  UpdateBusinessReserveBody,
  UpdateBusinessReserveParams,
  UpdateBusinessReserveResponse,
} from "@workspace/api-zod";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import {
  createBusinessDistribution,
  createBusinessEntity,
  resolveCompatibleTruckingBusiness,
  createBusinessExpense,
  createBusinessRevenue,
  getBusinessOverview,
  listBusinessEntities,
  updateBusinessEntity,
  updateBusinessReserve,
} from "../services/business";

const router: IRouter = Router();
router.get("/business", asyncRoute(async (_req, res) => res.json(GetBusinessOverviewResponse.parse(await getBusinessOverview(actorFrom(res))))));
router.get("/business/companies", asyncRoute(async (_req, res) => res.json(ListBusinessEntitiesResponse.parse(await listBusinessEntities(actorFrom(res))))));
router.post("/business/companies", asyncRoute(async (req, res) => {
  const body = CreateBusinessEntityBody.parse(req.body);
  res.status(201).json(CreateBusinessEntityResponse.parse(await createBusinessEntity(actorFrom(res), body)));
}));
router.post("/business/companies/resolve-compatible", asyncRoute(async (req, res) => {
  const body = ResolveCompatibleTruckingBusinessBody.parse(req.body);
  res.json(ResolveCompatibleTruckingBusinessResponse.parse(await resolveCompatibleTruckingBusiness(actorFrom(res), body)));
}));
router.patch("/business/companies/:businessId", asyncRoute(async (req, res) => {
  const params = UpdateBusinessEntityParams.parse(req.params);
  const body = UpdateBusinessEntityBody.parse(req.body);
  res.json(UpdateBusinessEntityResponse.parse(await updateBusinessEntity(actorFrom(res), params.businessId, body)));
}));
router.post("/business/revenue", asyncRoute(async (req, res) => {
  const body = CreateBusinessRevenueBody.parse(req.body);
  res.status(201).json(CreateBusinessRevenueResponse.parse(await createBusinessRevenue(actorFrom(res), body)));
}));
router.post("/business/expenses", asyncRoute(async (req, res) => {
  const body = CreateBusinessExpenseBody.parse(req.body);
  res.status(201).json(CreateBusinessExpenseResponse.parse(await createBusinessExpense(actorFrom(res), body)));
}));
router.post("/business/distributions", asyncRoute(async (req, res) => {
  const body = CreateBusinessDistributionBody.parse(req.body);
  const headers = CreateBusinessDistributionHeader.parse({ "Idempotency-Key": req.header("Idempotency-Key") });
  res.status(201).json(CreateBusinessDistributionResponse.parse(await createBusinessDistribution(actorFrom(res), body, headers["Idempotency-Key"])));
}));
router.patch("/business/reserves/:businessId", asyncRoute(async (req, res) => {
  const params = UpdateBusinessReserveParams.parse(req.params);
  const body = UpdateBusinessReserveBody.parse(req.body);
  res.json(UpdateBusinessReserveResponse.parse(await updateBusinessReserve(actorFrom(res), params.businessId, body)));
}));

export default router;