import { useEffect, useState, useCallback } from "react";
import { GlassPanel, Icon, Button, ErrorBanner, Spinner, EmptyState } from "../components/ui.jsx";
import VaultCard from "../components/VaultCard.jsx";
import { api } from "../api.js";

const PAGE_SIZE = 12;

// Every vault is readable by anyone (get_vault has no access control — see
// contracts/obolus.py) but the app previously had no way to discover a
// vault's id unless you already knew it: the Dashboard only lists vaults
// for the connected address's own grantor/beneficiary roles. That's a real
// gap for the contest mechanism, whose whole point is that someone other
// than the named parties — the subject if alive, a co-heir, anyone with
// counter-evidence — needs to be able to find a vault to contest it. This
// page is that discovery path: every vault, newest first, no wallet or
// role required.
export default function BrowseVaultsPage() {
  const [totalCount, setTotalCount] = useState(null);
  const [vaults, setVaults] = useState([]);
  const [loadedThrough, setLoadedThrough] = useState(null); // lowest id fetched so far
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const loadInitial = useCallback(() => {
    setLoading(true);
    setError("");
    api
      .getVaultCount()
      .then(async ({ count }) => {
        setTotalCount(count);
        if (count === 0) {
          setVaults([]);
          return;
        }
        const from = Math.max(1, count - PAGE_SIZE + 1);
        const ids = [];
        for (let id = count; id >= from; id--) ids.push(id);
        const fetched = await Promise.all(ids.map((id) => api.getVault(id)));
        setVaults(fetched);
        setLoadedThrough(from);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(loadInitial, [loadInitial]);

  async function loadMore() {
    if (!loadedThrough || loadedThrough <= 1) return;
    setLoadingMore(true);
    setError("");
    try {
      const from = Math.max(1, loadedThrough - PAGE_SIZE);
      const ids = [];
      for (let id = loadedThrough - 1; id >= from; id--) ids.push(id);
      const fetched = await Promise.all(ids.map((id) => api.getVault(id)));
      setVaults((prev) => [...prev, ...fetched]);
      setLoadedThrough(from);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  const hasMore = loadedThrough && loadedThrough > 1;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-headline-lg font-bold mb-2">Browse Vaults</h1>
        <p className="text-on-surface-variant text-body-md max-w-2xl">
          Every vault is public — no wallet or role required to view one. If you have evidence relevant to a claim
          or believe a vault's subject is misidentified, find it here and contest it directly.
          {totalCount !== null && ` ${totalCount} vault${totalCount === 1 ? "" : "s"} total.`}
        </p>
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <div className="flex items-center justify-center py-24 text-on-surface-variant gap-2">
          <Spinner /> Loading vaults…
        </div>
      ) : vaults.length === 0 ? (
        <GlassPanel>
          <EmptyState icon="inbox" title="No vaults yet" description="Nobody has created a vault on this deployment yet." />
        </GlassPanel>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {vaults.map((v) => (
              <VaultCard key={v.id} vault={v} roleLabel={`Grantor: ${v.grantor.slice(0, 6)}…${v.grantor.slice(-4)}`} />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center">
              <Button variant="secondary" onClick={loadMore} loading={loadingMore}>
                <Icon name="expand_more" className="text-[18px]" />
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
