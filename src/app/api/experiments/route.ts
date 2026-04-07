import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { listMessageExperiments, runMessageExperiment } from "@/lib/revenue-ops";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const campaignId = request.nextUrl.searchParams.get("campaignId");
  const experiments = await listMessageExperiments(user.id, campaignId);
  return NextResponse.json({ experiments });
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await request.json();
  if (!body.campaignId) {
    return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
  }

  const result = await runMessageExperiment(user.id, {
    campaignId: body.campaignId,
    experimentGoal: body.experimentGoal || null,
    audienceFilter: body.audienceFilter || null,
    variantCount: body.variantCount || null,
  });

  if (!result.experiment) {
    return NextResponse.json({ error: result.message }, { status: 404 });
  }

  return NextResponse.json(result);
}
