import assert from "node:assert/strict";
import WebSocket from "ws";
import { finalizeEvent, generateSecretKey, type Event } from "nostr-tools";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const relayUrl = process.env.SMOKE_RELAY_URL ?? "wss://relay.localhost";
const webUrl = process.env.SMOKE_WEB_URL ?? "https://localhost";
const secret = generateSecretKey();
const created_at = Math.floor(Date.now() / 1000);
const sign = (kind: number, content: string, tags: string[][]) => finalizeEvent({ kind, content, tags, created_at }, secret);

async function main() {
  const directPost = sign(1, "relay smoke body", [["subject", "relay smoke"], ["display_name", "smoke"]]);
  assert.equal((await publish(directPost)).accepted, true);
  await waitFor(async () => (await getFeed()).some((post) => post.id === directPost.id));

  const apiPost = sign(1, "api smoke body", [["subject", "api smoke"], ["display_name", "smoke"]]);
  const apiResponse = await fetch(`${webUrl}/api/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(apiPost),
  });
  if (!apiResponse.ok) throw new Error(await apiResponse.text());
  await waitFor(async () => (await getFeed()).some((post) => post.id === apiPost.id));

  const profile = sign(0, JSON.stringify({ name: "smoke-name" }), []);
  const profileResponse = await fetch(`${webUrl}/api/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(profile),
  });
  if (!profileResponse.ok) throw new Error(await profileResponse.text());
  await waitFor(async () => (await getProfile(profile.pubkey)).fixed_nickname === "smoke-name");

  const fixedNicknameSetting = sign(30078, JSON.stringify({ enabled: true }), [["d", "anarchos:fixed-nickname"]]);
  const fixedNicknameResponse = await fetch(`${webUrl}/api/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(fixedNicknameSetting),
  });
  if (!fixedNicknameResponse.ok) throw new Error(await fixedNicknameResponse.text());
  await waitFor(async () => (await getProfile(profile.pubkey)).fixed_nickname_enabled === true);

  const unsupported = sign(2, "blocked", []);
  assert.equal((await publish(unsupported)).accepted, false);

  const rateSecret = generateSecretKey();
  let rejected = false;
  const rateSocket = await openSocket();
  try {
    for (let index = 0; index < 61; index += 1) {
      const event = finalizeEvent({ kind: 1, content: "rate", tags: [["subject", `rate-${index}`]], created_at }, rateSecret);
      const result = await publish(event, rateSocket);
      if (index < 60) assert.equal(result.accepted, true, result.message);
      if (index === 60) rejected = !result.accepted && result.message.includes("rate-limited");
    }
  } finally {
    rateSocket.close();
  }
  assert.equal(rejected, true);

  const sockets = await Promise.allSettled(Array.from({ length: 11 }, () => openSocket()));
  assert.equal(sockets.filter((result) => result.status === "fulfilled").length <= 10, true);
  for (const result of sockets) {
    if (result.status === "fulfilled") result.value.close();
  }
  console.log("stack smoke: ok");
}

async function publish(event: Event, socket?: WebSocket) {
  if (socket) return sendEvent(socket, event);
  const openedSocket = await openSocket();
  try {
    return await sendEvent(openedSocket, event);
  } finally {
    openedSocket.close();
  }
}

function sendEvent(socket: WebSocket, event: Event) {
  return new Promise<{ accepted: boolean; message: string }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error("relay timeout"));
    }, 6_000);
    const onMessage = (raw: WebSocket.RawData) => {
      const message = JSON.parse(raw.toString()) as unknown[];
      if (message[0] !== "OK" || message[1] !== event.id) return;
      clearTimeout(timeout);
      socket.off("message", onMessage);
      resolve({ accepted: Boolean(message[2]), message: String(message[3] ?? "") });
    };
    socket.on("message", onMessage);
    socket.send(JSON.stringify(["EVENT", event]));
  });
}

function openSocket() {
  return new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(relayUrl, { rejectUnauthorized: false, handshakeTimeout: 5_000 });
    const timeout = setTimeout(() => reject(new Error("relay connection timeout")), 6_000);
    socket.on("open", () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.on("error", reject);
  });
}

async function getFeed() {
  const response = await fetch(`${webUrl}/api/feed`);
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()).posts as Array<{ id: string }>;
}

async function getProfile(pubkey: string) {
  const response = await fetch(`${webUrl}/api/profile/${pubkey}`);
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as { fixed_nickname_enabled: boolean; fixed_nickname: string };
}

async function waitFor(check: () => Promise<boolean>) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("timed out waiting for indexed event");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
