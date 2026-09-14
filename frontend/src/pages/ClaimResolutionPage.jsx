import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { GlassPanel, Icon, Button, ErrorBanner, Spinner, EmptyState } from "../components/ui.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import EvidenceList from "../components/EvidenceList.jsx";
import WithdrawCard from "../components/WithdrawCard.jsx";
import { formatUsdc } from "../lib/usdc.js";
import { formatTs } from "../lib/time.js";
import { api } from "../api.js";
import { write } from "../lib/writes.js";
import { useAddress, shortenAddress } from "../lib/AddressContext.jsx";

const VERDICT_ICON = { CONFIRMED: "gavel", REFUTED: "gavel", INCONCLUSIVE: "help" };
const VERDICT_TONE = {
  CONFIRMED: { text: "text-tertiary", bg: "bg-tertiary/10", border: "border-tertiary/20" },
  REFUTED: { text: "text-error", bg: "bg-error/10", border: "border-error/20" },
  INCONCLUSIVE: { text: "text-outline", bg: "bg-outline/10", border: "border-outline/20" },
};

function PayoutRow({ label, description, amount, tone }) {
  return (
    <tr>
      <td className="py-4 text-body-md font-bold">{label}</td>
      <td className="py-4 text-body-md text-on-surface-variant">{description}</td>
      <td className={`py-4 font-mono text-right ${tone || ""}`}>{amount}</td>
    </tr>
  );
}

function PayoutBreakdown({ claim, contests }) {
  const claimantBond = claim.claimant_bond_usdc;

  function contesterRows(description, tone, sign = "") {
    return contests
      .filter((c) => Number(c.bond_usdc) > 0)
      .map((c) => (
        <PayoutRow
          key={c.id}
          label={`Contester Bond (#${c.id})`}
          description={description}
          amount={`${sign}${formatUsdc(c.bond_usdc)}`}
          tone={tone}
        />
      ));
  }

  if (claim.status === "CONFIRMED") {
    return (
      <>
        <PayoutRow label="Vault Principal" description="Released to the beneficiary's withdrawable balance." amount="→ Beneficiary" />
        <PayoutRow label="Claimant Bond" description="Returned in full — the claim was upheld." amount={formatUsdc(claimantBond)} tone="text-tertiary" />
        {contesterRows("Forfeited into the beneficiary's payout — the contest was overruled.", "text-tertiary", "+")}
      </>
    );
  }
  if (claim.status === "REFUTED") {
    return (
      <>
        <PayoutRow label="Claimant Bond" description="Forfeited into the vault balance — the claim was disproven." amount={formatUsdc(claimantBond)} tone="text-error" />
        {contesterRows("Returned in full — the contest was vindicated.", "text-tertiary")}
        <PayoutRow label="Vault" description="Reopens ACTIVE with the forfeited bond added to its balance." amount="Reopened" />
      </>
    );
  }
  if (claim.status === "INCONCLUSIVE") {
    return (
      <>
        <PayoutRow label="Claimant Bond" description="Returned in full — abstention penalizes nobody." amount={formatUsdc(claimantBond)} tone="text-tertiary" />
        {contesterRows("Returned in full.", "text-tertiary")}
        <PayoutRow label="Vault" description="Untouched, reopens ACTIVE for a future claim." amount="Reopened" />
      </>
    );
  }
  return null;
}

export default function ClaimResolutionPage() {
  const { id } = useParams();
  const { glClient } = useAddress();
  const [claim, setClaim] = useState(null);
  const [contests, setContests] = useState([]);
  const [error, setError] = useState("");
  const [resolving, setResolving] = useState(false);
  const [now] = useState(Math.floor(Date.now() / 1000));

  const load = useCallback(() => {
    api.getClaim(id).then(setClaim).catch((err) => setError(err.message));
    api.getContestsForClaim(id).then(setContests).catch(() => {});
  }, [id]);

  useEffect(load, [load]);

  async function handleResolve() {
    setResolving(true);
    setError("");
    try {
      const result = await write(glClient, "resolve_claim", [Number(id)]);
      const vaultId = result?.resultValue?.vault_id;
      if (vaultId) {
        // Sweep whatever settlements this verdict produced onto Base
        // Sepolia — see backend/src/baseSepolia.js. Best-effort: a
        // failure here just delays claiming, never loses the settlement.
        api.relaySettlements(vaultId).catch(() => {});
      }
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setResolving(false);
    }
  }

  if (error && !claim) return <ErrorBanner message={error} />;
  if (!claim)
    return (
      <div className="flex items-center justify-center py-24 text-on-surface-variant gap-2">
        <Spinner /> Loading claim…
      </div>
    );

  const resolved = ["CONFIRMED", "REFUTED", "INCONCLUSIVE"].includes(claim.status);
  const canResolve = ["OPEN", "CONTESTED"].includes(claim.status) && now >= Number(claim.contest_deadline_ts);
  const tone = VERDICT_TONE[claim.status] || VERDICT_TONE.INCONCLUSIVE;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-end gap-6">
        <div>
          <p className="text-label-sm font-mono text-primary mb-2">CLAIM #{claim.id} · VAULT #{claim.vault_id}</p>
          <h1 className="text-headline-lg font-bold">
            {resolved ? "Claim Resolved" : "Claim Pending Resolution"}
          </h1>
        </div>
        <StatusBadge status={claim.status} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
        <div className="lg:col-span-8 space-y-gutter">
          {resolved ? (
            <section className="glass-panel p-6 rounded-xl">
              <h3 className="text-label-sm font-mono text-on-surface-variant uppercase mb-6 flex items-center gap-2">
                <Icon name="verified" className="text-[18px]" />
                Final Verdict
              </h3>
              <div className="flex items-start gap-6 mb-6">
                <div className={`w-14 h-14 rounded-lg flex items-center justify-center border shrink-0 ${tone.bg} ${tone.border}`}>
                  <Icon name={VERDICT_ICON[claim.status]} className={`${tone.text} text-[28px]`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <span className="text-headline-md font-semibold">{claim.determination}</span>
                    <span className={`text-label-sm font-mono px-2 py-0.5 rounded ${tone.bg} ${tone.text}`}>CONFIDENCE: {claim.confidence}</span>
                  </div>
                  <p className="text-body-md text-on-surface-variant leading-relaxed">{claim.reasoning || claim.evidence_summary}</p>
                </div>
              </div>
              {claim.evidence_summary && <p className="text-label-sm font-mono text-on-surface-variant italic">"{claim.evidence_summary}"</p>}
            </section>
          ) : (
            <GlassPanel className="p-8">
              <EmptyState
                icon="hourglass_top"
                title={canResolve ? "Ready to resolve" : "Contest window still open"}
                description={
                  canResolve
                    ? "The contest window has closed. Anyone may trigger resolution — it fetches every evidence source and runs one validator-consensus verdict."
                    : `Resolvable after ${formatTs(claim.contest_deadline_ts)}.`
                }
              />
              {canResolve && (
                <div className="flex justify-center pb-2">
                  <Button onClick={handleResolve} loading={resolving}>
                    <Icon name="gavel" className="text-[18px]" />
                    {resolving ? "Fetching evidence & judging…" : "Resolve Claim"}
                  </Button>
                </div>
              )}
              <ErrorBanner message={error} />
            </GlassPanel>
          )}

          <EvidenceList title="Death-claim evidence" urls={claim.evidence_urls} imageUrl={claim.evidence_image_url} />
          {contests.map((c) => (
            <EvidenceList key={c.id} title={`Contest #${c.id} evidence — ${shortenAddress(c.contester)}`} urls={c.urls} imageUrl={c.image_url} />
          ))}

          {resolved && (
            <section className="glass-panel p-6 rounded-xl">
              <h3 className="text-label-sm font-mono text-on-surface-variant uppercase mb-6">Payout Breakdown</h3>
              <table className="w-full text-left">
                <thead className="border-b border-outline-variant/20">
                  <tr>
                    <th className="py-4 text-label-sm font-mono text-on-surface-variant">Item</th>
                    <th className="py-4 text-label-sm font-mono text-on-surface-variant">What happened</th>
                    <th className="py-4 text-label-sm font-mono text-on-surface-variant text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  <PayoutBreakdown claim={claim} contests={contests} />
                </tbody>
              </table>
            </section>
          )}
        </div>

        <div className="lg:col-span-4 space-y-gutter">
          <WithdrawCard vaultId={claim.vault_id} />
          <GlassPanel className="p-6">
            <h3 className="text-label-sm font-mono text-on-surface-variant uppercase mb-4">Claim Timing</h3>
            <div className="space-y-3 text-body-md">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Submitted</span>
                <span>{formatTs(claim.submitted_ts)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Contest deadline</span>
                <span>{formatTs(claim.contest_deadline_ts)}</span>
              </div>
              {claim.resolved_ts > 0 && (
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Resolved</span>
                  <span>{formatTs(claim.resolved_ts)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Resolution attempts</span>
                <span className="font-mono">{claim.resolution_attempts}</span>
              </div>
            </div>
          </GlassPanel>
          <Link to={`/vaults/${claim.vault_id}`} className="block text-center text-label-sm font-mono text-secondary hover:underline">
            ← Back to vault #{claim.vault_id}
          </Link>
        </div>
      </div>
    </div>
  );
}
