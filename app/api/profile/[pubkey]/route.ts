import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { apiError } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ pubkey: string }> }) {
  try {
    const { pubkey } = await params;
    const result = await db.query(
      `SELECT
        COALESCE((SELECT fixed_nickname_enabled FROM profiles WHERE pubkey = $1), false) AS fixed_nickname_enabled,
        COALESCE((SELECT fixed_nickname FROM profiles WHERE pubkey = $1), '') AS fixed_nickname,
        (SELECT COUNT(*) FROM posts WHERE pubkey = $1 AND NOT deleted AND NOT hidden) AS post_count,
        (SELECT COUNT(*) FROM comments WHERE pubkey = $1 AND NOT deleted AND NOT hidden) AS comment_count`,
      [pubkey],
    );
    return NextResponse.json({ ...result.rows[0], fixed_nickname_enabled: Boolean(result.rows[0].fixed_nickname_enabled) });
  } catch (error) {
    return apiError(error, 500);
  }
}
