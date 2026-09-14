import { Link } from "react-router-dom";
import { Icon } from "./ui.jsx";
import StatusBadge from "./StatusBadge.jsx";
import { formatUsdc } from "../lib/usdc.js";

const STATUS_ICON = {
  ACTIVE: "lock",
  CLAIM_PENDING: "pending_actions",
  PAYOUT_READY: "lock_open",
  CANCELLED: "block",
};

export default function VaultCard({ vault, roleLabel }) {
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
      {roleLabel && <p className="text-label-sm font-mono text-outline mb-4">{roleLabel}</p>}
      <div className="flex justify-between text-label-sm font-mono border-t border-outline-variant/20 pt-3">
        <span className="text-outline">Escrowed</span>
        <span className="text-on-surface">{formatUsdc(vault.balance_usdc)}</span>
      </div>
    </Link>
  );
}
