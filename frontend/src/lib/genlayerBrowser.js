// Real, user-signed transactions against StudioNet from the browser.
//
// genlayer-js@1.1.8+ ships a proper `studionet` chain object — correct RPC
// URL, correct chain id, and a hardcoded `consensusMainContract`
// address + ABI (no dynamic discovery needed). An earlier version of this
// file worked around genlayer-js@0.8.0 not shipping StudioNet at all by
// reusing the SDK's `simulator` chain object with its RPC URL overridden —
// that's why writes silently never went through: `simulator`'s consensus
// contract only ever gets populated by the simulator-only
// `sim_getConsensusContract` RPC call, which Studio's hosted RPC doesn't
// answer the same way `simulator` expects. Verified against
// `~/Event-Weaver`, a separate GenLayer project on this machine with
// confirmed-working StudioNet wallet writes, whose `frontend/src/lib/wallet.tsx`
// this file mirrors closely.
//
// The `account` passed to `createClient` is the connected wallet's address
// as a plain string (not a local private-key account object) — that's what
// makes genlayer-js sign through the injected wallet (window.ethereum)
// instead of a raw key.
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const STUDIONET_CHAIN_ID_HEX = `0x${studionet.id.toString(16)}`;

// Force the injected wallet onto StudioNet. Without this, the wallet signs
// and submits on whatever chain it currently has selected (commonly
// Ethereum Mainnet) — the transaction "succeeds" in the wallet's own eyes
// but never reaches this contract, which looks exactly like "my write
// isn't going through."
async function ensureStudioNetwork() {
  if (!window.ethereum) throw new Error("No injected wallet found.");
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: STUDIONET_CHAIN_ID_HEX }] });
  } catch (err) {
    if (err.code !== 4902) throw err; // 4902: chain not added to the wallet yet.
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: STUDIONET_CHAIN_ID_HEX,
          chainName: studionet.name,
          rpcUrls: studionet.rpcUrls.default.http,
          nativeCurrency: studionet.nativeCurrency,
          blockExplorerUrls: studionet.blockExplorers?.default ? [studionet.blockExplorers.default.url] : undefined,
        },
      ],
    });
  }
}

export async function createWalletClient(address) {
  await ensureStudioNetwork();
  return createClient({ chain: studionet, account: address });
}

export async function walletWriteContract(walletClient, { address, functionName, args = [], value = 0n }) {
  // Re-assert the network on every write: the user may have switched
  // chains in their wallet after connecting without disconnecting from
  // the app, which would otherwise silently sign against the wrong chain.
  await ensureStudioNetwork();
  const txHash = await walletClient.writeContract({ address, functionName, args, value, account: walletClient.account });
  // ACCEPTED, not FINALIZED — see backend/src/contract.js's writeMethod for
  // why. interval/retries mirror ~/Event-Weaver's confirmed-working values.
  return walletClient.waitForTransactionReceipt({ hash: txHash, status: "ACCEPTED", interval: 4000, retries: 90 });
}
