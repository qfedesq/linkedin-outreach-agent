import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const DEV_EMAIL = "dev@protofire.io";

async function getOrCreateDevUser() {
  let user = await prisma.user.findUnique({
    where: { email: DEV_EMAIL },
    include: { settings: true },
  });
  if (!user) {
    user = await prisma.user.create({
      data: { email: DEV_EMAIL, name: "Dev User" },
      include: { settings: true },
    });
  }
  return user;
}

export async function getAuthUser() {
  // Dev bypass for local testing
  if (process.env.DEV_BYPASS_AUTH === "true") {
    return getOrCreateDevUser();
  }

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
