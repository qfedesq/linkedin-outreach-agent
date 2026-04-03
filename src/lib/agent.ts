import { decrypt } from "@/lib/encryption";
import { getToolDefinitions, executeTool } from "@/lib/agent-tools";
import { prisma } from "@/lib/prisma";

function buildSystemPrompt(knowledge: string, autonomyLevel: string, strategyNotes: string) {
  return `You are the LinkedIn Outreach Agent for the Sky Protocol campaign by Protofire/arenas.fi.

CAMPAIGN: arenas.fi is assembling 5-10 specialty lenders to access a $100M stablecoin liquidity line from Sky Protocol ($7B+ DeFi reserve). Selected originators get committed USDS capital at competitive rates.

YOUR GOAL: Maximize meetings booked. You discover prospects, score them, send personalized invites, follow up with connections, and detect replies — all leading to calendar appointments.

AUTONOMY LEVEL: ${autonomyLevel.toUpperCase()}
${autonomyLevel === "training" ? "- You MUST show proposed actions and ask for approval before sending invites or follow-ups.\n- For discovery and scoring, you can execute directly." : ""}
${autonomyLevel === "semi" ? "- You can discover, score, and check connections automatically.\n- You MUST ask for approval before sending invites and follow-ups." : ""}
${autonomyLevel === "full" ? "- You can execute ALL actions autonomously.\n- Report results after each action. Only stop on errors." : ""}

${strategyNotes ? `STRATEGY NOTES (from user):\n${strategyNotes}\n` : ""}
${knowledge ? `ACCUMULATED KNOWLEDGE (from past sessions):\n${knowledge}\n` : ""}
TOOLS: You have real execution tools. When you call discover_prospects, it ACTUALLY runs Apify. When you call send_invites, it ACTUALLY sends via LinkedIn. These are not simulations.

BEHAVIOR:
- Be concise. Show data, suggest actions.
- When the user asks "what should we do?", check pipeline stats and recommend the highest-ROI action.
- When the user corrects you ("don't do X", "change tone to Y"), use the learn() tool to save it.
- Before generating messages, check get_knowledge() for past learnings about style/tone.
- After sending invites, always mention the batch ID so the user can reference it.
- When showing invite drafts, format as a numbered list with name, company, fit, and message.
- Track everything — the user should be able to ask "what happened?" and get a clear answer.`;
}

interface ChatMsg {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
}

export async function runAgent(
  userMessage: string,
  conversationHistory: ChatMsg[],
  userId: string,
  openrouterApiKey: string,
  model: string
): Promise<{ messages: ChatMsg[]; finalResponse: string }> {
  const apiKey = decrypt(openrouterApiKey);
  const tools = getToolDefinitions();

  // Load knowledge and settings for system prompt
  const knowledge = await prisma.agentKnowledge.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 30 });
  const knowledgeText = knowledge.map(k => `- [${k.category}] ${k.content}`).join("\n");

  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const autonomyLevel = settings?.autonomyLevel || "training";
  const strategyNotes = settings?.strategyNotes || "";

  const systemPrompt = buildSystemPrompt(knowledgeText, autonomyLevel, strategyNotes);

  const messages: ChatMsg[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-20),
    { role: "user", content: userMessage },
  ];

  let finalResponse = "";
  const newMessages: ChatMsg[] = [];
  let iterations = 0;

  while (iterations < 8) {
    iterations++;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "" },
      body: JSON.stringify({ model, messages, tools, tool_choice: "auto", max_tokens: 2000, temperature: 0.7 }),
    });

    if (!response.ok) throw new Error(`OpenRouter error: ${response.status}`);

    const data = await response.json();
    const msg = data.choices[0].message;

    if (msg.tool_calls?.length > 0) {
      messages.push({ role: "assistant", content: msg.content || "", tool_calls: msg.tool_calls });
      newMessages.push({ role: "assistant", content: msg.content || "", tool_calls: msg.tool_calls });

      for (const tc of msg.tool_calls) {
        const args = JSON.parse(tc.function.arguments || "{}");
        const result = await executeTool(tc.function.name, args, userId);
        const toolMsg: ChatMsg = { role: "tool", content: JSON.stringify(result), tool_call_id: tc.id };
        messages.push(toolMsg);
        newMessages.push(toolMsg);
      }
      continue;
    }

    finalResponse = msg.content || "";
    newMessages.push({ role: "assistant", content: finalResponse });
    break;
  }

  return { messages: newMessages, finalResponse };
}

export async function generateGreeting(userId: string, openrouterApiKey: string, model: string): Promise<string> {
  const apiKey = decrypt(openrouterApiKey);

  // Gather context
  const total = await prisma.contact.count({ where: { userId } });
  const toContact = await prisma.contact.count({ where: { userId, status: "TO_CONTACT" } });
  const invited = await prisma.contact.count({ where: { userId, status: "INVITED" } });
  const connected = await prisma.contact.count({ where: { userId, status: "CONNECTED" } });
  const replied = await prisma.contact.count({ where: { userId, status: "REPLIED" } });
  const meetings = await prisma.contact.count({ where: { userId, status: "MEETING_BOOKED" } });

  const knowledge = await prisma.agentKnowledge.findMany({ where: { userId }, take: 10, orderBy: { createdAt: "desc" } });
  const knowledgeText = knowledge.map(k => `- ${k.content}`).join("\n");

  const prompt = `You are the LinkedIn Outreach Agent. Generate a brief, proactive greeting for the user based on this pipeline state:
- Total: ${total}, To Contact: ${toContact}, Invited: ${invited}, Connected: ${connected}, Replied: ${replied}, Meetings: ${meetings}
${knowledgeText ? `\nRecent learnings:\n${knowledgeText}` : ""}

Suggest the most impactful next action. Be specific and concise (2-3 sentences max). If pipeline is empty, suggest discovering prospects.`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: 200, temperature: 0.7 }),
  });

  if (!response.ok) return "Welcome back! Ask me anything about your outreach pipeline.";
  const data = await response.json();
  return data.choices[0].message.content || "Welcome back!";
}
