import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { generateGreeting } from "@/lib/agent";
import { logActivity } from "@/lib/activity-log";
import { decrypt } from "@/lib/encryption";
import { getToolDefinitions, executeTool } from "@/lib/agent-tools";
import { clearAgentStatus } from "@/lib/agent-status";

export const maxDuration = 120;

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user?.settings?.openrouterApiKey) return unauthorized();

  const body = await request.json();
  const { message, history = [], campaignId = null } = body;
  if (!message) return NextResponse.json({ error: "Message required" }, { status: 400 });

  await prisma.chatMessage.create({ data: { userId: user.id, role: "user", content: message, campaignId } });
  await logActivity(user.id, "agent_chat", { level: "info", message: `User: ${message.substring(0, 80)}` });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: string) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`)); } catch {}
      };

      try {
        const apiKey = decrypt(user.settings!.openrouterApiKey!);
        const model = user.settings!.preferredModel;
        const tools = getToolDefinitions();

        const knowledge = await prisma.agentKnowledge.findMany({ where: { userId: user.id }, take: 30, orderBy: { createdAt: "desc" } });
        const knowledgeText = knowledge.map(k => `- [${k.category}] ${k.content}`).join("\n");
        const autonomy = user.settings!.autonomyLevel || "training";

        let strategy = user.settings!.strategyNotes || "";
        let campaignContext = "";
        if (campaignId) {
          const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, userId: user.id } });
          if (campaign) {
            campaignContext = `\nACTIVE CAMPAIGN: "${campaign.name}"${campaign.description ? `\nDescription: ${campaign.description}` : ""}${campaign.icpDefinition ? `\nICP: ${campaign.icpDefinition}` : ""}`;
            if (campaign.strategyNotes) strategy = campaign.strategyNotes;
            if (campaign.calendarUrl) campaignContext += `\nCalendar: ${campaign.calendarUrl}`;
          }
        }

        const systemPrompt = buildSystemPrompt(knowledgeText, autonomy, strategy, campaignContext);
        const messages: Array<Record<string, unknown>> = [
          { role: "system", content: systemPrompt },
          ...history.slice(-20),
          { role: "user", content: message },
        ];

        send("thinking", "Analyzing your request...");
        clearAgentStatus(user.id);

        let finalResponse = "";
        let iterations = 0;

        while (iterations < 8) {
          iterations++;
          send("thinking", `Thinking... (step ${iterations})`);

          // NON-STREAMING call for reliable tool handling
          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "" },
            body: JSON.stringify({ model, messages, tools, tool_choice: "auto", max_tokens: 2000, temperature: 0.7 }),
          });

          if (!response.ok) {
            const errText = await response.text().catch(() => "");
            send("error", `LLM error ${response.status}: ${errText.substring(0, 100)}`);
            send("content", `Error connecting to LLM (${response.status}). Please try again.`);
            break;
          }

          const data = await response.json();
          const msg = data.choices?.[0]?.message;
          if (!msg) {
            send("error", "Empty response from LLM");
            send("content", "The LLM returned an empty response. Please try again.");
            break;
          }

          if (msg.tool_calls?.length > 0) {
            if (msg.content) send("content", msg.content + "\n\n");
            messages.push({ role: "assistant", content: msg.content || "", tool_calls: msg.tool_calls });

            for (const tc of msg.tool_calls) {
              const toolName = tc.function.name.replace(/_/g, " ");
              send("thinking", `Executing: ${toolName}...`);

              const args = JSON.parse(tc.function.arguments || "{}");
              const result = await executeTool(tc.function.name, args, user.id);

              send("thinking", `✓ ${result.message.substring(0, 120)}`);
              messages.push({ role: "tool", content: JSON.stringify(result), tool_call_id: tc.id });
            }
            continue;
          }

          finalResponse = msg.content || "";
          break;
        }

        // Stream final response with typewriter effect
        if (finalResponse) {
          send("clear", "");
          const words = finalResponse.split(/(\s+)/);
          for (let i = 0; i < words.length; i += 3) {
            send("content", words.slice(i, i + 3).join(""));
            await new Promise(r => setTimeout(r, 25));
          }

          await prisma.chatMessage.create({ data: { userId: user.id, role: "assistant", content: finalResponse, campaignId } });
          await logActivity(user.id, "agent_chat", { level: "success", message: `Agent: ${finalResponse.substring(0, 80)}...` });
        } else if (iterations >= 8) {
          send("content", "I reached the maximum number of steps. Please try a simpler request.");
        }

        send("done", "");
      } catch (error) {
        send("error", (error as Error).message);
        send("content", `Error: ${(error as Error).message}`);
        send("done", "");
        await logActivity(user.id, "agent_chat", { level: "error", message: `Error: ${(error as Error).message}`, success: false });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user?.settings?.openrouterApiKey) return unauthorized();

  const campaignId = request.nextUrl.searchParams.get("campaignId");
  const chatHistory = await prisma.chatMessage.findMany({
    where: { userId: user.id, ...(campaignId ? { campaignId } : {}) },
    orderBy: { createdAt: "desc" }, take: 50,
  });

  const lastMsg = chatHistory[0];
  const needsGreeting = !lastMsg || (Date.now() - new Date(lastMsg.createdAt).getTime() > 12 * 60 * 60 * 1000);
  let greeting = null;
  if (needsGreeting) {
    try { greeting = await generateGreeting(user.id, user.settings.openrouterApiKey, user.settings.preferredModel); } catch {}
  }

  return NextResponse.json({
    history: chatHistory.reverse().map(m => ({ role: m.role, content: m.content })),
    greeting,
  });
}

function buildSystemPrompt(knowledge: string, autonomyLevel: string, strategyNotes: string, campaignContext?: string) {
  return `You are the LinkedIn Outreach Agent by Protofire.

YOUR GOAL: Maximize meetings booked. Discover, score, invite, follow up, detect replies.
${campaignContext || "No specific campaign selected."}

AUTONOMY: ${autonomyLevel.toUpperCase()}
${autonomyLevel === "training" ? "Ask approval before sending invites/follow-ups." : ""}
${autonomyLevel === "full" ? "Execute everything autonomously. Report results." : ""}

${strategyNotes ? `STRATEGY:\n${strategyNotes}\n` : ""}
${knowledge ? `KNOWLEDGE:\n${knowledge}\n` : ""}
TOOLS: Real execution tools. discover_prospects SEARCHES LinkedIn. send_invites SENDS via LinkedIn.

RATE LIMITS: Auto-enforced (15 invites/day, 60/week). Check with get_usage_limits.

Be concise. Use tools proactively. Report results clearly. When user corrects you, save with learn().`;
}
