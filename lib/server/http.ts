import { NextResponse } from "next/server";

export function apiError(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : "request failed";
  return NextResponse.json({ error: message }, { status });
}
