import type { Event } from "nostr-tools";
import { NextRequest, NextResponse } from "next/server";
import { indexEvent, validateCommunityEvent } from "@/lib/server/events";
import { apiError } from "@/lib/server/http";
import { publishEvent } from "@/lib/server/relay";
import { consumeRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    consumeRateLimit(`submit:${forwarded ?? "unknown"}`, 30, 60_000);
    const event = await request.json() as Event;
    validateCommunityEvent(event);
    const relays = await publishEvent(event);
    const indexed = await indexEvent(event, {
      sourceRelays: relays.filter(({ ok }) => ok).map(({ relay }) => relay),
      awardLocalPoints: true,
    });
    return NextResponse.json({ indexed, relays });
  } catch (error) {
    return apiError(error);
  }
}
