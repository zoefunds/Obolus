import Redis from "ioredis";

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

export async function cached(key, ttlSeconds, fn) {
  if (!redis) return fn();
  try {
    const hit = await redis.get(key);
    if (hit !== null) return JSON.parse(hit);
  } catch (err) {
    console.error(`Redis read failed for ${key}, falling back to live call:`, err.message);
  }

  const value = await fn();

  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds ?? DEFAULT_TTL_SECONDS);
  } catch (err) {
    console.error(`Redis write failed for ${key}:`, err.message);
  }

  return value;
}

export async function invalidate(pattern) {
  if (!redis) return;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(...keys);
  } catch (err) {
    console.error(`Redis invalidate failed for ${pattern}:`, err.message);
  }
}
