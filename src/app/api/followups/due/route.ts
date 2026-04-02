import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  const contacts = await prisma.contact.findMany({
    where: {
      userId: user.id,
      status: "CONNECTED",
      connectedDate: { lte: threeDaysAgo },
      followupSentDate: null,
    },
    orderBy: { connectedDate: "asc" },
  });

  return NextResponse.json({ contacts });
}
