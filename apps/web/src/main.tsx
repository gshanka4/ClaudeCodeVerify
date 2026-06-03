import { ClerkProvider } from "@clerk/clerk-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@/App";
import { ClerkApiBridge } from "@/providers/ClerkApiBridge";
import "@/styles/globals.css";

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

const root = createRoot(document.getElementById("root")!);

if (clerkKey) {
  root.render(
    <StrictMode>
      <ClerkProvider publishableKey={clerkKey}>
        <ClerkApiBridge>
          <App />
        </ClerkApiBridge>
      </ClerkProvider>
    </StrictMode>,
  );
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
