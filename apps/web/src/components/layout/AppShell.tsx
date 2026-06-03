import { ProductJourneyMap } from "@/components/journey/ProductJourneyMap";
import { UserProfileBar } from "@/components/layout/UserProfileBar";

interface AppShellProps {
  children: React.ReactNode;
}

/**
 * App-wide chrome: reserves space for the fixed profile bar (Phase A).
 */
export function AppShell({ children }: AppShellProps): JSX.Element {
  return (
    <div className="relative min-h-screen pb-20" data-testid="app-shell">
      {children}
      <ProductJourneyMap />
      <UserProfileBar />
    </div>
  );
}
