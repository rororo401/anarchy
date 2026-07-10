import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { apiError } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const cursor = Number(request.nextUrl.searchParams.get("cursor") ?? 0);
    const pubkey = request.nextUrl.searchParams.get("pubkey") ?? "";
    const post = await db.query(
      `SELECT p.event_id AS id, p.pubkey AS author,
         CASE
           WHEN COALESCE(profile.fixed_nickname_enabled, false) AND profile.fixed_nickname <> '' THEN profile.fixed_nickname
           ELSE p.author_name
         END AS author_name,
         p.title, p.body, p.created_at,
         COUNT(DISTINCT r.event_id) AS like_count,
         COALESCE(MAX(CASE WHEN r.pubkey = $2 THEN 1 ELSE 0 END), 0) AS liked,
         MIN(CASE WHEN r.pubkey = $2 THEN r.event_id END) AS liked_event_id
       FROM posts p
       LEFT JOIN profiles profile ON profile.pubkey = p.pubkey
       LEFT JOIN reactions r ON r.target_event_id = p.event_id AND NOT r.deleted
       WHERE p.event_id = $1 AND NOT p.deleted AND NOT p.hidden
       GROUP BY p.event_id`,
      [id, pubkey],
    );
    if (!post.rowCount) return NextResponse.json({ error: "post not found" }, { status: 404 });
    const comments = await db.query(
      `SELECT c.event_id AS id, c.pubkey AS author,
         CASE
           WHEN COALESCE(profile.fixed_nickname_enabled, false) AND profile.fixed_nickname <> '' THEN profile.fixed_nickname
           ELSE c.author_name
         END AS author_name,
         c.body, c.created_at
       FROM comments c
       LEFT JOIN profiles profile ON profile.pubkey = c.pubkey
       WHERE c.root_event_id = $1 AND NOT c.deleted AND NOT c.hidden AND c.created_at > $2
       ORDER BY c.created_at ASC LIMIT 50`,
      [id, cursor],
    );
    return NextResponse.json({ post: { ...post.rows[0], liked: Boolean(post.rows[0].liked) }, comments: comments.rows, nextCursor: comments.rows.at(-1)?.created_at ?? null });
  } catch (error) {
    return apiError(error, 500);
  }
}
