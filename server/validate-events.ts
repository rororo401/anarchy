import assert from "node:assert/strict";
import { finalizeEvent, generateSecretKey } from "nostr-tools";
import { validateCommunityEvent } from "../lib/server/events";

const secret = generateSecretKey();
const created_at = Math.floor(Date.now() / 1000);
const sign = (kind: number, content: string, tags: string[][]) => finalizeEvent({ kind, content, tags, created_at }, secret);

const post = sign(1, "body", [["subject", "title"], ["display_name", "ㅇㅇ"]]);
const comment = sign(1111, "comment", [["E", post.id], ["e", post.id]]);
const reaction = sign(7, "+", [["e", post.id]]);
const deletion = sign(5, "", [["e", post.id]]);
const profile = sign(0, JSON.stringify({ name: "name" }), []);
const fixedNicknameSetting = sign(30078, JSON.stringify({ enabled: true }), [["d", "anarchos:fixed-nickname"]]);

for (const event of [post, comment, reaction, deletion, profile, fixedNicknameSetting]) validateCommunityEvent(event);

assert.throws(() => validateCommunityEvent(sign(2, "unsupported", [])), /unsupported/);
assert.throws(() => validateCommunityEvent(sign(1, "body", [])), /title/);
assert.throws(() => validateCommunityEvent(sign(1111, "comment", [])), /root or parent/);
assert.throws(() => validateCommunityEvent(sign(7, "+", [])), /reaction/);
assert.throws(() => validateCommunityEvent(sign(5, "", [])), /target/);
assert.throws(() => validateCommunityEvent(sign(0, "{}", [])), /profile JSON/);
assert.throws(() => validateCommunityEvent(sign(0, JSON.stringify({ name: "name", about: "no" }), [])), /profile JSON/);
assert.throws(() => validateCommunityEvent(sign(0, "not-json", [])), /profile JSON/);
assert.throws(() => validateCommunityEvent(sign(0, JSON.stringify({ name: "name" }), [["extra", "tag"]])), /invalid profile/);
assert.throws(() => validateCommunityEvent(sign(30078, JSON.stringify({ enabled: "yes" }), [["d", "anarchos:fixed-nickname"]])), /fixed nickname setting/);
assert.throws(() => validateCommunityEvent(sign(30078, JSON.stringify({ enabled: true }), [["d", "wrong"]])), /fixed nickname setting/);

console.log("event validation: ok");
