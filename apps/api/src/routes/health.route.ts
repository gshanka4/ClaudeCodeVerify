import { Router } from "express";
import type { AppContext } from "@/context";
import { createReadyzHandler, getHealth } from "@/controllers/health.controller";

export function createHealthRouter(ctx?: AppContext): Router {
  const healthRouter = Router();
  healthRouter.get("/healthz", getHealth);
  if (ctx) {
    healthRouter.get("/readyz", createReadyzHandler(ctx));
  }
  return healthRouter;
}

/** @deprecated Use createHealthRouter(ctx) for /readyz support. */
export const healthRouter = createHealthRouter();
