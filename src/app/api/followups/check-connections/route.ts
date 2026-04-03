import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { requireLinkedIn } from "@/lib/linkedin-provider";
import { logActivity } from "@/lib/activity-log";

export async function POST() {
  const user = await getAuthUser();
  if (!user?.settings) return unauthorized();

  const invited = await prisma.contact.findMany({
    where: { userId: user.id, status: "INVITED" },
  });

  if (invited.length === 0) {
    return NextResponse.json({ checked: 0, newConnections: 0, expired: 0, stillPending: 0 });
  }

  let linkedin;
  try { linkedin = requireLinkedIn(user.settings); } catch {
    // If Unipile not configured, just check by time (mark 30+ day old as unresponsive)
    let expired = 0;
    for (const contact of invited) {
      if (contact.inviteSentDate && Date.now() - new Date(contact.inviteSentDate).getTime() > 30 * 24 * 60 * 60 * 1000) {
        await prisma.contact.update({ where: { id: contact.id }, data: { status: "UNRESPONSIVE" } });
        expired++;
      }
    }
    return NextResponse.json({ checked: invited.length, newConnections: 0, expired, stillPending: invited.length - expired });
  }

  await logActivity(user.id, "check_connection", {
    level: "info", message: `Checking connection status for ${invited.length} invited contacts via Unipile...`,
  });

  let newConnections = 0;
  let expired = 0;

  // Use Unipile chats to detect who has accepted (if they appear in conversations, they're connected)
  try {
    const chats = await linkedin.getChats(100);
    const chatAttendees = new Set<string>();
    for (const chat of (chats?.items || [])) {
      for (const att of (chat?.attendees || [])) {
        if (att?.provider_id) chatAttendees.add(att.provider_id);
      }
    }

    for (const contact of invited) {
      if (contact.linkedinProfileId && chatAttendees.has(contact.linkedinProfileId)) {
        await prisma.contact.update({ where: { id: contact.id }, data: { status: "CONNECTED", connectedDate: new Date() } });
        newConnections++;
      } else if (contact.inviteSentDate && Date.now() - new Date(contact.inviteSentDate).getTime() > 30 * 24 * 60 * 60 * 1000) {
        await prisma.contact.update({ where: { id: contact.id }, data: { status: "UNRESPONSIVE" } });
        expired++;
      }
    }
  } catch (error) {
    await logActivity(user.id, "check_connection", {
      level: "error", message: `Connection check failed: ${(error as Error).message}`, success: false,
    });
  }

  await logActivity(user.id, "check_connection", {
    level: "success", message: `Checked ${invited.length}: ${newConnections} new connections, ${expired} expired`,
  });

  return NextResponse.json({ checked: invited.length, newConnections, expired, stillPending: invited.length - newConnections - expired });
}
