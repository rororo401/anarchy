import { verifyEvent, type Event } from "nostr-tools";
import { type DatabaseClient, withTransaction } from "@/lib/server/db";

export const ALLOWED_KINDS = new Set([0, 1, 5, 7, 1111, 30078]);

export function validateCommunityEvent(event: Event) {
  if (!verifyEvent(event)) throw new Error("invalid event signature");
  if (!ALLOWED_KINDS.has(event.kind)) throw new Error("unsupported event kind");
  if (event.content.length > 10_000) throw new Error("event content too long");
  if (event.tags.length > 64) throw new Error("too many event tags");
  if (event.tags.some((tag) => tag.some((value) => value.length > 1_024))) throw new Error("event tag value too long");

  if (event.kind === 1) {
    const title = tagValue(event, "subject");
    if (!title || title.length > 100) throw new Error("post title must be 1-100 characters");
  }
  if (event.kind === 1111) {
    if (!event.content.trim() || event.content.length > 2_000) throw new Error("comment must be 1-2000 characters");
    if (!tagValue(event, "E") || !tagValue(event, "e")) throw new Error("comment is missing root or parent tags");
  }
  if (event.kind === 7 && (event.content !== "+" || !tagValue(event, "e"))) throw new Error("invalid reaction");
  if (event.kind === 5 && !tagValue(event, "e")) throw new Error("deletion is missing target event");
  if (event.kind === 0) {
    if (event.tags.length || event.content.length > 512) throw new Error("invalid profile");
    parseStandardProfile(event.content);
  }
  if (event.kind === 30078) parseFixedNicknameSetting(event);
}

export async function indexEvent(event: Event) {
  validateCommunityEvent(event);
  return withTransaction(async (client) => {
    const blocked = await client.query("SELECT 1 FROM blocked_pubkeys WHERE pubkey = $1", [event.pubkey]);
    if (blocked.rowCount) throw new Error("blocked pubkey");

    const inserted = await client.query(
      `INSERT INTO events (id, pubkey, kind, created_at, content, tags, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [event.id, event.pubkey, event.kind, event.created_at, event.content, JSON.stringify(event.tags), JSON.stringify(event)],
    );
    if (!inserted.rowCount) return { inserted: false };

    if (event.kind === 1) await insertPost(client, event, true);
    if (event.kind === 1111) await insertComment(client, event, true);
    if (event.kind === 7) await insertReaction(client, event);
    if (event.kind === 5) await applyDeletion(client, event);
    if (event.kind === 0) await upsertProfile(client, event);
    if (event.kind === 30078) await upsertFixedNicknameSetting(client, event);
    return { inserted: true };
  });
}

export async function rebuildProjections() {
  return withTransaction(async (client) => {
    await client.query("DELETE FROM reactions");
    await client.query("DELETE FROM comments");
    await client.query("DELETE FROM posts");
    await client.query("DELETE FROM profiles");
    await client.query("UPDATE events SET deleted = false");
    const result = await client.query("SELECT raw FROM events ORDER BY received_at ASC, id ASC");
    for (const row of result.rows) {
      const event = JSON.parse(String(row.raw)) as Event;
      if (event.kind === 1) await insertPost(client, event, false);
      if (event.kind === 1111) await insertComment(client, event, false);
      if (event.kind === 7) await insertReaction(client, event);
      if (event.kind === 5) await applyDeletion(client, event);
      if (event.kind === 0) await upsertProfile(client, event);
      if (event.kind === 30078) {
        if (tagValue(event, "d") === "anarchos:fixed-nickname") await upsertFixedNicknameSetting(client, event);
        else await upsertLegacyProfile(client, event);
      }
    }
    await client.query("UPDATE posts SET hidden = (SELECT hidden FROM events WHERE events.id = posts.event_id)");
    await client.query("UPDATE comments SET hidden = (SELECT hidden FROM events WHERE events.id = comments.event_id)");
    return result.rowCount;
  });
}

async function insertPost(client: DatabaseClient, event: Event, rewardEnabled: boolean) {
  await client.query(
    `INSERT INTO posts (event_id, pubkey, title, body, author_name, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [event.id, event.pubkey, tagValue(event, "subject"), event.content, displayName(event), event.created_at],
  );
  if (rewardEnabled) await reward(client, event, 3, "post", 30 * 60);
}

async function insertComment(client: DatabaseClient, event: Event, rewardEnabled: boolean) {
  await client.query(
    `INSERT INTO comments (event_id, root_event_id, parent_event_id, pubkey, body, author_name, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [event.id, tagValue(event, "E"), tagValue(event, "e"), event.pubkey, event.content, displayName(event), event.created_at],
  );
  if (rewardEnabled) await reward(client, event, 1, "comment", 5 * 60);
}

async function insertReaction(client: DatabaseClient, event: Event) {
  if (event.content !== "+") return;
  await client.query(
    `INSERT INTO reactions (event_id, target_event_id, pubkey, created_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (target_event_id, pubkey) DO UPDATE SET
       event_id = EXCLUDED.event_id,
       created_at = EXCLUDED.created_at,
       deleted = false`,
    [event.id, tagValue(event, "e"), event.pubkey, event.created_at],
  );
}

async function applyDeletion(client: DatabaseClient, event: Event) {
  for (const target of event.tags.filter(([name]) => name === "e").map(([, value]) => value)) {
    await client.query(`UPDATE events SET deleted = true WHERE id = $1 AND pubkey = $2`, [target, event.pubkey]);
    await client.query(`UPDATE posts SET deleted = true WHERE event_id = $1 AND pubkey = $2`, [target, event.pubkey]);
    await client.query(`UPDATE comments SET deleted = true WHERE event_id = $1 AND pubkey = $2`, [target, event.pubkey]);
    await client.query(`UPDATE reactions SET deleted = true WHERE event_id = $1 AND pubkey = $2`, [target, event.pubkey]);
  }
}

async function upsertProfile(client: DatabaseClient, event: Event) {
  const profile = parseStandardProfile(event.content);
  const nickname = trimName(profile.name);
  await client.query(
    `INSERT INTO profiles (pubkey, fixed_nickname, event_id, updated_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (pubkey) DO UPDATE SET
       fixed_nickname = EXCLUDED.fixed_nickname,
       event_id = EXCLUDED.event_id,
       updated_at = EXCLUDED.updated_at
     WHERE profiles.updated_at <= EXCLUDED.updated_at`,
    [event.pubkey, nickname, event.id, event.created_at],
  );
}

async function upsertLegacyProfile(client: DatabaseClient, event: Event) {
  const profile = parseLegacyProfile(event.content);
  const nickname = trimName(String(profile.fixedNickname ?? ""));
  await saveLegacyProfile(client, event, Boolean(profile.fixedNicknameEnabled), nickname);
}

async function upsertFixedNicknameSetting(client: DatabaseClient, event: Event) {
  const setting = parseFixedNicknameSetting(event);
  await client.query(
    `INSERT INTO profiles (pubkey, fixed_nickname_enabled, event_id, updated_at, settings_event_id, settings_updated_at)
     VALUES ($1, $2, $3, 0, $3, $4)
     ON CONFLICT (pubkey) DO UPDATE SET
       fixed_nickname_enabled = EXCLUDED.fixed_nickname_enabled,
       settings_event_id = EXCLUDED.settings_event_id,
       settings_updated_at = EXCLUDED.settings_updated_at
     WHERE profiles.settings_updated_at <= EXCLUDED.settings_updated_at`,
    [event.pubkey, setting.enabled, event.id, event.created_at],
  );
}

async function saveLegacyProfile(client: DatabaseClient, event: Event, enabled: boolean, nickname: string) {
  await client.query(
    `INSERT INTO profiles (pubkey, fixed_nickname_enabled, fixed_nickname, event_id, updated_at, settings_event_id, settings_updated_at)
     VALUES ($1, $2, $3, $4, $5, $4, $5)
     ON CONFLICT (pubkey) DO UPDATE SET
       fixed_nickname_enabled = EXCLUDED.fixed_nickname_enabled,
       fixed_nickname = EXCLUDED.fixed_nickname,
       event_id = EXCLUDED.event_id,
       updated_at = EXCLUDED.updated_at,
       settings_event_id = EXCLUDED.settings_event_id,
       settings_updated_at = EXCLUDED.settings_updated_at
     WHERE profiles.updated_at <= EXCLUDED.updated_at`,
    [event.pubkey, enabled, nickname, event.id, event.created_at],
  );
}

function parseStandardProfile(content: string) {
  try {
    const profile = JSON.parse(content) as unknown;
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) throw new Error("invalid profile JSON");
    const entries = Object.entries(profile);
    if (entries.length !== 1 || entries[0][0] !== "name" || typeof entries[0][1] !== "string") throw new Error("invalid profile JSON");
    if (Array.from(entries[0][1]).length > 40) throw new Error("profile name too long");
    return profile as { name: string };
  } catch {
    throw new Error("invalid profile JSON");
  }
}

function parseFixedNicknameSetting(event: Event) {
  try {
    if (event.tags.length !== 1 || tagValue(event, "d") !== "anarchos:fixed-nickname" || event.tags[0].length !== 2) {
      throw new Error("invalid fixed nickname setting");
    }
    const setting = JSON.parse(event.content) as unknown;
    if (!setting || typeof setting !== "object" || Array.isArray(setting)) throw new Error("invalid fixed nickname setting");
    const entries = Object.entries(setting);
    if (entries.length !== 1 || entries[0][0] !== "enabled" || typeof entries[0][1] !== "boolean") {
      throw new Error("invalid fixed nickname setting");
    }
    return setting as { enabled: boolean };
  } catch {
    throw new Error("invalid fixed nickname setting");
  }
}

function trimName(name: string) {
  return Array.from(name.trim()).slice(0, 40).join("");
}

function parseLegacyProfile(content: string) {
  const profile = JSON.parse(content) as unknown;
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) throw new Error("invalid legacy profile JSON");
  return profile as { fixedNicknameEnabled?: boolean; fixedNickname?: string };
}

async function reward(client: DatabaseClient, event: Event, delta: number, reason: "post" | "comment", intervalSeconds: number) {
  const latest = await client.query(
    `SELECT created_at FROM point_ledger WHERE pubkey = $1 AND reason = $2 ORDER BY created_at DESC LIMIT 1`,
    [event.pubkey, reason],
  );
  if (latest.rowCount && Math.floor(Date.now() / 1000) - Number(latest.rows[0].created_at) < intervalSeconds) return;
  await client.query(
    `INSERT INTO point_ledger (event_id, pubkey, delta, reason) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [event.id, event.pubkey, delta, reason],
  );
}

export function tagValue(event: Event, name: string) {
  return event.tags.find(([tagName]) => tagName === name)?.[1] ?? "";
}

function displayName(event: Event) {
  return tagValue(event, "display_name").trim().slice(0, 40) || "ㅇㅇ";
}
