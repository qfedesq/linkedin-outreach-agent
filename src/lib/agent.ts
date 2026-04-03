import { decrypt } from "@/lib/encryption";
import { getToolDefinitions, executeTool } from "@/lib/agent-tools";

const SYSTEM_PROMPT = `You are the LinkedIn Outreach Agent for arenas.fi's Sky Protocol campaign, managed by Protofire.

CAMPAIGN:
arenas.fi is assembling 5-10 specialty lenders/capital deployers to access a $100M stablecoin liquidity line from Sky Protocol ($7B+ DeFi reserve). Selected originators get committed USDS capital at competitive rates, deployed in days, no bank-style covenants. Protofire handles all onchain integration.

YOUR ROLE:
You are an autonomous outreach agent. Your job is to maximize meetings booked with qualified prospects. You:
1. Discover prospects matching the ICP (specialty lenders, fintech founders, capital markets heads)
2. Score them by fit (HIGH = embedded finance, RBF, invoice finance, B2B BNPL)
3. Generate personalized connection notes that get accepted
4. Send follow-ups that convert to meetings
5. Learn from results — which messages work, which profiles respond

CURRENT CAPABILITIES:
- get_pipeline_stats: See the full funnel numbers
- search_contacts: Find contacts by name/company/status/fit
- discover_prospects: Start Apify scrape for new prospects
- score_contacts: LLM-score contacts by ICP fit
- prepare_invite_batch: Generate personalized connection notes
- get_invite_batches: See batch status
- run_daily_cycle: Execute daily check (connections + follow-ups + inbox)
- get_recent_activity: See what happened recently
- get_best_messages: Analyze which messages perform best
- update_strategy: Update your outreach approach

BEHAVIOR:
- Be concise and actionable. Show data, suggest next steps.
- When asked "what should we do?", call get_pipeline_stats and get_performance_report, then recommend specific actions.
- When asked to improve messages, call get_best_messages to see what worked, then suggest improvements.
- Always call tools to get real data before making recommendations. Never guess.
- Explain your reasoning briefly.
- Format responses with markdown for readability.
- When generating new messages, learn from past performance: what messages got accepted vs rejected.
- Optimize for the ultimate goal: meetings booked in the calendar.

LEARNING LOOP:
- Track which ICP fits convert best (HIGH > MEDIUM > LOW usually, but check)
- Track which message patterns get the most acceptances
- If acceptance rate is low, suggest changing the message approach
- If reply rate is low after connection, suggest a different follow-up strategy
- Always recommend the highest-ROI action based on current pipeline state`;

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

export async function runAgent(
  userMessage: string,
  conversationHistory: ChatMessage[],
  userId: string,
  openrouterApiKey: string,
  model: string
): Promise<{ messages: ChatMessage[]; finalResponse: string }> {
  const apiKey = decrypt(openrouterApiKey);
  const tools = await getToolDefinitions();

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];

  let finalResponse = "";
  const newMessages: ChatMessage[] = [];
  let iterations = 0;
  const maxIterations = 5; // prevent infinite loops

  while (iterations < maxIterations) {
    iterations++;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "",
      },
      body: JSON.stringify({
        model,
        messages,
        tools,
        tool_choice: "auto",
        max_tokens: 1500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter error: ${response.status}`);
    }

    const data = await response.json();
    const choice = data.choices[0];
    const msg = choice.message;

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      // Agent wants to call tools
      messages.push({
        role: "assistant",
        content: msg.content || "",
        tool_calls: msg.tool_calls,
      });
      newMessages.push({
        role: "assistant",
        content: msg.content || "",
        tool_calls: msg.tool_calls,
      });

      // Execute each tool call
      for (const toolCall of msg.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments || "{}");
        const result = await executeTool(toolCall.function.name, args, userId);

        const toolMsg: ChatMessage = {
          role: "tool",
          content: JSON.stringify(result),
          tool_call_id: toolCall.id,
        };
        messages.push(toolMsg);
        newMessages.push(toolMsg);
      }

      // Continue the loop — the model will see tool results and respond
      continue;
    }

    // No tool calls — this is the final response
    finalResponse = msg.content || "";
    newMessages.push({ role: "assistant", content: finalResponse });
    break;
  }

  return { messages: newMessages, finalResponse };
}
