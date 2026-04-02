import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { createLinkedInAPI } from "@/lib/linkedin";

export async function POST() {
  const user = await getAuthUser();
  if (!user?.settings?.linkedinLiAt || !user.settings.linkedinCsrfToken) {
    return unauthorized();
  }

  const liAt = decrypt(user.settings.linkedinLiAt);
  const csrf = decrypt(user.settings.linkedinCsrfToken);
  const api = createLinkedInAPI(liAt, csrf);

  try {
    const conversations = await api.messaging.getConversations(0, 50);

    // Get all tracked contacts
    const contacts = await prisma.contact.findMany({
      where: { userId: user.id, status: { in: ["INVITED", "CONNECTED", "FOLLOWED_UP"] } },
    });

    const contactByUrn = new Map(
      contacts.filter((c) => c.linkedinEntityUrn).map((c) => [c.linkedinEntityUrn!, c])
    );

    const matches = [];

    for (const conv of conversations) {
      for (const participant of conv.participants) {
        const contact = contactByUrn.get(participant.entityUrn);
        if (contact && conv.lastMessage) {
          // Check if the message is from the contact (not from us)
          if (conv.lastMessage.senderUrn !== user.settings.linkedinProfileUrn) {
            if (contact.status !== "REPLIED" && contact.status !== "MEETING_BOOKED") {
              await prisma.contact.update({
                where: { id: contact.id },
                data: {
                  status: "REPLIED",
                  notes: contact.notes
                    ? `${contact.notes}\nReply detected: ${new Date().toISOString()}`
                    : `Reply detected: ${new Date().toISOString()}`,
                },
              });
            }
            matches.push({
              contact,
              lastMessage: conv.lastMessage.text.substring(0, 200),
              conversationId: conv.conversationId,
            });
          }
        }
      }
    }

    await prisma.executionLog.create({
      data: {
        action: "scan_inbox",
        success: true,
        response: JSON.stringify({ conversationsScanned: conversations.length, matchesFound: matches.length }),
        userId: user.id,
      },
    });

    return NextResponse.json({
      scanned: conversations.length,
      matches,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
