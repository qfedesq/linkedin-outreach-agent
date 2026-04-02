import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { callLLM, ICP_SCORING_PROMPT } from "@/lib/llm";

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user?.settings?.openrouterApiKey) return unauthorized();

  const body = await request.json();
  const contactIds: string[] = body.contactIds || [];
  const results = [];

  for (const id of contactIds) {
    const contact = await prisma.contact.findFirst({ where: { id, userId: user.id } });
    if (!contact) continue;

    const profileText = [
      `Name: ${contact.name}`,
      contact.position && `Position: ${contact.position}`,
      contact.company && `Company: ${contact.company}`,
      contact.companyDescription && `Company Description: ${contact.companyDescription}`,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const response = await callLLM(
        ICP_SCORING_PROMPT,
        profileText,
        user.settings.openrouterApiKey,
        user.settings.preferredModel
      );

      const parsed = JSON.parse(response.trim());
      await prisma.contact.update({
        where: { id },
        data: {
          profileFit: parsed.fit || "MEDIUM",
          fitRationale: parsed.rationale || null,
        },
      });
      results.push({ id, fit: parsed.fit, rationale: parsed.rationale });
    } catch (error) {
      results.push({ id, error: (error as Error).message });
    }
  }

  return NextResponse.json({ results });
}
