import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { draftReplyStrategy } from "@/lib/revenue-ops";

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await request.json();
  const result = await draftReplyStrategy(user.id, {
    contactId: body.contactId || null,
    campaignId: body.campaignId || null,
    messageText: body.messageText || null,
  });

  return NextResponse.json(result);
}
