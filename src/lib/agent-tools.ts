import { prisma } from "@/lib/prisma";
import { callLLM, getIcpScoringPrompt, getConnectionNotePrompt, getFollowupPrompt, CampaignContext } from "@/lib/llm";
import { createLinkedIn } from "@/lib/linkedin-provider";
import { logActivity } from "@/lib/activity-log";
import { setAgentStatus } from "@/lib/agent-status";
import { canPerformAction, canInviteContact, canFollowupContact, humanDelay, getUsageSummary } from "@/lib/linkedin-limits";
import { createContactSafe, checkGlobalDuplicate } from "@/lib/contact-dedup";
import { healError, checkSystemHealth } from "@/lib/self-heal";
import {
  buildAccountMap,
  draftReplyStrategy,
  listMessageExperiments,
  prepareMeetingBrief,
  prioritizePipelineByExpectedValue,
  reactivateStalePipeline,
  runMessageExperiment,
} from "@/lib/revenue-ops";

export interface ToolResult {
  success: boolean;
  data?: unknown;
  message: string;
}

async function getUserSettings(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { settings: true } });
  return user?.settings;
}

export function getToolDefinitions() {
  return [
    { type: "function" as const, function: { name: "get_pipeline_stats", description: "Get pipeline: total contacts, counts by status, conversion rates", parameters: { type: "object", properties: {} } } },
    { type: "function" as const, function: { name: "search_contacts", description: "Search contacts by name/company/status/fit", parameters: { type: "object", properties: { query: { type: "string" }, status: { type: "string", enum: ["TO_CONTACT","INVITED","CONNECTED","FOLLOWED_UP","REPLIED","MEETING_BOOKED","UNRESPONSIVE"] }, fit: { type: "string", enum: ["HIGH","MEDIUM","LOW"] }, limit: { type: "number" } } } } },
    { type: "function" as const, function: { name: "discover_prospects", description: "EXECUTE: Search LinkedIn for prospects by keyword + location. Assigns to specified campaign.", parameters: { type: "object", properties: { job_title: { type: "string", description: "e.g. CEO, CFO, VP Lending" }, location: { type: "string", description: "e.g. United Kingdom" }, count: { type: "number", description: "max results (default 25)" }, campaign_id: { type: "string", description: "Campaign ID to assign contacts to" } }, required: ["job_title"] } } },
    { type: "function" as const, function: { name: "score_contacts", description: "EXECUTE: Score unscored contacts using LLM (HIGH/MEDIUM/LOW fit)", parameters: { type: "object", properties: { limit: { type: "number", description: "max to score (default 10)" } } } } },
    { type: "function" as const, function: { name: "prepare_invites", description: "EXECUTE: Generate personalized connection notes via LLM for TO_CONTACT contacts. Prioritizes HIGH fit. Returns draft messages for review.", parameters: { type: "object", properties: { count: { type: "number", description: "max invites to prepare (default 10)" }, campaign_id: { type: "string", description: "Campaign ID to filter contacts (recommended)" } } } } },
    { type: "function" as const, function: { name: "send_invites", description: "EXECUTE: Send approved invites via LinkedIn (Unipile). Sends one by one.", parameters: { type: "object", properties: { batch_id: { type: "string", description: "Batch ID to send" } }, required: ["batch_id"] } } },
    { type: "function" as const, function: { name: "check_connections_and_inbox", description: "EXECUTE: Check which invites were accepted + scan inbox for replies", parameters: { type: "object", properties: {} } } },
    { type: "function" as const, function: { name: "send_followups", description: "EXECUTE: Generate and send follow-up messages to connected contacts (3+ days)", parameters: { type: "object", properties: {} } } },
    { type: "function" as const, function: { name: "run_full_cycle", description: "EXECUTE: Run complete daily cycle (check connections → send followups → scan inbox)", parameters: { type: "object", properties: {} } } },
    { type: "function" as const, function: { name: "get_performance", description: "Get performance analytics: acceptance rate, best messages, fit comparison", parameters: { type: "object", properties: {} } } },
    { type: "function" as const, function: { name: "get_recent_activity", description: "Get recent execution logs", parameters: { type: "object", properties: { limit: { type: "number" } } } } },
    { type: "function" as const, function: { name: "learn", description: "Save a learning/insight to the knowledge base (persists across sessions)", parameters: { type: "object", properties: { category: { type: "string", enum: ["message_style","icp_insight","strategy","correction"] }, content: { type: "string", description: "The learning to remember" } }, required: ["category","content"] } } },
    { type: "function" as const, function: { name: "get_knowledge", description: "Read all accumulated knowledge/learnings from past sessions", parameters: { type: "object", properties: {} } } },
    { type: "function" as const, function: { name: "get_usage_limits", description: "Check current LinkedIn usage vs safety limits (invites today/week, messages, searches)", parameters: { type: "object", properties: {} } } },
    { type: "function" as const, function: { name: "prioritize_pipeline_by_expected_value", description: "Rank contacts and accounts by expected meeting value and suggest the best next action right now.", parameters: { type: "object", properties: { campaign_id: { type: "string" }, limit: { type: "number" }, include_reasons: { type: "boolean" } } } } },
    { type: "function" as const, function: { name: "build_account_map", description: "Group contacts by account, show buying-committee coverage, and suggest the next account-level move.", parameters: { type: "object", properties: { campaign_id: { type: "string" }, company: { type: "string" }, limit: { type: "number" } } } } },
    { type: "function" as const, function: { name: "draft_reply_strategy", description: "Analyze an inbound reply and generate the best next response strategy and draft without sending anything.", parameters: { type: "object", properties: { contact_id: { type: "string" }, campaign_id: { type: "string" }, message_text: { type: "string" } } } } },
    { type: "function" as const, function: { name: "run_message_experiment", description: "Design and save a structured messaging experiment for a campaign.", parameters: { type: "object", properties: { campaign_id: { type: "string" }, experiment_goal: { type: "string" }, audience_filter: { type: "string" }, variant_count: { type: "number" } }, required: ["campaign_id"] } } },
    { type: "function" as const, function: { name: "reactivate_stale_pipeline", description: "Find stale contacts worth reopening and generate reactivation angles and drafts.", parameters: { type: "object", properties: { campaign_id: { type: "string" }, days_stale: { type: "number" }, limit: { type: "number" } } } } },
    { type: "function" as const, function: { name: "prepare_meeting_brief", description: "Prepare a meeting brief for a contact with history, likely pains, objections, and talk track.", parameters: { type: "object", properties: { contact_id: { type: "string" } }, required: ["contact_id"] } } },
    { type: "function" as const, function: { name: "list_message_experiments", description: "List saved messaging experiments, optionally filtered by campaign.", parameters: { type: "object", properties: { campaign_id: { type: "string" } } } } },
    // ===== CAMPAIGN MANAGEMENT =====
    { type: "function" as const, function: { name: "create_campaign", description: "Create a new outreach campaign with name, description, ICP, and strategy", parameters: { type: "object", properties: { name: { type: "string", description: "Campaign name" }, description: { type: "string", description: "Campaign description" }, icpDefinition: { type: "string", description: "ICP scoring criteria" }, strategyNotes: { type: "string", description: "Outreach strategy and messaging notes" }, calendarUrl: { type: "string", description: "Calendar booking URL" } }, required: ["name"] } } },
    { type: "function" as const, function: { name: "list_campaigns", description: "List all campaigns with their IDs, status, and contact counts. ALWAYS call this first when you need a campaign_id.", parameters: { type: "object", properties: {} } } },
    { type: "function" as const, function: { name: "update_campaign", description: "Update a campaign's settings (name, description, ICP, strategy, calendar, limits)", parameters: { type: "object", properties: { campaign_id: { type: "string" }, name: { type: "string" }, description: { type: "string" }, icpDefinition: { type: "string" }, strategyNotes: { type: "string" }, calendarUrl: { type: "string" }, dailyInviteLimit: { type: "number" }, followupDelayDays: { type: "number" }, isActive: { type: "boolean" } }, required: ["campaign_id"] } } },
    { type: "function" as const, function: { name: "delete_campaign", description: "Delete a campaign (contacts are preserved)", parameters: { type: "object", properties: { campaign_id: { type: "string" } }, required: ["campaign_id"] } } },
    { type: "function" as const, function: { name: "merge_campaigns", description: "Move ALL contacts from one campaign into another, then optionally delete the source. Use to consolidate duplicate campaigns.", parameters: { type: "object", properties: { source_campaign_id: { type: "string", description: "Campaign to merge FROM (its contacts will move to target)" }, target_campaign_id: { type: "string", description: "Campaign to merge INTO" }, delete_source: { type: "boolean", description: "Delete the source campaign after merging (default: true)" } }, required: ["source_campaign_id", "target_campaign_id"] } } },
    // ===== CONTACT MANAGEMENT =====
    { type: "function" as const, function: { name: "assign_contacts_to_campaign", description: "Bulk-assign unassigned contacts (or all user contacts) to a campaign. Use before score_contacts when contacts have no campaign.", parameters: { type: "object", properties: { campaign_id: { type: "string", description: "Target campaign ID to assign contacts to" }, only_unassigned: { type: "boolean", description: "Only assign contacts that currently have no campaign (default: true)" } }, required: ["campaign_id"] } } },
    { type: "function" as const, function: { name: "delete_contacts", description: "Delete contacts by IDs, by status, or all contacts in a campaign", parameters: { type: "object", properties: { contact_ids: { type: "array", items: { type: "string" }, description: "Specific contact IDs to delete" }, status: { type: "string", description: "Delete all contacts with this status (e.g. TO_CONTACT, UNRESPONSIVE)" }, campaign_id: { type: "string", description: "Delete all contacts in this campaign" }, confirm: { type: "boolean", description: "Must be true to execute bulk deletes" } } } } },
    { type: "function" as const, function: { name: "update_contact_status", description: "Update status of contacts — by ID list, or bulk by campaign + optional fit filter. Use to disqualify LOW fit contacts, reactivate stalled ones, or clean the pipeline without deleting.", parameters: { type: "object", properties: { contact_ids: { type: "array", items: { type: "string" }, description: "Specific contact IDs to update" }, status: { type: "string", enum: ["TO_CONTACT","INVITED","CONNECTED","FOLLOWED_UP","REPLIED","MEETING_BOOKED","UNRESPONSIVE","DISQUALIFIED"], description: "New status to assign" }, reason: { type: "string", description: "Reason for the change (logged, not written to contact)" }, campaign_id: { type: "string", description: "Bulk-update all contacts in this campaign (combine with fit_filter)" }, fit_filter: { type: "string", enum: ["HIGH","MEDIUM","LOW"], description: "Only update contacts with this fit score (requires campaign_id)" } }, required: ["status"] } } },
    // ===== SELF-HEALING =====
    { type: "function" as const, function: { name: "diagnose_and_fix", description: "Diagnose an error from a failed tool, attempt auto-fix, and provide clear instructions. Call this when any tool returns success:false.", parameters: { type: "object", properties: { error_message: { type: "string", description: "The error message from the failed tool" }, failed_tool: { type: "string", description: "Name of the tool that failed" }, context: { type: "string", description: "Additional context about what was being attempted" } }, required: ["error_message", "failed_tool"] } } },
    { type: "function" as const, function: { name: "check_system_health", description: "Pre-flight check: verify OpenRouter, Unipile/LinkedIn, rate limits, and campaign config are all working before executing tasks", parameters: { type: "object", properties: {} } } },
  ];
}

export type ProgressCallback = (message: string) => void;

export async function executeTool(name: string, args: Record<string, unknown>, userId: string, onProgress?: ProgressCallback): Promise<ToolResult> {
  const progress = (msg: string) => {
    setAgentStatus(userId, msg);
    if (onProgress) onProgress(msg);
  };
  const settings = await getUserSettings(userId);

  switch (name) {
    // ===== READ TOOLS =====
    case "get_pipeline_stats": {
      const statuses = ["TO_CONTACT","INVITED","CONNECTED","FOLLOWED_UP","REPLIED","MEETING_BOOKED","UNRESPONSIVE"];
      const counts: Record<string, number> = {};
      for (const s of statuses) counts[s] = await prisma.contact.count({ where: { userId, status: s } });
      const total = await prisma.contact.count({ where: { userId } });
      return { success: true, data: { total, ...counts }, message: `Pipeline: ${total} total | ${counts.TO_CONTACT} to contact | ${counts.INVITED} invited | ${counts.CONNECTED} connected | ${counts.FOLLOWED_UP} followed up | ${counts.REPLIED} replied | ${counts.MEETING_BOOKED} meetings` };
    }

    case "search_contacts": {
      const where: Record<string, unknown> = { userId };
      if (args.status) where.status = args.status;
      if (args.fit) where.profileFit = args.fit;
      if (args.query) where.OR = [{ name: { contains: args.query as string } }, { company: { contains: args.query as string } }, { position: { contains: args.query as string } }];
      const contacts = await prisma.contact.findMany({ where, take: (args.limit as number) || 10, orderBy: { createdAt: "desc" } });
      return { success: true, data: contacts.map(c => ({ name: c.name, position: c.position, company: c.company, fit: c.profileFit, status: c.status, degree: c.connectionDegree, url: c.linkedinUrl })), message: `Found ${contacts.length} contacts` };
    }

    case "get_recent_activity": {
      const logs = await prisma.executionLog.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: (args.limit as number) || 15, select: { action: true, request: true, success: true, createdAt: true } });
      return { success: true, data: logs, message: `${logs.length} recent activities` };
    }

    case "get_performance": {
      const total = await prisma.contact.count({ where: { userId } });
      const sent = await prisma.inviteBatchItem.count({ where: { batch: { userId }, sent: true } });
      const connected = await prisma.contact.count({ where: { userId, status: { in: ["CONNECTED","FOLLOWED_UP","REPLIED","MEETING_BOOKED"] } } });
      const replied = await prisma.contact.count({ where: { userId, status: { in: ["REPLIED","MEETING_BOOKED"] } } });
      const meetings = await prisma.contact.count({ where: { userId, status: "MEETING_BOOKED" } });
      const acceptRate = sent > 0 ? Math.round(connected / sent * 100) : 0;
      const replyRate = connected > 0 ? Math.round(replied / connected * 100) : 0;
      return { success: true, data: { total, sent, connected, replied, meetings, acceptRate, replyRate }, message: `Sent ${sent} invites | ${connected} accepted (${acceptRate}%) | ${replied} replied (${replyRate}%) | ${meetings} meetings` };
    }

    case "prioritize_pipeline_by_expected_value": {
      const result = await prioritizePipelineByExpectedValue(userId, {
        campaignId: (args.campaign_id as string) || null,
        limit: (args.limit as number) || 10,
        includeReasons: args.include_reasons !== false,
      });
      return { success: true, data: result.priorities, message: result.message };
    }

    case "build_account_map": {
      const result = await buildAccountMap(userId, {
        campaignId: (args.campaign_id as string) || null,
        company: (args.company as string) || null,
        limit: (args.limit as number) || 10,
      });
      return { success: true, data: result.accounts, message: result.message };
    }

    case "draft_reply_strategy": {
      const result = await draftReplyStrategy(userId, {
        contactId: (args.contact_id as string) || null,
        campaignId: (args.campaign_id as string) || null,
        messageText: (args.message_text as string) || null,
      });
      return { success: true, data: result.result, message: result.message };
    }

    case "run_message_experiment": {
      const result = await runMessageExperiment(userId, {
        campaignId: args.campaign_id as string,
        experimentGoal: (args.experiment_goal as string) || null,
        audienceFilter: (args.audience_filter as string) || null,
        variantCount: (args.variant_count as number) || 3,
      });
      if (!result.experiment) return { success: false, message: result.message };
      return { success: true, data: result.experiment, message: result.message };
    }

    case "reactivate_stale_pipeline": {
      const result = await reactivateStalePipeline(userId, {
        campaignId: (args.campaign_id as string) || null,
        daysStale: (args.days_stale as number) || 21,
        limit: (args.limit as number) || 10,
      });
      return { success: true, data: result.contacts, message: result.message };
    }

    case "prepare_meeting_brief": {
      const contactId = args.contact_id as string | undefined;
      if (!contactId) return { success: false, message: "contact_id is required" };
      const result = await prepareMeetingBrief(userId, contactId);
      if (!result.brief) return { success: false, message: result.message };
      return { success: true, data: result.brief, message: result.message };
    }

    case "list_message_experiments": {
      const experiments = await listMessageExperiments(userId, (args.campaign_id as string) || null);
      return { success: true, data: experiments, message: experiments.length === 0 ? "No message experiments saved yet." : `Found ${experiments.length} saved experiment${experiments.length > 1 ? "s" : ""}.` };
    }

    // ===== KNOWLEDGE TOOLS =====
    case "learn": {
      await prisma.agentKnowledge.create({ data: { userId, category: args.category as string, content: args.content as string, source: "user_feedback" } });
      await logActivity(userId, "agent_learn", { level: "info", message: `Learned [${args.category}]: ${(args.content as string).substring(0, 100)}` });
      return { success: true, message: `Saved to knowledge base: [${args.category}] ${args.content}` };
    }

    case "get_knowledge": {
      const knowledge = await prisma.agentKnowledge.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 });
      if (knowledge.length === 0) return { success: true, message: "No knowledge accumulated yet." };
      const formatted = knowledge.map(k => `[${k.category}] ${k.content}`).join("\n");
      return { success: true, data: knowledge, message: formatted };
    }

    // ===== EXECUTION TOOLS =====
    case "discover_prospects": {
      const linkedin = settings ? createLinkedIn(settings) : null;
      if (!linkedin) return { success: false, message: "Unipile not configured. Go to Settings." };

      // Rate limit check — auto-wait if too fast
      const searchCheck = await canPerformAction(userId, "search");
      if (!searchCheck.allowed && searchCheck.waitMs && searchCheck.waitMs < 30000) {
        progress(`Waiting ${Math.ceil(searchCheck.waitMs / 1000)}s before searching...`);
        await new Promise(r => setTimeout(r, (searchCheck.waitMs || 20000) + 2000));
      } else if (!searchCheck.allowed) {
        return { success: false, message: `Search blocked: ${searchCheck.reason}` };
      }

      const keywords = (args.job_title as string) || "CEO fintech";
      const location = (args.location as string) || undefined;

      // Validate campaign_id — resolve name to ID if needed
      let campaignId = (args.campaign_id as string) || null;
      if (campaignId) {
        const campExists = await prisma.campaign.findFirst({ where: { id: campaignId, userId } });
        if (!campExists) {
          // Maybe LLM passed the name instead of ID — try to find by name
          const campByName = await prisma.campaign.findFirst({ where: { userId, name: { contains: campaignId } } });
          if (campByName) {
            campaignId = campByName.id;
          } else {
            // Inject the actual valid campaign list so LLM can immediately retry with correct ID
            const allCamps = await prisma.campaign.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: { createdAt: "desc" } });
            const campList = allCamps.length > 0
              ? allCamps.map(c => `"${c.name}" → ID: ${c.id}`).join(" | ")
              : "No campaigns exist yet — create one first with create_campaign.";
            return { success: false, message: `Campaign "${campaignId}" not found (stale or wrong ID). Valid campaigns: [${campList}]. Use one of these IDs directly — do NOT call list_campaigns again, just retry with the correct ID.` };
          }
        }
      }

      progress(`Searching LinkedIn: "${keywords}"...`);
      await logActivity(userId, "linkedin_search", { level: "info", message: `Searching: "${keywords}"${location ? ` in ${location}` : ""}` });

      try {
        const results = await linkedin.searchPeople(keywords, { location });
        const items = results?.items || [];

        if (items.length === 0) {
          return { success: true, message: "No results found. Try different keywords." };
        }

        progress(`Found ${items.length} profiles. Saving...`);

        let created = 0, skipped = 0, connected1st = 0;
        for (const p of items) {
          const url = (p.public_profile_url || p.profile_url || "").toLowerCase().replace(/\/$/, "").split("?")[0];
          if (!url.includes("linkedin.com/in/")) { skipped++; continue; }
          const slug = p.public_identifier || url.match(/linkedin\.com\/in\/([^/?]+)/i)?.[1] || null;
          const providerId = p.member_urn || p.id || null;

          const degree = p.network_distance || null; // DISTANCE_1, DISTANCE_2, DISTANCE_3
          const result = await createContactSafe(userId, {
            name: p.name || "Unknown",
            position: p.headline || null,
            company: null,
            linkedinUrl: url,
            linkedinSlug: slug,
            linkedinProfileId: providerId,
            connectionDegree: degree,
            source: "unipile",
            campaignId: campaignId,
          });
          if (result.created) {
            created++;
            if (degree === "DISTANCE_1") connected1st++;
          } else skipped++;
        }

        await logActivity(userId, "linkedin_search", { level: "success", message: `Found ${items.length}, saved ${created} new (${connected1st} already connected, ${skipped} skipped)`, success: true });
        return { success: true, data: { total: items.length, created, skipped, connected1st }, message: `Found ${items.length} profiles. Saved ${created} new contacts${connected1st > 0 ? ` (${connected1st} already connected — marked as CONNECTED)` : ""}${skipped > 0 ? ` (${skipped} duplicates skipped)` : ""}.` };
      } catch (e) {
        const errMsg = (e as Error).message;
        await logActivity(userId, "linkedin_search", {
          level: "error",
          message: `Search failed: ${errMsg}`,
          request: { keywords, location: location || "any", count: args.count || 25, campaign_id: args.campaign_id || null },
          success: false,
          errorCode: errMsg.substring(0, 50),
        });
        return { success: false, message: `Search failed: ${errMsg}` };
      }
    }

    case "score_contacts": {
      if (!settings?.openrouterApiKey) return { success: false, message: "OpenRouter not configured." };
      progress("Loading unscored contacts...");

      // Hard cap: max 15 per call to avoid Vercel timeout (each takes ~2-5s LLM call)
      const SCORE_MAX = 15;
      const requestedLimit = (args.limit as number) || 10;
      const effectiveLimit = Math.min(requestedLimit, SCORE_MAX);

      const totalUnscored = await prisma.contact.count({ where: { userId, fitRationale: null } });
      const allUnscored = await prisma.contact.findMany({ where: { userId, fitRationale: null }, take: effectiveLimit });
      if (allUnscored.length === 0) return { success: true, message: "All contacts are already scored." };

      // Separate contacts with and without campaign assignment
      const skippedNoCampaign = allUnscored.filter(c => !c.campaignId);
      const contacts = allUnscored.filter(c => c.campaignId);

      // If ALL contacts are unassigned, surface a clear fix instead of a silent block
      if (contacts.length === 0) {
        const allCamps = await prisma.campaign.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: { createdAt: "desc" } });
        const campList = allCamps.map(c => `"${c.name}" → ${c.id}`).join(" | ");
        return { success: false, message: `All ${skippedNoCampaign.length} unscored contacts have no campaign assigned. Fix: call assign_contacts_to_campaign with campaign_id. Available campaigns: [${campList}]` };
      }

      // Build a cache of campaign ICP definitions (fallback to generic if ICP not set)
      const campaignIcpCache = new Map<string, string | null>();
      const campaignIds = [...new Set(contacts.map(c => c.campaignId).filter(Boolean))];
      for (const cid of campaignIds) {
        const camp = await prisma.campaign.findFirst({ where: { id: cid!, userId } });
        campaignIcpCache.set(cid!, camp?.icpDefinition || null);
      }

      // Log warning for campaigns without ICP, but don't block — use generic scoring
      const noIcpCamps = campaignIds.filter(cid => !campaignIcpCache.get(cid!));
      if (noIcpCamps.length > 0) {
        progress(`Warning: ${noIcpCamps.length} campaign(s) have no ICP defined. Using general scoring.`);
      }

      const GENERIC_ICP = "Evaluate this professional as a potential B2B outreach contact. Score HIGH if they are a senior decision-maker (C-suite, VP, Director) at a relevant company. Score MEDIUM if they could be valuable but aren't a direct decision-maker. Score LOW if they are unlikely to be a relevant contact.";

      const results = [];
      const startTime = Date.now();
      for (const c of contacts) {
        // Time guard: bail if approaching 80s to leave room for the LLM final response
        if (Date.now() - startTime > 80000) {
          progress(`Time limit approaching. Stopping after ${results.length} contacts.`);
          break;
        }

        const text = [`Name: ${c.name}`, c.position && `Position: ${c.position}`, c.company && `Company: ${c.company}`].filter(Boolean).join("\n");
        try {
          progress(`Scoring ${c.name} (${results.length + 1}/${contacts.length})...`);
          const campaignIcp = c.campaignId ? (campaignIcpCache.get(c.campaignId) || GENERIC_ICP) : GENERIC_ICP;
          const icpPrompt = getIcpScoringPrompt(campaignIcp);
          const resp = await callLLM(icpPrompt, text, settings.openrouterApiKey, settings.preferredModel);
          const parsed = JSON.parse(resp.trim());
          await prisma.contact.update({ where: { id: c.id }, data: { profileFit: parsed.fit || "MEDIUM", fitRationale: parsed.rationale || null } });
          results.push(`${c.name}: ${parsed.fit} — ${parsed.rationale}`);
        } catch { results.push(`${c.name}: scoring failed`); }
      }

      const remaining = totalUnscored - results.length;
      const skippedMsg = skippedNoCampaign.length > 0 ? ` (${skippedNoCampaign.length} skipped — no campaign assigned; call assign_contacts_to_campaign to fix)` : "";
      await logActivity(userId, "score_contact", { level: "success", message: `Scored ${results.length} contacts (${remaining} remaining)` });
      return { success: true, data: results, message: `Scored ${results.length} contacts${skippedMsg}:\n${results.join("\n")}${remaining > 0 ? `\n\n${remaining} contacts still unscored. Call score_contacts again to continue.` : ""}` };
    }

    case "prepare_invites": {
      if (!settings?.openrouterApiKey) return { success: false, message: "OpenRouter not configured." };
      progress("Preparing personalized invite messages via LLM...");
      // Hard cap: max 10 per call to avoid Vercel timeout
      const PREPARE_MAX = 10;
      const maxBatch = Math.min((args.count as number) || 10, PREPARE_MAX);

      // Validate campaign_id — resolve name to ID if needed
      let prepCampaignId = args.campaign_id as string | undefined;
      if (prepCampaignId) {
        const campCheck = await prisma.campaign.findFirst({ where: { id: prepCampaignId, userId } });
        if (!campCheck) {
          const campByName = await prisma.campaign.findFirst({ where: { userId, name: { contains: prepCampaignId } } });
          if (campByName) { prepCampaignId = campByName.id; }
          else { return { success: false, message: `Campaign "${prepCampaignId}" not found. Use list_campaigns to see IDs.` }; }
        }
      }

      // Filter by campaign if provided, prioritize HIGH → MEDIUM → LOW
      const contactWhere: Record<string, unknown> = { userId, status: "TO_CONTACT" };
      if (prepCampaignId) contactWhere.campaignId = prepCampaignId;

      const allReady = await prisma.contact.findMany({ where: contactWhere, orderBy: { createdAt: "asc" } });

      // Sort by fit priority: HIGH first, then MEDIUM, then LOW, then unscored
      const fitOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      allReady.sort((a, b) => (fitOrder[a.profileFit || ""] ?? 3) - (fitOrder[b.profileFit || ""] ?? 3));
      const contacts = allReady.slice(0, maxBatch);

      if (contacts.length === 0) return { success: true, message: `No contacts ready for invites${prepCampaignId ? " in this campaign" : ""}. Discover and score prospects first.` };

      // Load campaign context for each contact's campaign
      const campCache = new Map<string, CampaignContext>();
      const userName = (await prisma.user.findUnique({ where: { id: userId } }))?.name || "the outreach team";
      const batch = await prisma.inviteBatch.create({ data: { userId } });
      const items = [];
      const prepStartTime = Date.now();

      for (const c of contacts) {
        // Time guard
        if (Date.now() - prepStartTime > 80000) {
          progress(`Time limit approaching. Prepared ${items.length} invites so far.`);
          break;
        }
        const userPrompt = [`Name: ${c.name}`, c.position && `Position: ${c.position}`, c.company && `Company: ${c.company}`, c.fitRationale && `Fit: ${c.fitRationale}`].filter(Boolean).join("\n");
        let msg = "";
        let campCtx: CampaignContext = { userName, campaignName: "Outreach" };
        if (c.campaignId) {
          if (!campCache.has(c.campaignId)) {
            const camp = await prisma.campaign.findFirst({ where: { id: c.campaignId, userId } });
            if (camp) campCache.set(c.campaignId, { userName, campaignName: camp.name, campaignDescription: camp.description || undefined, strategyNotes: camp.strategyNotes || undefined, calendarUrl: camp.calendarUrl || undefined });
          }
          campCtx = campCache.get(c.campaignId) || campCtx;
        }
        try {
          const systemPrompt = getConnectionNotePrompt(campCtx);
          msg = (await callLLM(systemPrompt, userPrompt, settings.openrouterApiKey, settings.preferredModel, { temperature: 0.8, maxTokens: 200 })).trim().substring(0, 200);
        } catch {
          msg = `${c.name.split(" ")[0]} — would love to connect about ${campCtx.campaignName}. Open to a quick chat?`.substring(0, 200);
        }
        await prisma.inviteBatchItem.create({ data: { batchId: batch.id, contactId: c.id, draftMessage: msg, approved: true } });
        items.push({ name: c.name, company: c.company, fit: c.profileFit, message: msg });
      }

      await logActivity(userId, "prepare_invites", { level: "success", message: `Prepared ${items.length} invite drafts (batch ${batch.id})` });
      const preview = items.map((it, i) => `${i + 1}. **${it.name}** (${it.company || "?"}) [${it.fit}]\n   "${it.message}"`).join("\n\n");
      return { success: true, data: { batchId: batch.id, count: items.length }, message: `Prepared ${items.length} invites (batch: ${batch.id}):\n\n${preview}\n\nSay "send them" or "send invites batch ${batch.id}" to send.` };
    }

    case "send_invites": {
      const batchId = args.batch_id as string;
      if (!batchId) return { success: false, message: "Batch ID required." };
      const linkedin = settings ? createLinkedIn(settings) : null;
      if (!linkedin) return { success: false, message: "Unipile not configured." };

      const items = await prisma.inviteBatchItem.findMany({ where: { batchId, approved: true, sent: false, batch: { userId } }, include: { batch: true } });
      if (items.length === 0) return { success: true, message: "No pending invites in this batch." };

      // Pre-send warning: TO_CONTACT in our DB doesn't guarantee no prior LinkedIn invite
      progress(`Sending ${items.length} invite(s)...`);

      let sent = 0, failed = 0, blocked = 0;
      for (const item of items) {
        // Check rate limits before each invite — auto-wait if cooldown is short enough
        let rateCheck = await canPerformAction(userId, "invite");
        if (!rateCheck.allowed && rateCheck.waitMs && rateCheck.waitMs <= 360000) {
          // Cooldown ≤ 6 minutes — auto-wait and retry
          const waitSec = Math.ceil(rateCheck.waitMs / 1000);
          progress(`⏱️ Cooldown active. Auto-waiting ${waitSec}s...`);
          await logActivity(userId, "send_invite", { level: "info", message: `Auto-waiting ${waitSec}s for cooldown to expire` });
          await new Promise(r => setTimeout(r, rateCheck.waitMs! + 2000)); // Wait + 2s buffer
          rateCheck = await canPerformAction(userId, "invite"); // Re-check
        }
        if (!rateCheck.allowed) {
          // Still blocked after waiting (daily/weekly limit, not just cooldown)
          progress(`Rate limit: ${rateCheck.reason}`);
          await logActivity(userId, "send_invite", { level: "warning", message: `Stopped: ${rateCheck.reason}`, success: true });
          const remaining = items.length - sent - failed - blocked;
          return { success: true, data: { sent, failed, blocked: remaining, batchId }, message: `Sent ${sent} invites, then stopped: ${rateCheck.reason}. ${remaining} remaining in batch ${batchId}.` };
        }

        const contact = await prisma.contact.findUnique({ where: { id: item.contactId } });
        if (!contact) continue;

        // Check per-contact limits
        const contactCheck = await canInviteContact(userId, contact.id);
        if (!contactCheck.allowed) {
          await prisma.inviteBatchItem.update({ where: { id: item.id }, data: { sent: true, sendResult: `skipped: ${contactCheck.reason}` } });
          blocked++;
          continue;
        }

        // Cross-user dedup: check if another user already contacted this person
        if (contact.linkedinUrl) {
          const globalCheck = await checkGlobalDuplicate(contact.linkedinUrl, userId);
          if (globalCheck.contacted) {
            await prisma.inviteBatchItem.update({ where: { id: item.id }, data: { sent: true, sendResult: `skipped: already contacted by ${globalCheck.by?.userName}` } });
            progress(`Skipped ${contact.name}: already contacted by ${globalCheck.by?.userName} (${globalCheck.by?.status})`);
            await logActivity(userId, "send_invite", { level: "warning", message: `${contact.name}: skipped — already ${globalCheck.by?.status} by ${globalCheck.by?.userName}`, contactId: contact.id, success: true });
            blocked++;
            continue;
          }
        }

        // Get Unipile provider_id — must be Unipile's format, NOT LinkedIn URN
        let providerId = contact.linkedinProfileId || "";
        const isUrn = providerId.startsWith("urn:") || providerId.includes("member:");
        const needsLookup = !providerId || isUrn;

        if (needsLookup) {
          // Look up via Unipile to get correct provider_id
          const lookupId = contact.linkedinSlug || providerId;
          if (lookupId) {
            try {
              const profile = await linkedin.getProfile(lookupId);
              const newId = profile?.provider_id || profile?.id || "";
              if (newId && !newId.startsWith("urn:")) {
                providerId = newId;
                await prisma.contact.update({ where: { id: contact.id }, data: { linkedinProfileId: providerId } });
              }
            } catch {
              // If lookup fails and we only have a URN, we can't send
              if (isUrn) {
                await prisma.inviteBatchItem.update({ where: { id: item.id }, data: { sent: true, sendResult: "failed: could not resolve LinkedIn profile ID" } });
                await logActivity(userId, "send_invite", { level: "error", message: `Cannot resolve profile for ${contact.name} (stored: ${providerId.substring(0, 40)})`, contactId: contact.id, success: false });
                failed++;
                continue;
              }
            }
          }
        }
        if (!providerId || providerId.startsWith("urn:")) { failed++; continue; }

        try {
          progress(`Sending invite to ${contact.name}...`);
          await linkedin.sendInvitation(providerId, (item.editedMessage || item.draftMessage).substring(0, 200));
          await prisma.inviteBatchItem.update({ where: { id: item.id }, data: { sent: true, sentAt: new Date(), sendResult: "success" } });
          await prisma.contact.update({ where: { id: contact.id }, data: { status: "INVITED", inviteSentDate: new Date(), connectionMessage: item.editedMessage || item.draftMessage } });
          sent++;
          await logActivity(userId, "send_invite", { level: "success", message: `Invite sent to ${contact.name}`, contactId: contact.id });

          // Human-like delay between invites (45s ± 20%)
          if (sent < items.length) {
            progress(`✓ Sent ${sent}/${items.length}. Waiting 45s before next...`);
            await humanDelay(45000);
          }
        } catch (e) {
          const errMsg = (e as Error).message;

          // 422 "Cannot resend" — LinkedIn already has a pending invite for this contact
          // This is NOT a rate limit — do NOT log with errorCode (would trigger cooldown)
          if (errMsg.includes("422") || errMsg.includes("Cannot resend") || errMsg.includes("already")) {
            blocked++;
            await prisma.inviteBatchItem.update({ where: { id: item.id }, data: { sent: true, sendResult: "skipped: already invited on LinkedIn" } });
            // Mark as INVITED since LinkedIn already has the pending invite
            await prisma.contact.update({ where: { id: contact.id }, data: { status: "INVITED", inviteSentDate: new Date() } });
            await logActivity(userId, "send_invite", { level: "warning", message: `${contact.name}: Already has pending LinkedIn invite (422). Marked as INVITED.`, contactId: contact.id, success: true }); // success: true to NOT trigger cooldown
            continue;
          }

          // Real failure — log with errorCode (may trigger cooldown)
          failed++;
          await prisma.inviteBatchItem.update({ where: { id: item.id }, data: { sent: true, sendResult: `failed: ${errMsg.substring(0, 100)}` } });
          await logActivity(userId, "send_invite", { level: "error", message: `Failed: ${contact.name} — ${errMsg}`, success: false, errorCode: errMsg.substring(0, 50) });

          // If it's a rate limit error, stop immediately
          if (errMsg.includes("429") || errMsg.includes("rate") || errMsg.includes("limit") || errMsg.includes("restrict")) {
            await logActivity(userId, "send_invite", { level: "error", message: `RATE LIMIT DETECTED — stopping all sends. ${sent} sent, ${items.length - sent - failed} remaining.`, success: false, errorCode: "rate_limit" });
            return { success: false, message: `Rate limit detected after ${sent} invites. Stopped to protect your account. ${items.length - sent - failed} remaining — try again later.` };
          }
        }
      }

      return { success: true, data: { sent, failed, blocked, batchId }, message: `Sent ${sent} invites${failed > 0 ? `, ${failed} failed` : ""}${blocked > 0 ? `, ${blocked} skipped (already contacted or prior LinkedIn invite)` : ""}.` };
    }

    case "check_connections_and_inbox": {
      const linkedin = settings ? createLinkedIn(settings) : null;
      const results: string[] = [];

      // Check connections
      const invited = await prisma.contact.findMany({ where: { userId, status: "INVITED" } });
      if (invited.length > 0 && linkedin) {
        try {
          const chats = await linkedin.getChats(100);
          const attendeeIds = new Set<string>();
          for (const chat of (chats?.items || [])) {
            for (const att of (chat?.attendees || [])) {
              if (att?.provider_id) attendeeIds.add(att.provider_id);
            }
          }
          let newConns = 0;
          for (const c of invited) {
            if (c.linkedinProfileId && attendeeIds.has(c.linkedinProfileId)) {
              await prisma.contact.update({ where: { id: c.id }, data: { status: "CONNECTED", connectedDate: new Date() } });
              newConns++;
            }
          }
          results.push(`Connections: ${newConns} new (checked ${invited.length} pending)`);
        } catch (e) { results.push(`Connection check error: ${(e as Error).message}`); }
      } else {
        results.push(`Connections: ${invited.length} pending (${linkedin ? "checked" : "Unipile not configured"})`);
      }

      // Scan inbox for replies
      if (linkedin) {
        try {
          const chats = await linkedin.getChats(50);
          const tracked = await prisma.contact.findMany({ where: { userId, status: { in: ["CONNECTED","FOLLOWED_UP"] }, linkedinProfileId: { not: null } } });
          const trackedMap = new Map(tracked.map(c => [c.linkedinProfileId!, c]));
          let replies = 0;
          for (const chat of (chats?.items || [])) {
            for (const att of (chat?.attendees || [])) {
              const contact = trackedMap.get(att?.provider_id);
              if (contact && chat.last_message?.sender_id !== settings?.unipileAccountId) {
                await prisma.contact.update({ where: { id: contact.id }, data: { status: "REPLIED" } });
                replies++;
              }
            }
          }
          results.push(`Inbox: ${replies} new replies detected`);
        } catch (e) { results.push(`Inbox scan error: ${(e as Error).message}`); }
      }

      await logActivity(userId, "check_connections_and_inbox", { level: "success", message: results.join(" | ") });
      return { success: true, message: results.join("\n") };
    }

    case "send_followups": {
      if (!settings?.openrouterApiKey) return { success: false, message: "OpenRouter not configured." };
      const linkedin = settings ? createLinkedIn(settings) : null;
      if (!linkedin) return { success: false, message: "Unipile not configured." };

      // Rate limit check
      const msgCheck = await canPerformAction(userId, "message");
      if (!msgCheck.allowed) return { success: false, message: `Follow-ups blocked: ${msgCheck.reason}` };

      const delayDays = settings.followupDelayDays || 3;
      const cutoff = new Date(Date.now() - delayDays * 24 * 60 * 60 * 1000);
      const due = await prisma.contact.findMany({ where: { userId, status: "CONNECTED", connectedDate: { lte: cutoff }, followupSentDate: null } });
      if (due.length === 0) return { success: true, message: "No contacts due for follow-up." };

      const fUserName = (await prisma.user.findUnique({ where: { id: userId } }))?.name || "the outreach team";
      const fCampCache = new Map<string, CampaignContext>();
      let sent = 0;
      let skippedFollowup = 0;
      for (const c of due) {
        // Per-contact check
        const fCheck = await canFollowupContact(userId, c.id);
        if (!fCheck.allowed) { skippedFollowup++; continue; }

        // Rate limit check before each message
        const mCheck = await canPerformAction(userId, "message");
        if (!mCheck.allowed) {
          return { success: true, message: `Sent ${sent} follow-ups, then stopped: ${mCheck.reason}` };
        }

        const userPrompt = [`Name: ${c.name}`, c.position && `Position: ${c.position}`, c.company && `Company: ${c.company}`].filter(Boolean).join("\n");
        try {
          progress(`Sending follow-up to ${c.name}...`);
          let fCtx: CampaignContext = { userName: fUserName, campaignName: "Outreach" };
          if (c.campaignId) {
            if (!fCampCache.has(c.campaignId)) {
              const camp = await prisma.campaign.findFirst({ where: { id: c.campaignId, userId } });
              if (camp) fCampCache.set(c.campaignId, { userName: fUserName, campaignName: camp.name, campaignDescription: camp.description || undefined, calendarUrl: camp.calendarUrl || settings.calendarBookingUrl || undefined });
            }
            fCtx = fCampCache.get(c.campaignId) || fCtx;
          }
          const fPrompt = getFollowupPrompt(fCtx);
          const msg = (await callLLM(fPrompt, userPrompt, settings.openrouterApiKey, settings.preferredModel, { temperature: 0.7, maxTokens: 300 })).trim();
          await linkedin.sendMessage([c.linkedinProfileId!], msg);
          await prisma.contact.update({ where: { id: c.id }, data: { status: "FOLLOWED_UP", followupSentDate: new Date() } });
          sent++;
          await logActivity(userId, "send_followup", { level: "success", message: `Follow-up sent to ${c.name}` });

          // Human delay between messages
          if (sent < due.length) await humanDelay(30000);
        } catch (e) {
          const errMsg = (e as Error).message;
          await logActivity(userId, "send_followup", { level: "error", message: `Failed: ${c.name} — ${errMsg}`, success: false, errorCode: errMsg.substring(0, 50) });
          if (errMsg.includes("429") || errMsg.includes("rate")) {
            return { success: false, message: `Rate limit after ${sent} follow-ups. Stopped to protect account.` };
          }
        }
      }
      return { success: true, message: `Sent ${sent}/${due.length} follow-ups${skippedFollowup > 0 ? ` (${skippedFollowup} skipped)` : ""}.` };
    }

    case "run_full_cycle": {
      const r1 = await executeTool("check_connections_and_inbox", {}, userId);
      const r2 = await executeTool("send_followups", {}, userId);
      return { success: true, message: `Daily cycle complete:\n• ${r1.message}\n• ${r2.message}` };
    }

    case "get_usage_limits": {
      const usage = await getUsageSummary(userId);
      return {
        success: true,
        data: usage,
        message: `LinkedIn usage:\n• Invites: ${usage.invites.today}/${usage.invites.todayLimit} today, ${usage.invites.week}/${usage.invites.weekLimit} this week\n• Messages: ${usage.messages.today}/${usage.messages.todayLimit} today\n• Searches: ${usage.searches.today}/${usage.searches.todayLimit} today`,
      };
    }

    // ===== CAMPAIGN MANAGEMENT =====
    case "create_campaign": {
      const campaign = await prisma.campaign.create({
        data: {
          userId,
          name: (args.name as string) || "New Campaign",
          description: (args.description as string) || null,
          icpDefinition: (args.icpDefinition as string) || null,
          strategyNotes: (args.strategyNotes as string) || null,
          calendarUrl: (args.calendarUrl as string) || null,
        },
      });
      await logActivity(userId, "create_campaign", { level: "success", message: `Created campaign: ${campaign.name}` });
      return { success: true, data: { id: campaign.id, name: campaign.name }, message: `Campaign "${campaign.name}" created (ID: ${campaign.id}). You can configure it further in the sidebar.` };
    }

    case "list_campaigns": {
      const campaigns = await prisma.campaign.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
      if (campaigns.length === 0) return { success: true, message: "No campaigns yet. Create one with create_campaign." };
      const list = await Promise.all(campaigns.map(async c => {
        const contacts = await prisma.contact.count({ where: { userId, campaignId: c.id } });
        return `• **${c.name}** (${c.isActive ? "active" : "paused"}) — ${contacts} contacts${c.description ? ` — ${c.description.substring(0, 50)}` : ""}`;
      }));
      return { success: true, data: campaigns.map(c => ({ id: c.id, name: c.name, isActive: c.isActive })), message: `${campaigns.length} campaigns:\n${list.join("\n")}` };
    }

    case "update_campaign": {
      const cid = args.campaign_id as string;
      if (!cid) return { success: false, message: "campaign_id required" };
      const updates: Record<string, unknown> = {};
      if (args.name !== undefined) updates.name = args.name;
      if (args.description !== undefined) updates.description = args.description;
      if (args.icpDefinition !== undefined) updates.icpDefinition = args.icpDefinition;
      if (args.strategyNotes !== undefined) updates.strategyNotes = args.strategyNotes;
      if (args.calendarUrl !== undefined) updates.calendarUrl = args.calendarUrl;
      if (args.dailyInviteLimit !== undefined) updates.dailyInviteLimit = args.dailyInviteLimit;
      if (args.followupDelayDays !== undefined) updates.followupDelayDays = args.followupDelayDays;
      if (args.isActive !== undefined) updates.isActive = args.isActive;
      await prisma.campaign.updateMany({ where: { id: cid, userId }, data: updates });
      await logActivity(userId, "update_campaign", { level: "success", message: `Updated campaign ${cid}: ${Object.keys(updates).join(", ")}` });
      return { success: true, message: `Campaign updated: ${Object.keys(updates).join(", ")}` };
    }

    case "delete_campaign": {
      const did = args.campaign_id as string;
      if (!did) return { success: false, message: "campaign_id required" };
      const camp = await prisma.campaign.findFirst({ where: { id: did, userId } });
      if (!camp) return { success: false, message: "Campaign not found" };
      await prisma.campaign.deleteMany({ where: { id: did, userId } });
      await logActivity(userId, "delete_campaign", { level: "info", message: `Deleted campaign: ${camp.name}` });
      return { success: true, message: `Campaign "${camp.name}" deleted. Contacts preserved.` };
    }

    case "merge_campaigns": {
      const sourceId = args.source_campaign_id as string;
      const targetId = args.target_campaign_id as string;
      const deleteSource = args.delete_source !== false; // default true

      const allCamps = await prisma.campaign.findMany({ where: { userId }, select: { id: true, name: true } });
      const campMap = new Map(allCamps.map(c => [c.id, c.name]));

      // Resolve by name if needed
      const resolveId = async (raw: string) => {
        if (campMap.has(raw)) return raw;
        const byName = await prisma.campaign.findFirst({ where: { userId, name: { contains: raw } } });
        return byName?.id || null;
      };

      const resolvedSourceId = await resolveId(sourceId);
      const resolvedTargetId = await resolveId(targetId);

      if (!resolvedSourceId) {
        const list = allCamps.map(c => `"${c.name}" → ${c.id}`).join(" | ");
        return { success: false, message: `Source campaign "${sourceId}" not found. Available: [${list}]` };
      }
      if (!resolvedTargetId) {
        const list = allCamps.map(c => `"${c.name}" → ${c.id}`).join(" | ");
        return { success: false, message: `Target campaign "${targetId}" not found. Available: [${list}]` };
      }
      if (resolvedSourceId === resolvedTargetId) {
        return { success: false, message: "Source and target campaigns are the same." };
      }

      const sourceName = campMap.get(resolvedSourceId) || resolvedSourceId;
      const targetName = campMap.get(resolvedTargetId) || resolvedTargetId;

      const movedCount = await prisma.contact.count({ where: { userId, campaignId: resolvedSourceId } });
      await prisma.contact.updateMany({ where: { userId, campaignId: resolvedSourceId }, data: { campaignId: resolvedTargetId } });

      if (deleteSource) {
        await prisma.campaign.deleteMany({ where: { id: resolvedSourceId, userId } });
      }

      await logActivity(userId, "merge_campaigns", { level: "success", message: `Merged ${movedCount} contacts from "${sourceName}" into "${targetName}"${deleteSource ? " — source deleted" : ""}` });
      return { success: true, message: `Merged ${movedCount} contacts from "${sourceName}" into "${targetName}".${deleteSource ? ` Source campaign deleted.` : ""}` };
    }

    // ===== CONTACT MANAGEMENT =====
    case "assign_contacts_to_campaign": {
      const targetCampaignId = args.campaign_id as string;
      const onlyUnassigned = args.only_unassigned !== false; // default true

      // Resolve by name if ID not found
      let resolvedId = targetCampaignId;
      const campExists = await prisma.campaign.findFirst({ where: { id: targetCampaignId, userId } });
      if (!campExists) {
        const byName = await prisma.campaign.findFirst({ where: { userId, name: { contains: targetCampaignId } } });
        if (byName) {
          resolvedId = byName.id;
        } else {
          const allCamps = await prisma.campaign.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: { createdAt: "desc" } });
          const list = allCamps.map(c => `"${c.name}" → ${c.id}`).join(" | ");
          return { success: false, message: `Campaign "${targetCampaignId}" not found. Available campaigns: [${list}]` };
        }
      }

      const camp = await prisma.campaign.findFirst({ where: { id: resolvedId, userId } });
      const where = onlyUnassigned ? { userId, campaignId: null as unknown as string } : { userId };
      const count = await prisma.contact.count({ where });

      if (count === 0) {
        return { success: true, message: `No ${onlyUnassigned ? "unassigned " : ""}contacts to assign.` };
      }

      await prisma.contact.updateMany({ where, data: { campaignId: resolvedId } });
      await logActivity(userId, "assign_contacts", { level: "success", message: `Assigned ${count} contacts to campaign "${camp?.name}"` });
      return { success: true, message: `Assigned ${count} ${onlyUnassigned ? "previously unassigned " : ""}contacts to campaign "${camp?.name}". Now you can call score_contacts.` };
    }

    case "delete_contacts": {
      const contactIds = args.contact_ids as string[] | undefined;
      const statusFilter = args.status as string | undefined;
      const campaignIdFilter = args.campaign_id as string | undefined;
      const confirm = args.confirm as boolean;

      // Build description of what will be deleted
      let description = "";
      let count = 0;

      if (contactIds?.length) {
        count = contactIds.length;
        description = `${count} specific contacts`;
      } else if (campaignIdFilter) {
        count = await prisma.contact.count({ where: { userId, campaignId: campaignIdFilter } });
        const camp = await prisma.campaign.findFirst({ where: { id: campaignIdFilter, userId } });
        description = `all ${count} contacts in campaign "${camp?.name || campaignIdFilter}"`;
      } else if (statusFilter) {
        count = await prisma.contact.count({ where: { userId, status: statusFilter } });
        description = `all ${count} contacts with status ${statusFilter}`;
      } else {
        return { success: false, message: "Specify contact_ids, status, or campaign_id to delete." };
      }

      if (count === 0) return { success: true, message: "No contacts match the criteria." };

      // Require confirmation for bulk deletes
      if (!confirm) {
        return { success: false, message: `This will delete ${description}. Call again with confirm: true to proceed.` };
      }

      // Delete related batch items first
      if (contactIds?.length) {
        await prisma.inviteBatchItem.deleteMany({ where: { contactId: { in: contactIds } } });
        await prisma.contact.deleteMany({ where: { id: { in: contactIds }, userId } });
      } else if (campaignIdFilter) {
        const contacts = await prisma.contact.findMany({ where: { userId, campaignId: campaignIdFilter }, select: { id: true } });
        const ids = contacts.map(c => c.id);
        if (ids.length > 0) await prisma.inviteBatchItem.deleteMany({ where: { contactId: { in: ids } } });
        await prisma.contact.deleteMany({ where: { userId, campaignId: campaignIdFilter } });
      } else if (statusFilter) {
        const contacts = await prisma.contact.findMany({ where: { userId, status: statusFilter }, select: { id: true } });
        const ids = contacts.map(c => c.id);
        if (ids.length > 0) await prisma.inviteBatchItem.deleteMany({ where: { contactId: { in: ids } } });
        await prisma.contact.deleteMany({ where: { userId, status: statusFilter } });
      }

      await logActivity(userId, "delete_contacts", { level: "info", message: `Deleted ${description}` });
      return { success: true, message: `Deleted ${description}.` };
    }

    case "update_contact_status": {
      const contactIds = args.contact_ids as string[] | undefined;
      const status = args.status as string;
      const reason = args.reason as string | undefined;
      const campaignIdArg = args.campaign_id as string | undefined;
      const fitFilter = args.fit_filter as string | undefined;

      const validStatuses = ["TO_CONTACT","INVITED","CONNECTED","FOLLOWED_UP","REPLIED","MEETING_BOOKED","UNRESPONSIVE","DISQUALIFIED"];
      if (!validStatuses.includes(status)) {
        return { success: false, message: `Invalid status "${status}". Valid: ${validStatuses.join(", ")}` };
      }

      if (contactIds?.length) {
        progress(`Updating ${contactIds.length} contact(s) to ${status}...`);
        const updated = await prisma.contact.updateMany({ where: { id: { in: contactIds }, userId }, data: { status } });
        await logActivity(userId, "update_contact_status", { level: "info", message: `Updated ${updated.count} contacts to ${status}${reason ? ` — ${reason}` : ""}` });
        return { success: true, message: `Updated \`${updated.count}\` contact(s) to \`${status}\`.${reason ? ` Reason: ${reason}` : ""}` };
      }

      if (campaignIdArg) {
        const where: Record<string, unknown> = { userId, campaignId: campaignIdArg };
        if (fitFilter) where.profileFit = fitFilter;
        const count = await prisma.contact.count({ where });
        if (count === 0) return { success: true, message: "No contacts match the criteria." };
        progress(`Updating ${count} contact(s)${fitFilter ? ` (${fitFilter} fit)` : ""} to ${status}...`);
        await prisma.contact.updateMany({ where, data: { status } });
        const camp = await prisma.campaign.findFirst({ where: { id: campaignIdArg, userId }, select: { name: true } });
        const fitLabel = fitFilter ? ` with \`${fitFilter}\` fit` : "";
        await logActivity(userId, "update_contact_status", { level: "info", message: `Bulk updated ${count} contacts${fitLabel} in "${camp?.name}" to ${status}` });
        return { success: true, message: `Updated \`${count}\` contact(s)${fitLabel} in campaign "${camp?.name || campaignIdArg}" to \`${status}\`.${reason ? ` Reason: ${reason}` : ""}` };
      }

      return { success: false, message: "Provide `contact_ids` OR `campaign_id` (with optional `fit_filter`)." };
    }

    // ===== SELF-HEALING TOOLS =====
    case "diagnose_and_fix": {
      const errorMsg = (args.error_message as string) || "Unknown error";
      const failedTool = (args.failed_tool as string) || "unknown";
      const context = (args.context as string) || "";

      const result = await healError(errorMsg, failedTool, userId, context);
      const d = result.diagnosis;

      let message = `🔍 **Diagnosis** [${d.category.toUpperCase()}]\n${d.rootCause}`;
      if (result.fixApplied && result.fixResult) {
        message += `\n\n🔧 **Auto-fix applied:** ${result.fixResult}`;
      }
      if (d.userAction) {
        message += `\n\n👉 **Action needed:** ${d.userAction}`;
      }
      if (result.retryRecommended) {
        message += `\n\n🔄 Retry recommended.`;
      }

      return {
        success: true,
        data: { category: d.category, autoFixable: d.autoFixable, fixApplied: result.fixApplied, retryRecommended: result.retryRecommended },
        message,
      };
    }

    case "check_system_health": {
      const health = await checkSystemHealth(userId);
      const icon = health.overall === "healthy" ? "✅" : health.overall === "degraded" ? "⚠️" : "❌";
      const lines = health.checks.map(c => {
        const ci = c.status === "ok" ? "✅" : c.status === "warning" ? "⚠️" : "❌";
        return `${ci} **${c.service}**: ${c.message}`;
      });
      return {
        success: true,
        data: health,
        message: `${icon} System: **${health.overall.toUpperCase()}**\n\n${lines.join("\n")}`,
      };
    }

    default:
      return { success: false, message: `Unknown tool: ${name}` };
  }
}
