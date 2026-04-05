import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.email !== "federico.ledesma@protofire.io") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await logActivity(session.user.id, "admin_access", { message: "Admin dashboard accessed" });

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") || "month";
  const days = period === "quarter" ? 90 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Total users
  const totalUsers = await prisma.user.count();
  const activeUsers = await prisma.executionLog.findMany({
    where: { createdAt: { gte: since } },
    select: { userId: true },
    distinct: ['userId']
  });
  const activeUsersCount = activeUsers.length;

  // Campaigns
  const totalCampaigns = await prisma.campaign.count();

  // Invites sent
  const totalInvites = await prisma.executionLog.count({
    where: { action: "send_invite", success: true, createdAt: { gte: since } }
  });

  // Connections accepted (assuming action: "check_connections" with success)
  const totalConnections = await prisma.executionLog.count({
    where: { action: "check_connections", success: true, createdAt: { gte: since } }
  });

  // Responses (inbox scans successful)
  const totalResponses = await prisma.executionLog.count({
    where: { action: "scan_inbox", success: true, createdAt: { gte: since } }
  });

  // Contacts by stage
  const contactsByStage = await prisma.contact.groupBy({
    by: ["status"],
    _count: true,
    where: { createdAt: { gte: since } }
  });
  const contactsStageData = contactsByStage.map(c => ({ stage: c.status, count: c._count }));

  // Contacts by user (anonymized)
  const contactsByUserRaw = await prisma.contact.groupBy({
    by: ["userId"],
    _count: true,
    where: { createdAt: { gte: since } }
  });
  const contactsByUser = contactsByUserRaw.map((c, i) => ({
    user: `Usuario ${i + 1}`,
    count: c._count
  }));

  // Token usage (placeholder, assume no field; use 0 or calculate if possible)
  const tokenUsage = [
    { month: "Jan", tokens: 1000 },
    { month: "Feb", tokens: 1200 },
    { month: "Mar", tokens: 1100 }
  ]; // TODO: Implement real aggregation if token field exists

  // Usage time
  const logs = await prisma.executionLog.findMany({
    where: { createdAt: { gte: since } },
    select: { userId: true, createdAt: true }
  });
  const userTimes: Record<string, { min: Date, max: Date }> = {};
  logs.forEach(log => {
    if (!userTimes[log.userId]) {
      userTimes[log.userId] = { min: log.createdAt, max: log.createdAt };
    } else {
      if (log.createdAt < userTimes[log.userId].min) userTimes[log.userId].min = log.createdAt;
      if (log.createdAt > userTimes[log.userId].max) userTimes[log.userId].max = log.createdAt;
    }
  });
  const totalHours = Object.values(userTimes).reduce((sum, t) => sum + (t.max.getTime() - t.min.getTime()) / (1000 * 60 * 60), 0);
  const avgPerUser = totalHours / Object.keys(userTimes).length;

  const topUsersByTime = Object.entries(userTimes)
    .map(([userId, t]) => ({ user: `Usuario ${userId.slice(-4)}`, hours: (t.max.getTime() - t.min.getTime()) / (1000 * 60 * 60) }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 5);

  return NextResponse.json({
    totalUsers,
    activeUsers: activeUsersCount,
    totalCampaigns,
    totalInvites,
    totalConnections,
    totalResponses,
    contactsByStage: contactsStageData,
    contactsByUser,
    tokenUsage,
    usageTime: { totalHours: Math.round(totalHours), avgPerUser: Math.round(avgPerUser * 100) / 100 },
    topUsersByTime
  });
}