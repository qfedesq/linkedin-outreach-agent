import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { generateGreeting } from "@/lib/agent";
import { logActivity } from "@/lib/activity-log";
import { decrypt } from "@/lib/encryption";
import { getToolDefinitions, executeTool, ToolResult, ProgressCallback, getDynamicToolDefinitions } from "@/lib/agent-tools";
import { clearAgentStatus } from "@/lib/agent-status";
import { diagnoseError } from "@/lib/self-heal";

export const maxDuration = 300;

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

      let totalTokens = 0;
      try {
        const apiKey = decrypt(user.settings!.openrouterApiKey!);
        const model = user.settings!.preferredModel;
        // Merge static + dynamic (user-created) tool definitions
        const [staticTools, dynamicTools] = await Promise.all([
          Promise.resolve(getToolDefinitions()),
          getDynamicToolDefinitions(user.id),
        ]);
        const tools = [...staticTools, ...dynamicTools];

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
        // Limit history to last 10 messages to avoid token overflow and timeouts
        const trimmedHistory = (history || []).slice(-10);
        const messages: Array<Record<string, unknown>> = [
          { role: "system", content: systemPrompt },
          ...trimmedHistory,
          { role: "user", content: message },
        ];

        send("thinking", "Analyzing your request...");
        clearAgentStatus(user.id);

        let finalResponse = "";
        let iterations = 0;
        let hasError = false;
        let loopExitReason = "unknown";
        let toolsExecuted = 0;
        const toolsCalled = new Set<string>();    // Track which tools were actually called
        const toolResults = new Map<string, { success: boolean; message: string }>(); // Last result per tool

        // Helper: log debug info to ExecutionLog for visibility in Logs page
        const debugLog = async (msg: string, extra?: Record<string, unknown>) => {
          await logActivity(user.id, "chat_debug", {
            level: "debug",
            message: msg,
            ...(extra ? { request: extra } : {}),
          });
        };

        await debugLog(`Chat start | model=${model} | msg="${message.substring(0, 60)}" | history=${history.length}`);

        // ===== INTENT DETECTION: detect "send" intent and inject tool_choice hint =====
        const msgLower = message.toLowerCase().trim();
        const isSendIntent = /^(send|dale|envía|enviar|go|hazlo|manda|proceed|do it|send them|send invites|envialos)/.test(msgLower)
          || /send.*batch|enviar.*batch|dale.*invit/.test(msgLower);

        while (iterations < 8) {
          iterations++;
          send("thinking", `Thinking... (step ${iterations})`);

          await debugLog(`Loop iter ${iterations} | messages=${messages.length}`);

          // NON-STREAMING call for reliable tool handling (60s timeout)
          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "" },
            body: JSON.stringify({ model, messages, tools, tool_choice: "auto", max_tokens: 2000, temperature: 0.7 }),
            signal: AbortSignal.timeout(60000),
          });

          if (!response.ok) {
            const errText = await response.text().catch(() => "");
            await debugLog(`LLM HTTP error | status=${response.status} | body=${errText.substring(0, 200)}`);

            // If 401 with tools, retry without tools (some keys have tool restrictions)
            if (response.status === 401 && iterations === 1) {
              send("thinking", "Retrying without tools...");
              const retryRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model, messages, max_tokens: 2000, temperature: 0.7 }),
                signal: AbortSignal.timeout(60000),
              });
              if (retryRes.ok) {
                const retryData = await retryRes.json();
                finalResponse = retryData.choices?.[0]?.message?.content || "";
                if (finalResponse) { loopExitReason = "retry_no_tools_ok"; break; }
              }
            }

            send("thinking", `Error: LLM returned ${response.status}`);
            send("content", `⚠️ LLM error (${response.status}): ${errText.substring(0, 150)}\n\nThis usually means the OpenRouter API key needs credits or the model is unavailable. Check Settings > OpenRouter.`);
            hasError = true;
            loopExitReason = `llm_http_${response.status}`;
            break;
          }

          const data = await response.json();

          // Log token usage from chat LLM call
          if (data.usage) {
            const pt = data.usage.prompt_tokens || 0;
            const ct = data.usage.completion_tokens || 0;
            totalTokens += pt + ct;
            const cost = (pt * 0.003 + ct * 0.015) / 1000;
            await prisma.executionLog.create({
              data: { action: "llm_usage", request: `${model} | ${pt + ct} tokens`, response: JSON.stringify({ prompt_tokens: pt, completion_tokens: ct, total: pt + ct, cost }), success: true, duration: pt + ct, userId: user.id },
            }).catch(() => {});
          }

          const msg = data.choices?.[0]?.message;
          const finishReason = data.choices?.[0]?.finish_reason || "unknown";

          await debugLog(`LLM response | iter=${iterations} | finish=${finishReason} | tool_calls=${msg?.tool_calls?.length || 0} | content_len=${msg?.content?.length || 0} | model=${data.model || model}`);

          if (!msg) {
            await debugLog(`Empty message object from LLM | raw=${JSON.stringify(data.choices?.[0]).substring(0, 200)}`);
            send("content", "⚠️ The LLM returned an empty response. Please try again.");
            hasError = true;
            loopExitReason = "empty_message";
            break;
          }

          if (msg.tool_calls?.length > 0) {
            if (msg.content) send("content", msg.content + "\n\n");
            messages.push({ role: "assistant", content: msg.content || "", tool_calls: msg.tool_calls });

            for (const tc of msg.tool_calls) {
              const toolName = tc.function.name.replace(/_/g, " ");
              send("thinking", `Executing: ${toolName}...`);

              let args: Record<string, unknown> = {};
              try { args = JSON.parse(tc.function.arguments || "{}"); } catch {
                await debugLog(`Failed to parse tool args | tool=${tc.function.name} | raw=${tc.function.arguments?.substring(0, 200)}`);
                messages.push({ role: "tool", content: JSON.stringify({ success: false, message: "Invalid tool arguments" }), tool_call_id: tc.id });
                continue;
              }

              await debugLog(`Tool call | ${tc.function.name} | args=${JSON.stringify(args).substring(0, 150)}`);
              // Pass progress callback so tools can stream real-time updates to chat
              const toolProgress: ProgressCallback = (msg) => send("thinking", msg);
              let result: ToolResult = await executeTool(tc.function.name, args, user.id, toolProgress);
              toolsExecuted++;
              toolsCalled.add(tc.function.name);
              toolResults.set(tc.function.name, { success: result.success, message: result.message.substring(0, 200) });

              // ===== SELF-HEALING: auto-diagnose on failure =====
              if (!result.success && tc.function.name !== "diagnose_and_fix") {
                send("thinking", `⚠️ ${toolName} failed. Diagnosing...`);
                const diagnosis = diagnoseError(result.message, tc.function.name);
                await debugLog(`Tool failed | ${tc.function.name} | error=${result.message.substring(0, 150)} | diagnosis=${diagnosis.category}/${diagnosis.fixAction}`);

                if (diagnosis.autoFixable && diagnosis.fixAction === "wait_and_retry") {
                  send("thinking", `🔧 Rate limit detected. Waiting 30s before retry...`);
                  await new Promise(r => setTimeout(r, 30000));
                  const retry = await executeTool(tc.function.name, args, user.id);
                  if (retry.success) {
                    result = retry;
                    send("thinking", `✅ Retry succeeded after auto-heal.`);
                  } else {
                    result = { ...result, message: `${result.message}\n\n🔍 Diagnosis [${diagnosis.category}]: ${diagnosis.rootCause}${diagnosis.userAction ? `\n👉 ${diagnosis.userAction}` : ""}` };
                  }
                } else if (diagnosis.autoFixable && diagnosis.fixAction === "retry_after_delay") {
                  send("thinking", `🔧 Network issue. Retrying in 5s...`);
                  await new Promise(r => setTimeout(r, 5000));
                  const retry = await executeTool(tc.function.name, args, user.id);
                  if (retry.success) {
                    result = retry;
                    send("thinking", `✅ Retry succeeded.`);
                  } else {
                    result = { ...result, message: `${result.message}\n\n🔍 Diagnosis [${diagnosis.category}]: ${diagnosis.rootCause}${diagnosis.userAction ? `\n👉 ${diagnosis.userAction}` : ""}` };
                  }
                } else if (diagnosis.autoFixable && diagnosis.fixAction === "retry") {
                  send("thinking", `🔧 Transient error. Retrying...`);
                  const retry = await executeTool(tc.function.name, args, user.id);
                  result = retry.success ? retry : { ...result, message: `${result.message}\n\n🔍 Diagnosis: ${diagnosis.rootCause}` };
                } else {
                  result = { ...result, message: `${result.message}\n\n🔍 Diagnosis [${diagnosis.category}]: ${diagnosis.rootCause}${diagnosis.userAction ? `\n👉 ${diagnosis.userAction}` : ""}` };
                }
              }

              send("thinking", `${result.success ? "✓" : "⚠️"} ${result.message.substring(0, 120)}`);
              messages.push({ role: "tool", content: JSON.stringify(result), tool_call_id: tc.id });
            }
            continue;
          }

          finalResponse = msg.content || "";
          loopExitReason = finalResponse ? "final_response" : "empty_content";
          break;
        }

        if (iterations >= 8 && !finalResponse) loopExitReason = "max_iterations";

        await debugLog(`Loop end | reason=${loopExitReason} | iters=${iterations} | tools=${toolsExecuted} | toolsCalled=${[...toolsCalled].join(",")} | response_len=${finalResponse.length} | hasError=${hasError} | sendIntent=${isSendIntent}`);

        // ===== SAFETY: If user intended to send but LLM never called send_invites, try to find and send the latest batch =====
        if (isSendIntent && !toolsCalled.has("send_invites") && !hasError) {
          await debugLog("Send intent detected but send_invites not called. Looking for latest batch...");
          send("thinking", "Detecting unsent batch...");
          try {
            const latestBatch = await prisma.inviteBatch.findFirst({
              where: { userId: user.id },
              orderBy: { createdAt: "desc" },
              include: { items: { where: { sent: false, approved: true } } },
            });
            if (latestBatch && latestBatch.items.length > 0) {
              send("thinking", `Found batch ${latestBatch.id} with ${latestBatch.items.length} pending. Sending now...`);
              const sendResult = await executeTool("send_invites", { batch_id: latestBatch.id }, user.id, (msg) => send("thinking", msg));
              toolsCalled.add("send_invites");
              toolResults.set("send_invites", { success: sendResult.success, message: sendResult.message.substring(0, 200) });
              toolsExecuted++;
              finalResponse = sendResult.message;
              await debugLog(`Auto-send result: ${sendResult.success} | ${sendResult.message.substring(0, 100)}`);
            } else {
              await debugLog("No pending batch found for auto-send.");
              if (!finalResponse) {
                finalResponse = "No pending invite batches found. Use `prepare invites` first, then tell me to send them.";
              }
            }
          } catch (e) {
            await debugLog(`Auto-send error: ${(e as Error).message}`);
          }
        }

        // ===== SAFETY NET: If loop exhausted with tool results but no final text, force one more LLM call without tools =====
        if (!finalResponse && !hasError && toolsExecuted > 0) {
          await debugLog("Forcing final LLM call without tools to get summary...");
          send("thinking", "Generating summary...");
          try {
            const summaryRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "" },
              body: JSON.stringify({ model, messages, max_tokens: 2000, temperature: 0.7 }),
              signal: AbortSignal.timeout(45000),
            });
            if (summaryRes.ok) {
              const summaryData = await summaryRes.json();
              finalResponse = summaryData.choices?.[0]?.message?.content || "";
              await debugLog(`Summary call result | content_len=${finalResponse.length}`);
            }
          } catch (e) {
            await debugLog(`Summary call failed: ${(e as Error).message}`);
          }
        }

        // ===== HALLUCINATION GUARD: Validate claims against actual tool calls =====
        if (finalResponse) {
          const responseLower = finalResponse.toLowerCase();
          const claimsAction = (patterns: string[]) => patterns.some(p => responseLower.includes(p));

          // Check if response claims sending invites but send_invites was never called
          const claimsSent = claimsAction(["enviado exitosamente", "sent successfully", "invite sent", "invites sent", "invite enviado", "fueron enviados", "ya fue enviado", "already sent", "was sent"]);
          const claimsDiscovered = claimsAction(["found and saved", "prospects discovered", "contacts saved", "perfiles encontrados"]);
          const claimsScored = claimsAction(["scored all", "contacts scored", "scoring complete", "puntuación completa"]);

          if (claimsSent && !toolsCalled.has("send_invites")) {
            await debugLog(`HALLUCINATION BLOCKED: Response claims invites sent but send_invites was never called. Tools called: ${[...toolsCalled].join(",")}`);
            const sendResult = toolResults.get("send_invites");
            finalResponse = `⚠️ **Correction**: I was about to claim invites were sent, but \`send_invites\` was NOT actually executed in this conversation turn.\n\n**Tools actually called**: ${[...toolsCalled].join(", ") || "none"}\n\n${sendResult ? `**Last send_invites result**: ${sendResult.message}` : "No send_invites call was made."}\n\nPlease tell me explicitly: "send invites batch [ID]" to actually send them.`;
          }

          if (claimsDiscovered && !toolsCalled.has("discover_prospects")) {
            await debugLog(`HALLUCINATION BLOCKED: Response claims discovery but discover_prospects was never called.`);
            finalResponse = `⚠️ **Correction**: I described discovering prospects, but \`discover_prospects\` was NOT executed.\n\nPlease tell me: "search LinkedIn for [job title] in [location]" to actually search.`;
          }

          if (claimsScored && !toolsCalled.has("score_contacts")) {
            await debugLog(`HALLUCINATION BLOCKED: Response claims scoring but score_contacts was never called.`);
            finalResponse = `⚠️ **Correction**: I described scoring contacts, but \`score_contacts\` was NOT executed.\n\nPlease tell me: "score contacts" to actually run scoring.`;
          }
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
        } else {
          // ALWAYS show something — never leave the user with a blank chat
          const fallback = iterations >= 8
            ? `I executed ${toolsExecuted} tool(s) across ${iterations} steps but couldn't generate a final summary. Check **Contacts** and **Logs** for results. Try asking: "show me the pipeline" or "what happened?"`
            : hasError
              ? "An error occurred during processing. Check the error details above, or ask me: \"check system health\"."
              : "I wasn't able to generate a response. Please try again.";
          send("content", fallback);
          await prisma.chatMessage.create({ data: { userId: user.id, role: "assistant", content: fallback, campaignId } });
          await debugLog(`Fallback sent | reason=${loopExitReason}`);
        }

        send("done", JSON.stringify({ tokens: totalTokens }));
      } catch (error) {
        const errMsg = (error as Error).message || "Unknown error";
        const isTimeout = errMsg.includes("abort") || errMsg.includes("timeout") || errMsg.includes("TimeoutError");
        const userMsg = isTimeout
          ? "⏱️ The LLM took too long to respond (>60s). This can happen with large conversation history. Try again — the history has been trimmed automatically."
          : `Error: ${errMsg}`;
        send("error", userMsg);
        send("content", userMsg);
        send("done", JSON.stringify({ tokens: totalTokens }));
        await logActivity(user.id, "agent_chat", { level: "error", message: `${isTimeout ? "TIMEOUT" : "Error"}: ${errMsg}`, success: false, errorCode: isTimeout ? "timeout" : errMsg.substring(0, 50) });
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
  return `You are a LinkedIn Outreach Agent that EXECUTES real actions via tools.

YOUR GOAL: Maximize meetings booked. Discover, score, invite, follow up, detect replies.
${campaignContext || "No specific campaign selected."}

AUTONOMY: ${autonomyLevel.toUpperCase()}
${autonomyLevel === "training" ? "Ask approval before sending invites/follow-ups." : ""}
${autonomyLevel === "full" ? "Execute everything autonomously. Report results." : ""}

${strategyNotes ? `STRATEGY:\n${strategyNotes}\n` : ""}
${knowledge ? `KNOWLEDGE:\n${knowledge}\n` : ""}

CRITICAL RULES — NEVER VIOLATE:
1. NEVER claim you sent/executed something without ACTUALLY calling the tool first. If user says "send them", you MUST call send_invites() and report the REAL result.
2. NEVER simulate or assume tool results. Always call the tool and use the actual response.
3. After send_invites, verify with the tool response (sent count). Report EXACT numbers from the tool result.
4. If a tool returns success:false or sent:0, report the FAILURE honestly. Never say "done" when it failed.
5. If rate limited or cooldown active, tell the user to come back in X minutes. You CANNOT wait or set timers — you are stateless.
6. TO_CONTACT status in our database does NOT guarantee no prior LinkedIn invite. Warn users that LinkedIn may have pending invites from previous campaigns or manual sends.
7. Always investigate root causes using tools (get_recent_activity, get_pipeline_stats) BEFORE reporting results. Use evidence, not assumptions.
8. When user says "send" or "go ahead", ALWAYS call the appropriate send tool. Never just describe what you would do.

TOOLS: Real execution tools. discover_prospects SEARCHES LinkedIn. send_invites SENDS via LinkedIn. prepare_invites with campaign_id to filter by campaign.
REVENUE OPERATOR TOOLS: prioritize_pipeline_by_expected_value, build_account_map, draft_reply_strategy, run_message_experiment, reactivate_stale_pipeline, prepare_meeting_brief.

CAMPAIGN ID RULES — CRITICAL:
- NEVER use a campaign_id from conversation history without verifying it exists. Campaign IDs from past sessions may be stale/deleted.
- Before any discover_prospects or prepare_invites call: if you don't have a campaign_id confirmed in THIS session, call list_campaigns FIRST to get the current valid IDs.
- If discover_prospects returns "campaign not found", the error message includes the valid IDs — use them immediately, do NOT call list_campaigns again.
- If contacts have no campaign assigned, call assign_contacts_to_campaign BEFORE score_contacts.
- To consolidate two campaigns, use merge_campaigns — you do NOT need to delete manually.

RATE LIMITS: Auto-enforced (15 invites/day, 60/week). Check with get_usage_limits.

SELF-HEALING: If a tool fails, errors are auto-diagnosed with root cause and fix instructions. You can also:
- Call check_system_health BEFORE starting work to verify all services are operational.
- Call diagnose_and_fix explicitly for any error you encounter.
Always explain errors clearly and guide the user to fix config issues.

RESPONSE FORMAT — always follow this when reporting results:
- Use **bold headers** to separate sections (e.g. **Discovery Results**, **Pipeline Status**, **Errors**)
- Use \`backticks\` for tool names, campaign IDs, field names, statuses, and numeric values (e.g. \`score_contacts\`, \`CONNECTED\`, \`15 contacts\`)
- Use bullet points for lists — never numbered lists unless showing ordered steps
- Start with a one-line **summary sentence** in bold (e.g. **✓ 12 invites sent to Sky Protocol campaign.**)
- Then supporting details in bullets — exact counts, key names, errors
- MANDATORY: Every single response MUST end with a \`---\` separator and a **💡 Next step:** line suggesting the single most natural action to take right now, based on the current state. No exceptions — even for errors, suggest what to fix next.
- Never write walls of prose — be structured and scannable
- Keep responses SHORT. One section per action. Expand only if user asks for detail.
- For errors: **❌ Error** header, then \`tool_name\` → what failed → why → how to fix

Be concise. Use tools proactively. Report results clearly with exact numbers from tool responses. When user corrects you, save with learn().`;
}
