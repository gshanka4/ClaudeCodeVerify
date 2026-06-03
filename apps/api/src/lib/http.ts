import type { ApiResponse } from "@architectai/shared";
import type { Response } from "express";

/**
 * Response helpers so every successful payload is wrapped in the shared
 * `ApiResponse<T>` envelope (`{ data, meta? }`). Use these instead of calling
 * `res.json` directly with ad-hoc shapes.
 */
export function ok<T>(res: Response, data: T, meta?: ApiResponse<T>["meta"]): void {
  const body: ApiResponse<T> = meta ? { data, meta } : { data };
  res.status(200).json(body);
}

export function created<T>(res: Response, data: T): void {
  res.status(201).json({ data } satisfies ApiResponse<T>);
}

export function accepted<T>(res: Response, data: T): void {
  res.status(202).json({ data } satisfies ApiResponse<T>);
}

export function noContent(res: Response): void {
  res.status(204).end();
}
