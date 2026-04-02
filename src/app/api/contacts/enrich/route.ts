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
  const contactIds: string[] = body.contactIds || [];

  const liAt = decrypt(user.settings.linkedinLiAt);
  const csrf = decrypt(user.settings.linkedinCsrfToken);
  const api = createLinkedInAPI(liAt, csrf);

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
      results.push({ id, success: true });
    } catch (error) {
      results.push({ id, success: false, error: (error as Error).message });
    }
  }

  return NextResponse.json({ results });
}
