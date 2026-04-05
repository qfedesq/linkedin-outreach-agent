import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { getSessionUsage } from "@/lib/llm";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const session = getSessionUsage();

  // Count LLM-related actions today
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayActions = await prisma.executionLog.count({
    where: { userId: user.id, action: { in: ["agent_chat", "score_contact", "prepare_invites", "generate_followup"] }, createdAt: { gte: todayStart } },
  });

  // Count total actions this session (all time for this user)
  const totalActions = await prisma.executionLog.count({
    where: { userId: user.id, action: { in: ["agent_chat", "score_contact", "prepare_invites", "generate_followup"] } },
  });

  return NextResponse.json({
    ...session,
    todayLLMCalls: todayActions,
    totalLLMCalls: totalActions,
  });
}
