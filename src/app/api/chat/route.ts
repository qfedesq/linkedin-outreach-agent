import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { runAgent, generateGreeting } from "@/lib/agent";
import { logActivity } from "@/lib/activity-log";

export const maxDuration = 120;

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user?.settings?.openrouterApiKey) return unauthorized();

  const body = await request.json();
  const { message, history = [] } = body;
  if (!message) return NextResponse.json({ error: "Message required" }, { status: 400 });

  await prisma.chatMessage.create({ data: { userId: user.id, role: "user", content: message } });
  await logActivity(user.id, "agent_chat", { level: "info", message: `User: ${message.substring(0, 80)}` });

  try {
    const result = await runAgent(message, history, user.id, user.settings.openrouterApiKey, user.settings.preferredModel);

    await prisma.chatMessage.create({ data: { userId: user.id, role: "assistant", content: result.finalResponse } });
    await logActivity(user.id, "agent_chat", { level: "success", message: `Agent: ${result.finalResponse.substring(0, 80)}...` });

    // Extract tool steps for "thinking" display
    const steps = result.messages
      .filter(m => m.role === "tool" || (m.role === "assistant" && m.tool_calls))
      .map(m => {
        if (m.tool_calls) {
          return m.tool_calls.map(tc => ({
            type: "call" as const,
            tool: tc.function.name,
            args: tc.function.arguments,
          }));
        }
        if (m.role === "tool") {
          try {
            const parsed = JSON.parse(m.content);
            return [{ type: "result" as const, tool: "", message: parsed.message || m.content.substring(0, 200) }];
          } catch {
            return [{ type: "result" as const, tool: "", message: m.content.substring(0, 200) }];
          }
        }
        return [];
      })
      .flat();

    return NextResponse.json({ response: result.finalResponse, steps, messages: result.messages });
  } catch (error) {
    await logActivity(user.id, "agent_chat", { level: "error", message: `Error: ${(error as Error).message}`, success: false });
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user?.settings?.openrouterApiKey) return unauthorized();

  const history = await prisma.chatMessage.findMany({
    where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50,
  });

  const lastMsg = history[0];
  const needsGreeting = !lastMsg || (Date.now() - new Date(lastMsg.createdAt).getTime() > 12 * 60 * 60 * 1000);
  let greeting = null;
  if (needsGreeting) {
    try { greeting = await generateGreeting(user.id, user.settings.openrouterApiKey, user.settings.preferredModel); } catch {}
  }

  return NextResponse.json({
    history: history.reverse().map(m => ({ role: m.role, content: m.content })),
    greeting,
  });
}
