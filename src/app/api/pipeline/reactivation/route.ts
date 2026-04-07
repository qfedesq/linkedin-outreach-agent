import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { reactivateStalePipeline } from "@/lib/revenue-ops";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const campaignId = request.nextUrl.searchParams.get("campaignId");
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "10");
  const daysStale = parseInt(request.nextUrl.searchParams.get("daysStale") || "21");

  const result = await reactivateStalePipeline(user.id, {
    campaignId,
    limit,
    daysStale,
  });

  return NextResponse.json(result);
}
