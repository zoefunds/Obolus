import { useEffect, useState } from "react";
import { useAddress } from "./AddressContext.jsx";
import { api } from "../api.js";

// Whether the connected wallet is the contract's current owner
// (get_config().owner) — used to hide/guard the admin surface. This is a
// UI convenience only, not a security boundary: the contract itself
// enforces `only the owner may call this` on every admin write regardless
// of what the frontend shows, so hiding the nav link/route is about not
// presenting a "you'll just get rejected" dead end, not about protecting
// anything a determined caller couldn't reach directly against the
// contract anyway.
//
// Returns { isOwner, loading } — callers that gate rendering (the admin
// route guard) should wait out `loading` rather than treating an
// unresolved check as "not owner", or a legitimate owner would flash a
// denied screen on every load.
export function useIsOwner() {
  const { address } = useAddress();
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .getConfig()
      .then((c) => !cancelled && setOwner(c.owner))
      .catch(() => !cancelled && setOwner(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const isOwner = Boolean(address && owner && address.toLowerCase() === owner.toLowerCase());
  return { isOwner, loading };
}
