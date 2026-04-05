import { decrypt } from "@/lib/encryption";

// In-memory usage tracker
let sessionUsage = { totalTokens: 0, totalCost: 0, calls: 0 };
export function getSessionUsage() { return { ...sessionUsage }; }

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

  // Track token usage
  if (data.usage) {
    const pt = data.usage.prompt_tokens || 0;
    const ct = data.usage.completion_tokens || 0;
    sessionUsage.totalTokens += pt + ct;
    sessionUsage.totalCost += (pt * 0.003 + ct * 0.015) / 1000;
    sessionUsage.calls++;
  }

  return data.choices[0].message.content;
}

export function getIcpScoringPrompt(campaignIcp: string): string {
  return `You are an ICP (Ideal Customer Profile) scoring agent.

SCORING CRITERIA (from the active campaign):
${campaignIcp}

Given the following LinkedIn profile, respond with ONLY a JSON object:
{"fit": "HIGH" | "MEDIUM" | "LOW", "rationale": "<1 sentence explaining why>"}

IMPORTANT: Score ONLY against the criteria above. Do NOT use any other criteria.`;
}

export function getConnectionNotePrompt(calendarUrl: string): string {
  return `You are writing LinkedIn connection request notes for Andrei Yurkevich at Protofire/arenas.fi.

CAMPAIGN: arenas.fi is assembling a consortium of 5-10 specialty lenders and capital deployers to access a $100M stablecoin liquidity line from Sky Protocol (one of DeFi's largest reserve systems, $7B+). Selected originators get committed USDS capital at competitive rates, deployed in days, no bank-style covenants. Protofire handles all onchain integration — zero engineering lift on their side.

CONNECTION NOTE FORMULA:
[First name] — [specific signal about their company/role]. [1-line hook about arenas.fi/Sky Protocol]. [Soft CTA]?

RULES:
- MUST be ≤ 200 characters total. This is critical — the system rejects notes over 200 chars. Be very concise.
- Reference something SPECIFIC about their company, role, or recent activity
- Never use "I came across your profile" or generic openers
- End with a low-pressure question
- Tone: peer-to-peer, knowledgeable, not salesy

Respond with ONLY the connection note text, nothing else. Count your characters carefully.`;
}

export function getFollowupPrompt(calendarUrl: string): string {
  return `You are writing a LinkedIn follow-up message for Andrei Yurkevich at Protofire/arenas.fi.

This person accepted a connection request about the Sky Protocol $100M stablecoin facility 3+ days ago but hasn't replied.

RULES:
- 3-4 sentences MAX
- Specific to their company (not a copy-paste blast)
- Must include the calendar link: ${calendarUrl}
- Tone: warm re-opener, not a second pitch
- NEVER re-explain the whole product
- ONE follow-up only — if no reply after 2 weeks, mark as Unresponsive

Respond with ONLY the message text, nothing else.`;
}
