import express, { Router, type IRouter } from "express";
import { asyncRoute } from "../middleware/errors";
import { processReadOnlyBankWebhook } from "../services/household-finance";

const router: IRouter = Router();

router.post("/banking/webhooks/:provider", express.raw({ type: "application/json", limit: "100kb" }), asyncRoute(async (req, res) => {
  const provider = Array.isArray(req.params.provider) ? req.params.provider[0] : req.params.provider;
  if (!Buffer.isBuffer(req.body)) {
    res.status(400).json({ code: "INVALID_WEBHOOK", message: "Webhook body must be raw JSON" });
    return;
  }
  res.status(202).json(await processReadOnlyBankWebhook(provider, req.headers, req.body));
}));

export default router;