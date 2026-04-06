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
 * Check if ANY user in the system has already contacted this LinkedIn profile.
 * Used before sending invites/messages to prevent multiple users reaching out to the same person.
 * Returns the contact owner info if found.
 */
export async function checkGlobalDuplicate(
  linkedinUrl: string,
  excludeUserId?: string,
): Promise<{ contacted: boolean; by?: { userId: string; userName: string; status: string; campaignId: string | null } }> {
  const normalized = linkedinUrl.toLowerCase().replace(/\/$/, "").split("?")[0]
    .replace(/^https?:\/\/(www\.)?linkedin\.com/, "https://www.linkedin.com");

  const existing = await prisma.contact.findFirst({
    where: {
      linkedinUrl: normalized,
      status: { in: ["INVITED", "CONNECTED", "FOLLOWED_UP", "REPLIED", "MEETING_BOOKED"] },
      ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
    },
    select: { id: true, userId: true, status: true, campaignId: true },
  });

  if (existing) {
    const owner = await prisma.user.findUnique({ where: { id: existing.userId }, select: { name: true } });
    return {
      contacted: true,
      by: {
        userId: existing.userId,
        userName: owner?.name || "another user",
        status: existing.status,
        campaignId: existing.campaignId,
      },
    };
  }

  return { contacted: false };
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
    connectionDegree?: string | null;
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
    if (existing.campaignId === data.campaignId) {
      return { created: false, reason: "duplicate_same_campaign" };
    }
    return { created: false, reason: `exists_in_other_campaign`, contactId: existing.id };
  }

  // Cross-user check: warn if another user already contacted this person
  const otherUser = await prisma.contact.findFirst({
    where: {
      linkedinUrl: normalized,
      userId: { not: userId },
      status: { in: ["INVITED", "CONNECTED", "FOLLOWED_UP", "REPLIED", "MEETING_BOOKED"] },
    },
    select: { id: true, userId: true, status: true },
  });

  if (otherUser) {
    const owner = await prisma.user.findUnique({ where: { id: otherUser.userId }, select: { name: true } });
    return { created: false, reason: `already_contacted_by_${owner?.name || "another user"}` };
  }

  try {
    // Auto-detect status from connection degree
    const isFirstDegree = data.connectionDegree === "DISTANCE_1";

    const contact = await prisma.contact.create({
      data: {
        name: data.name,
        position: data.position || null,
        company: data.company || null,
        linkedinUrl: normalized,
        linkedinSlug: data.linkedinSlug || null,
        linkedinProfileId: data.linkedinProfileId || null,
        connectionDegree: data.connectionDegree || null,
        source: data.source || "unipile",
        campaignId: data.campaignId || null,
        // 1st degree = already connected, no invite needed
        status: isFirstDegree ? "CONNECTED" : "TO_CONTACT",
        connectedDate: isFirstDegree ? new Date() : null,
        userId,
      },
    });
    return { created: true, contactId: contact.id };
  } catch {
    return { created: false, reason: "duplicate_url" };
  }
}
