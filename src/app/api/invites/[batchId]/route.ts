import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { batchId } = await params;

  const batch = await prisma.inviteBatch.findFirst({
    where: { id: batchId, userId: user.id },
    include: { items: true },
  });

  if (!batch) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Attach contact info to each item
  const contactIds = batch.items.map((i) => i.contactId);
  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds } },
  });
  const contactMap = new Map(contacts.map((c) => [c.id, c]));

  const items = batch.items.map((item) => ({
    ...item,
    contact: contactMap.get(item.contactId),
  }));

  return NextResponse.json({ ...batch, items });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { batchId } = await params;
  const body = await request.json();

  // Update batch status
  if (body.status) {
    await prisma.inviteBatch.updateMany({
      where: { id: batchId, userId: user.id },
      data: { status: body.status },
    });
  }

  // Update individual items
  if (body.items) {
    for (const item of body.items) {
      await prisma.inviteBatchItem.update({
        where: { id: item.id },
        data: {
          approved: item.approved,
          skipped: item.skipped,
          editedMessage: item.editedMessage,
        },
      });
    }
  }

  return NextResponse.json({ success: true });
}
