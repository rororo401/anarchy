import assert from "node:assert/strict";
import { finalizeEvent, generateSecretKey } from "nostr-tools";
import { WebSocketServer } from "ws";
import { openRelayPublisher } from "../lib/server/relay";

async function main() {
  const server = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("expected TCP listener");
  let connections = 0;
  const ids = new Set<string>();

  server.on("connection", (socket) => {
    connections += 1;
    socket.on("message", (raw) => {
      const [, event] = JSON.parse(raw.toString()) as ["EVENT", { id: string }];
      const duplicate = ids.has(event.id);
      ids.add(event.id);
      socket.send(JSON.stringify(["OK", event.id, !duplicate, duplicate ? "duplicate: already stored" : ""]));
    });
  });

  const publisher = await openRelayPublisher(`ws://127.0.0.1:${address.port}`);
  const event = finalizeEvent({ kind: 1, content: "body", tags: [["subject", "title"]], created_at: 1 }, generateSecretKey());
  assert.equal((await publisher.publish(event)).accepted, true);
  assert.deepEqual(await publisher.publish(event), { accepted: false, message: "duplicate: already stored" });
  assert.equal(connections, 1);
  publisher.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));

  await assert.rejects(() => openRelayPublisher("https://relay.example.com"), /must use ws/);
  console.log("relay publisher: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
