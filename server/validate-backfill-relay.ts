import assert from "node:assert/strict";
import { finalizeEvent, generateSecretKey } from "nostr-tools";
import { WebSocketServer } from "ws";
import { backfillRelay } from "../lib/server/backfill-relay";
import { db } from "../lib/server/db";
import { indexEvent } from "../lib/server/events";

async function main() {
  const event = finalizeEvent(
    { kind: 1, content: "backfill body", tags: [["subject", "backfill title"]], created_at: Math.floor(Date.now() / 1000) },
    generateSecretKey(),
  );
  await indexEvent(event);
  const eventCount = Number((await db.query("SELECT COUNT(*) AS count FROM events")).rows[0].count);

  const ids = new Set<string>();
  let connections = 0;
  const server = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("expected TCP listener");
  server.on("connection", (socket) => {
    connections += 1;
    socket.on("message", (raw) => {
      const [, received] = JSON.parse(raw.toString()) as ["EVENT", { id: string }];
      const duplicate = ids.has(received.id);
      ids.add(received.id);
      socket.send(JSON.stringify(["OK", received.id, !duplicate, duplicate ? "duplicate: already stored" : ""]));
    });
  });

  const url = `ws://127.0.0.1:${address.port}`;
  assert.deepEqual(await backfillRelay(url, { delayMs: 0 }), {
    total: eventCount,
    published: eventCount,
    duplicates: 0,
    rejected: 0,
  });
  assert.deepEqual(await backfillRelay(url, { delayMs: 0 }), {
    total: eventCount,
    published: 0,
    duplicates: eventCount,
    rejected: 0,
  });
  assert.equal(connections, 2);

  await db.end();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  console.log("relay backfill: ok");
}

main().catch(async (error) => {
  console.error(error);
  await db.end();
  process.exit(1);
});
