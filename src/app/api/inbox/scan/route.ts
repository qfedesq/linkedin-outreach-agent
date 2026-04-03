import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { requireLinkedIn } from "@/lib/linkedin-provider";
import { logActivity } from "@/lib/activity-log";

export async function POST() {
  const user = await getAuthUser();
  if (!user?.settings) return unauthorized();

  let linkedin;
  try { linkedin = requireLinkedIn(user.settings); } catch (e) {
    return NextResponse.json({ scanned: 0, matches: [], warning: (e as Error).message });
  }

  try {
    const chats = await linkedin.getChats(50);
    const chatItems = chats?.items || [];

    const contacts = await prisma.contact.findMany({
      where: { userId: user.id, status: { in: ["INVITED", "CONNECTED", "FOLLOWED_UP"] } },
    });
    const contactByProviderId = new Map(
      contacts.filter(c => c.linkedinProfileId).map(c => [c.linkedinProfileId!, c])
    );

    const matches = [];

    for (const chat of chatItems) {
      const attendees = chat.attendees || [];
      for (const att of attendees) {
        const contact = contactByProviderId.get(att.provider_id);
        if (!contact) continue;

        // Check if there are messages from the contact (not from us)
        const lastMsg = chat.last_message;
        if (lastMsg && lastMsg.sender_id !== user.settings.unipileAccountId) {
          if (contact.status !== "REPLIED" && contact.status !== "MEETING_BOOKED") {
            await prisma.contact.update({
              where: { id: contact.id },
              data: {
                status: "REPLIED",
                notes: contact.notes
                  ? `${contact.notes}\nReply: ${new Date().toISOString()}`
                  : `Reply: ${new Date().toISOString()}`,
              },
            });
          }
          matches.push({
            contact: { name: contact.name, company: contact.company },
            lastMessage: (lastMsg.text || "").substring(0, 200),
          });
        }
      }
    }

    await logActivity(user.id, "scan_inbox", {
      level: "success",
      message: `Scanned ${chatItems.length} conversations, ${matches.length} replies detected`,
      success: true,
    });

    return NextResponse.json({ scanned: chatItems.length, matches });
  } catch (error) {
    await logActivity(user.id, "scan_inbox", {
      level: "error", message: `Inbox scan failed: ${(error as Error).message}`, success: false,
    });
    return NextResponse.json({ scanned: 0, matches: [], warning: (error as Error).message });
  }
}
