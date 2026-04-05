import { prisma } from "@/lib/prisma";

/**
 * Check if a contact with this LinkedIn URL already exists for this user.
 * Returns the existing contact info if found (for cross-campaign dedup).
 */
export async function checkDuplicate(
  userId: string,
  linkedinUrl: string
): Promise<{ isDuplicate: boolean; existingContact?: { id: string; name: string; campaignId: string | null; status: string } }> {
  const normalized = linkedinUrl.toLowerCase().replace(/\/$/, "").split("?")[0]
    .replace(/^https?:\/\/(www\.)?linkedin\.com/, "https://www.linkedin.com");

  const existing = await prisma.contact.findFirst({
    where: { userId, linkedinUrl: normalized },
    select: { id: true, name: true, campaignId: true, status: true },
  });

  if (existing) {
    return { isDuplicate: true, existingContact: existing };
  }

  return { isDuplicate: false };
}

/**
 * Create a contact with dedup check. Returns the created contact or skip reason.
 */
export async function createContactSafe(
  userId: string,
  data: {
    name: string;
    position?: string | null;
    company?: string | null;
    linkedinUrl: string;
    linkedinSlug?: string | null;
    linkedinProfileId?: string | null;
    source?: string;
    campaignId?: string | null;
  }
): Promise<{ created: boolean; reason?: string; contactId?: string }> {
  const normalized = data.linkedinUrl.toLowerCase().replace(/\/$/, "").split("?")[0]
    .replace(/^https?:\/\/(www\.)?linkedin\.com/, "https://www.linkedin.com");

  // Check for existing contact across ALL campaigns for this user
  const existing = await prisma.contact.findFirst({
    where: { userId, linkedinUrl: normalized },
    select: { id: true, name: true, campaignId: true, status: true },
  });

  if (existing) {
    // Same campaign = skip silently
    if (existing.campaignId === data.campaignId) {
      return { created: false, reason: "duplicate_same_campaign" };
    }
    // Different campaign = block (cross-campaign dedup)
    return { created: false, reason: `exists_in_other_campaign`, contactId: existing.id };
  }

  try {
    const contact = await prisma.contact.create({
      data: {
        name: data.name,
        position: data.position || null,
        company: data.company || null,
        linkedinUrl: normalized,
        linkedinSlug: data.linkedinSlug || null,
        linkedinProfileId: data.linkedinProfileId || null,
        source: data.source || "unipile",
        campaignId: data.campaignId || null,
        userId,
      },
    });
    return { created: true, contactId: contact.id };
  } catch {
    return { created: false, reason: "duplicate_url" };
  }
}
