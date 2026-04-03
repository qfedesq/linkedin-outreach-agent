import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { requireLinkedIn } from "@/lib/linkedin-provider";
import { logActivity } from "@/lib/activity-log";

export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user?.settings) return unauthorized();

  let linkedin;
  try { linkedin = requireLinkedIn(user.settings); } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const body = await request.json();
  const contactIds: string[] = body.contactIds || [];

  await logActivity(user.id, "enrich_contacts", {
    level: "info", message: `Enriching ${contactIds.length} contacts via Unipile...`,
  });

  const results = [];
  for (const id of contactIds) {
    const contact = await prisma.contact.findFirst({ where: { id, userId: user.id } });
    if (!contact?.linkedinSlug) continue;

    try {
      const profile = await linkedin.getProfile(contact.linkedinSlug);
      const providerId = profile?.provider_id || profile?.id || null;

      await prisma.contact.update({
        where: { id },
        data: {
          linkedinProfileId: providerId,
          linkedinEntityUrn: providerId,
          enrichedAt: new Date(),
        },
      });

      await logActivity(user.id, "enrich_contacts", {
        level: "success", message: `Enriched: ${contact.name} — providerId=${providerId?.substring(0, 20)}`,
      });
      results.push({ id, success: true });
    } catch (error) {
      await logActivity(user.id, "enrich_contacts", {
        level: "error", message: `Enrich failed for ${contact.name}: ${(error as Error).message}`, success: false,
      });
      results.push({ id, success: false, error: (error as Error).message });
    }
  }

  return NextResponse.json({ results });
}
