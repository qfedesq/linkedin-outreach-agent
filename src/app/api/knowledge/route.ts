import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const knowledge = await prisma.agentKnowledge.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ knowledge });
}

export async function DELETE(request: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await request.json();
  if (id) {
    await prisma.agentKnowledge.deleteMany({ where: { id, userId: user.id } });
  }

  return NextResponse.json({ success: true });
}
