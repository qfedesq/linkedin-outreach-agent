import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { runAgent, generateGreeting } from "@/lib/agent";
import { logActivity } from "@/lib/activity-log";

export const maxDuration = 120; // Agent tools can take time (Apify polling)

// POST: Send a message to the agent
export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user?.settings?.openrouterApiKey) return unauthorized();

  const body = await request.json();
  const { message, history = [] } = body;
  if (!message) return NextResponse.json({ error: "Message required" }, { status: 400 });

  // Save user message to DB
  await prisma.chatMessage.create({ data: { userId: user.id, role: "user", content: message } });

  await logActivity(user.id, "agent_chat", { level: "info", message: `User: ${message.substring(0, 80)}` });

  try {
    const result = await runAgent(message, history, user.id, user.settings.openrouterApiKey, user.settings.preferredModel);

    // Save assistant response to DB
    await prisma.chatMessage.create({ data: { userId: user.id, role: "assistant", content: result.finalResponse } });

    await logActivity(user.id, "agent_chat", { level: "success", message: `Agent: ${result.finalResponse.substring(0, 80)}...` });

    return NextResponse.json({ response: result.finalResponse, messages: result.messages });
  } catch (error) {
    await logActivity(user.id, "agent_chat", { level: "error", message: `Error: ${(error as Error).message}`, success: false });
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// GET: Load chat history + generate greeting if needed
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user?.settings?.openrouterApiKey) return unauthorized();

  const history = await prisma.chatMessage.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // If no recent messages (last 12h), generate greeting
  const lastMsg = history[0];
  const needsGreeting = !lastMsg || (Date.now() - new Date(lastMsg.createdAt).getTime() > 12 * 60 * 60 * 1000);

  let greeting = null;
  if (needsGreeting) {
    try {
      greeting = await generateGreeting(user.id, user.settings.openrouterApiKey, user.settings.preferredModel);
    } catch { /* ignore */ }
  }

  return NextResponse.json({
    history: history.reverse().map(m => ({ role: m.role, content: m.content })),
    greeting,
  });
}
