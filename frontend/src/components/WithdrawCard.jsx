import { useEffect, useState } from "react";
import { GlassPanel, Icon, Button, ErrorBanner } from "./ui.jsx";
import { useAddress } from "../lib/AddressContext.jsx";
import { formatGen, weiToGen } from "../lib/gen.js";
import { api } from "../api.js";
import { write } from "../lib/writes.js";

export default function WithdrawCard({ compact = false }) {
  const { address, glClient } = useAddress();
  const [balanceWei, setBalanceWei] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const refresh = () => {
    if (!address) return;
    api.getBalance(address).then((r) => setBalanceWei(r.balanceWei)).catch(() => {});
  };

  useEffect(refresh, [address]);

  async function withdraw() {
    setBusy(true);
    setError("");
    setSuccess(false);
    try {
      await write(glClient, "withdraw", [BigInt(balanceWei)]);
      setSuccess(true);
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const hasBalance = balanceWei && BigInt(balanceWei) > 0n;

  if (!address) {
    return (
      <GlassPanel className="p-6 text-center text-on-surface-variant">
        <Icon name="account_circle" className="text-[28px] mb-2 opacity-50" />
        <p className="text-body-md">Connect a wallet in the header to check your withdrawable balance.</p>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel className={`relative overflow-hidden flex flex-col items-center text-center gold-glow ${compact ? "p-6" : "p-8"}`}>
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 blur-[60px] rounded-full" />
      <Icon name="account_balance_wallet" className="text-primary text-[36px] mb-3 relative" />
      <p className="text-label-sm font-mono text-on-surface-variant uppercase tracking-widest mb-1 relative">
        Available for Withdrawal
      </p>
      <h2 className="text-[28px] font-extrabold text-primary leading-none mb-1 relative">{balanceWei !== null ? weiToGen(balanceWei) : "…"}</h2>
      <p className="text-headline-md text-primary/60 mb-6 relative">GEN</p>
      <div className="w-full relative">
        <ErrorBanner message={error} />
        {success && <p className="text-tertiary text-body-md mb-3">Withdrawal broadcast — funds are on their way.</p>}
        <Button className="w-full" onClick={withdraw} loading={busy} disabled={!hasBalance}>
          <span>Withdraw {hasBalance ? formatGen(balanceWei) : ""}</span>
          <Icon name="arrow_forward" className="text-[18px]" />
        </Button>
      </div>
      {!hasBalance && <p className="mt-4 text-label-sm text-on-surface-variant/60 relative">Nothing credited to this address yet.</p>}
    </GlassPanel>
  );
}
