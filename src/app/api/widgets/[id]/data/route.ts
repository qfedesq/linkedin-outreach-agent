import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { fetchWidgetData } from "@/lib/dynamic-tool-dispatcher";

// GET /api/widgets/[id]/data?campaignId=xxx — execute widget data query
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get("campaignId") || undefined;

  const widget = await prisma.dynamicWidget.findFirst({
    where: { id, userId: user.id, isActive: true },
  });
  if (!widget) return NextResponse.json({ error: "Widget not found" }, { status: 404 });

  try {
    const data = await fetchWidgetData(widget.dataConfig, user.id, campaignId);
    return NextResponse.json({ data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Data query failed: ${msg}` }, { status: 500 });
  }
}
