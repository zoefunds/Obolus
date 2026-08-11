import Redis from "ioredis";
import { CONTRACT_ADDRESS } from "./genlayerClient.js";

// Optional read cache. GenLayer views (get_config, get_platform_stats, and
// especially per-vault/per-claim lookups the dashboard polls repeatedly)
// are real network round-trips to StudioNet — caching them briefly cuts
// load without staling data meaningfully, since nothing here is safe-critical
// (writes always hit the chain directly, never the cache). No-ops cleanly
// if REDIS_URL isn't set, so it's never a hard dependency.
const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;

if (redis) {
  redis.on("error", (err) => console.error("Redis error (continuing without cache for affected calls):", err.message));
}

const DEFAULT_TTL_SECONDS = 5;

// Every key is namespaced by the contract address this backend instance is
// currently pointed at. Vault/claim ids are 1-indexed per-contract, so
// "vault:1" from a prior deployment and "vault:1" from a freshly redeployed
// contract are unrelated records that happen to share a numeric id —
// without this prefix, a stale cache entry from an old contract address
// could briefly serve as if it were data for the new one right after a
// redeploy, until its TTL happened to expire. Scoping the key means a
// changed VDE_CONTRACT_ADDRESS makes every prior entry unreachable
// immediately, with no manual flush required.
function scopedKey(key) {
  return `${CONTRACT_ADDRESS || "no-contract"}:${key}`;
}

export async function cached(key, ttlSeconds, fn) {
  if (!redis) return fn();
  const scoped = scopedKey(key);
  try {
    const hit = await redis.get(scoped);
    if (hit !== null) return JSON.parse(hit);
  } catch (err) {
    console.error(`Redis read failed for ${scoped}, falling back to live call:`, err.message);
  }

  const value = await fn();

  try {
    await redis.set(scoped, JSON.stringify(value), "EX", ttlSeconds ?? DEFAULT_TTL_SECONDS);
  } catch (err) {
    console.error(`Redis write failed for ${scoped}:`, err.message);
  }

  return value;
}

export async function invalidate(pattern) {
  if (!redis) return;
  const scoped = scopedKey(pattern);
  try {
    const keys = await redis.keys(scoped);
    if (keys.length) await redis.del(...keys);
  } catch (err) {
    console.error(`Redis invalidate failed for ${scoped}:`, err.message);
  }
}
