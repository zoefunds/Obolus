import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { GlassPanel, Icon, Field, Input, Textarea, Button, ErrorBanner, Spinner } from "../components/ui.jsx";
import { genToWei } from "../lib/gen.js";
import { api } from "../api.js";
import { write } from "../lib/writes.js";
import { useAddress } from "../lib/AddressContext.jsx";

export default function SubmitClaimPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { glClient } = useAddress();
  const [vault, setVault] = useState(null);
  const [urls, setUrls] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [note, setNote] = useState("");
  const [bondGen, setBondGen] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getVault(id).then(setVault).catch((err) => setError(err.message));
  }, [id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const urlList = urls
        .split("\n")
        .map((u) => u.trim())
        .filter(Boolean);
      const receipt = await write(
        glClient,
        "submit_death_claim",
        [Number(id), JSON.stringify(urlList), imageUrl, note],
        genToWei(bondGen)
      );
      const claimId = receipt?.data?.result;
      navigate(claimId ? `/claims/${claimId}` : `/vaults/${id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !vault) return <ErrorBanner message={error} />;
  if (!vault)
    return (
      <div className="flex items-center justify-center py-24 text-on-surface-variant gap-2">
        <Spinner /> Loading vault…
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-2 text-label-sm font-mono text-on-surface-variant">
        <Link to={`/vaults/${id}`} className="hover:text-primary">
          VAULT #{id}
        </Link>
        <Icon name="chevron_right" className="text-[14px]" />
        <span className="text-on-surface">SUBMIT DEATH CLAIM</span>
      </div>

      <GlassPanel className="overflow-hidden">
        <div className="p-8 border-b border-outline-variant/30 bg-surface-container-low/50">
          <h1 className="text-headline-lg font-bold text-primary mb-2">Submit a Death Claim</h1>
          <p className="text-body-md text-on-surface-variant">
            Claiming that <span className="text-on-surface font-medium">{vault.subject_name}</span> has died. Validators will
            independently fetch every URL below — only concrete, specific, sourced evidence should be submitted. A false or
            unsupported claim risks your bond being forfeited on a REFUTED verdict.
          </p>
        </div>
        <form className="p-8 space-y-6" onSubmit={handleSubmit}>
          <ErrorBanner message={error} />

          <Field label="Evidence URLs" hint="One per line, 1–5 required. Obituary, death registry, or credible news.">
            <Textarea rows={4} value={urls} onChange={(e) => setUrls(e.target.value)} placeholder={"https://...\nhttps://..."} required />
          </Field>

          <Field label="Optional certificate / obituary image URL">
            <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
          </Field>

          <Field label="Note" hint="Context only — e.g. your relationship to the subject. Not itself evidence.">
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={800} />
          </Field>

          <Field label="Bond (GEN)" hint="Returned if CONFIRMED or INCONCLUSIVE. Forfeited into the vault if REFUTED.">
            <Input type="number" step="any" min="0" value={bondGen} onChange={(e) => setBondGen(e.target.value)} required />
          </Field>

          <div className="flex items-center justify-end gap-4 pt-2">
            <Button type="submit" loading={submitting}>
              {submitting ? "Submitting…" : "Submit Claim"}
            </Button>
          </div>
        </form>
      </GlassPanel>
    </div>
  );
}
