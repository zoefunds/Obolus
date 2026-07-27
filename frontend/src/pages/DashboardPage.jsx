import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { GlassPanel, Icon, EmptyState, Spinner } from "../components/ui.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { useAddress, shortenAddress } from "../lib/AddressContext.jsx";
import { formatGen } from "../lib/gen.js";
import { api } from "../api.js";

const STATUS_ICON = {
  ACTIVE: "lock",
  CLAIM_PENDING: "pending_actions",
  PAYOUT_READY: "lock_open",
  CANCELLED: "block",
};

function VaultCard({ vault, roleLabel }) {
  return (
    <Link
      to={`/vaults/${vault.id}`}
      className={`glass-panel p-6 rounded-xl block group cursor-pointer hover:bg-surface-variant/20 transition-all duration-300 border-l-[3px] ${
        vault.status === "ACTIVE" || vault.status === "PAYOUT_READY" ? "border-l-primary" : "border-l-outline-variant/50"
      }`}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center text-primary">
          <Icon name={STATUS_ICON[vault.status] || "lock"} />
        </div>
        <StatusBadge status={vault.status} size="sm" />
      </div>
      <h3 className="text-headline-md font-semibold mb-1">
        Vault #{vault.id} — {vault.subject_name}
      </h3>
      <p className="text-label-sm font-mono text-outline mb-4">{roleLabel}</p>
      <div className="flex justify-between text-label-sm font-mono border-t border-outline-variant/20 pt-3">
        <span className="text-outline">Escrowed</span>
        <span className="text-on-surface">{formatGen(vault.balance_wei)}</span>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const { address } = useAddress();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [grantorVaults, setGrantorVaults] = useState([]);
  const [beneficiaryVaults, setBeneficiaryVaults] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.getStats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    if (!address) {
      setGrantorVaults([]);
      setBeneficiaryVaults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([api.getVaultsForGrantor(address), api.getVaultsForBeneficiary(address)])
      .then(async ([grantorIds, beneficiaryIds]) => {
        const [grantorFull, beneficiaryFull] = await Promise.all([
          Promise.all(grantorIds.map((id) => api.getVault(id))),
          Promise.all(beneficiaryIds.map((id) => api.getVault(id))),
        ]);
        if (cancelled) return;
        setGrantorVaults(grantorFull);
        setBeneficiaryVaults(beneficiaryFull);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [address]);

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-headline-lg font-bold mb-2">Dashboard</h1>
          <p className="text-on-surface-variant text-body-md">Vaults you've granted or stand to benefit from.</p>
        </div>
        <Link to="/vaults/new" className="px-6 py-3 bg-primary text-on-primary font-medium rounded-lg hover:brightness-110 transition-all flex items-center gap-2 self-start">
          <Icon name="add" className="text-[18px]" />
          New Vault
        </Link>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            ["Vaults", stats.vault_count],
            ["Claims", stats.claim_count],
            ["Confirmed", stats.total_claims_confirmed],
            ["Escrowed", formatGen(stats.total_escrowed_wei)],
          ].map(([label, value]) => (
            <GlassPanel key={label} className="p-5">
              <p className="text-label-sm font-mono text-on-surface-variant uppercase tracking-widest mb-1">{label}</p>
              <p className="text-headline-md font-semibold">{value}</p>
            </GlassPanel>
          ))}
        </div>
      )}

      {!address ? (
        <GlassPanel>
          <EmptyState
            icon="account_circle"
            title="Connect a wallet"
            description="Connect a wallet in the header to see the vaults it grants or benefits from."
          />
        </GlassPanel>
      ) : loading ? (
        <div className="flex items-center justify-center py-16 text-on-surface-variant gap-2">
          <Spinner /> Loading vaults for {shortenAddress(address)}…
        </div>
      ) : error ? (
        <GlassPanel className="p-6 text-error">{error}</GlassPanel>
      ) : (
        <>
          <section className="space-y-4">
            <h2 className="text-headline-md font-semibold flex items-center gap-2">
              <Icon name="account_balance_wallet" className="text-primary text-[20px]" />
              As grantor
              <span className="text-label-sm font-mono text-outline">{grantorVaults.length}</span>
            </h2>
            {grantorVaults.length === 0 ? (
              <GlassPanel>
                <EmptyState icon="inbox" title="No vaults granted yet" description="Create one to lock GEN for a beneficiary." />
              </GlassPanel>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {grantorVaults.map((v) => (
                  <VaultCard key={v.id} vault={v} roleLabel={`Beneficiary: ${shortenAddress(v.beneficiary)}`} />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-headline-md font-semibold flex items-center gap-2">
              <Icon name="redeem" className="text-secondary text-[20px]" />
              As beneficiary
              <span className="text-label-sm font-mono text-outline">{beneficiaryVaults.length}</span>
            </h2>
            {beneficiaryVaults.length === 0 ? (
              <GlassPanel>
                <EmptyState icon="inbox" title="No vaults naming you yet" description="Vaults where you're the named beneficiary will appear here." />
              </GlassPanel>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {beneficiaryVaults.map((v) => (
                  <VaultCard key={v.id} vault={v} roleLabel={`Grantor: ${shortenAddress(v.grantor)}`} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
