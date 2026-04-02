import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const replied = await prisma.contact.findMany({
    where: {
      userId: user.id,
      status: { in: ["REPLIED", "MEETING_BOOKED"] },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ contacts: replied });
}
