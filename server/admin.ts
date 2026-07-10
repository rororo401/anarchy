import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { db } from "../lib/server/db";
import { backfillRelay } from "../lib/server/backfill-relay";
import { rebuildProjections } from "../lib/server/events";

const [command, value, ...rest] = process.argv.slice(2);
const blockedFile = process.env.BLOCKED_PUBKEY_FILE ?? "/var/lib/anarchos/blocked-pubkeys.txt";

async function main() {
  if (command === "hide-event" || command === "unhide-event") {
    if (!value) throw new Error("event id is required");
    const hidden = command === "hide-event";
    await db.query("UPDATE events SET hidden = $2 WHERE id = $1", [value, hidden]);
    await db.query("UPDATE posts SET hidden = $2 WHERE event_id = $1", [value, hidden]);
    await db.query("UPDATE comments SET hidden = $2 WHERE event_id = $1", [value, hidden]);
    console.log(`${value} hidden=${hidden}`);
    return;
  }
  if (command === "block-pubkey" || command === "unblock-pubkey") {
    if (!value) throw new Error("pubkey is required");
    if (command === "block-pubkey") {
      await db.query("INSERT INTO blocked_pubkeys (pubkey, reason) VALUES ($1, $2) ON CONFLICT (pubkey) DO UPDATE SET reason = EXCLUDED.reason", [value, rest.join(" ")]);
    } else {
      await db.query("DELETE FROM blocked_pubkeys WHERE pubkey = $1", [value]);
    }
    await syncBlockedFile();
    console.log(`${value} ${command === "block-pubkey" ? "blocked" : "unblocked"}`);
    return;
  }
  if (command === "list-blocked") {
    const result = await db.query("SELECT pubkey, reason, created_at FROM blocked_pubkeys ORDER BY created_at DESC");
    console.table(result.rows);
    return;
  }
  if (command === "ledger-audit") {
    const result = await db.query("SELECT pubkey, SUM(delta) AS balance FROM point_ledger GROUP BY pubkey ORDER BY balance DESC");
    console.table(result.rows);
    return;
  }
  if (command === "reindex") {
    console.log(`rebuilt ${await rebuildProjections()} events`);
    return;
  }
  if (command === "backfill-relay") {
    if (!value) throw new Error("relay URL is required");
    const result = await backfillRelay(value, {
      onProgress: ({ total }) => {
        if (total % 100 === 0) console.log(`backfilled ${total} events`);
      },
    });
    console.log(`backfill complete: ${result.published} published, ${result.duplicates} duplicates, ${result.rejected} rejected`);
    if (result.rejected) throw new Error("backfill completed with rejected events");
    return;
  }
  throw new Error("usage: admin <hide-event|unhide-event|block-pubkey|unblock-pubkey|list-blocked|ledger-audit|reindex|backfill-relay> [value]");
}

async function syncBlockedFile() {
  const result = await db.query("SELECT pubkey FROM blocked_pubkeys ORDER BY pubkey");
  await mkdir(dirname(blockedFile), { recursive: true });
  const temporary = `${blockedFile}.tmp`;
  await writeFile(temporary, `${result.rows.map(({ pubkey }) => pubkey).join("\n")}\n`);
  await rename(temporary, blockedFile);
}

void readFile(blockedFile).catch(() => "");
main().catch((error) => {
  console.error(error.message);
  process.exit(1);
}).finally(() => db.end());
