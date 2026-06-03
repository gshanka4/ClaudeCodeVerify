import { useAuth } from "@clerk/clerk-react";
import { useEffect } from "react";
import { setApiTokenGetter } from "@/lib/api";

/** Wires Clerk session tokens into the fetch client. */
export function ClerkApiBridge({ children }: { children: React.ReactNode }): JSX.Element {
  const { getToken } = useAuth();

  useEffect(() => {
    setApiTokenGetter(async () => {
      try {
        return await getToken();
      } catch {
        return null;
      }
    });
  }, [getToken]);

  return <>{children}</>;
}
