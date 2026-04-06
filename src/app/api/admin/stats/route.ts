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

  await logActivity((session.user as any).id, "admin_access", { message: "Admin dashboard accessed" });

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

  // Individual user stats
  const users = await prisma.user.findMany({
    include: { settings: true }
  });

  const userStats = await Promise.all(users.map(async (user) => {
    const campaigns = await prisma.campaign.count({ where: { userId: user.id } });
    const contacts = await prisma.contact.count({ where: { userId: user.id } });
    const invites = await prisma.executionLog.count({
      where: { userId: user.id, action: "send_invite", success: true, createdAt: { gte: since } }
    });
    const connections = await prisma.executionLog.count({
      where: { userId: user.id, action: "check_connections", success: true, createdAt: { gte: since } }
    });
    const responses = await prisma.executionLog.count({
      where: { userId: user.id, action: "scan_inbox", success: true, createdAt: { gte: since } }
    });
    const followups = await prisma.executionLog.count({
      where: { userId: user.id, action: "send_followup", success: true, createdAt: { gte: since } }
    });
    // Real token/cost data from ExecutionLog (llm_usage entries)
    const llmLogs = await prisma.executionLog.findMany({
      where: { userId: user.id, action: "llm_usage", createdAt: { gte: since } },
      select: { response: true },
    });
    let tokens = 0;
    let cost = 0;
    for (const log of llmLogs) {
      try {
        const parsed = JSON.parse(log.response || "{}");
        tokens += parsed.total || 0;
        cost += parsed.cost || 0;
      } catch {}
    }
    // Also check global llm_usage logs (older format uses userId="global")
    const globalLlmLogs = await prisma.executionLog.findMany({
      where: { userId: "global", action: "llm_usage", createdAt: { gte: since } },
      select: { response: true },
    });
    // Chat messages
    const chatMsgs = await prisma.chatMessage.count({ where: { userId: user.id } });

    return {
      email: user.email,
      name: user.name || "",
      linkedin: !!user.settings?.unipileApiKey,
      openrouter: !!user.settings?.openrouterApiKey,
      campaigns,
      contacts,
      invites,
      connections,
      responses,
      followups,
      chatMsgs,
      tokens,
      cost,
    };
  }));

  // Additional stats
  const inactiveUsers = totalUsers - activeUsersCount;
  const inviteAcceptanceRate = totalInvites > 0 ? (totalConnections / totalInvites * 100).toFixed(2) : 0;
  const responseRate = totalInvites > 0 ? (totalResponses / totalInvites * 100).toFixed(2) : 0;
  const totalTokens = userStats.reduce((sum, u) => sum + u.tokens, 0);
  const avgTokensPerUser = activeUsersCount > 0 ? Math.round(totalTokens / activeUsersCount) : 0;
  const totalCost = userStats.reduce((sum, u) => sum + u.cost, 0);
  const alerts = [];
  if (inactiveUsers > totalUsers * 0.5) alerts.push("Más del 50% de usuarios inactivos");
  if (totalInvites === 0) alerts.push("No hay invites enviados en el período");

  // Knowledge base for all users
  const allKnowledge = await prisma.agentKnowledge.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const knowledgeByUser = new Map<string, Array<{ category: string; content: string; source: string; createdAt: Date }>>();
  for (const k of allKnowledge) {
    if (!knowledgeByUser.has(k.userId)) knowledgeByUser.set(k.userId, []);
    knowledgeByUser.get(k.userId)!.push({ category: k.category, content: k.content, source: k.source || "unknown", createdAt: k.createdAt });
  }
  // Map userId to email
  const userEmailMap = new Map(users.map(u => [u.id, u.email]));
  const knowledgeEntries = allKnowledge.map(k => ({
    userEmail: userEmailMap.get(k.userId) || k.userId,
    category: k.category,
    content: k.content,
    source: k.source || "unknown",
    createdAt: k.createdAt,
  }));

  return NextResponse.json({
    totalUsers,
    activeUsers: activeUsersCount,
    inactiveUsers,
    totalCampaigns,
    totalInvites,
    totalConnections,
    totalResponses,
    contactsByStage: contactsStageData,
    contactsByUser,
    tokenUsage,
    usageTime: { totalHours: Math.round(totalHours), avgPerUser: Math.round(avgPerUser * 100) / 100 },
    topUsersByTime,
    users: userStats,
    ratios: {
      inviteAcceptanceRate: `${inviteAcceptanceRate}%`,
      responseRate: `${responseRate}%`,
      avgTokensPerUser
    },
    totalCost,
    alerts,
    knowledge: knowledgeEntries,
  });
}