import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await request.json();
  const { messageContent, rating, wrongText, expectedText } = body as {
    messageContent: string;
    rating: "up" | "down";
    wrongText?: string;
    expectedText?: string;
  };

  if (!messageContent || !rating) {
    return NextResponse.json({ error: "messageContent and rating required" }, { status: 400 });
  }

  const preview = messageContent.slice(0, 150).trim();
  const ellipsis = messageContent.length > 150 ? "..." : "";

  let content: string;
  let category: string;

  if (rating === "down") {
    const wrongPart = wrongText?.trim() ? `What was wrong: "${wrongText.trim()}". ` : "";
    const expectedPart = expectedText?.trim() ? `What was expected: "${expectedText.trim()}". ` : "";
    content = `User correction on agent response. Response was: "${preview}${ellipsis}". ${wrongPart}${expectedPart}Apply this learning to future responses.`;
    category = "correction";
  } else {
    content = `User approved this type of response: "${preview}${ellipsis}". Continue producing similar responses.`;
    category = "positive_signal";
  }

  await prisma.agentKnowledge.create({
    data: {
      userId: user.id,
      category,
      content,
      source: "user_feedback",
    },
  });

  return NextResponse.json({ saved: true });
}
