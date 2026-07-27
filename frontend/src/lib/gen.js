// GEN is 18-decimal, wei-denominated on-chain (see contracts/verifiable_decease_escrow.py: WEI = 1).
const DECIMALS = 18n;
const SCALE = 10n ** DECIMALS;

export function weiToGen(wei) {
  if (wei === null || wei === undefined) return "0";
  const value = typeof wei === "bigint" ? wei : BigInt(wei);
  const whole = value / SCALE;
  const frac = value % SCALE;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "").slice(0, 6);
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

export function genToWei(gen) {
  const str = String(gen).trim();
  if (!str) return 0n;
  const [wholeStr, fracStr = ""] = str.split(".");
  const whole = BigInt(wholeStr || "0");
  const frac = BigInt((fracStr + "0".repeat(18)).slice(0, 18) || "0");
  return whole * SCALE + frac;
}

export function formatGen(wei) {
  return `${weiToGen(wei)} GEN`;
}
