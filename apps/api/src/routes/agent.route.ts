import { Router } from "express";
import type { AppContext } from "@/context";
import {
  createCursorHotPathRouter,
  createCursorRouter,
} from "@/routes/cursor.route";

/** Agent runtime aliases (Claude Code pivot) — same handlers as `/api/cursor`. */
export function createAgentHotPathRouter(ctx: AppContext): Router {
  return createCursorHotPathRouter(ctx);
}

export function createAgentRouter(ctx: AppContext): Router {
  return createCursorRouter(ctx);
}
