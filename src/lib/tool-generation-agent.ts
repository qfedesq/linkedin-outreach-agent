/**
 * Tool Generation Agent — harness/framework pattern (mirrors Claude Code's architecture)
 *
 * Stages:
 *   READ     — Build context: schema summary, existing tool patterns, user request
 *   THINK    — LLM reasons about the best design for the requested tool
 *   WRITE    — LLM produces a validated JSON DSL config
 *   VALIDATE — Structural validation + semantic safety checks
 *   STORE    — Persist to DB (DynamicTool or DynamicWidget)
 *   RETRY    — Feed validation errors back into WRITE for up to MAX_ITERATIONS rounds
 */

import { callLLM } from "@/lib/llm";
import { prisma } from "@/lib/prisma";
import type {
  PrismaQueryConfig,
  LLMAnalysisConfig,
  CompositeConfig,
  HandlerConfig,
} from "@/lib/dynamic-tool-dispatcher";

// ─────────────────────── Constants ───────────────────────

const MAX_ITERATIONS = 3;

// ─────────────────────── Schema context (READ stage) ───────────────────────

const SCHEMA_CONTEXT = `
## Available Prisma Models (you may query these)
- contact: id, name, position, company, linkedinUrl, profileFit (HIGH/MEDIUM/LOW), status (TO_CONTACT/INVITED/CONNECTED/FOLLOWED_UP/REPLIED/MEETING_BOOKED/UNRESPONSIVE/DISQUALIFIED), campaignId, inviteSentDate, connectedDate, followupSentDate, source, createdAt
- campaign: id, name, description, icpDefinition, strategyNotes, isActive, dailyInviteLimit, followupDelayDays, createdAt
- agentKnowledge: id, category (message_style/icp_insight/strategy/correction), content, source, createdAt
- executionLog: id, action, contactId, success, errorCode, duration, createdAt
- dailyRun: id, phase, prospectsFound, invitesSent, newConnections, followupsSent, newReplies, meetingsBooked, status, createdAt

## Supported Handler Types
1. prisma_query — query the DB
   { model, operation (findMany|findFirst|count|groupBy|aggregate), where, select, orderBy, take, by, _count, _sum, _avg }
   IMPORTANT: userId is ALWAYS auto-injected — never include it in 'where'
   Use {{arg_name}} inside where values to reference tool arguments

2. llm_analysis — call the LLM
   { systemPrompt, userPromptTemplate, maxTokens?, temperature? }
   Use {{arg_name}} and {{data}} (piped from previous composite step) in userPromptTemplate

3. composite — chain steps
   { steps: [{id, type, config, inputFrom?}], output: "step_id_to_return" }

4. http_fetch — external HTTP GET (allow-listed domains only: api.coingecko.com, api.github.com)
   { url, method?, headers? }

## Widget Types (for create_widget)
- stat_card: single metric. displayConfig: { label, format? ("number"|"percent"|"currency") }
- bar_chart: grouped data. displayConfig: { title, xKey, yKey, colorKey?, colors? }
- table: rows/columns. displayConfig: { title, columns: [{key, label, format?}] }
- funnel: pipeline stages. displayConfig: { title, stages: [{key, label}] }
- kpi_grid: multiple stat cards. displayConfig: { title, items: [{key, label, format?}] }
`.trim();

const TOOL_EXAMPLES = `
## Example 1: Simple count tool
{
  "name": "count_high_fit_contacts",
  "description": "Count HIGH fit contacts, optionally filtered by campaign",
  "parameters": {
    "type": "object",
    "properties": {
      "campaign_id": { "type": "string", "description": "Optional campaign ID filter" }
    }
  },
  "handlerType": "prisma_query",
  "handlerConfig": {
    "model": "contact",
    "operation": "count",
    "where": { "profileFit": "HIGH", "campaignId": "{{campaign_id}}" }
  }
}

## Example 2: LLM analysis tool
{
  "name": "summarize_pipeline_health",
  "description": "Ask the LLM to summarize pipeline health and recommend the top next action",
  "parameters": { "type": "object", "properties": {} },
  "handlerType": "llm_analysis",
  "handlerConfig": {
    "systemPrompt": "You are a B2B sales advisor. Be concise.",
    "userPromptTemplate": "The user has {{data}} contacts. Summarize pipeline health and give the single best next action.",
    "maxTokens": 300
  }
}

## Example 3: Composite (query + analysis)
{
  "name": "best_companies_to_target",
  "description": "Find companies with the most HIGH fit contacts and suggest focus order",
  "parameters": { "type": "object", "properties": { "limit": { "type": "number" } } },
  "handlerType": "composite",
  "handlerConfig": {
    "steps": [
      {
        "id": "companies",
        "type": "prisma_query",
        "config": {
          "model": "contact",
          "operation": "groupBy",
          "by": ["company"],
          "_count": { "id": true },
          "where": { "profileFit": "HIGH" },
          "orderBy": { "_count": { "id": "desc" } },
          "take": 10
        }
      },
      {
        "id": "analysis",
        "type": "llm_analysis",
        "inputFrom": "companies",
        "config": {
          "systemPrompt": "You are a B2B sales advisor. Format as a ranked list.",
          "userPromptTemplate": "Here are the companies with the most HIGH fit contacts:\\n{{data}}\\n\\nRank them by focus priority and explain why.",
          "maxTokens": 400
        }
      }
    ],
    "output": "analysis"
  }
}
`.trim();

// ─────────────────────── System prompts ───────────────────────

const THINK_SYSTEM_PROMPT = `You are a tool architect for a LinkedIn outreach agent.
Your task is to design the best approach for implementing a requested tool.
Think step by step: what data is needed, which handler type fits best, what parameters the agent would need.
Be concise — 3-5 sentences max.`;

const WRITE_SYSTEM_PROMPT = `You are a JSON DSL generator for a LinkedIn outreach agent tool registry.
Output ONLY valid JSON — no markdown code blocks, no commentary, nothing else.
The JSON must conform exactly to the schema below.

REQUIRED OUTPUT SCHEMA:
{
  "name": string (snake_case, unique per user, <= 40 chars),
  "description": string (shown to the LLM — explain what this tool does),
  "parameters": object (OpenAI JSON Schema for tool arguments — use {} if no args needed),
  "handlerType": "prisma_query" | "llm_analysis" | "composite" | "http_fetch",
  "handlerConfig": object (see DSL spec)
}

${SCHEMA_CONTEXT}

${TOOL_EXAMPLES}`;

const WIDGET_WRITE_SYSTEM_PROMPT = `You are a JSON DSL generator for dashboard widgets in a LinkedIn outreach agent.
Output ONLY valid JSON — no markdown code blocks, no commentary, nothing else.

REQUIRED OUTPUT SCHEMA:
{
  "name": string (human-readable widget title),
  "description": string (optional, 1 sentence),
  "widgetType": "stat_card" | "bar_chart" | "table" | "funnel" | "kpi_grid",
  "dataConfig": object (prisma_query DSL — what data to fetch),
  "displayConfig": object (rendering options specific to widgetType)
}

${SCHEMA_CONTEXT}

## Widget Examples

stat_card — single number:
{
  "name": "Total Connected Contacts",
  "widgetType": "stat_card",
  "dataConfig": { "model": "contact", "operation": "count", "where": { "status": "CONNECTED" } },
  "displayConfig": { "label": "Connected", "format": "number" }
}

bar_chart — contacts by status:
{
  "name": "Pipeline by Status",
  "widgetType": "bar_chart",
  "dataConfig": {
    "model": "contact",
    "operation": "groupBy",
    "by": ["status"],
    "_count": { "id": true }
  },
  "displayConfig": { "title": "Pipeline Distribution", "xKey": "status", "yKey": "_count.id" }
}

table — top connected contacts:
{
  "name": "Recently Connected",
  "widgetType": "table",
  "dataConfig": {
    "model": "contact",
    "operation": "findMany",
    "where": { "status": "CONNECTED" },
    "select": { "name": true, "company": true, "connectedDate": true },
    "orderBy": { "connectedDate": "desc" },
    "take": 10
  },
  "displayConfig": {
    "title": "Recently Connected",
    "columns": [
      { "key": "name", "label": "Name" },
      { "key": "company", "label": "Company" },
      { "key": "connectedDate", "label": "Connected", "format": "date" }
    ]
  }
}`;

// ─────────────────────── Validators ───────────────────────

function validateToolDSL(raw: string): { success: true; data: ToolDSL } | { success: false; error: string } {
  let parsed: unknown;
  // Strip possible markdown code fences
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try { parsed = JSON.parse(cleaned); } catch {
    return { success: false, error: "Response is not valid JSON. Output only a raw JSON object." };
  }
  const obj = parsed as Record<string, unknown>;
  if (!obj.name || typeof obj.name !== "string") return { success: false, error: "Missing or invalid 'name' (must be a string)" };
  if (!/^[a-z][a-z0-9_]{0,39}$/.test(obj.name)) return { success: false, error: "name must be snake_case, start with a letter, max 40 chars" };
  if (!obj.description || typeof obj.description !== "string") return { success: false, error: "Missing 'description'" };
  if (!obj.parameters || typeof obj.parameters !== "object") return { success: false, error: "Missing 'parameters' (must be a JSON Schema object, use {} for no args)" };
  const validHandlers = ["prisma_query", "llm_analysis", "composite", "http_fetch"];
  if (!obj.handlerType || !validHandlers.includes(obj.handlerType as string)) {
    return { success: false, error: `handlerType must be one of: ${validHandlers.join(", ")}` };
  }
  if (!obj.handlerConfig || typeof obj.handlerConfig !== "object") return { success: false, error: "Missing 'handlerConfig'" };

  // Validate model is in allowlist for prisma_query
  if (obj.handlerType === "prisma_query") {
    const cfg = obj.handlerConfig as PrismaQueryConfig;
    const allowedModels = ["contact", "campaign", "agentKnowledge", "executionLog", "dailyRun", "contactInsight", "messageExperiment"];
    if (!allowedModels.includes(cfg.model)) {
      return { success: false, error: `handlerConfig.model must be one of: ${allowedModels.join(", ")}` };
    }
    if (!cfg.operation) return { success: false, error: "handlerConfig.operation is required for prisma_query" };
  }

  // Safety: userId must NOT be in where — it is auto-injected
  const configStr = JSON.stringify(obj.handlerConfig);
  if (configStr.includes('"userId"')) {
    return { success: false, error: "Do not include 'userId' in handlerConfig — it is automatically injected for security." };
  }

  return { success: true, data: obj as unknown as ToolDSL };
}

function validateWidgetDSL(raw: string): { success: true; data: WidgetDSL } | { success: false; error: string } {
  let parsed: unknown;
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try { parsed = JSON.parse(cleaned); } catch {
    return { success: false, error: "Response is not valid JSON." };
  }
  const obj = parsed as Record<string, unknown>;
  if (!obj.name || typeof obj.name !== "string") return { success: false, error: "Missing 'name'" };
  const validTypes = ["stat_card", "bar_chart", "table", "funnel", "kpi_grid"];
  if (!obj.widgetType || !validTypes.includes(obj.widgetType as string)) {
    return { success: false, error: `widgetType must be one of: ${validTypes.join(", ")}` };
  }
  if (!obj.dataConfig || typeof obj.dataConfig !== "object") return { success: false, error: "Missing 'dataConfig'" };
  if (!obj.displayConfig || typeof obj.displayConfig !== "object") return { success: false, error: "Missing 'displayConfig'" };

  const cfg = obj.dataConfig as PrismaQueryConfig;
  const allowedModels = ["contact", "campaign", "agentKnowledge", "executionLog", "dailyRun"];
  if (!allowedModels.includes(cfg.model)) {
    return { success: false, error: `dataConfig.model must be one of: ${allowedModels.join(", ")}` };
  }

  const configStr = JSON.stringify(obj.dataConfig);
  if (configStr.includes('"userId"')) {
    return { success: false, error: "Do not include 'userId' in dataConfig — it is automatically injected." };
  }

  return { success: true, data: obj as unknown as WidgetDSL };
}

// ─────────────────────── Types ───────────────────────

export interface ToolDSL {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handlerType: string;
  handlerConfig: HandlerConfig;
}

export interface WidgetDSL {
  name: string;
  description?: string;
  widgetType: string;
  dataConfig: PrismaQueryConfig;
  displayConfig: Record<string, unknown>;
}

// ─────────────────────── Generate Tool (harness loop) ───────────────────────

export async function generateTool(
  userId: string,
  request: string,
  apiKey: string,
  model: string,
  onProgress?: (msg: string) => void
): Promise<{ success: boolean; toolName?: string; message: string }> {

  // Log generation attempt
  const logEntry = await prisma.toolGenerationLog.create({
    data: { userId, prompt: request.substring(0, 500), status: "generating" }
  });

  onProgress?.("🔍 READ — Analyzing request and schema context...");

  // ── STAGE 1: THINK ──────────────────────────────────────────────────────────
  onProgress?.("🤔 THINK — Designing tool architecture...");
  const thinkContext = `
SCHEMA & CAPABILITIES:
${SCHEMA_CONTEXT}

USER REQUEST: "${request}"

Briefly describe: (1) what data/analysis this tool needs, (2) which handler type fits best and why, (3) what parameters the user would pass to this tool.`.trim();

  let designNotes: string;
  try {
    designNotes = await callLLM(THINK_SYSTEM_PROMPT, thinkContext, apiKey, model, { maxTokens: 400, temperature: 0.5 });
  } catch {
    await prisma.toolGenerationLog.update({ where: { id: logEntry.id }, data: { status: "failed", errorLog: "THINK stage failed" } });
    return { success: false, message: "Tool generation failed at THINK stage. Check your OpenRouter API key." };
  }

  // ── STAGE 2: WRITE + VALIDATE loop ──────────────────────────────────────────
  const writeContext = `
USER REQUEST: "${request}"

DESIGN NOTES (from previous analysis step):
${designNotes}

Now generate the JSON DSL config for this tool. Output ONLY valid JSON.`.trim();

  let lastError = "";
  let validated: ToolDSL | null = null;

  for (let iter = 1; iter <= MAX_ITERATIONS; iter++) {
    onProgress?.(`✍️ WRITE — Generating DSL config (attempt ${iter}/${MAX_ITERATIONS})...`);

    const feedbackContext = iter > 1
      ? `${writeContext}\n\nPREVIOUS ATTEMPT FAILED:\n${lastError}\n\nFix the issue and output corrected JSON.`
      : writeContext;

    let raw: string;
    try {
      raw = await callLLM(WRITE_SYSTEM_PROMPT, feedbackContext, apiKey, model, { maxTokens: 800, temperature: iter === 1 ? 0.3 : 0.1 });
    } catch {
      lastError = "LLM call failed";
      continue;
    }

    onProgress?.(`🔎 VALIDATE — Checking DSL structure (attempt ${iter})...`);
    const result = validateToolDSL(raw);
    if (result.success) {
      validated = result.data;
      break;
    }
    lastError = result.error;
    onProgress?.(`⚠️ Validation error: ${lastError}`);
  }

  if (!validated) {
    await prisma.toolGenerationLog.update({
      where: { id: logEntry.id },
      data: { status: "failed", iterations: MAX_ITERATIONS, errorLog: lastError }
    });
    return {
      success: false,
      message: `Tool generation failed after ${MAX_ITERATIONS} attempts.\nLast error: ${lastError}\n\nTry rephrasing your request more specifically.`
    };
  }

  // ── STAGE 3: STORE ──────────────────────────────────────────────────────────
  onProgress?.(`💾 STORE — Saving tool '${validated.name}'...`);

  // Check for name collision
  const existing = await prisma.dynamicTool.findFirst({ where: { userId, name: validated.name } });
  if (existing) {
    // Deactivate old version and replace
    await prisma.dynamicTool.update({ where: { id: existing.id }, data: { isActive: false } });
  }

  await prisma.dynamicTool.create({
    data: {
      userId,
      name: validated.name,
      description: validated.description,
      parameters: validated.parameters as object,
      handlerType: validated.handlerType,
      handlerConfig: validated.handlerConfig as object,
      isActive: true,
    }
  });

  await prisma.toolGenerationLog.update({
    where: { id: logEntry.id },
    data: { status: "active", toolName: validated.name, iterations: MAX_ITERATIONS }
  });

  return {
    success: true,
    toolName: validated.name,
    message: `✅ Tool \`${validated.name}\` created and immediately available.\n\nDescription: ${validated.description}\n\nYou can now call it directly in this conversation.`
  };
}

// ─────────────────────── Generate Widget (harness loop) ───────────────────────

export async function generateWidget(
  userId: string,
  campaignId: string | undefined,
  request: string,
  apiKey: string,
  model: string,
  onProgress?: (msg: string) => void
): Promise<{ success: boolean; widgetId?: string; message: string }> {

  onProgress?.("🔍 READ — Analyzing dashboard widget request...");

  const thinkContext = `
SCHEMA & CAPABILITIES:
${SCHEMA_CONTEXT}

USER REQUEST: "${request}"
CAMPAIGN SCOPE: ${campaignId ? `Campaign ID: ${campaignId} (widget will appear on this campaign's dashboard)` : "Global dashboard (no specific campaign)"}

Briefly describe: (1) what data this widget needs to show, (2) which widget type fits best, (3) what the display should look like.`.trim();

  onProgress?.("🤔 THINK — Designing widget...");
  let designNotes: string;
  try {
    designNotes = await callLLM(
      "You are a dashboard widget designer for a LinkedIn outreach agent. Be concise — 3 sentences.",
      thinkContext, apiKey, model, { maxTokens: 300, temperature: 0.4 }
    );
  } catch {
    return { success: false, message: "Widget generation failed at THINK stage." };
  }

  const writeContext = `
USER REQUEST: "${request}"
CAMPAIGN SCOPE: ${campaignId ? `Campaign ID: ${campaignId}` : "Global"}
DESIGN NOTES: ${designNotes}

Generate the JSON DSL config for this dashboard widget. Output ONLY valid JSON.`.trim();

  let lastError = "";
  let validated: WidgetDSL | null = null;

  for (let iter = 1; iter <= MAX_ITERATIONS; iter++) {
    onProgress?.(`✍️ WRITE — Generating widget config (attempt ${iter})...`);
    const feedbackCtx = iter > 1
      ? `${writeContext}\n\nPREVIOUS ERROR: ${lastError}\n\nOutput corrected JSON.`
      : writeContext;

    let raw: string;
    try {
      raw = await callLLM(WIDGET_WRITE_SYSTEM_PROMPT, feedbackCtx, apiKey, model, { maxTokens: 700, temperature: iter === 1 ? 0.3 : 0.1 });
    } catch {
      lastError = "LLM call failed";
      continue;
    }

    onProgress?.(`🔎 VALIDATE — Checking widget DSL (attempt ${iter})...`);
    const result = validateWidgetDSL(raw);
    if (result.success) { validated = result.data; break; }
    lastError = result.error;
  }

  if (!validated) {
    return { success: false, message: `Widget generation failed after ${MAX_ITERATIONS} attempts.\nLast error: ${lastError}` };
  }

  onProgress?.(`💾 STORE — Saving widget '${validated.name}'...`);

  const widget = await prisma.dynamicWidget.create({
    data: {
      userId,
      campaignId: campaignId ?? null,
      name: validated.name,
      description: validated.description ?? null,
      widgetType: validated.widgetType,
      dataConfig: validated.dataConfig as object,
      displayConfig: validated.displayConfig as object,
      isActive: true,
    }
  });

  return {
    success: true,
    widgetId: widget.id,
    message: `✅ Widget **${validated.name}** added to your ${campaignId ? "campaign" : "global"} dashboard.\n\nType: \`${validated.widgetType}\`\nRefresh the dashboard to see it.`
  };
}

// ─────────────────────── Dynamic Tool Definitions (for agent) ───────────────────────

export async function getDynamicToolDefinitions(userId: string) {
  const tools = await prisma.dynamicTool.findMany({
    where: { userId, isActive: true },
    select: { name: true, description: true, parameters: true },
    orderBy: { createdAt: "asc" },
  });

  return tools.map(t => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: `[Custom Tool] ${t.description}`,
      parameters: t.parameters as Record<string, unknown>,
    },
  }));
}
