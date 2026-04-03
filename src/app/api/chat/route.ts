import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { runAgent } from "@/lib/agent";
import { logActivity } from "@/lib/activity-log";

export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user?.settings?.openrouterApiKey) return unauthorized();

  const body = await request.json();
  const { message, history = [] } = body;

  if (!message) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  await logActivity(user.id, "agent_chat", {
    level: "info",
    message: `User: ${message.substring(0, 100)}`,
  });

  try {
    const result = await runAgent(
      message,
      history,
      user.id,
      user.settings.openrouterApiKey,
      user.settings.preferredModel
    );

    await logActivity(user.id, "agent_chat", {
      level: "success",
      message: `Agent: ${result.finalResponse.substring(0, 100)}...`,
    });

    return NextResponse.json({
      response: result.finalResponse,
      messages: result.messages,
    });
  } catch (error) {
    await logActivity(user.id, "agent_chat", {
      level: "error",
      message: `Agent error: ${(error as Error).message}`,
      success: false,
    });
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
