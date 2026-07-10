import type { Event } from "nostr-tools";
import { db } from "@/lib/server/db";
import { openRelayPublisher } from "@/lib/server/relay";

type BackfillOptions = {
  batchSize?: number;
  delayMs?: number;
  onProgress?: (progress: BackfillResult) => void;
};

export type BackfillResult = {
  total: number;
  published: number;
  duplicates: number;
  rejected: number;
};

export async function backfillRelay(url: string, options: BackfillOptions = {}) {
  const batchSize = options.batchSize ?? 500;
  const delayMs = options.delayMs ?? Number(process.env.BACKFILL_DELAY_MS ?? 100);
  const result: BackfillResult = { total: 0, published: 0, duplicates: 0, rejected: 0 };
  let cursorReceivedAt = new Date(0).toISOString();
  let cursorId = "";
  const publisher = await openRelayPublisher(url);

  try {
    while (true) {
      const events = await db.query<{ id: string; received_at: string; raw: string }>(
        `SELECT id, received_at, raw FROM events
         WHERE (received_at, id) > ($1, $2)
         ORDER BY received_at ASC, id ASC
         LIMIT $3`,
        [cursorReceivedAt, cursorId, batchSize],
      );
      if (!events.rowCount) break;

      for (const row of events.rows) {
        const response = await publisher.publish(JSON.parse(row.raw) as Event);
        result.total += 1;
        if (response.accepted) {
          result.published += 1;
        } else if (isDuplicate(response.message)) {
          result.duplicates += 1;
        } else {
          result.rejected += 1;
          console.error(`${row.id} rejected: ${response.message}`);
        }
        cursorReceivedAt = row.received_at;
        cursorId = row.id;
        options.onProgress?.(result);
        if (delayMs > 0) await delay(delayMs);
      }
    }
  } finally {
    publisher.close();
  }
  return result;
}

function isDuplicate(message: string) {
  return /duplicate|already (?:have|exists|stored)|exists/i.test(message);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
