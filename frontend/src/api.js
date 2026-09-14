const BASE = "/api";

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `request failed: ${res.status}`);
  return body;
}

export const api = {
  getNetwork: () => req("/platform/network"),
  getConfig: () => req("/platform/config"),
  getStats: () => req("/platform/stats"),
  getVault: (id) => req(`/vaults/${id}`),
  getVaultCount: () => req("/vaults"),
  getClaimsForVault: (id) => req(`/vaults/${id}/claims`),
  getVaultsForGrantor: (address) => req(`/vaults/by-grantor/${address}`),
  getVaultsForBeneficiary: (address) => req(`/vaults/by-beneficiary/${address}`),
  createVault: (data) => req("/vaults", { method: "POST", body: JSON.stringify(data) }),
  fundVault: (id, amountUsdc) => req(`/vaults/${id}/fund`, { method: "POST", body: JSON.stringify({ amountUsdc }) }),
  cancelVault: (id) => req(`/vaults/${id}/cancel`, { method: "POST", body: JSON.stringify({}) }),
  setBeneficiary: (id, newBeneficiary) => req(`/vaults/${id}/beneficiary`, { method: "POST", body: JSON.stringify({ newBeneficiary }) }),

  // Base Sepolia payment layer — see backend/src/baseSepolia.js.
  // amountUnits is USDC base units (6 decimals); use lib/usdc.js's
  // usdcToUnits() to build it from a human-entered amount.
  getEscrowFundCalldata: (vaultId, amountUnits) =>
    req(`/vaults/${vaultId}/escrow-fund-calldata?amountUnits=${amountUnits}`),
  getEscrowClaimCalldata: (vaultId) => req(`/vaults/${vaultId}/escrow-claim-calldata`),
  getSettlementsForVault: (vaultId) => req(`/vaults/${vaultId}/settlements`),
  relaySettlements: (vaultId) => req(`/vaults/${vaultId}/relay-settlements`, { method: "POST", body: "{}" }),

  getClaim: (id) => req(`/claims/${id}`),
  getContestsForClaim: (id) => req(`/claims/${id}/contests`),
  isResolvable: (id) => req(`/claims/${id}/resolvable`),
  submitClaim: (vaultId, data) => req(`/vaults/${vaultId}/claims`, { method: "POST", body: JSON.stringify(data) }),
  contestClaim: (id, data) => req(`/claims/${id}/contest`, { method: "POST", body: JSON.stringify(data) }),
  resolveClaim: (id) => req(`/claims/${id}/resolve`, { method: "POST", body: JSON.stringify({}) }),

  getBalance: (address) => req(`/balances/${address}`),

  pause: () => req("/admin/pause", { method: "POST", body: "{}" }),
  unpause: () => req("/admin/unpause", { method: "POST", body: "{}" }),
  setMinimumBonds: (minClaimantBondUsdc, minContesterBondUsdc) =>
    req("/admin/minimum-bonds", { method: "POST", body: JSON.stringify({ minClaimantBondUsdc, minContesterBondUsdc }) }),
  setOwner: (newOwner) => req("/admin/owner", { method: "POST", body: JSON.stringify({ newOwner }) }),
};
