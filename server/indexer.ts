import WebSocket from "ws";
import type { Event } from "nostr-tools";
import { indexEvent } from "../lib/server/events";

const relay = process.env.INTERNAL_RELAY_URL ?? "ws://localhost:7777";

function connect() {
  const socket = new WebSocket(relay, { handshakeTimeout: 5_000, maxPayload: 128 * 1024 });
  socket.on("open", () => {
    console.log(`indexer connected to ${relay}`);
    socket.send(JSON.stringify(["REQ", "anarchos-indexer", { kinds: [0, 1, 5, 7, 1111, 30078] }]));
  });
  socket.on("message", async (raw) => {
    try {
      const message = JSON.parse(raw.toString()) as ["EVENT", string, Event];
      if (message[0] !== "EVENT") return;
      await indexEvent(message[2]);
    } catch (error) {
      console.error("indexer rejected event", error);
    }
  });
  socket.on("error", (error) => console.error("indexer relay error", error.message));
  socket.on("close", () => setTimeout(connect, 3_000));
}

connect();
