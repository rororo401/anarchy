import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { apiError } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await db.query(
      `SELECT
        (SELECT COUNT(*) FROM events) AS blocks,
        (SELECT COUNT(*) FROM posts WHERE NOT deleted AND NOT hidden) AS posts,
        (SELECT COUNT(*) FROM comments WHERE NOT deleted AND NOT hidden) AS comments,
        (SELECT COALESCE(SUM(delta), 0) FROM point_ledger) AS issued`,
    );
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    return apiError(error, 500);
  }
}
