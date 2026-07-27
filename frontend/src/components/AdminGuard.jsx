import { EmptyState, Spinner } from "./ui.jsx";
import { useIsOwner } from "../lib/useIsOwner.js";
import { useAddress } from "../lib/AddressContext.jsx";

// Blocks the /admin route for anyone but the connected contract owner —
// see lib/useIsOwner.js for why this is UX, not the real access control
// (the contract enforces that on-chain regardless).
export default function AdminGuard({ children }) {
  const { address } = useAddress();
  const { isOwner, loading } = useIsOwner();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-on-surface-variant gap-2">
        <Spinner /> Checking platform owner…
      </div>
    );
  }

  if (!isOwner) {
    return (
      <EmptyState
        icon="lock"
        title="Owner only"
        description={
          address
            ? "This wallet isn't the platform owner, so admin actions would revert on-chain anyway."
            : "Connect the platform owner's wallet to view this page."
        }
      />
    );
  }

  return children;
}
