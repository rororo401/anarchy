import WebSocket from "ws";
import type { Event } from "nostr-tools";
import { indexEvent } from "../lib/server/events";
import { configuredRelayUrls } from "../lib/server/relay-urls";

const relays = configuredRelayUrls();

for (const [index, relay] of relays.entries()) connect(relay, index);

function connect(relay: string, index: number) {
  const socket = new WebSocket(relay, { handshakeTimeout: 5_000, maxPayload: 128 * 1024 });
  const subscriptionId = `anarchy-relay-indexer-${index}`;

  socket.on("open", () => {
    console.log(`indexer connected to ${relay}`);
    socket.send(JSON.stringify(["REQ", subscriptionId, { kinds: [0, 1, 5, 7, 1111, 30078] }]));
  });
  socket.on("message", async (raw) => {
    try {
      const message = JSON.parse(raw.toString()) as unknown[];
      if (message[0] !== "EVENT" || message[1] !== subscriptionId) return;
      await indexEvent(message[2] as Event, { sourceRelay: relay });
    } catch (error) {
      console.error(`indexer rejected event from ${relay}`, error);
    }
  });
  socket.on("error", (error) => console.error(`indexer relay error (${relay})`, error.message));
  socket.on("close", () => {
    const delay = 3_000 + Math.floor(Math.random() * 2_000);
    console.warn(`indexer disconnected from ${relay}; reconnecting in ${delay}ms`);
    setTimeout(() => connect(relay, index), delay);
  });
}
