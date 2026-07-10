import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { finalizeEvent, generateSecretKey } from "nostr-tools";

const directory = mkdtempSync(join(tmpdir(), "anarchos-multi-relay-"));
process.env.SQLITE_PATH = join(directory, "anarchos.sqlite");

async function main() {
  const [{ db }, { indexEvent }] = await Promise.all([
    import("../lib/server/db"),
    import("../lib/server/events"),
  ]);
  const secret = generateSecretKey();
  const sign = (created_at: number, kind: number, content: string, tags: string[][]) =>
    finalizeEvent({ kind, content, tags, created_at }, secret);

  const profile = sign(900, 0, JSON.stringify({ name: "relay-name", about: "portable profile" }), []);
  const setting = sign(901, 30078, JSON.stringify({ enabled: true }), [["d", "anarchos:fixed-nickname"]]);
  await indexEvent(profile, { sourceRelay: "wss://relay-one.example" });
  await indexEvent(setting, { sourceRelay: "wss://relay-two.example/" });

  const early = sign(1_000, 1, "early", [["subject", "early"], ["display_name", "event-name"]]);
  const cooldown = sign(2_000, 1, "cooldown", [["subject", "cooldown"], ["display_name", "event-name"]]);
  const later = sign(4_000, 1, "later", [["subject", "later"], ["display_name", "event-name"]]);

  await indexEvent(later, { sourceRelay: "wss://relay-one.example" });
  await indexEvent(cooldown, { sourceRelay: "wss://relay-one.example" });
  await indexEvent(early, { sourceRelay: "wss://relay-one.example" });
  const duplicate = await indexEvent(early, { sourceRelay: "wss://relay-two.example" });
  assert.deepEqual(duplicate, { inserted: false });

  assert.equal(Number((await db.query("SELECT COUNT(*) AS count FROM events WHERE id = $1", [early.id])).rows[0].count), 1);
  assert.equal(Number((await db.query("SELECT COUNT(*) AS count FROM posts WHERE event_id = $1", [early.id])).rows[0].count), 1);
  assert.equal(Number((await db.query("SELECT COUNT(*) AS count FROM event_relays WHERE event_id = $1", [early.id])).rows[0].count), 2);
  assert.equal(Number((await db.query("SELECT COALESCE(SUM(delta), 0) AS balance FROM point_ledger WHERE pubkey = $1", [early.pubkey])).rows[0].balance), 0);

  await indexEvent(early, { awardLocalPoints: true });
  await indexEvent(cooldown, { awardLocalPoints: true });
  assert.equal(Number((await db.query("SELECT COALESCE(SUM(delta), 0) AS balance FROM point_ledger WHERE pubkey = $1", [early.pubkey])).rows[0].balance), 3);

  await db.query("UPDATE point_ledger SET created_at = created_at - 1801 WHERE event_id = $1", [early.id]);
  await indexEvent(later, { awardLocalPoints: true });
  assert.equal(Number((await db.query("SELECT COALESCE(SUM(delta), 0) AS balance FROM point_ledger WHERE pubkey = $1", [early.pubkey])).rows[0].balance), 6);

  const storedProfile = (await db.query("SELECT fixed_nickname, fixed_nickname_enabled FROM profiles WHERE pubkey = $1", [profile.pubkey])).rows[0];
  assert.equal(storedProfile.fixed_nickname, "relay-name");
  assert.equal(Boolean(storedProfile.fixed_nickname_enabled), true);

  await db.end();
  rmSync(directory, { recursive: true, force: true });
  console.log("multi-relay indexing: ok");
}

main().catch((error) => {
  console.error(error);
  rmSync(directory, { recursive: true, force: true });
  process.exit(1);
});
