// USDC is 6-decimal on Base Sepolia (see contracts/base/ObolusEscrow.sol).
// Every amount that used to be GEN (18-decimal, native GenLayer value) is
// now a declared USDC base-unit figure backed by a real deposit on that
// contract — see MEMORY.md, "USDC migration".
const DECIMALS = 6n;
const SCALE = 10n ** DECIMALS;

export function unitsToUsdc(units) {
  if (units === null || units === undefined) return "0";
  const value = typeof units === "bigint" ? units : BigInt(units);
  const whole = value / SCALE;
  const frac = value % SCALE;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

export function usdcToUnits(usdc) {
  const str = String(usdc).trim();
  if (!str) return 0n;
  const [wholeStr, fracStr = ""] = str.split(".");
  const whole = BigInt(wholeStr || "0");
  const frac = BigInt((fracStr + "0".repeat(6)).slice(0, 6) || "0");
  return whole * SCALE + frac;
}

export function formatUsdc(units) {
  return `${unitsToUsdc(units)} USDC`;
}
