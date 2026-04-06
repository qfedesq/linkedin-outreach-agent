import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { APP_VERSION } from "@/lib/constants";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const now = new Date();

  // Fetch all data in parallel for speed
  const [
    allLogs,
    allContacts,
    allCampaigns,
    allBatches,
    allChatMessages,
    allKnowledge,
    allUsers,
    totalLogs,
    totalContacts,
  ] = await Promise.all([
    prisma.executionLog.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.contact.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.campaign.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.inviteBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { items: true },
    }),
    prisma.chatMessage.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.agentKnowledge.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.user.findMany({
      include: {
        settings: {
          select: {
            preferredModel: true,
            autonomyLevel: true,
            dailyInviteLimit: true,
            followupDelayDays: true,
            unipileApiKey: true,
            unipileAccountId: true,
            unipileDsn: true,
            openrouterApiKey: true,
          },
        },
      },
    }),
    prisma.executionLog.count(),
    prisma.contact.count(),
  ]);

  // Build user map for enrichment
  const userMap = new Map(allUsers.map(u => [u.id, { name: u.name, email: u.email }]));

  // Build the diagnostic report
  const report = {
    _metadata: {
      exportedAt: now.toISOString(),
      exportedBy: user.email,
      appVersion: APP_VERSION,
      environment: process.env.VERCEL ? "vercel" : "local",
      nodeVersion: process.version,
      totalLogsInDB: totalLogs,
      totalContactsInDB: totalContacts,
      logsIncluded: allLogs.length,
      contactsIncluded: allContacts.length,
      documentation: {
        purpose: "Full diagnostic export for troubleshooting. Contains all execution logs, contacts, campaigns, invite batches, chat history, agent knowledge, and user configuration (API keys are masked).",
        sections: {
          users: "All registered users with their settings (API keys masked). Check hasLinkedIn/hasOpenRouter to verify configuration.",
          campaigns: "All campaigns with ICP definitions, strategy notes, and status.",
          contacts: "Last 500 contacts with fit scoring, status, connection degree, and owner.",
          executionLogs: "Last 500 execution logs with action, request/response, success/error, duration, and timestamps. Key actions: agent_chat, chat_debug, send_invite, score_contact, linkedin_search, llm_usage, self_heal_diagnosis.",
          inviteBatches: "Last 50 invite batches with individual items showing draft messages, send results, and approval status.",
          chatMessages: "Last 200 chat messages (user + assistant) with timestamps.",
          knowledge: "All agent knowledge entries (corrections, strategies, insights) persisted across sessions.",
          errorSummary: "Aggregated error counts by type for quick diagnosis.",
          rateLimitStatus: "Current daily usage counts vs limits.",
        },
      },
    },

    users: allUsers.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt,
      settings: u.settings ? {
        hasLinkedIn: !!(u.settings.unipileApiKey && u.settings.unipileDsn && u.settings.unipileAccountId),
        hasOpenRouter: !!u.settings.openrouterApiKey,
        preferredModel: u.settings.preferredModel,
        autonomyLevel: u.settings.autonomyLevel,
        dailyInviteLimit: u.settings.dailyInviteLimit,
        followupDelayDays: u.settings.followupDelayDays,
        unipileDsn: u.settings.unipileDsn ? "configured" : null,
      } : null,
    })),

    campaigns: allCampaigns.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description,
      icpDefinition: c.icpDefinition,
      strategyNotes: c.strategyNotes,
      calendarUrl: c.calendarUrl,
      isActive: c.isActive,
      dailyInviteLimit: c.dailyInviteLimit,
      followupDelayDays: c.followupDelayDays,
      owner: userMap.get(c.userId)?.email || c.userId,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),

    contacts: allContacts.map(c => ({
      id: c.id,
      name: c.name,
      position: c.position,
      company: c.company,
      linkedinUrl: c.linkedinUrl,
      linkedinSlug: c.linkedinSlug,
      linkedinProfileId: c.linkedinProfileId,
      connectionDegree: c.connectionDegree,
      profileFit: c.profileFit,
      fitRationale: c.fitRationale,
      status: c.status,
      source: c.source,
      campaignId: c.campaignId,
      owner: userMap.get(c.userId)?.email || c.userId,
      inviteSentDate: c.inviteSentDate,
      connectedDate: c.connectedDate,
      followupSentDate: c.followupSentDate,
      connectionMessage: c.connectionMessage,
      notes: c.notes,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),

    executionLogs: allLogs.map(l => ({
      id: l.id,
      action: l.action,
      request: l.request,
      response: l.response,
      success: l.success,
      errorCode: l.errorCode,
      duration: l.duration,
      contactId: l.contactId,
      user: userMap.get(l.userId)?.email || l.userId,
      timestamp: l.createdAt,
    })),

    inviteBatches: allBatches.map(b => ({
      id: b.id,
      owner: userMap.get(b.userId)?.email || b.userId,
      createdAt: b.createdAt,
      items: b.items.map(i => ({
        id: i.id,
        contactId: i.contactId,
        draftMessage: i.draftMessage,
        editedMessage: i.editedMessage,
        approved: i.approved,
        sent: i.sent,
        sentAt: i.sentAt,
        sendResult: i.sendResult,
      })),
    })),

    chatMessages: allChatMessages.map(m => ({
      role: m.role,
      content: m.content,
      campaignId: m.campaignId,
      user: userMap.get(m.userId)?.email || m.userId,
      timestamp: m.createdAt,
    })),

    knowledge: allKnowledge.map(k => ({
      category: k.category,
      content: k.content,
      source: k.source,
      user: userMap.get(k.userId)?.email || k.userId,
      timestamp: k.createdAt,
    })),

    errorSummary: (() => {
      const errors = allLogs.filter(l => !l.success && l.errorCode);
      const byType: Record<string, number> = {};
      const byAction: Record<string, number> = {};
      for (const e of errors) {
        byType[e.errorCode!] = (byType[e.errorCode!] || 0) + 1;
        byAction[e.action] = (byAction[e.action] || 0) + 1;
      }
      return {
        totalErrors: errors.length,
        byErrorCode: Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([code, count]) => ({ code, count })),
        byAction: Object.entries(byAction).sort((a, b) => b[1] - a[1]).map(([action, count]) => ({ action, count })),
        lastError: errors[0] ? {
          action: errors[0].action,
          error: errors[0].errorCode,
          message: errors[0].request,
          timestamp: errors[0].createdAt,
          user: userMap.get(errors[0].userId)?.email || errors[0].userId,
        } : null,
      };
    })(),

    rateLimitStatus: await (async () => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);
      const [invitesToday, invitesWeek, messagesToday, searchesToday] = await Promise.all([
        prisma.executionLog.count({ where: { action: "send_invite", success: true, createdAt: { gte: todayStart } } }),
        prisma.executionLog.count({ where: { action: "send_invite", success: true, createdAt: { gte: weekStart } } }),
        prisma.executionLog.count({ where: { action: { in: ["send_message", "send_followup"] }, success: true, createdAt: { gte: todayStart } } }),
        prisma.executionLog.count({ where: { action: "linkedin_search", success: true, createdAt: { gte: todayStart } } }),
      ]);
      return {
        invites: { today: invitesToday, limit: 40, week: invitesWeek, weekLimit: 120 },
        messages: { today: messagesToday, limit: 50 },
        searches: { today: searchesToday, limit: 25 },
      };
    })(),
  };

  return NextResponse.json(report);
}
