import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { checkDuplicate } from "@/lib/contact-dedup";

function normalizeLinkedInUrl(url: string): string {
  return url
    .toLowerCase()
    .replace(/\/$/, "")
    .split("?")[0]
    .replace(/^https?:\/\/(www\.)?linkedin\.com/, "https://www.linkedin.com");
}

function extractSlug(url: string): string | null {
  const match = url.match(/linkedin\.com\/in\/([^/?]+)/i);
  return match ? match[1] : null;
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get("status");
  const fit = searchParams.get("fit");
  const search = searchParams.get("search");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");

  const campaignId = searchParams.get("campaignId");

  const global = searchParams.get("global") === "true";
  const filterUserId = searchParams.get("userId");

  // Global view: all users' contacts (for the contacts page)
  // Regular view: only current user's contacts (for agent tools, stats, etc.)
  const where: Record<string, unknown> = global ? {} : { userId: user.id };
  if (filterUserId && global) where.userId = filterUserId;
  if (status) where.status = status;
  if (fit) where.profileFit = fit;
  if (campaignId) where.campaignId = campaignId;
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { company: { contains: search } },
      { position: { contains: search } },
    ];
  }

  const skip = (page - 1) * limit;

  const contacts = await prisma.contact.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip,
    take: limit,
  });

  // For global view, attach user info
  let enrichedContacts = contacts;
  if (global) {
    const userIds = [...new Set(contacts.map(c => c.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    });
    const userMap = new Map(users.map(u => [u.id, { name: u.name, email: u.email }]));
    enrichedContacts = contacts.map(c => ({ ...c, user: userMap.get(c.userId) || null })) as typeof contacts;
  }

  const total = await prisma.contact.count({ where });

  return NextResponse.json({ contacts: enrichedContacts, total, page, limit });
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await request.json();
  const contacts = Array.isArray(body) ? body : [body];
  const created = [];
  const skipped = [];

  for (const c of contacts) {
    const normalizedUrl = normalizeLinkedInUrl(c.linkedinUrl);
    const slug = extractSlug(normalizedUrl);

    // Cross-campaign dedup check
    const dedup = await checkDuplicate(user.id, normalizedUrl);
    if (dedup.isDuplicate) {
      skipped.push(normalizedUrl);
      continue;
    }

    try {
      const contact = await prisma.contact.create({
        data: {
          name: c.name,
          position: c.position || null,
          company: c.company || null,
          linkedinUrl: normalizedUrl,
          linkedinSlug: slug,
          companyDescription: c.companyDescription || null,
          connectionMessage: c.connectionMessage || null,
          profileFit: c.profileFit || "MEDIUM",
          fitRationale: c.fitRationale || null,
          status: c.status || "TO_CONTACT",
          source: c.source || "manual",
          notes: c.notes || null,
          userId: user.id,
        },
      });
      created.push(contact);
    } catch {
      skipped.push(normalizedUrl);
    }
  }

  return NextResponse.json({ created: created.length, skipped: skipped.length, contacts: created });
}
