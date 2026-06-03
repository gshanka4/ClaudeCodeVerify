import { useAuth } from "@clerk/clerk-react";
import { Navigate, useLocation } from "react-router-dom";
import { hasDevAuthToken } from "@/lib/auth-session";

interface AuthGuardProps {
  children: React.ReactNode;
}

function AuthGuardClerk({ children }: AuthGuardProps): JSX.Element {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-base text-text-muted">
        Loading…
      </div>
    );
  }

  if (!isSignedIn) {
    return <Navigate to="/" state={{ from: location.pathname, needsAuth: true }} replace />;
  }

  return <>{children}</>;
}

/** Redirects unauthenticated users to landing (P2-EC-01 auth-upfront). */
export function AuthGuard({ children }: AuthGuardProps): JSX.Element {
  const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
  const location = useLocation();

  if (!clerkKey) {
    if (hasDevAuthToken()) return <>{children}</>;
    return <Navigate to="/" state={{ from: location.pathname, needsAuth: true }} replace />;
  }

  return <AuthGuardClerk>{children}</AuthGuardClerk>;
}
