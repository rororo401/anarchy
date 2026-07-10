import assert from "node:assert/strict";
import { consumeRateLimit } from "../lib/server/rate-limit";

consumeRateLimit("test:one", 2, 60_000);
consumeRateLimit("test:one", 2, 60_000);
assert.throws(() => consumeRateLimit("test:one", 2, 60_000), /rate limit/);

consumeRateLimit("test:expired", 1, -1);
consumeRateLimit("test:expired", 1, -1);

console.log("api rate limit: ok");
