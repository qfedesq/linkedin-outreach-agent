import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { callLLM, getConnectionNotePrompt } from "@/lib/llm";

export async function POST() {
  const user = await getAuthUser();
  if (!user?.settings?.openrouterApiKey) return unauthorized();

  // Check daily invite cap
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayInvites = await prisma.inviteBatchItem.count({
    where: {
      sent: true,
      sentAt: { gte: today },
      batch: { userId: user.id },
    },
  });

  if (todayInvites >= 20) {
    return NextResponse.json({ error: "Daily invite cap (20) reached" }, { status: 429 });
  }

  const maxBatch = 20 - todayInvites;

  // Get contacts ready to invite (prioritize HIGH fit, then oldest)
  const contacts = await prisma.contact.findMany({
    where: {
      userId: user.id,
      status: "TO_CONTACT",
      linkedinProfileId: { not: null },
      linkedinTrackingId: { not: null },
    },
    orderBy: [
      { profileFit: "asc" }, // HIGH comes first alphabetically
      { createdAt: "asc" },
    ],
    take: maxBatch,
  });

  if (contacts.length === 0) {
    return NextResponse.json({ error: "No contacts ready for invites (need profileId — run enrichment first)" }, { status: 400 });
  }

  const systemPrompt = getConnectionNotePrompt(user.settings.calendarBookingUrl);

  // Create batch
  const batch = await prisma.inviteBatch.create({
    data: { userId: user.id },
  });

  const items = [];

  for (const contact of contacts) {
    const userPrompt = [
      `Name: ${contact.name}`,
      contact.position && `Position: ${contact.position}`,
      contact.company && `Company: ${contact.company}`,
      contact.companyDescription && `About company: ${contact.companyDescription}`,
      contact.fitRationale && `Fit rationale: ${contact.fitRationale}`,
    ]
      .filter(Boolean)
      .join("\n");

    let message = "";
    try {
      message = await callLLM(
        systemPrompt,
        userPrompt,
        user.settings.openrouterApiKey,
        user.settings.preferredModel,
        { temperature: 0.8, maxTokens: 200 }
      );
      // Enforce 300 char limit
      message = message.trim().substring(0, 300);
    } catch {
      message = `${contact.name.split(" ")[0]} — would love to connect and share how arenas.fi's $100M Sky Protocol facility could support ${contact.company || "your"} lending operations. Open to a quick call?`;
      message = message.substring(0, 300);
    }

    const item = await prisma.inviteBatchItem.create({
      data: {
        batchId: batch.id,
        contactId: contact.id,
        draftMessage: message,
      },
    });

    items.push({
      ...item,
      contact,
    });
  }

  return NextResponse.json({ batch, items });
}
