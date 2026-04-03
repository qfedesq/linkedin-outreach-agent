import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { createLinkedInAPI } from "@/lib/linkedin";
import { logActivity } from "@/lib/activity-log";

export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user?.settings?.linkedinLiAt || !user.settings.linkedinCsrfToken) {
    return unauthorized();
  }

  const body = await request.json();
  const contactIds: string[] = body.contactIds || [];

  const liAt = decrypt(user.settings.linkedinLiAt);
  const csrf = decrypt(user.settings.linkedinCsrfToken);
  const api = createLinkedInAPI(liAt, csrf);

  await logActivity(user.id, "enrich_contacts", {
    level: "info",
    message: `Enriching ${contactIds.length} contacts via LinkedIn Voyager...`,
  });

  const results = [];

  for (const id of contactIds) {
    const contact = await prisma.contact.findFirst({ where: { id, userId: user.id } });
    if (!contact?.linkedinSlug) continue;

    try {
      const profile = await api.profiles.getMiniProfile(contact.linkedinSlug);
      await prisma.contact.update({
        where: { id },
        data: {
          linkedinProfileId: profile.profileId,
          linkedinTrackingId: profile.trackingId,
          linkedinEntityUrn: profile.entityUrn,
          enrichedAt: new Date(),
        },
      });

      await logActivity(user.id, "enrich_contacts", {
        level: "success",
        message: `Enriched: ${contact.name} — profileId=${profile.profileId?.substring(0, 15)}...`,
      });

      results.push({ id, success: true });
    } catch (error) {
      await logActivity(user.id, "enrich_contacts", {
        level: "error",
        message: `Enrich failed for ${contact.name}: ${(error as Error).message}`,
        success: false,
      });
      results.push({ id, success: false, error: (error as Error).message });
    }
  }

  return NextResponse.json({ results });
}
