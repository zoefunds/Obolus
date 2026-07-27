import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createWalletClient } from "./genlayerBrowser.js";

// Writes are signed by the connected wallet itself — connectWallet() below
// requests the account via the standard EIP-1193 `eth_requestAccounts`
// call, then builds a genlayer-js client whose `account` is that address,
// which makes the SDK route signing through the injected wallet
// (window.ethereum) rather than a server-held key. See
// lib/genlayerBrowser.js for why this works against StudioNet despite
// genlayer-js's own `connect()` helper claiming only localnet is
// supported, and MEMORY.md for the full history. `glClient` is that
// signing client; write call sites use it directly (see lib/writes.js).
const AddressContext = createContext(null);

const STORAGE_KEY = "obolus.viewingAddress";
const WAS_CONNECTED_KEY = "obolus.walletConnected";

export function AddressProvider({ children }) {
  const [address, setAddressState] = useState(() => localStorage.getItem(STORAGE_KEY) || "");
  const [glClient, setGlClient] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [walletConnected, setWalletConnected] = useState(() => localStorage.getItem(WAS_CONNECTED_KEY) === "1");

  useEffect(() => {
    if (address) localStorage.setItem(STORAGE_KEY, address);
    else localStorage.removeItem(STORAGE_KEY);
  }, [address]);

  const setAddress = useCallback(async (addr) => {
    setAddressState(addr);
    if (!addr) {
      setGlClient(null);
      return;
    }
    try {
      setGlClient(await createWalletClient(addr));
    } catch (err) {
      setConnectError(err.message || "Could not prepare the wallet for signing.");
      setGlClient(null);
    }
  }, []);

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      setConnectError("No injected wallet found. Install MetaMask (or similar) to use Obolus.");
      return;
    }
    setConnecting(true);
    setConnectError("");
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (accounts?.[0]) {
        await setAddress(accounts[0]);
        setWalletConnected(true);
        localStorage.setItem(WAS_CONNECTED_KEY, "1");
      }
    } catch (err) {
      setConnectError(err.message || "Wallet connection was rejected.");
    } finally {
      setConnecting(false);
    }
  }, [setAddress]);

  const disconnectWallet = useCallback(() => {
    setWalletConnected(false);
    localStorage.removeItem(WAS_CONNECTED_KEY);
    setAddressState("");
    setGlClient(null);
  }, []);

  // Re-sync automatically if the wallet's active account changes, and
  // silently reconnect on reload if we were connected before (without
  // prompting — eth_accounts never triggers the wallet's permission UI).
  useEffect(() => {
    if (!window.ethereum) return;
    const handleAccountsChanged = (accounts) => {
      if (accounts?.[0]) setAddress(accounts[0]);
      else disconnectWallet();
    };
    window.ethereum.on?.("accountsChanged", handleAccountsChanged);

    if (walletConnected) {
      window.ethereum
        .request({ method: "eth_accounts" })
        .then((accounts) => accounts?.[0] && setAddress(accounts[0]))
        .catch(() => {});
    }

    return () => window.ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AddressContext.Provider
      value={{ address, setAddress, glClient, connectWallet, disconnectWallet, connecting, connectError, walletConnected }}
    >
      {children}
    </AddressContext.Provider>
  );
}

export function useAddress() {
  const ctx = useContext(AddressContext);
  if (!ctx) throw new Error("useAddress must be used within AddressProvider");
  return ctx;
}

export function shortenAddress(addr) {
  if (!addr || addr.length < 10) return addr || "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
