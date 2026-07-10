import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { apiError } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ pubkey: string }> }) {
  try {
    const { pubkey } = await params;
    const [balance, transactions] = await Promise.all([
      db.query(`SELECT COALESCE(SUM(delta), 0) AS balance FROM point_ledger WHERE pubkey = $1`, [pubkey]),
      db.query(`SELECT id, reason, delta AS amount, created_at FROM point_ledger WHERE pubkey = $1 ORDER BY created_at DESC LIMIT 100`, [pubkey]),
    ]);
    return NextResponse.json({ balance: balance.rows[0].balance, transactions: transactions.rows });
  } catch (error) {
    return apiError(error, 500);
  }
}
