import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const campaigns = await prisma.campaign.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ campaigns });
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await request.json();
  const campaign = await prisma.campaign.create({
    data: {
      userId: user.id,
      name: body.name || "New Campaign",
      description: body.description || null,
      icpDefinition: body.icpDefinition || null,
      strategyNotes: body.strategyNotes || null,
      calendarUrl: body.calendarUrl || null,
      dailyInviteLimit: body.dailyInviteLimit || 20,
      followupDelayDays: body.followupDelayDays || 3,
    },
  });

  return NextResponse.json({ campaign });
}
