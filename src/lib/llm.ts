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
  icpDefinition?: string;
}

export function getConnectionNotePrompt(ctx: CampaignContext): string {
  const who = ctx.userName || "the outreach team";
  const desc = ctx.campaignDescription || "";
  const strategy = ctx.strategyNotes || "";
  const icp = ctx.icpDefinition || "";

  return `You are writing LinkedIn connection request notes on behalf of ${who}.

CAMPAIGN: "${ctx.campaignName}"
${desc ? `WHAT WE OFFER: ${desc}` : ""}
${icp ? `TARGET PROFILE (ICP): ${icp.substring(0, 500)}` : ""}
${strategy ? `MESSAGING STRATEGY: ${strategy}` : ""}

CONNECTION NOTE FORMULA:
[First name] — [specific signal about their company/role]. [1-line hook relevant to THIS campaign]. [Soft CTA]?

RULES:
- MUST be <= 200 characters total. Be very concise.
- Reference something SPECIFIC about their company, role, or recent activity
- Never use "I came across your profile" or generic openers
- End with a low-pressure question
- Tone: peer-to-peer, knowledgeable, not salesy
- Message MUST relate to "${ctx.campaignName}" — do NOT mention products or angles from other campaigns

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

export function getReplyStrategyPrompt(ctx: CampaignContext, knowledge: string): string {
  return `You are a B2B revenue operator helping craft the best next reply on LinkedIn.

CAMPAIGN: "${ctx.campaignName}"
${ctx.campaignDescription ? `CAMPAIGN CONTEXT: ${ctx.campaignDescription}` : ""}
${ctx.strategyNotes ? `MESSAGE STRATEGY: ${ctx.strategyNotes}` : ""}
${ctx.calendarUrl ? `CALENDAR URL: ${ctx.calendarUrl}` : ""}
${knowledge ? `LEARNINGS:\n${knowledge}` : ""}

Classify the inbound message and recommend the best next move.
Respond with ONLY valid JSON:
{
  "intent": "positive" | "neutral" | "objection" | "referral" | "not_now" | "not_relevant",
  "strategy": "<short description of the best response strategy>",
  "draft": "<reply draft>",
  "cta": "<suggested CTA>",
  "riskFlags": ["<risk 1>", "<risk 2>"]
}

Rules:
- Keep the draft concise and natural for LinkedIn.
- If the contact is warm, push gently toward a call.
- If there is an objection, address it without sounding defensive.
- If it is a referral, acknowledge and ask for the shortest next step.
- Never invent facts not present in the provided context.`;
}

export function getMeetingBriefPrompt(ctx: CampaignContext, knowledge: string): string {
  return `You are preparing a sales operator for a LinkedIn-originated meeting.

CAMPAIGN: "${ctx.campaignName}"
${ctx.campaignDescription ? `CAMPAIGN CONTEXT: ${ctx.campaignDescription}` : ""}
${ctx.strategyNotes ? `MESSAGE STRATEGY: ${ctx.strategyNotes}` : ""}
${ctx.calendarUrl ? `CALENDAR URL: ${ctx.calendarUrl}` : ""}
${knowledge ? `LEARNINGS:\n${knowledge}` : ""}

Respond with ONLY valid JSON:
{
  "executiveSummary": "<2-3 sentence summary>",
  "likelyPains": ["<pain 1>", "<pain 2>"],
  "objectionMap": ["<objection 1>", "<objection 2>"],
  "talkTrack": ["<step 1>", "<step 2>", "<step 3>"],
  "cta": "<ideal outcome for the meeting>"
}

Rules:
- Be specific to the contact and campaign.
- Focus on likely business pains, not generic sales filler.
- The talk track should be practical and short.
- Do not fabricate detailed company facts that are not present in the context.`;
}

export function getReactivationPrompt(ctx: CampaignContext, knowledge: string): string {
  return `You are reactivating a stale B2B LinkedIn opportunity.

CAMPAIGN: "${ctx.campaignName}"
${ctx.campaignDescription ? `CAMPAIGN CONTEXT: ${ctx.campaignDescription}` : ""}
${ctx.strategyNotes ? `MESSAGE STRATEGY: ${ctx.strategyNotes}` : ""}
${ctx.calendarUrl ? `CALENDAR URL: ${ctx.calendarUrl}` : ""}
${knowledge ? `LEARNINGS:\n${knowledge}` : ""}

Respond with ONLY valid JSON:
{
  "reactivationReason": "<why it is worth reactivating now>",
  "angle": "<best angle to reopen the conversation>",
  "draft": "<reactivation draft message>"
}

Rules:
- Keep the message short and low-friction.
- Avoid sounding like an automated follow-up.
- Use a fresh angle instead of repeating the original pitch.`;
}

export function getExperimentDesignPrompt(ctx: CampaignContext, knowledge: string): string {
  return `You are designing a LinkedIn outbound messaging experiment.

CAMPAIGN: "${ctx.campaignName}"
${ctx.campaignDescription ? `CAMPAIGN CONTEXT: ${ctx.campaignDescription}` : ""}
${ctx.strategyNotes ? `MESSAGE STRATEGY: ${ctx.strategyNotes}` : ""}
${knowledge ? `LEARNINGS:\n${knowledge}` : ""}

Respond with ONLY valid JSON:
{
  "hypothesis": "<single testable hypothesis>",
  "successMetric": "<metric to optimize>",
  "suggestedSampleSize": "<recommended sample size>",
  "variants": [
    { "name": "A", "angle": "<angle>", "message": "<message>" },
    { "name": "B", "angle": "<angle>", "message": "<message>" },
    { "name": "C", "angle": "<angle>", "message": "<message>" }
  ]
}

Rules:
- Design a practical experiment for LinkedIn invite or reply messaging.
- Make the angles meaningfully different.
- Keep each variant concise and realistic for execution.
- Do not return markdown, only JSON.`;
}
