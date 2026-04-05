import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  // Get all LLM usage logs to calculate tokens and cost
  const usageLogs = await prisma.executionLog.findMany({
    where: { userId: { in: [user.id, "global", "system"] }, action: "llm_usage" },
    select: { response: true, createdAt: true },
  });

  let totalTokens = 0;
  let totalCost = 0;
  let todayTokens = 0;
  let todayCost = 0;

  for (const log of usageLogs) {
    try {
      const data = JSON.parse(log.response || "{}");
      const tokens = data.total || 0;
      const cost = data.cost || 0;
      totalTokens += tokens;
      totalCost += cost;
      if (log.createdAt >= todayStart) {
        todayTokens += tokens;
        todayCost += cost;
      }
    } catch {}
  }

  // Count LLM-related actions
  const todayLLMCalls = await prisma.executionLog.count({
    where: { userId: user.id, action: { in: ["agent_chat", "score_contact", "prepare_invites", "generate_followup", "llm_usage"] }, createdAt: { gte: todayStart } },
  });
  const totalLLMCalls = await prisma.executionLog.count({
    where: { userId: user.id, action: { in: ["agent_chat", "score_contact", "prepare_invites", "generate_followup", "llm_usage"] } },
  });

  return NextResponse.json({
    totalTokens,
    totalCost,
    todayTokens,
    todayCost,
    todayLLMCalls,
    totalLLMCalls,
  });
}
