import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get("action");
  const success = searchParams.get("success");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");

  const where: Record<string, unknown> = { userId: user.id };
  if (action) where.action = action;
  if (success !== null) where.success = success === "true";

  const [logs, total] = await Promise.all([
    prisma.executionLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.executionLog.count({ where }),
  ]);

  return NextResponse.json({ logs, total, page, limit });
}
