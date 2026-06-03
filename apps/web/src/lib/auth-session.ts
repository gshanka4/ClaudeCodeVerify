export const DEV_CLERK_STORAGE_KEY = "architectai_dev_clerk_id";
const DEV_CLERK_KEY = DEV_CLERK_STORAGE_KEY;
const SESSION_PERSIST_KEY = "architectai-session";

/** Whether dev bearer auth is active (no Clerk). */
export function hasDevAuthToken(): boolean {
  return Boolean(sessionStorage.getItem(DEV_CLERK_KEY));
}

export function getDevClerkId(): string | null {
  return sessionStorage.getItem(DEV_CLERK_KEY);
}

/** Clear dev token and persisted interrogation store (Phase A sign-out). */
export function clearLocalAuthSession(): void {
  sessionStorage.removeItem(DEV_CLERK_KEY);
  localStorage.removeItem(SESSION_PERSIST_KEY);
}
