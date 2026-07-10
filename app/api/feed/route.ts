import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { apiError } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    const cursor = Number(request.nextUrl.searchParams.get("cursor") ?? Number.MAX_SAFE_INTEGER);
    const pubkey = request.nextUrl.searchParams.get("pubkey") ?? "";
    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") ?? 20), 50);
    const result = await db.query(
      `SELECT p.event_id AS id, p.pubkey AS author, p.author_name,
         p.title, p.body, p.created_at,
         COUNT(DISTINCT c.event_id) AS comment_count,
         COUNT(DISTINCT r.event_id) AS like_count,
         COALESCE(MAX(CASE WHEN r.pubkey = $1 THEN 1 ELSE 0 END), 0) AS liked,
         MIN(CASE WHEN r.pubkey = $1 THEN r.event_id END) AS liked_event_id
       FROM posts p
       LEFT JOIN comments c ON c.root_event_id = p.event_id AND NOT c.deleted AND NOT c.hidden
       LEFT JOIN reactions r ON r.target_event_id = p.event_id AND NOT r.deleted
       WHERE NOT p.deleted AND NOT p.hidden AND p.created_at < $2
         AND ($3 = ''
           OR p.title LIKE '%' || $3 || '%'
           OR p.body LIKE '%' || $3 || '%'
           OR p.author_name LIKE '%' || $3 || '%')
       GROUP BY p.event_id
       ORDER BY p.created_at DESC
       LIMIT $4`,
      [pubkey, cursor, search, limit],
    );
    const posts = result.rows.map((post) => ({ ...post, liked: Boolean(post.liked) }));
    return NextResponse.json({ posts, nextCursor: result.rows.at(-1)?.created_at ?? null });
  } catch (error) {
    return apiError(error, 500);
  }
}
