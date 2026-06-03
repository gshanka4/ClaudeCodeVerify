import { pino } from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "architectai-api" },
});

export type Logger = typeof logger;
