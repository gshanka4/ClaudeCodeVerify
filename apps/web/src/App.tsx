import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import GenerationPage from "@/pages/GenerationPage";
import InterrogationPage from "@/pages/InterrogationPage";
import LandingPage from "@/pages/LandingPage";
import WorkspacePage from "@/pages/WorkspacePage";
import DashboardPage from "@/pages/DashboardPage";
import ExportWizardPage from "@/pages/ExportWizardPage";

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <AppShell>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route
          path="/interrogate/:sessionId"
          element={
            <AuthGuard>
              <InterrogationPage />
            </AuthGuard>
          }
        />
        <Route
          path="/generate/:architectureId"
          element={
            <AuthGuard>
              <GenerationPage />
            </AuthGuard>
          }
        />
        <Route
          path="/workspace/:architectureId"
          element={
            <AuthGuard>
              <WorkspacePage />
            </AuthGuard>
          }
        />
        <Route
          path="/dashboard"
          element={
            <AuthGuard>
              <DashboardPage />
            </AuthGuard>
          }
        />
        <Route
          path="/export/:architectureId"
          element={
            <AuthGuard>
              <ExportWizardPage />
            </AuthGuard>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
