import WebSocket from "ws";
import type { Event } from "nostr-tools";
import { configuredRelayUrls, normalizeRelayUrl } from "@/lib/server/relay-urls";

export type RelayResponse = {
  accepted: boolean;
  message: string;
};

function relayUrls() {
  return configuredRelayUrls();
}

export async function publishEvent(event: Event) {
  const urls = relayUrls();
  const results = await Promise.allSettled(urls.map((url) => publishToRelay(url, event)));
  if (!results.some((result) => result.status === "fulfilled")) {
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => result.reason);
    throw new AggregateError(failures, "all relays rejected the event");
  }
  return results.map((result, index) => ({ relay: urls[index], ok: result.status === "fulfilled" }));
}

function publishToRelay(url: string, event: Event) {
  return new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(url, { handshakeTimeout: 4_000, maxPayload: 96 * 1024 });
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`relay timeout: ${url}`));
    }, 5_000);
    socket.on("open", () => socket.send(JSON.stringify(["EVENT", event])));
    socket.on("message", (raw) => {
      let message: unknown[];
      try {
        message = JSON.parse(raw.toString()) as unknown[];
      } catch {
        return;
      }
      if (message[0] !== "OK" || message[1] !== event.id) return;
      clearTimeout(timeout);
      socket.close();
      message[2] ? resolve() : reject(new Error(String(message[3] ?? "relay rejected event")));
    });
    socket.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

export async function openRelayPublisher(url: string) {
  validateRelayUrl(url);
  const socket = new WebSocket(url, { handshakeTimeout: 4_000, maxPayload: 96 * 1024 });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`relay connection timeout: ${url}`));
    }, 5_000);
    socket.once("open", () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  return {
    publish(event: Event) {
      return new Promise<RelayResponse>((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error(`relay timeout: ${url}`));
        }, 5_000);
        const onMessage = (raw: WebSocket.RawData) => {
          let message: unknown[];
          try {
            message = JSON.parse(raw.toString()) as unknown[];
          } catch {
            return;
          }
          if (message[0] !== "OK" || message[1] !== event.id) return;
          cleanup();
          resolve({ accepted: Boolean(message[2]), message: String(message[3] ?? "") });
        };
        const onClose = () => {
          cleanup();
          reject(new Error(`relay disconnected: ${url}`));
        };
        const onError = (error: Error) => {
          cleanup();
          reject(error);
        };
        const cleanup = () => {
          clearTimeout(timeout);
          socket.off("message", onMessage);
          socket.off("close", onClose);
          socket.off("error", onError);
        };
        socket.on("message", onMessage);
        socket.once("close", onClose);
        socket.once("error", onError);
        try {
          socket.send(JSON.stringify(["EVENT", event]));
        } catch (error) {
          cleanup();
          reject(error);
        }
      });
    },
    close() {
      socket.close();
    },
  };
}

function validateRelayUrl(url: string) {
  normalizeRelayUrl(url);
}
