import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { callLLM, getFollowupPrompt } from "@/lib/llm";

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user?.settings?.openrouterApiKey) return unauthorized();

  const body = await request.json();
  const contactIds: string[] = body.contactIds || [];
  const results = [];

  const systemPrompt = getFollowupPrompt(user.settings.calendarBookingUrl);

  for (const id of contactIds) {
    const contact = await prisma.contact.findFirst({ where: { id, userId: user.id } });
    if (!contact) continue;

    const userPrompt = [
      `Name: ${contact.name}`,
      contact.position && `Position: ${contact.position}`,
      contact.company && `Company: ${contact.company}`,
      contact.companyDescription && `About: ${contact.companyDescription}`,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const message = await callLLM(
        systemPrompt,
        userPrompt,
        user.settings.openrouterApiKey,
        user.settings.preferredModel,
        { temperature: 0.7, maxTokens: 300 }
      );
      results.push({ id, contact, message: message.trim() });
    } catch (error) {
      results.push({ id, contact, error: (error as Error).message });
    }
  }

  return NextResponse.json({ results });
}
