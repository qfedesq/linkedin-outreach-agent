import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { createLinkedInAPI } from "@/lib/linkedin";

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user?.settings?.linkedinLiAt || !user.settings.linkedinCsrfToken) {
    return unauthorized();
  }

  const body = await request.json();
  const { messages }: { messages: { contactId: string; message: string }[] } = body;

  const liAt = decrypt(user.settings.linkedinLiAt);
  const csrf = decrypt(user.settings.linkedinCsrfToken);
  const api = createLinkedInAPI(liAt, csrf);

  const results = [];

  for (const { contactId, message } of messages) {
    const contact = await prisma.contact.findFirst({ where: { id: contactId, userId: user.id } });
    if (!contact?.linkedinEntityUrn) continue;

    try {
      const result = await api.messaging.sendMessage(
        contact.linkedinEntityUrn,
        message,
        user.settings.linkedinProfileUrn || ""
      );

      if (result.success) {
        await prisma.contact.update({
          where: { id: contactId },
          data: { status: "FOLLOWED_UP", followupSentDate: new Date() },
        });
      }

      await prisma.executionLog.create({
        data: {
          action: "send_message",
          contactId,
          success: result.success,
          errorCode: result.error || null,
          userId: user.id,
        },
      });

      results.push({ contactId, success: result.success });
    } catch (error) {
      results.push({ contactId, success: false, error: (error as Error).message });
    }
  }

  return NextResponse.json({ results });
}
