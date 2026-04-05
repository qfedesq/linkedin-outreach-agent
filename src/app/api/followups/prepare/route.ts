import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { callLLM, getFollowupPrompt } from "@/lib/llm";
import { logActivity } from "@/lib/activity-log";

export async function POST() {
  const user = await getAuthUser();
  if (!user?.settings?.openrouterApiKey) return unauthorized();

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  const contacts = await prisma.contact.findMany({
    where: {
      userId: user.id,
      status: "CONNECTED",
      connectedDate: { lte: threeDaysAgo },
      followupSentDate: null,
    },
    orderBy: { connectedDate: "asc" },
  });

  if (contacts.length === 0) {
    return NextResponse.json({ drafts: [], message: "No contacts due for follow-up" });
  }

  await logActivity(user.id, "generate_followup", {
    level: "info",
    message: `Generating follow-up messages for ${contacts.length} contacts`,
  });

  const systemPrompt = getFollowupPrompt({ userName: user.name || "the team", campaignName: "Outreach", calendarUrl: user.settings.calendarBookingUrl });
  const drafts = [];

  for (const contact of contacts) {
    const userPrompt = [
      `Name: ${contact.name}`,
      contact.position && `Position: ${contact.position}`,
      contact.company && `Company: ${contact.company}`,
      contact.companyDescription && `About: ${contact.companyDescription}`,
    ].filter(Boolean).join("\n");

    try {
      const message = await callLLM(
        systemPrompt,
        userPrompt,
        user.settings.openrouterApiKey,
        user.settings.preferredModel,
        { temperature: 0.7, maxTokens: 300 }
      );

      drafts.push({ contactId: contact.id, contact, message: message.trim() });

      await logActivity(user.id, "generate_followup", {
        level: "success",
        message: `Generated follow-up for ${contact.name} (${message.trim().length} chars)`,
      });
    } catch (error) {
      await logActivity(user.id, "generate_followup", {
        level: "error",
        message: `Failed to generate for ${contact.name}: ${(error as Error).message}`,
        success: false,
      });
    }
  }

  return NextResponse.json({ drafts, total: contacts.length });
}
