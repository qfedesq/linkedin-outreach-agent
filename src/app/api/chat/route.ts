import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { generateGreeting } from "@/lib/agent";
import { logActivity } from "@/lib/activity-log";
import { decrypt } from "@/lib/encryption";
import { getToolDefinitions, executeTool } from "@/lib/agent-tools";
import { setAgentStatus, clearAgentStatus } from "@/lib/agent-status";

export const maxDuration = 120;

// POST: Stream agent response via SSE
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
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`));
      };

      try {
        const apiKey = decrypt(user.settings!.openrouterApiKey!);
        const model = user.settings!.preferredModel;
        const tools = getToolDefinitions();

        // Load knowledge (global — shared across campaigns)
        const knowledge = await prisma.agentKnowledge.findMany({ where: { userId: user.id }, take: 30, orderBy: { createdAt: "desc" } });
        const knowledgeText = knowledge.map(k => `- [${k.category}] ${k.content}`).join("\n");
        const autonomy = user.settings!.autonomyLevel || "training";

        // Load campaign-specific config if in a campaign context
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

          // Call OpenRouter with streaming for the final response
          const isToolIteration = iterations < 8; // We don't know yet if there are tools

          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "" },
            body: JSON.stringify({ model, messages, tools, tool_choice: "auto", max_tokens: 2000, temperature: 0.7, stream: true }),
          });

          if (!response.ok) {
            send("error", `LLM error: ${response.status}`);
            break;
          }

          // Read the streaming response
          const reader = response.body?.getReader();
          if (!reader) break;

          let assistantContent = "";
          let toolCalls: Array<{ id: string; type: string; function: { name: string; arguments: string } }> = [];
          let hasToolCalls = false;

          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
              try {
                const chunk = JSON.parse(line.substring(6));
                const delta = chunk.choices?.[0]?.delta;
                if (!delta) continue;

                if (delta.content) {
                  assistantContent += delta.content;
                  send("content", delta.content); // Stream content token by token
                }

                if (delta.tool_calls) {
                  hasToolCalls = true;
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index || 0;
                    if (!toolCalls[idx]) {
                      toolCalls[idx] = { id: tc.id || `call_${idx}`, type: "function", function: { name: tc.function?.name || "", arguments: "" } };
                    }
                    if (tc.function?.name) toolCalls[idx].function.name = tc.function.name;
                    if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
                  }
                }
              } catch { /* skip malformed chunks */ }
            }
          }

          if (hasToolCalls && toolCalls.length > 0) {
            // Execute tools
            messages.push({ role: "assistant", content: assistantContent, tool_calls: toolCalls });

            for (const tc of toolCalls) {
              const toolLabel = tc.function.name.replace(/_/g, " ");
              send("thinking", `Executing: ${toolLabel}...`);
              setAgentStatus(user.id, `Executing: ${toolLabel}`);

              const args = JSON.parse(tc.function.arguments || "{}");
              const result = await executeTool(tc.function.name, args, user.id);

              send("thinking", `Done: ${result.message.substring(0, 80)}`);
              messages.push({ role: "tool", content: JSON.stringify(result), tool_call_id: tc.id });
            }

            // Clear streamed content and continue for next iteration
            send("clear", ""); // Tell frontend to clear partial content
            toolCalls = [];
            continue;
          }

          // No tool calls — this is the final response
          finalResponse = assistantContent;
          break;
        }

        // Save to DB
        if (finalResponse) {
          await prisma.chatMessage.create({ data: { userId: user.id, role: "assistant", content: finalResponse, campaignId } });
          await logActivity(user.id, "agent_chat", { level: "success", message: `Agent: ${finalResponse.substring(0, 80)}...` });
        }

        send("done", "");
      } catch (error) {
        send("error", (error as Error).message);
        await logActivity(user.id, "agent_chat", { level: "error", message: `Error: ${(error as Error).message}`, success: false });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

// GET: Load chat history + greeting
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
${campaignContext || "No specific campaign selected. Ask the user which campaign to work on."}

AUTONOMY: ${autonomyLevel.toUpperCase()}
${autonomyLevel === "training" ? "Ask approval before sending invites/follow-ups." : ""}
${autonomyLevel === "full" ? "Execute everything autonomously. Report results." : ""}

${strategyNotes ? `STRATEGY:\n${strategyNotes}\n` : ""}
${knowledge ? `KNOWLEDGE:\n${knowledge}\n` : ""}
TOOLS: Real execution tools. discover_prospects RUNS Apify. send_invites SENDS via LinkedIn.

Be concise. Use tools to get data before recommending. When user corrects you, use learn() to save it.`;
}
