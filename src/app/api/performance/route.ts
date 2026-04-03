import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  // Pipeline counts
  const statuses = ["TO_CONTACT", "INVITED", "CONNECTED", "FOLLOWED_UP", "REPLIED", "MEETING_BOOKED", "UNRESPONSIVE"];
  const counts: Record<string, number> = {};
  for (const s of statuses) {
    counts[s] = await prisma.contact.count({ where: { userId: user.id, status: s } });
  }
  const total = await prisma.contact.count({ where: { userId: user.id } });

  // Conversion rates
  const inviteRate = total > 0 ? Math.round((counts.INVITED + counts.CONNECTED + counts.FOLLOWED_UP + counts.REPLIED + counts.MEETING_BOOKED) / total * 100) : 0;
  const acceptRate = counts.INVITED > 0 ? Math.round((counts.CONNECTED + counts.FOLLOWED_UP + counts.REPLIED + counts.MEETING_BOOKED) / (counts.INVITED + counts.CONNECTED + counts.FOLLOWED_UP + counts.REPLIED + counts.MEETING_BOOKED) * 100) : 0;
  const replyRate = (counts.CONNECTED + counts.FOLLOWED_UP) > 0 ? Math.round((counts.REPLIED + counts.MEETING_BOOKED) / (counts.CONNECTED + counts.FOLLOWED_UP + counts.REPLIED + counts.MEETING_BOOKED) * 100) : 0;
  const meetingRate = counts.REPLIED > 0 ? Math.round(counts.MEETING_BOOKED / (counts.REPLIED + counts.MEETING_BOOKED) * 100) : 0;

  // Best performing messages (invites that led to connections)
  const sentItems = await prisma.inviteBatchItem.findMany({
    where: { batch: { userId: user.id }, sent: true },
    select: { draftMessage: true, editedMessage: true, contactId: true, sentAt: true },
  });

  const connectedContacts = await prisma.contact.findMany({
    where: { userId: user.id, status: { in: ["CONNECTED", "FOLLOWED_UP", "REPLIED", "MEETING_BOOKED"] } },
    select: { id: true, name: true, company: true, profileFit: true, connectionMessage: true },
  });
  const connectedIds = new Set(connectedContacts.map(c => c.id));

  const messagePerformance = sentItems.map(item => ({
    message: item.editedMessage || item.draftMessage,
    contactId: item.contactId,
    accepted: connectedIds.has(item.contactId),
    sentAt: item.sentAt,
  }));

  const acceptedMessages = messagePerformance.filter(m => m.accepted);
  const rejectedMessages = messagePerformance.filter(m => !m.accepted);

  // Top profiles (connected + replied)
  const topProfiles = connectedContacts.map(c => ({
    name: c.name,
    company: c.company,
    fit: c.profileFit,
    message: c.connectionMessage?.substring(0, 100),
  }));

  // Fit distribution
  const fitCounts = {
    HIGH: await prisma.contact.count({ where: { userId: user.id, profileFit: "HIGH" } }),
    MEDIUM: await prisma.contact.count({ where: { userId: user.id, profileFit: "MEDIUM" } }),
    LOW: await prisma.contact.count({ where: { userId: user.id, profileFit: "LOW" } }),
  };

  // Acceptance rate by fit
  const fitPerformance: Record<string, { sent: number; accepted: number; rate: number }> = {};
  for (const fit of ["HIGH", "MEDIUM", "LOW"]) {
    const fitContacts = await prisma.contact.findMany({
      where: { userId: user.id, profileFit: fit, status: { not: "TO_CONTACT" } },
      select: { id: true, status: true },
    });
    const sent = fitContacts.length;
    const accepted = fitContacts.filter(c => ["CONNECTED", "FOLLOWED_UP", "REPLIED", "MEETING_BOOKED"].includes(c.status)).length;
    fitPerformance[fit] = { sent, accepted, rate: sent > 0 ? Math.round(accepted / sent * 100) : 0 };
  }

  // Recent activity timeline
  const recentLogs = await prisma.executionLog.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { action: true, request: true, success: true, createdAt: true },
  });

  return NextResponse.json({
    funnel: { total, ...counts },
    rates: { inviteRate, acceptRate, replyRate, meetingRate },
    messages: {
      totalSent: sentItems.length,
      totalAccepted: acceptedMessages.length,
      overallRate: sentItems.length > 0 ? Math.round(acceptedMessages.length / sentItems.length * 100) : 0,
      topAccepted: acceptedMessages.slice(0, 5).map(m => m.message),
      recentRejected: rejectedMessages.slice(0, 3).map(m => m.message),
    },
    topProfiles,
    fitDistribution: fitCounts,
    fitPerformance,
    recentActivity: recentLogs,
  });
}
