import { prisma } from "@/lib/prisma";

export interface ToolResult {
  success: boolean;
  data?: unknown;
  message: string;
}

export async function getToolDefinitions() {
  return [
    {
      type: "function" as const,
      function: {
        name: "get_pipeline_stats",
        description: "Get current pipeline statistics: total contacts, invited, connected, followed up, replied, meetings booked",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "search_contacts",
        description: "Search contacts by name, company, position, or status. Returns matching contacts.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search text (name, company, or position)" },
            status: { type: "string", enum: ["TO_CONTACT", "INVITED", "CONNECTED", "FOLLOWED_UP", "REPLIED", "MEETING_BOOKED", "UNRESPONSIVE"], description: "Filter by status" },
            fit: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"], description: "Filter by ICP fit" },
            limit: { type: "number", description: "Max results (default 10)" },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "discover_prospects",
        description: "Start an Apify scrape to discover new prospects by job title and location. Returns a run ID for polling.",
        parameters: {
          type: "object",
          properties: {
            job_title: { type: "string", description: "Job title to search (e.g. CEO, CFO, VP Lending)" },
            location: { type: "string", description: "Location (e.g. United Kingdom, United States)" },
            max_results: { type: "number", description: "Max profiles to find (default 25)" },
          },
          required: ["job_title"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "score_contacts",
        description: "Score unscored contacts using LLM ICP classification (HIGH/MEDIUM/LOW fit)",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Max contacts to score (default 10)" },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "prepare_invite_batch",
        description: "Generate personalized connection notes via LLM for TO_CONTACT contacts. Creates an invite batch for review.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_invite_batches",
        description: "List recent invite batches with their status and items",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "run_daily_cycle",
        description: "Execute the daily outreach cycle: check connections, prepare follow-ups, scan inbox",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_recent_activity",
        description: "Get recent execution logs showing what the agent has been doing",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Number of logs to return (default 20)" },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_best_messages",
        description: "Analyze which connection messages have the best acceptance rates",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "update_strategy",
        description: "Update the outreach strategy notes that the agent uses for future message generation",
        parameters: {
          type: "object",
          properties: {
            notes: { type: "string", description: "New strategy notes / instructions for message generation" },
          },
          required: ["notes"],
        },
      },
    },
  ];
}

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  userId: string
): Promise<ToolResult> {
  switch (toolName) {
    case "get_pipeline_stats": {
      const statuses = ["TO_CONTACT", "INVITED", "CONNECTED", "FOLLOWED_UP", "REPLIED", "MEETING_BOOKED", "UNRESPONSIVE"];
      const counts: Record<string, number> = {};
      for (const s of statuses) {
        counts[s] = await prisma.contact.count({ where: { userId, status: s } });
      }
      const total = await prisma.contact.count({ where: { userId } });
      return {
        success: true,
        data: { total, ...counts },
        message: `Pipeline: ${total} total | ${counts.TO_CONTACT} to contact | ${counts.INVITED} invited | ${counts.CONNECTED} connected | ${counts.FOLLOWED_UP} followed up | ${counts.REPLIED} replied | ${counts.MEETING_BOOKED} meetings`,
      };
    }

    case "search_contacts": {
      const where: Record<string, unknown> = { userId };
      if (args.status) where.status = args.status;
      if (args.fit) where.profileFit = args.fit;
      if (args.query) {
        where.OR = [
          { name: { contains: args.query as string } },
          { company: { contains: args.query as string } },
          { position: { contains: args.query as string } },
        ];
      }
      const contacts = await prisma.contact.findMany({
        where,
        take: (args.limit as number) || 10,
        orderBy: { createdAt: "desc" },
      });
      return {
        success: true,
        data: contacts.map(c => ({
          name: c.name, position: c.position, company: c.company,
          fit: c.profileFit, status: c.status, linkedinUrl: c.linkedinUrl,
        })),
        message: `Found ${contacts.length} contacts`,
      };
    }

    case "discover_prospects": {
      return {
        success: true,
        data: { action: "discover", job_title: args.job_title, location: args.location || "United Kingdom", max_results: args.max_results || 25 },
        message: `To discover prospects, go to Command Center and run Apify scrape with title="${args.job_title}" location="${args.location || "United Kingdom"}". I cannot start Apify directly from chat yet — this will be available once Unipile is integrated.`,
      };
    }

    case "score_contacts": {
      const unscored = await prisma.contact.findMany({
        where: { userId, status: "TO_CONTACT", fitRationale: null },
        take: (args.limit as number) || 10,
        select: { id: true, name: true },
      });
      if (unscored.length === 0) {
        return { success: true, message: "No unscored contacts found." };
      }
      return {
        success: true,
        data: { contactIds: unscored.map(c => c.id), names: unscored.map(c => c.name) },
        message: `Found ${unscored.length} unscored contacts. Use Command Center > Score to run ICP scoring on them.`,
      };
    }

    case "prepare_invite_batch": {
      const ready = await prisma.contact.count({ where: { userId, status: "TO_CONTACT" } });
      if (ready === 0) {
        return { success: true, message: "No contacts with status 'To Contact'. Run discovery first." };
      }
      return {
        success: true,
        data: { readyCount: ready },
        message: `${ready} contacts ready for invites. Use Command Center > Prepare Invites to generate personalized connection notes.`,
      };
    }

    case "get_invite_batches": {
      const batches = await prisma.inviteBatch.findMany({
        where: { userId },
        include: { items: { select: { id: true, sent: true, sendResult: true, approved: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
      const summary = batches.map(b => ({
        id: b.id,
        status: b.status,
        total: b.items.length,
        approved: b.items.filter(i => i.approved).length,
        sent: b.items.filter(i => i.sent).length,
        date: b.createdAt,
      }));
      return { success: true, data: summary, message: `${batches.length} recent batches` };
    }

    case "run_daily_cycle": {
      return {
        success: true,
        message: "To run the daily cycle, use Command Center > Run Full Daily Cycle. It will check connections, prepare follow-ups, and scan inbox.",
      };
    }

    case "get_recent_activity": {
      const logs = await prisma.executionLog.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: (args.limit as number) || 20,
        select: { action: true, request: true, success: true, duration: true, createdAt: true },
      });
      return {
        success: true,
        data: logs,
        message: `${logs.length} recent activities`,
      };
    }

    case "get_best_messages": {
      // Analyze invite batch items to find best performing messages
      const items = await prisma.inviteBatchItem.findMany({
        where: { batch: { userId }, sent: true },
        select: { draftMessage: true, editedMessage: true, sendResult: true, contactId: true },
      });
      const contacts = await prisma.contact.findMany({
        where: { userId, status: { in: ["CONNECTED", "REPLIED", "MEETING_BOOKED"] } },
        select: { id: true, status: true, connectionMessage: true },
      });
      const connectedIds = new Set(contacts.map(c => c.id));
      const successful = items.filter(i => connectedIds.has(i.contactId));
      return {
        success: true,
        data: {
          totalSent: items.length,
          totalAccepted: successful.length,
          acceptRate: items.length > 0 ? `${Math.round((successful.length / items.length) * 100)}%` : "N/A",
          topMessages: successful.slice(0, 5).map(i => i.editedMessage || i.draftMessage),
        },
        message: `${items.length} invites sent, ${successful.length} accepted (${items.length > 0 ? Math.round((successful.length / items.length) * 100) : 0}% rate)`,
      };
    }

    case "update_strategy": {
      await prisma.userSettings.updateMany({
        where: { userId },
        data: { strategyNotes: args.notes as string },
      });
      return { success: true, message: `Strategy notes updated. The agent will use these for future message generation.` };
    }

    default:
      return { success: false, message: `Unknown tool: ${toolName}` };
  }
}
