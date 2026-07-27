import WithdrawCard from "../components/WithdrawCard.jsx";
import { GlassPanel } from "../components/ui.jsx";

export default function BalancePage() {
  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-headline-lg font-bold mb-2">Your Balance</h1>
        <p className="text-on-surface-variant text-body-md">
          Every payout is pull-based: a resolved claim or a cancelled vault only credits an internal balance here —
          it never moves automatically. Withdraw whenever you're ready.
        </p>
      </div>
      <WithdrawCard />
      <GlassPanel className="p-6">
        <p className="text-label-sm font-mono text-on-surface-variant leading-relaxed">
          A credit can come from: a CONFIRMED claim (beneficiary payout), a REFUTED or INCONCLUSIVE claim (bond
          return), or a cancelled vault (grantor refund). Check a specific claim's page for its payout breakdown.
        </p>
      </GlassPanel>
    </div>
  );
}
