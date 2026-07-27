import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import { AddressProvider } from "./lib/AddressContext.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import CreateVaultPage from "./pages/CreateVaultPage.jsx";
import VaultDetailPage from "./pages/VaultDetailPage.jsx";
import SubmitClaimPage from "./pages/SubmitClaimPage.jsx";
import ClaimResolutionPage from "./pages/ClaimResolutionPage.jsx";
import BalancePage from "./pages/BalancePage.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import AdminGuard from "./components/AdminGuard.jsx";

export default function App() {
  return (
    <AddressProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/vaults/new" element={<CreateVaultPage />} />
            <Route path="/vaults/:id" element={<VaultDetailPage />} />
            <Route path="/vaults/:id/claim" element={<SubmitClaimPage />} />
            <Route path="/claims/:id" element={<ClaimResolutionPage />} />
            <Route path="/balance" element={<BalancePage />} />
            <Route
              path="/admin"
              element={
                <AdminGuard>
                  <AdminPage />
                </AdminGuard>
              }
            />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AddressProvider>
  );
}
