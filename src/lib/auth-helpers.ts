import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function getAuthUser() {

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  let user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { settings: true },
  });

  if (!user) return null;

  // If user has no settings, create empty settings row (user must configure their own credentials)
  if (!user.settings) {
    await prisma.userSettings.create({ data: { userId: user.id } });
    user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { settings: true },
    });
  }

  return user;
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
