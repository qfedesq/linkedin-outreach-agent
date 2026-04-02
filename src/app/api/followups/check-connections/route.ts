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

  const invited = await prisma.contact.findMany({
    where: { userId: user.id, status: "INVITED" },
  });

  if (invited.length === 0) {
    return NextResponse.json({ checked: 0, newConnections: 0, expired: 0 });
  }

  const liAt = decrypt(user.settings.linkedinLiAt);
  const csrf = decrypt(user.settings.linkedinCsrfToken);
  const api = createLinkedInAPI(liAt, csrf);

  let newConnections = 0;
  let expired = 0;
  const results = [];

  for (const contact of invited) {
    if (!contact.linkedinSlug) continue;

    try {
      const status = await api.connections.getConnectionStatus(contact.linkedinSlug);

      if (status.distance === "DISTANCE_1") {
        await prisma.contact.update({
          where: { id: contact.id },
          data: { status: "CONNECTED", connectedDate: new Date() },
        });
        newConnections++;
        results.push({ id: contact.id, name: contact.name, result: "connected" });
      } else if (
        contact.inviteSentDate &&
        Date.now() - new Date(contact.inviteSentDate).getTime() > 30 * 24 * 60 * 60 * 1000
      ) {
        await prisma.contact.update({
          where: { id: contact.id },
          data: { status: "UNRESPONSIVE" },
        });
        expired++;
        results.push({ id: contact.id, name: contact.name, result: "expired" });
      } else {
        results.push({ id: contact.id, name: contact.name, result: "pending" });
      }

      await prisma.executionLog.create({
        data: {
          action: "check_connection",
          contactId: contact.id,
          success: true,
          response: JSON.stringify({ distance: status.distance }),
          userId: user.id,
        },
      });
    } catch (error) {
      results.push({ id: contact.id, name: contact.name, result: "error", error: (error as Error).message });
    }
  }

  return NextResponse.json({
    checked: invited.length,
    newConnections,
    expired,
    stillPending: invited.length - newConnections - expired,
    results,
  });
}
