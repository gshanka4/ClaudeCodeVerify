import { useAuth, useClerk, useUser } from "@clerk/clerk-react";
import { LogOut, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { getDevClerkId, hasDevAuthToken } from "@/lib/auth-session";
import { performDevSignOut } from "@/lib/sign-out";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/stores/useSessionStore";

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

function devInitials(clerkId: string): string {
  const tail = clerkId.replace(/^clerk[_-]?(dev[_-])?/i, "").slice(-2);
  return tail.length >= 2 ? tail.toUpperCase() : "DV";
}

function ProfileAvatar({ label, title }: { label: string; title?: string }): JSX.Element {
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-muted bg-bg-elevated text-xs font-medium text-text-secondary"
      data-testid="user-profile-icon"
      title={title ?? label}
      aria-hidden={false}
    >
      {label.length <= 2 ? (
        <span>{label}</span>
      ) : (
        <User size={18} className="text-text-muted" aria-label="User profile" />
      )}
    </div>
  );
}

function UserProfileBarDev(): JSX.Element | null {
  const navigate = useNavigate();
  const clerkId = getDevClerkId();

  if (!hasDevAuthToken() || !clerkId) return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 left-4 z-50 flex items-center gap-3 rounded-xl border border-border-muted",
        "bg-bg-panel/95 px-3 py-2 shadow-lg backdrop-blur-sm",
      )}
      data-testid="user-profile-bar"
    >
      <ProfileAvatar label={devInitials(clerkId)} title={clerkId} />
      <Button
        variant="ghost"
        className="text-xs"
        data-testid="sign-out-btn"
        onClick={() => performDevSignOut(navigate)}
      >
        <LogOut size={14} className="mr-1.5 inline" aria-hidden />
        Sign out
      </Button>
    </div>
  );
}

function UserProfileBarClerk(): JSX.Element | null {
  const navigate = useNavigate();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();

  if (!isLoaded || !isSignedIn) return null;

  const initials =
    user?.firstName && user?.lastName
      ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
      : (user?.primaryEmailAddress?.emailAddress?.[0] ?? "U").toUpperCase();

  const handleSignOut = () => {
    void clerk.signOut().then(() => {
      useSessionStore.getState().reset();
      navigate("/", { replace: true });
    });
  };

  return (
    <div
      className={cn(
        "fixed bottom-4 left-4 z-50 flex items-center gap-3 rounded-xl border border-border-muted",
        "bg-bg-panel/95 px-3 py-2 shadow-lg backdrop-blur-sm",
      )}
      data-testid="user-profile-bar"
    >
      <ProfileAvatar label={initials} title={user?.fullName ?? undefined} />
      <Button variant="ghost" className="text-xs" data-testid="sign-out-btn" onClick={() => void handleSignOut()}>
        <LogOut size={14} className="mr-1.5 inline" aria-hidden />
        Sign out
      </Button>
    </div>
  );
}

/** Bottom-left profile icon + Sign out on all pages when authenticated (REQ-1, REQ-2). */
export function UserProfileBar(): JSX.Element | null {
  if (clerkKey) return <UserProfileBarClerk />;
  return <UserProfileBarDev />;
}
