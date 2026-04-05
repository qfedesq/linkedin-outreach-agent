import { decrypt } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";

interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
}

export async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  model: string,
  options?: LLMOptions
): Promise<string> {
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${decrypt(apiKey)}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: options?.maxTokens ?? 500,
        temperature: options?.temperature ?? 0.7,
      }),
    }
  );
  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.status}`);
  }
  const data = await response.json();

  if (data.usage) {
    const pt = data.usage.prompt_tokens || 0;
    const ct = data.usage.completion_tokens || 0;
    const cost = (pt * 0.003 + ct * 0.015) / 1000;
    prisma.executionLog.create({
      data: {
        action: "llm_usage",
        request: `${model} | ${pt + ct} tokens`,
        response: JSON.stringify({ prompt_tokens: pt, completion_tokens: ct, total: pt + ct, cost }),
        success: true, duration: pt + ct, userId: "global",
      },
    }).catch(() => {});
  }

  return data.choices[0].message.content;
}

// ===== ALL PROMPTS ARE CAMPAIGN-DRIVEN — ZERO HARDCODED CAMPAIGN TEXT =====

export function getIcpScoringPrompt(campaignIcp: string): string {
  return `You are an ICP (Ideal Customer Profile) scoring agent.

SCORING CRITERIA (from the active campaign):
${campaignIcp}

Given the following LinkedIn profile, respond with ONLY a JSON object:
{"fit": "HIGH" | "MEDIUM" | "LOW", "rationale": "<1 sentence explaining why>"}

IMPORTANT: Score ONLY against the criteria above. Do NOT use any other criteria.`;
}

export interface CampaignContext {
  userName?: string;
  campaignName: string;
  campaignDescription?: string;
  strategyNotes?: string;
  calendarUrl?: string;
}

export function getConnectionNotePrompt(ctx: CampaignContext): string {
  const who = ctx.userName || "the outreach team";
  const desc = ctx.campaignDescription || ctx.campaignName;
  const strategy = ctx.strategyNotes || "";

  return `You are writing LinkedIn connection request notes on behalf of ${who}.

CAMPAIGN: "${ctx.campaignName}"
${desc ? `WHAT WE OFFER: ${desc}` : ""}
${strategy ? `MESSAGING STYLE: ${strategy}` : ""}

CONNECTION NOTE FORMULA:
[First name] — [specific signal about their company/role]. [1-line hook about our offering]. [Soft CTA]?

RULES:
- MUST be <= 200 characters total. Be very concise.
- Reference something SPECIFIC about their company, role, or recent activity
- Never use "I came across your profile" or generic openers
- End with a low-pressure question
- Tone: peer-to-peer, knowledgeable, not salesy
- Message must be relevant to the campaign above

Respond with ONLY the connection note text, nothing else.`;
}

export function getFollowupPrompt(ctx: CampaignContext): string {
  const who = ctx.userName || "the outreach team";
  const desc = ctx.campaignDescription || ctx.campaignName;

  return `You are writing a LinkedIn follow-up message on behalf of ${who}.

CAMPAIGN: "${ctx.campaignName}"
${desc ? `CONTEXT: ${desc}` : ""}

This person accepted a connection request related to this campaign but hasn't replied.

RULES:
- 3-4 sentences MAX
- Specific to their company (not a copy-paste blast)
${ctx.calendarUrl ? `- Include calendar link: ${ctx.calendarUrl}` : "- Suggest a brief call"}
- Tone: warm re-opener, not a second pitch
- NEVER re-explain the whole product
- ONE follow-up only
- Message must be relevant to the campaign above

Respond with ONLY the message text, nothing else.`;
}
