import { useEffect, useState } from "react";
import { GlassPanel, Icon, Field, Input, Button, ErrorBanner } from "../components/ui.jsx";
import { shortenAddress, useAddress } from "../lib/AddressContext.jsx";
import { formatGen } from "../lib/gen.js";
import { api } from "../api.js";
import { write } from "../lib/writes.js";

function StatTile({ label, value }) {
  return (
    <GlassPanel className="p-5">
      <p className="text-label-sm font-mono text-on-surface-variant uppercase tracking-widest mb-1">{label}</p>
      <p className="text-headline-md font-semibold">{value}</p>
    </GlassPanel>
  );
}

export default function AdminPage() {
  const { glClient } = useAddress();
  const [config, setConfig] = useState(null);
  const [stats, setStats] = useState(null);
  const [claimantBond, setClaimantBond] = useState("0");
  const [contesterBond, setContesterBond] = useState("0");
  const [newOwner, setNewOwner] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = () => {
    api.getConfig().then((c) => {
      setConfig(c);
      setClaimantBond(String(c.min_claimant_bond_wei));
      setContesterBond(String(c.min_contester_bond_wei));
    });
    api.getStats().then(setStats);
  };

  useEffect(load, []);

  async function run(action, fn) {
    setBusy(action);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(`${action} succeeded.`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  if (!config) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-headline-lg font-bold mb-2">Platform Administration</h1>
        <p className="text-on-surface-variant text-body-md">
          Owner-only calls, signed by your connected wallet. The contract's{" "}
          <code className="font-mono text-secondary">only the owner may call this</code> guard is enforced on-chain — these will
          revert unless your connected address is the current owner.
        </p>
        <p className="text-label-sm font-mono text-outline mt-2">Current owner: {shortenAddress(config.owner)}</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatTile label="Vaults" value={stats.vault_count} />
          <StatTile label="Claims" value={stats.claim_count} />
          <StatTile label="Escrowed" value={formatGen(stats.total_escrowed_wei)} />
          <StatTile label="Paid Out" value={formatGen(stats.total_paid_out_wei)} />
          <StatTile label="Confirmed" value={stats.total_claims_confirmed} />
          <StatTile label="Refuted" value={stats.total_claims_refuted} />
          <StatTile label="Inconclusive" value={stats.total_claims_inconclusive} />
          <StatTile label="Paused" value={stats.paused ? "YES" : "NO"} />
        </div>
      )}

      <ErrorBanner message={error} />
      {notice && <p className="text-tertiary text-body-md">{notice}</p>}

      <GlassPanel className="p-6 space-y-4">
        <h2 className="text-headline-md font-semibold flex items-center gap-2">
          <Icon name="pause_circle" className="text-[20px]" />
          Platform pause
        </h2>
        <p className="text-body-md text-on-surface-variant">
          Halts new vaults, funding, claims, and contests. Never blocks <code className="font-mono text-secondary">resolve_claim</code> or{" "}
          <code className="font-mono text-secondary">withdraw</code> — funds already at stake stay resolvable and withdrawable.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" loading={busy === "pause"} onClick={() => run("pause", () => write(glClient, "pause", []))}>
            Pause platform
          </Button>
          <Button variant="secondary" loading={busy === "unpause"} onClick={() => run("unpause", () => write(glClient, "unpause", []))}>
            Unpause platform
          </Button>
        </div>
      </GlassPanel>

      <GlassPanel className="p-6 space-y-4">
        <h2 className="text-headline-md font-semibold flex items-center gap-2">
          <Icon name="tune" className="text-[20px]" />
          Minimum bonds
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Min. claimant bond (wei)">
            <Input value={claimantBond} onChange={(e) => setClaimantBond(e.target.value)} />
          </Field>
          <Field label="Min. contester bond (wei)">
            <Input value={contesterBond} onChange={(e) => setContesterBond(e.target.value)} />
          </Field>
        </div>
        <Button
          loading={busy === "bonds"}
          onClick={() => run("bonds", () => write(glClient, "set_minimum_bonds", [Number(claimantBond), Number(contesterBond)]))}
        >
          Update minimums
        </Button>
      </GlassPanel>

      <GlassPanel className="p-6 space-y-4">
        <h2 className="text-headline-md font-semibold flex items-center gap-2">
          <Icon name="key" className="text-[20px]" />
          Transfer ownership
        </h2>
        <Field label="New owner address">
          <Input value={newOwner} onChange={(e) => setNewOwner(e.target.value)} placeholder="0x..." className="font-mono" />
        </Field>
        <Button variant="danger" loading={busy === "owner"} onClick={() => run("owner", () => write(glClient, "set_owner", [newOwner]))}>
          Transfer ownership
        </Button>
      </GlassPanel>
    </div>
  );
}
