const buckets = new Map();
export function allow(key, limit = 10, windowMs = 60000) {
  const now = Date.now();
  const bucket = buckets.get(key) || { count: 0, reset: now + windowMs };
  if (now > bucket.reset) { bucket.count = 0; bucket.reset = now + windowMs; }
  bucket.count += 1;
  buckets.set(key, bucket);
  return bucket.count <= limit;
}
