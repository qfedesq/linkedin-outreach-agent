import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { requireLinkedIn } from "@/lib/linkedin-provider";
import { logActivity } from "@/lib/activity-log";

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user?.settings) return unauthorized();

  let linkedin;
  try { linkedin = requireLinkedIn(user.settings); } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const body = await request.json();
  const { messages }: { messages: { contactId: string; message: string }[] } = body;
  const results = [];

  for (const { contactId, message } of messages) {
    const contact = await prisma.contact.findFirst({ where: { id: contactId, userId: user.id } });
    if (!contact?.linkedinProfileId) continue;

    try {
      await linkedin.sendMessage([contact.linkedinProfileId], message);

      await prisma.contact.update({
        where: { id: contactId },
        data: { status: "FOLLOWED_UP", followupSentDate: new Date() },
      });

      await logActivity(user.id, "send_message", {
        level: "success", message: `Follow-up sent to ${contact.name} via Unipile`, contactId,
      });
      results.push({ contactId, success: true });
    } catch (error) {
      await logActivity(user.id, "send_message", {
        level: "error", message: `Follow-up failed for ${contact.name}: ${(error as Error).message}`, success: false, contactId,
      });
      results.push({ contactId, success: false, error: (error as Error).message });
    }
  }

  return NextResponse.json({ results });
}
