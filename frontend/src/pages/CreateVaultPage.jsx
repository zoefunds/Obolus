import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GlassPanel, Icon, Field, Input, Button, ErrorBanner } from "../components/ui.jsx";
import { useAddress } from "../lib/AddressContext.jsx";
import { usdcToUnits, formatUsdc } from "../lib/usdc.js";
import { api } from "../api.js";
import { write } from "../lib/writes.js";
import { sendBaseSepoliaSteps } from "../lib/baseSepoliaWallet.js";

const MAX_AKA_COUNT = 6; // contracts/verifiable_decease_escrow.py: MAX_AKA_COUNT

export default function CreateVaultPage() {
  const { address, glClient } = useAddress();
  const navigate = useNavigate();
  const [config, setConfig] = useState(null);

  const [beneficiary, setBeneficiary] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [akas, setAkas] = useState([]);
  const [akaDraft, setAkaDraft] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [windowDays, setWindowDays] = useState(30);
  const [amountUsdc, setAmountUsdc] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.getConfig().then(setConfig).catch(() => {});
  }, []);

  const minWindowDays = config ? Math.ceil(config.min_contest_window_seconds / 86400) : 1;
  const maxWindowDays = config ? Math.floor(config.max_contest_window_seconds / 86400) : 180;

  function addAka() {
    const trimmed = akaDraft.trim();
    if (!trimmed || akas.includes(trimmed) || akas.length >= MAX_AKA_COUNT) return;
    setAkas([...akas, trimmed]);
    setAkaDraft("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!address || !glClient) {
      setError("Connect a wallet before creating a vault.");
      return;
    }
    setSubmitting(true);
    try {
      const amountUnits = usdcToUnits(amountUsdc);
      setStep("Declaring vault on GenLayer…");
      const receipt = await write(glClient, "create_vault", [
        beneficiary,
        subjectName,
        JSON.stringify(akas),
        birthYear ? Number(birthYear) : 0,
        Math.round(Number(windowDays) * 86400),
        Number(amountUnits),
      ]);
      const vaultId = receipt?.resultValue;
      if (!vaultId) throw new Error("Vault created but no vault id was returned — check /dashboard.");

      setStep("Depositing USDC on Base Sepolia (approve, then deposit)…");
      const { steps } = await api.getEscrowFundCalldata(vaultId, amountUnits.toString());
      await sendBaseSepoliaSteps(address, steps);

      navigate(`/vaults/${vaultId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
      setStep("");
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <GlassPanel className="overflow-hidden">
        <div className="p-8 border-b border-outline-variant/30 bg-surface-container-low/50">
          <h1 className="text-headline-lg font-bold text-primary mb-2">Create a Vault</h1>
          <p className="text-body-md text-on-surface-variant">
            Lock USDC for a beneficiary, naming the subject whose death must be evidenced to release it. The vault
            stays fully reclaimable while ACTIVE — nothing is final until a claim resolves. Depositing requires two
            wallet confirmations on Base Sepolia (approve, then deposit) right after the vault is declared on
            GenLayer.
          </p>
        </div>
        <form className="p-8 space-y-8" onSubmit={handleSubmit}>
          <ErrorBanner message={error} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            <div className="md:col-span-2">
              <Field label="Beneficiary Address" hint="Must differ from your own address.">
                <Input value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} placeholder="0x..." required className="font-mono" />
              </Field>
            </div>

            <Field label="Subject Name" hint="Whose death must be evidenced — usually yourself.">
              <Input value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder="e.g. Jane Doe" required maxLength={160} />
            </Field>

            <Field label="Birth Year (optional)" hint="Helps validators disambiguate a common name.">
              <Input type="number" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} placeholder="YYYY" min="1900" max="2100" />
            </Field>

            <div className="md:col-span-2">
              <Field label="Known Aliases (optional)" hint={`Up to ${MAX_AKA_COUNT} alternate names/handles that help identify the subject in evidence.`}>
                <div className="flex gap-2">
                  <Input
                    value={akaDraft}
                    onChange={(e) => setAkaDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addAka();
                      }
                    }}
                    placeholder="Add an alias and press Enter"
                    disabled={akas.length >= MAX_AKA_COUNT}
                  />
                  <Button type="button" variant="secondary" onClick={addAka} disabled={akas.length >= MAX_AKA_COUNT}>
                    Add
                  </Button>
                </div>
                {akas.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {akas.map((a) => (
                      <span key={a} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high text-label-sm font-mono border border-outline-variant/20">
                        {a}
                        <button type="button" onClick={() => setAkas(akas.filter((x) => x !== a))} className="text-on-surface-variant hover:text-error">
                          <Icon name="close" className="text-[14px]" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </Field>
            </div>

            <Field label="Contest Window" hint={`Between ${minWindowDays} and ${maxWindowDays} days.`}>
              <div className="relative">
                <Input
                  type="number"
                  value={windowDays}
                  onChange={(e) => setWindowDays(e.target.value)}
                  min={minWindowDays}
                  max={maxWindowDays}
                  required
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-label-sm font-mono text-outline pointer-events-none">DAYS</span>
              </div>
            </Field>

            <Field label="USDC to Escrow" hint="Base Sepolia USDC — you'll approve and deposit this after the vault is created.">
              <div className="relative">
                <Input type="number" step="any" min="0" value={amountUsdc} onChange={(e) => setAmountUsdc(e.target.value)} placeholder="0.00" required />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-label-sm font-mono text-primary font-bold pointer-events-none">USDC</span>
              </div>
            </Field>
          </div>

          <div className="bg-surface-container-high/50 rounded-xl p-6 border border-outline-variant/20 flex gap-4">
            <div className="shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Icon name="info" />
            </div>
            <div>
              <h4 className="text-headline-md font-semibold mb-1">How the contest window works</h4>
              <p className="text-body-md text-on-surface-variant mb-4">
                Once someone submits a death claim against this vault, the contest window you set here starts —
                anyone with counter-evidence has that long to submit it before resolution can run. Neither the
                claimant's nor a contester's bond is set here; those minimums are configured platform-wide.
              </p>
              {config && (
                <div className="flex gap-4 flex-wrap">
                  <div className="px-3 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant/10">
                    <span className="block text-[10px] font-mono text-outline uppercase mb-0.5">Min. claimant bond</span>
                    <span className="text-on-surface font-mono text-code-md">{formatUsdc(config.min_claimant_bond_usdc)}</span>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant/10">
                    <span className="block text-[10px] font-mono text-outline uppercase mb-0.5">Min. contester bond</span>
                    <span className="text-on-surface font-mono text-code-md">{formatUsdc(config.min_contester_bond_usdc)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-4 pt-4">
            {submitting && step && <span className="text-label-sm font-mono text-on-surface-variant">{step}</span>}
            <Button type="submit" loading={submitting}>
              {submitting ? "Establishing…" : "Establish Vault"}
            </Button>
          </div>
        </form>
      </GlassPanel>
    </div>
  );
}
