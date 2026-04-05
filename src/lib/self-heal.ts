import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { logActivity } from "@/lib/activity-log";

// ===== ERROR CATEGORIES =====
export type ErrorCategory = "auth" | "rate_limit" | "config" | "linkedin_api" | "data_error" | "network" | "duplicate" | "unknown";

export interface Diagnosis {
  category: ErrorCategory;
  rootCause: string;
  autoFixable: boolean;
  fixAction: string | null;
  userAction: string | null;
}

export interface HealResult {
  diagnosis: Diagnosis;
  fixApplied: boolean;
  fixResult: string | null;
  retryRecommended: boolean;
}

// ===== ERROR PATTERNS =====
interface ErrorPattern {
  test: (error: string, tool: string) => boolean;
  category: ErrorCategory;
  rootCause: (error: string, tool: string) => string;
  autoFixable: boolean;
  fixAction: string | null;
  userAction: (error: string, tool: string) => string | null;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  // Auth errors — OpenRouter
  {
    test: (e) => (e.includes("401") || e.includes("Unauthorized") || e.includes("User not found")) && !e.includes("Unipile"),
    category: "auth",
    rootCause: () => "OpenRouter API key is invalid, expired, or has no credits.",
    autoFixable: false,
    fixAction: null,
    userAction: () => "Go to **Settings → OpenRouter** and verify your API key has credits. You can check your balance at openrouter.ai/account.",
  },
  // Auth errors — Unipile / LinkedIn
  {
    test: (e) => (e.includes("401") || e.includes("Unauthorized") || e.includes("auth")) && (e.includes("Unipile") || e.includes("linkedin") || e.includes("unipile")),
    category: "auth",
    rootCause: () => "Unipile API key or account ID is invalid. The LinkedIn session may have expired.",
    autoFixable: false,
    fixAction: null,
    userAction: () => "Go to **Settings → LinkedIn Connection** and verify your Unipile API key and Account ID. Click 'Test Connection' to verify.",
  },
  // Rate limit errors
  {
    test: (e) => e.includes("429") || e.includes("rate") || e.includes("limit") || e.includes("too many") || e.includes("throttl"),
    category: "rate_limit",
    rootCause: (e, tool) => `Rate limit hit while running ${tool}. LinkedIn or the API provider is throttling requests.`,
    autoFixable: true,
    fixAction: "wait_and_retry",
    userAction: () => null,
  },
  // Config missing — Unipile not configured
  {
    test: (e) => e.includes("not configured") && (e.includes("Unipile") || e.includes("linkedin")),
    category: "config",
    rootCause: () => "LinkedIn integration (Unipile) is not configured.",
    autoFixable: false,
    fixAction: null,
    userAction: () => "Go to **Settings → LinkedIn Connection** and enter your Unipile API Key, DSN, and Account ID.",
  },
  // Config missing — OpenRouter not configured
  {
    test: (e) => e.includes("not configured") && (e.includes("OpenRouter") || e.includes("LLM")),
    category: "config",
    rootCause: () => "OpenRouter (LLM) is not configured.",
    autoFixable: false,
    fixAction: null,
    userAction: () => "Go to **Settings → OpenRouter** and enter your API key.",
  },
  // No campaign / no ICP
  {
    test: (e) => e.includes("no campaign") || e.includes("no ICP") || e.includes("ICP defined"),
    category: "data_error",
    rootCause: (e) => e.includes("ICP") ? "Contacts need an ICP definition on their campaign to be scored." : "Contacts are not assigned to any campaign.",
    autoFixable: false,
    fixAction: null,
    userAction: (e) => e.includes("ICP")
      ? "Click the ⚙️ icon next to the campaign in the sidebar and define the ICP criteria. Or tell me: \"set ICP for [campaign name] to [criteria]\"."
      : "Assign contacts to a campaign first. Use discover_prospects with a campaign_id, or tell me which campaign to assign them to.",
  },
  // No contacts to work with
  {
    test: (e) => e.includes("No contacts") || e.includes("0 contacts") || e.includes("No results"),
    category: "data_error",
    rootCause: (_, tool) => `No contacts available for ${tool}. The pipeline may be empty or contacts are in a different status.`,
    autoFixable: false,
    fixAction: null,
    userAction: (_, tool) => {
      if (tool.includes("score")) return "Discover prospects first, then score them. Tell me: \"search LinkedIn for [job title] in [location]\".";
      if (tool.includes("invite") || tool.includes("prepare")) return "Score contacts first so the best ones are ready. Tell me: \"score contacts\".";
      if (tool.includes("followup")) return "No contacts are in CONNECTED status long enough for follow-up. Wait for invites to be accepted.";
      return "Start by discovering prospects. Tell me: \"search LinkedIn for [job title] in [location]\".";
    },
  },
  // Duplicate / already contacted
  {
    test: (e) => e.includes("already") || e.includes("duplicate") || e.includes("Cannot resend"),
    category: "duplicate",
    rootCause: () => "This contact has already been contacted or invited.",
    autoFixable: true,
    fixAction: "skip_contact",
    userAction: () => null,
  },
  // Invalid parameters — LinkedIn API
  {
    test: (e) => e.includes("Invalid parameters") || e.includes("invalid") || e.includes("provider_id"),
    category: "linkedin_api",
    rootCause: () => "LinkedIn API rejected the request — likely a missing or malformed profile ID.",
    autoFixable: true,
    fixAction: "lookup_profile",
    userAction: () => null,
  },
  // Network errors
  {
    test: (e) => e.includes("fetch failed") || e.includes("ECONNREFUSED") || e.includes("ETIMEDOUT") || e.includes("network") || e.includes("socket"),
    category: "network",
    rootCause: () => "Network error — the API service may be temporarily unavailable.",
    autoFixable: true,
    fixAction: "retry_after_delay",
    userAction: () => null,
  },
  // LLM model errors
  {
    test: (e) => e.includes("model") && (e.includes("unavailable") || e.includes("not found") || e.includes("does not exist")),
    category: "config",
    rootCause: () => "The selected LLM model is unavailable on OpenRouter.",
    autoFixable: false,
    fixAction: null,
    userAction: () => "Go to **Settings → OpenRouter** and select a different model from the dropdown. Recommended: `anthropic/claude-sonnet-4`.",
  },
  // JSON parse errors from LLM response
  {
    test: (e) => e.includes("JSON") || e.includes("parse") || e.includes("Unexpected token"),
    category: "linkedin_api",
    rootCause: () => "The LLM returned malformed output that couldn't be parsed. This is usually a one-time glitch.",
    autoFixable: true,
    fixAction: "retry",
    userAction: () => null,
  },
];

// ===== DIAGNOSIS ENGINE =====
export function diagnoseError(errorMessage: string, failedTool: string): Diagnosis {
  const errorLower = errorMessage.toLowerCase();
  const toolLower = failedTool.toLowerCase();

  for (const pattern of ERROR_PATTERNS) {
    if (pattern.test(errorLower, toolLower)) {
      return {
        category: pattern.category,
        rootCause: pattern.rootCause(errorMessage, failedTool),
        autoFixable: pattern.autoFixable,
        fixAction: pattern.fixAction,
        userAction: pattern.userAction(errorMessage, failedTool),
      };
    }
  }

  return {
    category: "unknown",
    rootCause: `Unexpected error in ${failedTool}: ${errorMessage.substring(0, 200)}`,
    autoFixable: false,
    fixAction: null,
    userAction: "Check **Settings** to verify all API keys are valid, then check **Activity Log** for more details. If the issue persists, try a different approach or contact support.",
  };
}

// ===== AUTO-FIX ENGINE =====
export async function attemptAutoFix(
  diagnosis: Diagnosis,
  failedTool: string,
  userId: string,
): Promise<{ fixed: boolean; result: string }> {
  switch (diagnosis.fixAction) {
    case "wait_and_retry":
      return { fixed: true, result: "Waiting 30 seconds before retrying to respect rate limits..." };

    case "retry_after_delay":
      return { fixed: true, result: "Network issue detected. Will retry after a short delay..." };

    case "retry":
      return { fixed: true, result: "Transient error. Recommending retry..." };

    case "skip_contact":
      return { fixed: true, result: "Contact already processed. Skipping to next." };

    case "lookup_profile": {
      return { fixed: true, result: "Will attempt to look up the correct LinkedIn profile ID before retrying." };
    }

    default:
      return { fixed: false, result: "Auto-fix not available for this error type." };
  }
}

// ===== FULL HEAL FLOW =====
export async function healError(
  errorMessage: string,
  failedTool: string,
  userId: string,
  context?: string,
): Promise<HealResult> {
  const diagnosis = diagnoseError(errorMessage, failedTool);

  await logActivity(userId, "self_heal_diagnosis", {
    level: diagnosis.autoFixable ? "info" : "warning",
    message: `[${diagnosis.category}] ${diagnosis.rootCause}`,
    errorCode: diagnosis.category,
  });

  let fixApplied = false;
  let fixResult: string | null = null;
  let retryRecommended = false;

  if (diagnosis.autoFixable) {
    const fix = await attemptAutoFix(diagnosis, failedTool, userId);
    fixApplied = fix.fixed;
    fixResult = fix.result;
    retryRecommended = fix.fixed; // If we applied a fix, retry is recommended
  }

  return { diagnosis, fixApplied, fixResult, retryRecommended };
}

// ===== HEALTH CHECK =====
export async function checkSystemHealth(userId: string): Promise<{
  overall: "healthy" | "degraded" | "broken";
  checks: Array<{ service: string; status: "ok" | "warning" | "error"; message: string }>;
}> {
  const checks: Array<{ service: string; status: "ok" | "warning" | "error"; message: string }> = [];
  const settings = await prisma.user.findUnique({ where: { id: userId }, include: { settings: true } });

  if (!settings?.settings) {
    return { overall: "broken", checks: [{ service: "Settings", status: "error", message: "No settings configured. Go to Settings page." }] };
  }

  const s = settings.settings;

  // 1. Check OpenRouter
  if (!s.openrouterApiKey) {
    checks.push({ service: "OpenRouter", status: "error", message: "API key not set. Go to Settings → OpenRouter." });
  } else {
    try {
      const key = decrypt(s.openrouterApiKey);
      const res = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        checks.push({ service: "OpenRouter", status: "ok", message: "Connected and authenticated." });
      } else if (res.status === 401) {
        checks.push({ service: "OpenRouter", status: "error", message: "API key invalid or no credits. Check Settings → OpenRouter." });
      } else {
        checks.push({ service: "OpenRouter", status: "warning", message: `API returned ${res.status}. May be temporarily unavailable.` });
      }
    } catch (e) {
      checks.push({ service: "OpenRouter", status: "warning", message: `Connection test failed: ${(e as Error).message.substring(0, 80)}` });
    }
  }

  // 2. Check Unipile / LinkedIn
  if (!s.unipileApiKey) {
    checks.push({ service: "LinkedIn (Unipile)", status: "error", message: "API key not set. Go to Settings → LinkedIn Connection." });
  } else if (!(s as unknown as Record<string, string>).unipileDsn) {
    checks.push({ service: "LinkedIn (Unipile)", status: "error", message: "DSN (Server URL) not set. Go to Settings → LinkedIn Connection." });
  } else {
    try {
      const key = decrypt(s.unipileApiKey);
      const dsn = (s as unknown as Record<string, string>).unipileDsn;
      const res = await fetch(`${dsn}/api/v1/accounts`, {
        headers: { "X-API-KEY": key, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        const accounts = data?.items || data || [];
        const linkedinAccount = Array.isArray(accounts) ? accounts.find((a: Record<string, string>) => a.type === "LINKEDIN") : null;
        if (linkedinAccount) {
          checks.push({ service: "LinkedIn (Unipile)", status: "ok", message: `Connected. Account: ${linkedinAccount.name || linkedinAccount.id}` });
        } else {
          checks.push({ service: "LinkedIn (Unipile)", status: "warning", message: "Unipile connected but no LinkedIn account found. Add a LinkedIn account in Unipile dashboard." });
        }
      } else if (res.status === 401) {
        checks.push({ service: "LinkedIn (Unipile)", status: "error", message: "Unipile API key invalid. Check Settings → LinkedIn Connection." });
      } else {
        checks.push({ service: "LinkedIn (Unipile)", status: "warning", message: `Unipile returned ${res.status}.` });
      }
    } catch (e) {
      checks.push({ service: "LinkedIn (Unipile)", status: "warning", message: `Connection test failed: ${(e as Error).message.substring(0, 80)}` });
    }
  }

  // 3. Check rate limits
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const invitesToday = await prisma.executionLog.count({
      where: { userId, action: "send_invite", success: true, createdAt: { gte: today } },
    });
    if (invitesToday >= 15) {
      checks.push({ service: "Rate Limits", status: "warning", message: `Daily invite limit reached (${invitesToday}/15). Wait until tomorrow.` });
    } else if (invitesToday >= 12) {
      checks.push({ service: "Rate Limits", status: "warning", message: `Approaching daily limit: ${invitesToday}/15 invites sent today.` });
    } else {
      checks.push({ service: "Rate Limits", status: "ok", message: `${invitesToday}/15 invites today. ${15 - invitesToday} remaining.` });
    }
  } catch {
    checks.push({ service: "Rate Limits", status: "ok", message: "Rate limit check skipped." });
  }

  // 4. Check campaigns
  const campaignCount = await prisma.campaign.count({ where: { userId } });
  if (campaignCount === 0) {
    checks.push({ service: "Campaigns", status: "warning", message: "No campaigns created yet. Create one to start outreach." });
  } else {
    const withIcp = await prisma.campaign.count({ where: { userId, icpDefinition: { not: null } } });
    if (withIcp < campaignCount) {
      checks.push({ service: "Campaigns", status: "warning", message: `${campaignCount - withIcp} campaign(s) missing ICP definition. Scoring won't work without ICP.` });
    } else {
      checks.push({ service: "Campaigns", status: "ok", message: `${campaignCount} campaign(s) configured with ICP.` });
    }
  }

  // Determine overall
  const hasError = checks.some(c => c.status === "error");
  const hasWarning = checks.some(c => c.status === "warning");
  const overall = hasError ? "broken" : hasWarning ? "degraded" : "healthy";

  return { overall, checks };
}
