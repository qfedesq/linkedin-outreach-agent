/**
 * Dynamic Tool Dispatcher
 *
 * Executes agent-created tools via a JSON DSL — no eval, no dynamic code execution.
 * All queries are userId-scoped and model-whitelisted for security.
 *
 * Handler types:
 *   prisma_query  — Run a Prisma query against allowed models
 *   llm_analysis  — Call the LLM with a prompt template + optional piped data
 *   composite     — Chain multiple steps (query → analysis)
 *   http_fetch    — GET an allow-listed external URL
 */

import { prisma } from "@/lib/prisma";
import { callLLM } from "@/lib/llm";
import type { ToolResult } from "@/lib/agent-tools";

// ─────────────────────── Security: model allowlist ───────────────────────

const ALLOWED_MODELS = new Set([
  "contact",
  "campaign",
  "agentKnowledge",
  "executionLog",
  "dailyRun",
  "contactInsight",
  "messageExperiment",
  "inviteBatch",
]);

// Allowed HTTP domains for http_fetch handler
const ALLOWED_DOMAINS = new Set([
  "api.coingecko.com",
  "api.coinmarketcap.com",
  "api.github.com",
  "api.openrouter.ai",
]);

// ─────────────────────── DSL type definitions ───────────────────────

export interface PrismaQueryConfig {
  model: string;
  operation: "findMany" | "findFirst" | "count" | "groupBy" | "aggregate";
  where?: Record<string, unknown>;
  select?: Record<string, boolean>;
  orderBy?: Record<string, string> | Array<Record<string, string>>;
  take?: number;
  skip?: number;
  by?: string[];
  _count?: Record<string, boolean> | boolean;
  _sum?: Record<string, boolean>;
  _avg?: Record<string, boolean>;
  _min?: Record<string, boolean>;
  _max?: Record<string, boolean>;
}

export interface LLMAnalysisConfig {
  systemPrompt: string;
  userPromptTemplate: string; // {{arg_name}} for tool args, {{data}} for piped step output
  maxTokens?: number;
  temperature?: number;
}

export interface CompositeStep {
  id: string;
  type: "prisma_query" | "llm_analysis" | "http_fetch";
  config: PrismaQueryConfig | LLMAnalysisConfig | HttpFetchConfig;
  inputFrom?: string; // step id whose output feeds into {{data}}
}

export interface CompositeConfig {
  steps: CompositeStep[];
  output: string; // step id to return as final result
}

export interface HttpFetchConfig {
  url: string; // must be in ALLOWED_DOMAINS
  method?: "GET";
  headers?: Record<string, string>;
}

export type HandlerConfig = PrismaQueryConfig | LLMAnalysisConfig | CompositeConfig | HttpFetchConfig;

// ─────────────────────── Template renderer ───────────────────────

function renderTemplate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = vars[key];
    if (val === undefined || val === null) return "";
    if (typeof val === "object") return JSON.stringify(val, null, 2);
    return String(val);
  });
}

// ─────────────────────── Prisma executor ───────────────────────

async function runPrismaQuery(
  config: PrismaQueryConfig,
  userId: string,
  extraWhere?: Record<string, unknown>
): Promise<unknown> {
  if (!ALLOWED_MODELS.has(config.model)) {
    throw new Error(`Model '${config.model}' is not allowed. Allowed: ${[...ALLOWED_MODELS].join(", ")}`);
  }

  // Always inject userId + any extra where clauses
  const safeWhere = { ...config.where, ...extraWhere, userId };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = (prisma as unknown) as Record<string, Record<string, (args: unknown) => Promise<unknown>>>;
  const modelClient = client[config.model];
  if (!modelClient) throw new Error(`Prisma model '${config.model}' not found`);

  const op = config.operation;

  if (op === "findMany") {
    return modelClient.findMany({
      where: safeWhere,
      select: config.select,
      orderBy: config.orderBy,
      take: config.take ?? 50,
      skip: config.skip,
    });
  }
  if (op === "findFirst") {
    return modelClient.findFirst({
      where: safeWhere,
      select: config.select,
      orderBy: config.orderBy,
    });
  }
  if (op === "count") {
    return modelClient.count({ where: safeWhere });
  }
  if (op === "groupBy") {
    if (!config.by?.length) throw new Error("groupBy requires a 'by' array");
    return modelClient.groupBy({
      by: config.by,
      where: safeWhere,
      _count: config._count,
      _sum: config._sum,
      _avg: config._avg,
      _min: config._min,
      _max: config._max,
      orderBy: config.orderBy,
      take: config.take,
    });
  }
  if (op === "aggregate") {
    return modelClient.aggregate({
      where: safeWhere,
      _count: config._count,
      _sum: config._sum,
      _avg: config._avg,
      _min: config._min,
      _max: config._max,
    });
  }
  throw new Error(`Unsupported operation: ${op}`);
}

// ─────────────────────── HTTP executor ───────────────────────

async function runHttpFetch(config: HttpFetchConfig): Promise<unknown> {
  const url = new URL(config.url);
  if (!ALLOWED_DOMAINS.has(url.hostname)) {
    throw new Error(`Domain '${url.hostname}' not in allowlist.`);
  }
  const res = await fetch(config.url, {
    method: config.method ?? "GET",
    headers: config.headers,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url.hostname}`);
  return res.json();
}

// ─────────────────────── Main dispatcher ───────────────────────

export interface DispatchContext {
  userId: string;
  args: Record<string, unknown>;
  apiKey: string;
  model: string;
}

export async function executeDynamicTool(
  handlerType: string,
  handlerConfig: unknown,
  ctx: DispatchContext
): Promise<ToolResult> {
  try {
    const result = await dispatchHandler(handlerType, handlerConfig as HandlerConfig, ctx, {});
    const message = typeof result === "string"
      ? result
      : typeof result === "number"
      ? String(result)
      : Array.isArray(result)
      ? `Found ${(result as unknown[]).length} results`
      : "Done";
    return { success: true, data: result, message };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Dynamic tool error: ${msg}` };
  }
}

async function dispatchHandler(
  type: string,
  config: HandlerConfig,
  ctx: DispatchContext,
  stepOutputs: Record<string, unknown>
): Promise<unknown> {
  if (type === "prisma_query") {
    const cfg = config as PrismaQueryConfig;
    // Substitute {{arg_name}} placeholders in where values
    const resolvedWhere = resolveWherePlaceholders(cfg.where, ctx.args);
    return runPrismaQuery({ ...cfg, where: resolvedWhere }, ctx.userId);
  }

  if (type === "llm_analysis") {
    const cfg = config as LLMAnalysisConfig;
    const templateVars: Record<string, unknown> = {
      ...ctx.args,
      userId: ctx.userId,
      data: stepOutputs["data"] ?? stepOutputs[Object.keys(stepOutputs)[0]] ?? "",
    };
    const userPrompt = renderTemplate(cfg.userPromptTemplate, templateVars);
    return callLLM(cfg.systemPrompt, userPrompt, ctx.apiKey, ctx.model, {
      maxTokens: cfg.maxTokens ?? 600,
      temperature: cfg.temperature ?? 0.5,
    });
  }

  if (type === "http_fetch") {
    return runHttpFetch(config as HttpFetchConfig);
  }

  if (type === "composite") {
    const cfg = config as CompositeConfig;
    const outputs: Record<string, unknown> = {};
    for (const step of cfg.steps) {
      // Resolve piped input
      const piped = step.inputFrom ? outputs[step.inputFrom] : undefined;
      const enrichedStepOutputs = piped ? { ...outputs, data: piped } : outputs;
      outputs[step.id] = await dispatchHandler(step.type, step.config, ctx, enrichedStepOutputs);
    }
    if (!(cfg.output in outputs)) throw new Error(`Composite output step '${cfg.output}' not found`);
    return outputs[cfg.output];
  }

  throw new Error(`Unknown handler type: ${type}`);
}

// Resolve {{arg_name}} placeholders inside where-clause leaf values
function resolveWherePlaceholders(
  where: Record<string, unknown> | undefined,
  args: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!where) return where;
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(where)) {
    if (typeof v === "string" && v.startsWith("{{") && v.endsWith("}}")) {
      const key = v.slice(2, -2).trim();
      result[k] = args[key] ?? v;
    } else if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      result[k] = resolveWherePlaceholders(v as Record<string, unknown>, args);
    } else {
      result[k] = v;
    }
  }
  return result;
}

// ─────────────────────── Widget data fetcher ───────────────────────

export async function fetchWidgetData(
  dataConfig: unknown,
  userId: string,
  campaignId?: string
): Promise<unknown> {
  const cfg = dataConfig as PrismaQueryConfig;
  const extraWhere = campaignId ? { campaignId } : {};
  return runPrismaQuery(cfg, userId, extraWhere);
}
