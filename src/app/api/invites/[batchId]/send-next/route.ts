import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { requireLinkedIn } from "@/lib/linkedin-provider";
import { logActivity } from "@/lib/activity-log";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const user = await getAuthUser();
  if (!user?.settings) return unauthorized();

  const { batchId } = await params;

  // Check daily cap
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayCount = await prisma.inviteBatchItem.count({
    where: { sent: true, sentAt: { gte: today }, batch: { userId: user.id } },
  });
  if (todayCount >= (user.settings.dailyInviteLimit || 20)) {
    return NextResponse.json({ error: "Daily cap reached", done: true }, { status: 429 });
  }

  // Get next unsent approved item
  const item = await prisma.inviteBatchItem.findFirst({
    where: { batchId, approved: true, skipped: false, sent: false, batch: { userId: user.id } },
    orderBy: { id: "asc" },
  });

  if (!item) {
    await prisma.inviteBatch.updateMany({ where: { id: batchId, userId: user.id }, data: { status: "SENT" } });
    return NextResponse.json({ done: true });
  }

  const contact = await prisma.contact.findUnique({ where: { id: item.contactId } });
  if (!contact) {
    await prisma.inviteBatchItem.update({ where: { id: item.id }, data: { sent: true, sendResult: "contact_not_found" } });
    return NextResponse.json({ item: { ...item, sendResult: "contact_not_found" }, done: false });
  }

  let linkedin;
  try { linkedin = requireLinkedIn(user.settings); } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const message = item.editedMessage || item.draftMessage;

  try {
    // Get the Unipile provider_id — if we only have a slug, look up the profile first
    let providerId = contact.linkedinProfileId || contact.linkedinEntityUrn || "";

    if (!providerId && contact.linkedinSlug) {
      try {
        const profile = await linkedin.getProfile(contact.linkedinSlug);
        providerId = profile?.provider_id || profile?.id || "";
        if (providerId) {
          await prisma.contact.update({ where: { id: contact.id }, data: { linkedinProfileId: providerId } });
        }
      } catch {
        // Profile lookup failed — try with slug directly
        providerId = contact.linkedinSlug;
      }
    }

    if (!providerId) {
      await prisma.inviteBatchItem.update({ where: { id: item.id }, data: { sent: true, sendResult: "no_provider_id" } });
      return NextResponse.json({ item: { ...item, sendResult: "no_provider_id", contact }, done: false });
    }

    await linkedin.sendInvitation(providerId, message);

    await prisma.inviteBatchItem.update({
      where: { id: item.id },
      data: { sent: true, sentAt: new Date(), sendResult: "success" },
    });
    await prisma.contact.update({
      where: { id: contact.id },
      data: { status: "INVITED", inviteSentDate: new Date(), connectionMessage: message },
    });

    await logActivity(user.id, "send_invite", {
      level: "success", message: `Invite sent to ${contact.name} via Unipile`, contactId: contact.id,
    });

    return NextResponse.json({ item: { ...item, sendResult: "success", contact }, done: false });
  } catch (error) {
    await prisma.inviteBatchItem.update({ where: { id: item.id }, data: { sent: true, sendResult: "failed" } });
    await logActivity(user.id, "send_invite", {
      level: "error", message: `Invite failed for ${contact.name}: ${(error as Error).message}`, success: false, contactId: contact.id,
    });
    return NextResponse.json({ item: { ...item, sendResult: "failed", error: (error as Error).message }, done: false });
  }
}
