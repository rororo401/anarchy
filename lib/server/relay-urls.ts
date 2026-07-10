const DEFAULT_INTERNAL_RELAY = "ws://localhost:7777";

export function configuredRelayUrls() {
  const internal = process.env.INTERNAL_RELAY_URL ?? DEFAULT_INTERNAL_RELAY;
  return uniqueRelayUrls([internal, ...splitRelayUrls(process.env.PUBLIC_RELAY_URLS)]);
}

export function splitRelayUrls(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
}

export function normalizeRelayUrl(url: string) {
  const parsed = new URL(url);
  if (!['ws:', 'wss:'].includes(parsed.protocol)) throw new Error(`relay URL must use ws:// or wss://: ${url}`);
  if (parsed.username || parsed.password) throw new Error(`relay URL must not contain credentials: ${url}`);
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return parsed.toString().replace(/\/$/, "");
}

function uniqueRelayUrls(urls: string[]) {
  const unique = new Map<string, string>();
  for (const url of urls) {
    const normalized = normalizeRelayUrl(url);
    if (!unique.has(normalized)) unique.set(normalized, normalized);
  }
  return [...unique.values()];
}
