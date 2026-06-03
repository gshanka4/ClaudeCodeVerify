import type { AuthContext } from "@/middleware/auth";
import type { WorkspaceContext } from "@/middleware/workspace-auth";

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireAuth`. Carries tenant identity for RLS + RBAC. */
      auth?: AuthContext;
      /** Set by `requireWorkspaceToken` on /drift/check. */
      workspace?: WorkspaceContext;
      /** Stable per-request id for logs + audit correlation. */
      id?: string;
    }
  }
}

export {};
