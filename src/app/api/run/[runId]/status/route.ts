import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { runId } = await params;

  const run = await prisma.dailyRun.findFirst({
    where: { id: runId, userId: user.id },
  });

  if (!run) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(run);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { runId } = await params;
  const body = await request.json();

  await prisma.dailyRun.updateMany({
    where: { id: runId, userId: user.id },
    data: body,
  });

  return NextResponse.json({ success: true });
}
