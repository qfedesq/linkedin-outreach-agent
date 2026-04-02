import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { createLinkedInAPI } from "@/lib/linkedin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const user = await getAuthUser();
  if (!user?.settings?.linkedinLiAt || !user.settings.linkedinCsrfToken) {
    return unauthorized();
  }

  const { batchId } = await params;

  // Check daily cap
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayCount = await prisma.inviteBatchItem.count({
    where: {
      sent: true,
      sentAt: { gte: today },
      batch: { userId: user.id },
    },
  });

  if (todayCount >= 20) {
    return NextResponse.json({ error: "Daily cap reached", done: true }, { status: 429 });
  }

  // Get next unsent approved item
  const item = await prisma.inviteBatchItem.findFirst({
    where: {
      batchId,
      approved: true,
      skipped: false,
      sent: false,
      batch: { userId: user.id },
    },
    orderBy: { id: "asc" },
  });

  if (!item) {
    // All done
    await prisma.inviteBatch.updateMany({
      where: { id: batchId, userId: user.id },
      data: { status: "SENT" },
    });
    return NextResponse.json({ done: true });
  }

  const contact = await prisma.contact.findUnique({ where: { id: item.contactId } });
  if (!contact?.linkedinProfileId || !contact.linkedinTrackingId) {
    await prisma.inviteBatchItem.update({
      where: { id: item.id },
      data: { sent: true, sendResult: "profile_not_found" },
    });
    return NextResponse.json({ item: { ...item, sendResult: "profile_not_found" }, done: false });
  }

  const liAt = decrypt(user.settings.linkedinLiAt);
  const csrf = decrypt(user.settings.linkedinCsrfToken);
  const api = createLinkedInAPI(liAt, csrf);

  const message = item.editedMessage || item.draftMessage;

  try {
    const result = await api.invitations.sendInvitation(
      contact.linkedinProfileId,
      contact.linkedinTrackingId,
      message
    );

    const sendResult = result.success ? "success" : "failed";

    await prisma.inviteBatchItem.update({
      where: { id: item.id },
      data: { sent: true, sentAt: new Date(), sendResult },
    });

    if (result.success) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { status: "INVITED", inviteSentDate: new Date(), connectionMessage: message },
      });
    }

    // Log
    await prisma.executionLog.create({
      data: {
        action: "send_invite",
        contactId: contact.id,
        request: JSON.stringify({ profileId: contact.linkedinProfileId, messageLength: message.length }),
        response: JSON.stringify(result),
        success: result.success,
        errorCode: result.error || null,
        userId: user.id,
      },
    });

    return NextResponse.json({
      item: { ...item, sendResult, contact },
      done: false,
    });
  } catch (error) {
    await prisma.inviteBatchItem.update({
      where: { id: item.id },
      data: { sent: true, sendResult: "failed" },
    });

    return NextResponse.json({
      item: { ...item, sendResult: "failed", error: (error as Error).message },
      done: false,
    });
  }
}
