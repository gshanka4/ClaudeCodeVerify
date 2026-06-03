import type { NavigateFunction } from "react-router-dom";
import { clearLocalAuthSession } from "@/lib/auth-session";
import { useSessionStore } from "@/stores/useSessionStore";

let signingOut = false;

/**
 * Dev sign-out: clear tokens/stores and land on `/` (REQ-2).
 * Idempotent — safe if already signed out (A-EC-02).
 */
export function performDevSignOut(navigate: NavigateFunction): void {
  if (signingOut) return;
  signingOut = true;
  try {
    clearLocalAuthSession();
    useSessionStore.getState().reset();
    navigate("/", { replace: true });
  } finally {
    signingOut = false;
  }
}
