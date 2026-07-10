const buckets = new Map<string, { count: number; resetAt: number }>();
let lastCleanup = 0;

export function consumeRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup > 60_000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
    lastCleanup = now;
  }
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (current.count >= limit) throw new Error("rate limit exceeded");
  current.count += 1;
}
