import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { GlassPanel, Icon, Button, Field, Input, Textarea, ErrorBanner, Spinner, EmptyState } from "../components/ui.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import ClaimTimeline from "../components/ClaimTimeline.jsx";
import EvidenceList from "../components/EvidenceList.jsx";
import { useAddress, shortenAddress } from "../lib/AddressContext.jsx";
import { formatUsdc, usdcToUnits } from "../lib/usdc.js";
import { formatTs } from "../lib/time.js";
import { api } from "../api.js";
import { write } from "../lib/writes.js";
import { sendBaseSepoliaSteps } from "../lib/baseSepoliaWallet.js";

function ParticipantsCard({ vault }) {
  return (
    <GlassPanel className="p-6">
      <h2 className="text-label-sm font-mono text-on-surface-variant uppercase mb-6">Vault Participants</h2>
      <div className="space-y-6">
        <div>
          <p className="text-label-sm font-mono text-on-surface-variant mb-2">GRANTOR</p>
          <div className="flex items-center gap-3 p-3 bg-surface-container-low rounded border border-outline-variant/10">
            <div className="w-8 h-8 rounded-full bg-primary-container/20 flex items-center justify-center text-primary">
              <Icon name="person" className="text-[18px]" />
            </div>
            <span className="text-label-sm font-mono text-on-surface truncate">{shortenAddress(vault.grantor)}</span>
          </div>
        </div>
        <div>
          <p className="text-label-sm font-mono text-on-surface-variant mb-2">BENEFICIARY</p>
          <div className="flex items-center gap-3 p-3 bg-surface-container-low rounded border border-outline-variant/10">
            <div className="w-8 h-8 rounded-full bg-secondary-container/20 flex items-center justify-center text-secondary">
              <Icon name="account_balance" className="text-[18px]" />
            </div>
            <span className="text-label-sm font-mono text-on-surface truncate">{shortenAddress(vault.beneficiary)}</span>
          </div>
        </div>
        {vault.subject_aka?.length > 0 && (
          <div>
            <p className="text-label-sm font-mono text-on-surface-variant mb-2">KNOWN ALIASES</p>
            <div className="flex flex-wrap gap-2">
              {vault.subject_aka.map((a) => (
                <span key={a} className="px-2 py-1 rounded bg-surface-container-low text-label-sm font-mono border border-outline-variant/10">
                  {a}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </GlassPanel>
  );
}

function GrantorControls({ vault, address, glClient, onChanged }) {
  const [mode, setMode] = useState(null); // "fund" | "beneficiary" | null
  const [amount, setAmount] = useState("");
  const [newBeneficiary, setNewBeneficiary] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [error, setError] = useState("");

  async function fund(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const amountUnits = usdcToUnits(amount);
      setStep("Declaring top-up on GenLayer…");
      await write(glClient, "fund_vault", [vault.id, Number(amountUnits)]);
      setStep("Depositing USDC on Base Sepolia…");
      const { steps } = await api.getEscrowFundCalldata(vault.id, amountUnits.toString());
      await sendBaseSepoliaSteps(address, steps);
      setMode(null);
      setAmount("");
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setStep("");
    }
  }

  async function changeBeneficiary(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await write(glClient, "set_beneficiary", [vault.id, newBeneficiary]);
      setMode(null);
      setNewBeneficiary("");
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!confirm("Cancel this vault and reclaim the full balance?")) return;
    setBusy(true);
    setError("");
    try {
      await write(glClient, "cancel_vault", [vault.id]);
      // Sweep the refund settlement onto Base Sepolia so the grantor can
      // actually claim it — see backend/src/baseSepolia.js. Best-effort:
      // a failure here just means claiming has to wait for a later sweep.
      api.relaySettlements(vault.id).catch(() => {});
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassPanel className="p-6 space-y-4">
      <h2 className="text-label-sm font-mono text-on-surface-variant uppercase">Grantor Controls</h2>
      <ErrorBanner message={error} />
      {mode === "fund" ? (
        <form onSubmit={fund} className="space-y-3">
          <Field label="Additional USDC">
            <Input type="number" step="any" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
          </Field>
          {busy && step && <p className="text-label-sm font-mono text-on-surface-variant">{step}</p>}
          <div className="flex gap-2">
            <Button type="submit" loading={busy} className="flex-1">
              Confirm
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : mode === "beneficiary" ? (
        <form onSubmit={changeBeneficiary} className="space-y-3">
          <Field label="New beneficiary address">
            <Input value={newBeneficiary} onChange={(e) => setNewBeneficiary(e.target.value)} placeholder="0x..." className="font-mono" required autoFocus />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" loading={busy} className="flex-1">
              Confirm
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          <Button variant="secondary" className="w-full" onClick={() => setMode("fund")}>
            <Icon name="add_circle" className="text-[18px]" /> Fund Vault
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => setMode("beneficiary")}>
            <Icon name="person_edit" className="text-[18px]" /> Change Beneficiary
          </Button>
          <Button variant="danger" className="w-full" onClick={cancel} loading={busy}>
            <Icon name="cancel" className="text-[18px]" /> Cancel &amp; Refund
          </Button>
        </div>
      )}
    </GlassPanel>
  );
}

function ContestForm({ claimId, vaultId, address, glClient, onSubmitted }) {
  const [urls, setUrls] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [bondUsdc, setBondUsdc] = useState("0");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const urlList = urls
        .split("\n")
        .map((u) => u.trim())
        .filter(Boolean);
      const bondUnits = usdcToUnits(bondUsdc);
      setStep("Declaring contest on GenLayer…");
      await write(glClient, "contest_claim", [claimId, JSON.stringify(urlList), imageUrl, Number(bondUnits)]);
      if (bondUnits > 0n) {
        setStep("Depositing bond on Base Sepolia…");
        const { steps } = await api.getEscrowFundCalldata(vaultId, bondUnits.toString());
        await sendBaseSepoliaSteps(address, steps);
      }
      onSubmitted();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setStep("");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorBanner message={error} />
      <Field
        label="Counter-evidence URLs"
        hint="One per line, up to 5. Proof the subject is alive, or that the death claim is mistaken. Must be Wayback Machine snapshots (web.archive.org/web/...), not live pages."
      >
        <Textarea
          rows={3}
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
          placeholder={"https://web.archive.org/web/20240101000000/https://..."}
          required
        />
      </Field>
      <Field label="Optional image URL" hint="Also a Wayback Machine snapshot URL, not a live page.">
        <Input
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://web.archive.org/web/20240101000000/https://..."
        />
      </Field>
      <Field label="Bond (USDC)">
        <Input type="number" step="any" min="0" value={bondUsdc} onChange={(e) => setBondUsdc(e.target.value)} required />
      </Field>
      {busy && step && <p className="text-label-sm font-mono text-on-surface-variant">{step}</p>}
      <Button type="submit" loading={busy} className="w-full">
        Submit Counter-Evidence
      </Button>
    </form>
  );
}

export default function VaultDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { address, glClient } = useAddress();
  const [vault, setVault] = useState(null);
  const [claims, setClaims] = useState([]);
  const [contests, setContests] = useState([]);
  const [error, setError] = useState("");
  const [showContest, setShowContest] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  const load = useCallback(() => {
    api
      .getVault(id)
      .then(setVault)
      .catch((err) => setError(err.message));
    api
      .getClaimsForVault(id)
      .then(setClaims)
      .catch(() => {});
  }, [id]);

  useEffect(load, [load]);

  const activeClaimId = vault?.active_claim_id;
  useEffect(() => {
    if (!activeClaimId) {
      setContests([]);
      return;
    }
    api
      .getContestsForClaim(activeClaimId)
      .then(setContests)
      .catch(() => {});
  }, [activeClaimId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!vault)
    return (
      <div className="flex items-center justify-center py-24 text-on-surface-variant gap-2">
        <Spinner /> Loading vault…
      </div>
    );

  const activeClaim = claims.find((c) => c.id === vault.active_claim_id) || null;
  const pastClaims = claims.filter((c) => c.id !== vault.active_claim_id);
  const isGrantor = address && vault.grantor.toLowerCase() === address.toLowerCase();
  const canResolve = activeClaim && ["OPEN", "CONTESTED"].includes(activeClaim.status) && now >= Number(activeClaim.contest_deadline_ts);
  const contestOpen = activeClaim && ["OPEN", "CONTESTED"].includes(activeClaim.status) && now < Number(activeClaim.contest_deadline_ts);

  async function handleResolve() {
    setResolving(true);
    setError("");
    try {
      await write(glClient, "resolve_claim", [activeClaim.id]);
      load();
      navigate(`/claims/${activeClaim.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2 text-label-sm font-mono text-on-surface-variant mb-4">
          <Link to="/dashboard" className="hover:text-primary">
            VAULTS
          </Link>
          <Icon name="chevron_right" className="text-[14px]" />
          <span className="text-on-surface">VAULT #{vault.id}</span>
        </div>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-headline-lg font-bold mb-2">{vault.subject_name}</h1>
            <p className="text-on-surface-variant max-w-2xl text-body-md">
              Escrow vault #{vault.id}, created {formatTs(vault.created_ts)}. Contest window: {Math.round(vault.contest_window_seconds / 86400)} days.
            </p>
          </div>
          <StatusBadge status={vault.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
        <div className="lg:col-span-8 space-y-gutter">
          <GlassPanel className="p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <Icon name="account_balance_wallet" className="filled" style={{ fontSize: "96px" }} />
            </div>
            <div className="relative z-10">
              <p className="text-label-sm font-mono text-on-surface-variant mb-2">VAULT BALANCE</p>
              <div className="flex items-baseline gap-3">
                <span className="text-[36px] font-extrabold text-primary leading-none">{formatUsdc(vault.balance_usdc)}</span>
              </div>
            </div>
          </GlassPanel>

          {activeClaim ? (
            <section className="glass-panel rounded-xl overflow-hidden">
              <div className="px-8 py-6 border-b border-outline-variant/20 flex justify-between items-center">
                <h2 className="text-headline-md font-semibold">Active Claim</h2>
                <span className="text-label-sm font-mono text-on-surface-variant">#{activeClaim.id}</span>
              </div>
              <div className="p-8 space-y-8">
                <ClaimTimeline claim={activeClaim} now={now} />
                {activeClaim.reasoning && (
                  <div className="p-4 bg-surface-container-high rounded-lg border border-outline-variant/20">
                    <p className="text-label-sm font-mono text-on-surface-variant uppercase mb-2">Validator reasoning</p>
                    <p className="text-body-md text-on-surface">{activeClaim.reasoning}</p>
                  </div>
                )}
                <EvidenceList title="Death-claim evidence" urls={activeClaim.evidence_urls} imageUrl={activeClaim.evidence_image_url} />
                {contests.map((c) => (
                  <EvidenceList key={c.id} title={`Contest #${c.id} evidence — ${shortenAddress(c.contester)}`} urls={c.urls} imageUrl={c.image_url} />
                ))}

                {showContest && contestOpen && (
                  <div className="pt-4 border-t border-outline-variant/20">
                    <ContestForm
                      claimId={activeClaim.id}
                      vaultId={vault.id}
                      address={address}
                      glClient={glClient}
                      onSubmitted={() => {
                        setShowContest(false);
                        load();
                      }}
                    />
                  </div>
                )}
              </div>
            </section>
          ) : vault.status === "ACTIVE" ? (
            <GlassPanel>
              <EmptyState icon="shield" title="No open claim" description="This vault is dormant — no death claim is currently under judgement." />
            </GlassPanel>
          ) : null}

          {pastClaims.length > 0 && (
            <section className="glass-panel rounded-xl overflow-hidden">
              <div className="px-8 py-6 border-b border-outline-variant/20">
                <h2 className="text-headline-md font-semibold">Claim History</h2>
              </div>
              <div className="divide-y divide-outline-variant/10">
                {pastClaims.map((c) => (
                  <Link key={c.id} to={`/claims/${c.id}`} className="flex items-center justify-between px-8 py-4 hover:bg-surface-variant/10 transition-colors">
                    <div>
                      <p className="font-medium">Claim #{c.id}</p>
                      <p className="text-label-sm font-mono text-on-surface-variant">{formatTs(c.submitted_ts)}</p>
                    </div>
                    <StatusBadge status={c.status} size="sm" />
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="lg:col-span-4 space-y-gutter">
          <ParticipantsCard vault={vault} />

          {isGrantor && vault.status === "ACTIVE" && (
            <GrantorControls vault={vault} address={address} glClient={glClient} onChanged={load} />
          )}

          <GlassPanel className="p-6 space-y-4">
            <h2 className="text-label-sm font-mono text-on-surface-variant uppercase">Actions</h2>
            <ErrorBanner message={error} />

            {vault.status === "ACTIVE" && (
              <Link to={`/vaults/${vault.id}/claim`}>
                <Button className="w-full">
                  <Icon name="report" className="text-[18px]" />
                  Submit Death Claim
                </Button>
              </Link>
            )}

            {contestOpen && !showContest && (
              <Button variant="secondary" className="w-full" onClick={() => setShowContest(true)}>
                <Icon name="add_moderator" className="text-[18px]" />
                Submit Counter-Evidence
              </Button>
            )}

            {activeClaim && !canResolve && !["CONFIRMED", "REFUTED", "INCONCLUSIVE"].includes(activeClaim.status) && (
              <div className="relative group">
                <button disabled className="w-full border border-outline-variant/30 text-on-surface-variant py-4 rounded-lg flex flex-col items-center opacity-50 cursor-not-allowed">
                  <div className="flex items-center gap-2">
                    <Icon name="verified_user" className="text-[20px]" />
                    Resolve Claim
                  </div>
                  <span className="text-[10px] font-mono mt-1 uppercase tracking-tighter">Available once the window closes</span>
                </button>
              </div>
            )}

            {canResolve && (
              <Button className="w-full" onClick={handleResolve} loading={resolving}>
                <Icon name="gavel" className="text-[18px]" />
                {resolving ? "Fetching evidence & judging…" : "Resolve Claim"}
              </Button>
            )}

            {vault.status === "PAYOUT_READY" && (
              <Link to="/balance">
                <Button className="w-full">
                  <Icon name="account_balance_wallet" className="text-[18px]" />
                  Go withdraw
                </Button>
              </Link>
            )}
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}
