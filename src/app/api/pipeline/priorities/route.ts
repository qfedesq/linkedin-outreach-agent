import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prioritizePipelineByExpectedValue } from "@/lib/revenue-ops";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const campaignId = request.nextUrl.searchParams.get("campaignId");
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "10");
  const includeReasons = request.nextUrl.searchParams.get("includeReasons") !== "false";

  const result = await prioritizePipelineByExpectedValue(user.id, {
    campaignId,
    limit,
    includeReasons,
  });

  return NextResponse.json(result);
}
