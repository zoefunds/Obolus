import { useEffect, useState } from "react";
import { GlassPanel, Icon, Input, Button, ErrorBanner } from "./ui.jsx";
import { useAddress } from "../lib/AddressContext.jsx";
import { formatUsdc } from "../lib/usdc.js";
import { api } from "../api.js";
import { sendBaseSepoliaSteps } from "../lib/baseSepoliaWallet.js";

// Payouts moved to Base Sepolia's ObolusEscrow with the USDC migration
// (see MEMORY.md) — GenLayer only records who is owed what (Settlement
// rows); the actual USDC transfer is this component's self-serve
// claim() call straight to ObolusEscrow, signed by the connected wallet.
// Pass `vaultId` when the caller already knows which vault's payout to
// show (e.g. a claim's resolution page); omit it to show the aggregate
// claimable balance across every vault and let the user pick one.
export default function WithdrawCard({ vaultId: fixedVaultId, compact = false }) {
  const { address } = useAddress();
  const [vaultId, setVaultId] = useState(fixedVaultId ? String(fixedVaultId) : "");
  const [totalClaimableUnits, setTotalClaimableUnits] = useState(null);
  const [vaultClaimableUnits, setVaultClaimableUnits] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const refreshTotal = () => {
    if (!address) return;
    api.getBalance(address).then((r) => setTotalClaimableUnits(r.totalClaimableUsdc)).catch(() => {});
  };

  useEffect(refreshTotal, [address]);

  useEffect(() => {
    if (!address || !vaultId) {
      setVaultClaimableUnits(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/balances/${address}/vault/${vaultId}`)
      .then((r) => r.json())
      .then((d) => !cancelled && setVaultClaimableUnits(d.claimableUsdc))
      .catch(() => !cancelled && setVaultClaimableUnits(null));
    return () => {
      cancelled = true;
    };
  }, [address, vaultId]);

  async function claim() {
    if (!vaultId) {
      setError("Enter the vault id to claim from.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess(false);
    try {
      const { steps, to, data, value } = await api.getEscrowClaimCalldata(vaultId);
      const claimSteps = steps || [{ to, data, value }];
      await sendBaseSepoliaSteps(address, claimSteps);
      setSuccess(true);
      setVaultClaimableUnits("0");
      refreshTotal();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!address) {
    return (
      <GlassPanel className="p-6 text-center text-on-surface-variant">
        <Icon name="account_circle" className="text-[28px] mb-2 opacity-50" />
        <p className="text-body-md">Connect a wallet in the header to check your claimable USDC.</p>
      </GlassPanel>
    );
  }

  const displayUnits = fixedVaultId ? vaultClaimableUnits : totalClaimableUnits;
  const hasClaimable = displayUnits && BigInt(displayUnits) > 0n;

  return (
    <GlassPanel className={`relative overflow-hidden flex flex-col items-center text-center gold-glow ${compact ? "p-6" : "p-8"}`}>
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 blur-[60px] rounded-full" />
      <Icon name="account_balance_wallet" className="text-primary text-[36px] mb-3 relative" />
      <p className="text-label-sm font-mono text-on-surface-variant uppercase tracking-widest mb-1 relative">
        {fixedVaultId ? `Claimable — Vault #${fixedVaultId}` : "Total Claimable (Base Sepolia)"}
      </p>
      <h2 className="text-[28px] font-extrabold text-primary leading-none mb-1 relative">
        {displayUnits !== null ? formatUsdc(displayUnits).replace(" USDC", "") : "…"}
      </h2>
      <p className="text-headline-md text-primary/60 mb-6 relative">USDC</p>
      <div className="w-full relative space-y-3">
        <ErrorBanner message={error} />
        {success && <p className="text-tertiary text-body-md">Claim sent — USDC is on its way to your wallet.</p>}
        {!fixedVaultId && (
          <Input value={vaultId} onChange={(e) => setVaultId(e.target.value)} placeholder="Vault id to claim from" className="font-mono" />
        )}
        <Button className="w-full" onClick={claim} loading={busy} disabled={!vaultId || (fixedVaultId && !hasClaimable)}>
          <span>Claim on Base Sepolia</span>
          <Icon name="arrow_forward" className="text-[18px]" />
        </Button>
      </div>
      {fixedVaultId && !hasClaimable && (
        <p className="mt-4 text-label-sm text-on-surface-variant/60 relative">
          Nothing claimable for this vault yet — it may still need relaying (see the resolve action above).
        </p>
      )}
    </GlassPanel>
  );
}
