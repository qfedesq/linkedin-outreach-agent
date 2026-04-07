import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { buildAccountMap } from "@/lib/revenue-ops";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const campaignId = request.nextUrl.searchParams.get("campaignId");
  const company = request.nextUrl.searchParams.get("company");
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "10");

  const result = await buildAccountMap(user.id, { campaignId, company, limit });
  return NextResponse.json(result);
}
