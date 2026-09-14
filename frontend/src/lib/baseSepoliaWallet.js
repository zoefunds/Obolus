// Real, user-signed USDC transactions on Base Sepolia from the browser.
//
// GenLayer (genlayerBrowser.js) is the adjudication layer only — it never
// escrows or moves real value (see MEMORY.md, "USDC migration"). Real
// USDC custody lives in ObolusEscrow on Base Sepolia, and every write here
// goes through the SAME injected wallet used for GenLayer writes, just on
// a different chain. The backend never signs or holds these — it only
// returns ready-to-send calldata (see backend/src/baseSepolia.js), the
// same "server builds calldata, wallet signs it" split used for GenLayer.
const BASE_SEPOLIA_CHAIN_ID_HEX = "0x14a34"; // 84532

async function ensureBaseSepolia() {
  if (!window.ethereum) throw new Error("No injected wallet found.");
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_SEPOLIA_CHAIN_ID_HEX }] });
  } catch (err) {
    if (err.code !== 4902) throw err; // 4902: chain not added to the wallet yet.
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: BASE_SEPOLIA_CHAIN_ID_HEX,
          chainName: "Base Sepolia",
          rpcUrls: ["https://sepolia.base.org"],
          nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
          blockExplorerUrls: ["https://sepolia.basescan.org"],
        },
      ],
    });
  }
}

/** Sends one or more {to, data, value} steps in order, on Base Sepolia,
 * from `fromAddress`. Used for the approve+fundVault pair returned by
 * GET /api/vaults/:id/escrow-fund-calldata, and for the single claim()
 * step from GET /api/vaults/:id/escrow-claim-calldata. Waits for each
 * step's receipt before sending the next, since fundVault depends on the
 * approve landing first. */
export async function sendBaseSepoliaSteps(fromAddress, steps) {
  await ensureBaseSepolia();
  const hashes = [];
  for (const step of steps) {
    const hash = await window.ethereum.request({
      method: "eth_sendTransaction",
      params: [{ from: fromAddress, to: step.to, data: step.data, value: step.value || "0x0" }],
    });
    hashes.push(hash);
    await waitForReceipt(hash);
  }
  return hashes;
}

async function waitForReceipt(hash, { intervalMs = 2000, retries = 60 } = {}) {
  for (let i = 0; i < retries; i++) {
    const receipt = await window.ethereum.request({ method: "eth_getTransactionReceipt", params: [hash] });
    if (receipt) {
      if (receipt.status === "0x0") throw new Error(`Base Sepolia transaction ${hash} reverted.`);
      return receipt;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for Base Sepolia transaction ${hash}.`);
}
