import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const run = await prisma.dailyRun.create({
    data: {
      userId: user.id,
      phase: "discover",
      status: "RUNNING",
    },
  });

  return NextResponse.json({ runId: run.id });
}
