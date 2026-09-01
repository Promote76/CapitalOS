import type { NextFunction, Request, Response } from "express";
import { ensureSeedData } from "../services/seed";
import type { Actor } from "../services/capital-os";
import type { HouseholdRole } from "../domain/governance";

const roles = new Set<HouseholdRole>(["owner", "partner", "viewer", "advisor"]);

export async function requestContext(_req: Request, res: Response, next: NextFunction) {
  try {
    const seed = await ensureSeedData();
    const requestedRole = _req.header("X-Household-Role") as HouseholdRole | undefined;
    const role =
      process.env.NODE_ENV === "production"
        ? "viewer"
        : requestedRole && roles.has(requestedRole)
          ? requestedRole
          : "owner";
    const actor: Actor = {
      role,
      userId: seed.ownerId,
      source: process.env.NODE_ENV === "production" ? "production-default" : "development-header",
    };
    res.locals.actor = actor;
    res.locals.householdId = seed.householdId;
    next();
  } catch (error) {
    next(error);
  }
}

export function actorFrom(res: Response): Actor {
  const actor = res.locals.actor as Actor | undefined;
  if (!actor) throw new Error("Request actor context is missing");
  return actor;
}