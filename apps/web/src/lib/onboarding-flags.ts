const EXPORT_EDU_KEY = "architectai_export_edu_seen";
const JOURNEY_COLLAPSED_KEY = "architectai_journey_collapsed";

export function hasSeenExportEducation(): boolean {
  try {
    return localStorage.getItem(EXPORT_EDU_KEY) === "1";
  } catch {
    return false;
  }
}

export function markExportEducationSeen(dontShowAgain: boolean): void {
  if (!dontShowAgain) return;
  try {
    localStorage.setItem(EXPORT_EDU_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function isJourneyMapCollapsed(): boolean {
  try {
    return localStorage.getItem(JOURNEY_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setJourneyMapCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(JOURNEY_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore */
  }
}
