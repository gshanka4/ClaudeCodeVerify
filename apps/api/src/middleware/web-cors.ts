import type { RequestHandler } from "express";

/** Allow browser requests from the deployed web app (cross-origin API + SPA). */
export function webCors(webBaseUrl: string | undefined): RequestHandler {
  return (req, res, next) => {
    if (!webBaseUrl?.trim()) {
      next();
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", webBaseUrl);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Accept, Last-Event-ID",
    );
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  };
}
