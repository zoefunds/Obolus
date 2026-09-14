// genlayer-js@1.1.8+ ships a real `studionet` chain object — proper RPC
// URL, correct chain id, and (critically) a hardcoded `consensusMainContract`
// address + ABI, no dynamic discovery needed. An earlier version of this
// file worked around genlayer-js@0.8.0 not having this at all (that
// version only shipped `localnet`/`simulator`) by reusing the SDK's
// `simulator` chain object with its RPC URL overridden — a fragile hack
// that silently dropped every value-carrying write, since `simulator`'s
// consensus contract is only ever populated by successfully calling the
// simulator-only `sim_getConsensusContract` RPC method. Upgrading to a
// current genlayer-js and using its real `studionet` export removes the
// need for any of that. Verified against a separate, confirmed-working
// StudioNet write implementation.
export { studionet, localnet } from "genlayer-js/chains";
