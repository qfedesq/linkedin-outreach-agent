import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

// GET /api/widgets?campaignId=xxx — list active widgets
export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get("campaignId");

  const where = campaignId
    ? { userId: user.id, campaignId, isActive: true }
    : { userId: user.id, isActive: true };

  const widgets = await prisma.dynamicWidget.findMany({
    where,
    select: {
      id: true,
      name: true,
      description: true,
      widgetType: true,
      displayConfig: true,
      campaignId: true,
      sortOrder: true,
    },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({ widgets });
}

// DELETE /api/widgets?id=xxx — deactivate a widget
export async function DELETE(request: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const widget = await prisma.dynamicWidget.findFirst({ where: { id, userId: user.id } });
  if (!widget) return NextResponse.json({ error: "Widget not found" }, { status: 404 });

  await prisma.dynamicWidget.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ ok: true });
}
