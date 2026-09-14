import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import Logo from "./Logo.jsx";
import { Icon } from "./ui.jsx";
import { useAddress, shortenAddress } from "../lib/AddressContext.jsx";
import { api } from "../api.js";
import { useIsOwner } from "../lib/useIsOwner.js";

const NAV_LINKS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/vaults", label: "Browse" },
  { to: "/vaults/new", label: "New Vault" },
];

function navClass({ isActive }) {
  return isActive
    ? "text-primary border-b-2 border-primary pb-1 text-label-sm font-mono uppercase tracking-widest"
    : "text-on-surface-variant hover:text-primary transition-colors text-label-sm font-mono uppercase tracking-widest";
}

function mobileNavClass({ isActive }) {
  return isActive
    ? "block px-4 py-3 rounded-lg bg-primary/10 text-primary text-label-sm font-mono uppercase tracking-widest"
    : "block px-4 py-3 rounded-lg text-on-surface-variant hover:bg-surface-variant/20 text-label-sm font-mono uppercase tracking-widest";
}

function WalletControl() {
  const { address, connectWallet, disconnectWallet, connecting, connectError } = useAddress();
  const [menuOpen, setMenuOpen] = useState(false);

  if (address) {
    return (
      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
          className="flex items-center gap-2 h-8 pl-2 pr-3 rounded-full border border-outline-variant/50 text-on-surface hover:border-primary/40 transition-colors"
        >
          <span className="w-2 h-2 rounded-full bg-tertiary" />
          <span className="text-code-md font-mono text-[12px]">{shortenAddress(address)}</span>
          <Icon name="expand_more" className="text-[16px] text-on-surface-variant" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-2 w-48 glass-panel rounded-lg overflow-hidden z-50">
            <button
              onClick={disconnectWallet}
              className="w-full text-left px-4 py-3 text-body-md text-error hover:bg-error/10 transition-colors flex items-center gap-2"
            >
              <Icon name="logout" className="text-[16px]" />
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {connectError && <span className="hidden lg:inline text-[11px] text-error max-w-[220px] truncate" title={connectError}>{connectError}</span>}
      <button
        onClick={connectWallet}
        disabled={connecting}
        className="flex items-center gap-2 h-8 px-3 rounded-full bg-primary text-on-primary text-label-sm font-mono hover:brightness-110 transition-all disabled:opacity-50"
      >
        {connecting ? <Icon name="progress_activity" className="animate-spin text-[16px]" /> : <Icon name="account_balance_wallet" className="text-[16px]" />}
        {connecting ? "Connecting…" : "Connect Wallet"}
      </button>
    </div>
  );
}

export default function Header() {
  const { address } = useAddress();
  const { isOwner } = useIsOwner();
  const [claimableUnits, setClaimableUnits] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!address) {
      setClaimableUnits(null);
      return;
    }
    api
      .getBalance(address)
      .then((res) => !cancelled && setClaimableUnits(res.totalClaimableUsdc))
      .catch(() => !cancelled && setClaimableUnits(null));
    return () => {
      cancelled = true;
    };
  }, [address]);

  const balanceUsdc = claimableUnits
    ? (Number(BigInt(claimableUnits)) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 4 })
    : null;
  const mobileLinks = isOwner ? [...NAV_LINKS, { to: "/admin", label: "Admin" }] : NAV_LINKS;

  return (
    <header className="sticky top-0 z-50 w-full bg-surface/80 backdrop-blur-xl border-b border-outline-variant/30">
      <div className="flex justify-between items-center w-full px-margin-mobile md:px-margin-desktop h-16 max-w-container-max-width mx-auto">
        <div className="flex items-center gap-8">
          <NavLink to="/">
            <Logo size={30} />
          </NavLink>
          <nav className="hidden md:flex items-center gap-6">
            {NAV_LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} className={navClass}>
                {l.label}
              </NavLink>
            ))}
            {isOwner && (
              <NavLink to="/admin" className={navClass}>
                Admin
              </NavLink>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {address && (
            <NavLink
              to="/balance"
              className="hidden sm:flex px-4 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary font-mono text-label-sm hover:bg-primary/10 transition-colors"
            >
              Balance: {balanceUsdc ?? "…"} USDC
            </NavLink>
          )}
          <WalletControl />
          <button
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-variant/20 transition-colors"
            aria-label="Toggle navigation menu"
          >
            <Icon name={mobileMenuOpen ? "close" : "menu"} className="text-[22px]" />
          </button>
        </div>
      </div>
      {mobileMenuOpen && (
        <nav className="md:hidden px-margin-mobile pb-4 space-y-1 border-t border-outline-variant/20 pt-3">
          {mobileLinks.map((l) => (
            <NavLink key={l.to} to={l.to} className={mobileNavClass} onClick={() => setMobileMenuOpen(false)}>
              {l.label}
            </NavLink>
          ))}
          {address && (
            <NavLink to="/balance" className={mobileNavClass} onClick={() => setMobileMenuOpen(false)}>
              Balance ({balanceUsdc ?? "…"} USDC)
            </NavLink>
          )}
        </nav>
      )}
    </header>
  );
}
