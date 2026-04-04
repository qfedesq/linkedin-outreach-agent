import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { callLLM, ICP_SCORING_PROMPT, getConnectionNotePrompt, getFollowupPrompt } from "@/lib/llm";
import { createLinkedIn } from "@/lib/linkedin-provider";
import { logActivity } from "@/lib/activity-log";

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
    { type: "function" as const, function: { name: "discover_prospects", description: "EXECUTE: Run Apify scrape to find new prospects by job title + location. Takes 2-3 minutes.", parameters: { type: "object", properties: { job_title: { type: "string", description: "e.g. CEO, CFO, VP Lending" }, location: { type: "string", description: "e.g. United Kingdom" }, count: { type: "number", description: "max results (default 25)" } }, required: ["job_title"] } } },
    { type: "function" as const, function: { name: "score_contacts", description: "EXECUTE: Score unscored contacts using LLM (HIGH/MEDIUM/LOW fit)", parameters: { type: "object", properties: { limit: { type: "number", description: "max to score (default 10)" } } } } },
    { type: "function" as const, function: { name: "prepare_invites", description: "EXECUTE: Generate personalized connection notes via LLM for TO_CONTACT contacts. Returns draft messages for review.", parameters: { type: "object", properties: { count: { type: "number", description: "max invites to prepare (default 10)" } } } } },
    { type: "function" as const, function: { name: "send_invites", description: "EXECUTE: Send approved invites via LinkedIn (Unipile). Sends one by one.", parameters: { type: "object", properties: { batch_id: { type: "string", description: "Batch ID to send" } }, required: ["batch_id"] } } },
    { type: "function" as const, function: { name: "check_connections_and_inbox", description: "EXECUTE: Check which invites were accepted + scan inbox for replies", parameters: { type: "object", properties: {} } } },
    { type: "function" as const, function: { name: "send_followups", description: "EXECUTE: Generate and send follow-up messages to connected contacts (3+ days)", parameters: { type: "object", properties: {} } } },
    { type: "function" as const, function: { name: "run_full_cycle", description: "EXECUTE: Run complete daily cycle (check connections → send followups → scan inbox)", parameters: { type: "object", properties: {} } } },
    { type: "function" as const, function: { name: "get_performance", description: "Get performance analytics: acceptance rate, best messages, fit comparison", parameters: { type: "object", properties: {} } } },
    { type: "function" as const, function: { name: "get_recent_activity", description: "Get recent execution logs", parameters: { type: "object", properties: { limit: { type: "number" } } } } },
    { type: "function" as const, function: { name: "learn", description: "Save a learning/insight to the knowledge base (persists across sessions)", parameters: { type: "object", properties: { category: { type: "string", enum: ["message_style","icp_insight","strategy","correction"] }, content: { type: "string", description: "The learning to remember" } }, required: ["category","content"] } } },
    { type: "function" as const, function: { name: "get_knowledge", description: "Read all accumulated knowledge/learnings from past sessions", parameters: { type: "object", properties: {} } } },
  ];
}

export async function executeTool(name: string, args: Record<string, unknown>, userId: string): Promise<ToolResult> {
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
      return { success: true, data: contacts.map(c => ({ name: c.name, position: c.position, company: c.company, fit: c.profileFit, status: c.status, url: c.linkedinUrl })), message: `Found ${contacts.length} contacts` };
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
      if (!settings?.apifyApiToken) return { success: false, message: "Apify not configured. Go to Settings." };
      const token = decrypt(settings.apifyApiToken);
      const jobTitle = (args.job_title as string) || "CEO";
      const location = (args.location as string) || "United Kingdom";
      const maxResults = (args.count as number) || 25;

      await logActivity(userId, "apify_scrape", { level: "info", message: `Agent starting Apify: "${jobTitle}" in ${location}` });

      try {
        // Start actor
        const runRes = await fetch("https://api.apify.com/v2/acts/apimaestro~linkedin-profile-search-scraper/runs", {
          method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ current_job_title: jobTitle, location, rows: maxResults }),
        });
        if (!runRes.ok) return { success: false, message: `Apify start failed: ${runRes.status}` };
        const runData = await runRes.json();
        const runId = runData.data?.id;
        const datasetId = runData.data?.defaultDatasetId;

        // Poll (max 3 min)
        let status = "RUNNING";
        for (let i = 0; i < 18; i++) {
          await new Promise(r => setTimeout(r, 10000));
          const check = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, { headers: { Authorization: `Bearer ${token}` } });
          status = (await check.json()).data?.status || "UNKNOWN";
          if (status === "SUCCEEDED" || status === "FAILED") break;
        }

        // Fetch results
        const dataRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?format=json`, { headers: { Authorization: `Bearer ${token}` } });
        const profiles = await dataRes.json();
        if (!Array.isArray(profiles) || profiles.length === 0) {
          return { success: true, message: `Apify completed (${status}) but found 0 profiles. Try different job title or location.` };
        }

        let created = 0, skipped = 0;
        for (const p of profiles) {
          const basic = p.basic_info || p;
          const url = (basic.profile_url || basic.url || "").toLowerCase().replace(/\/$/, "").split("?")[0];
          if (!url.includes("linkedin.com/in/")) { skipped++; continue; }
          const slug = url.match(/linkedin\.com\/in\/([^/?]+)/i)?.[1] || null;
          const pName = basic.fullname || basic.name || `${basic.first_name || ""} ${basic.last_name || ""}`.trim() || "Unknown";
          const exp = (p.experience || [])[0];
          try {
            await prisma.contact.create({ data: { name: pName, position: basic.headline || basic.title || null, company: exp?.company_name || null, linkedinUrl: url.replace(/^https?:\/\/(www\.)?linkedin\.com/, "https://www.linkedin.com"), linkedinSlug: slug, source: "apify", userId } });
            created++;
          } catch { skipped++; }
        }

        await logActivity(userId, "apify_scrape", { level: "success", message: `Found ${profiles.length} profiles, saved ${created} new contacts`, success: true });
        return { success: true, data: { total: profiles.length, created, skipped }, message: `Discovered ${created} new prospects (${skipped} duplicates/invalid skipped) from ${profiles.length} total profiles.` };
      } catch (e) {
        return { success: false, message: `Apify error: ${(e as Error).message}` };
      }
    }

    case "score_contacts": {
      if (!settings?.openrouterApiKey) return { success: false, message: "OpenRouter not configured." };
      const contacts = await prisma.contact.findMany({ where: { userId, fitRationale: null }, take: (args.limit as number) || 10 });
      if (contacts.length === 0) return { success: true, message: "All contacts are already scored." };

      const results = [];
      for (const c of contacts) {
        const text = [`Name: ${c.name}`, c.position && `Position: ${c.position}`, c.company && `Company: ${c.company}`].filter(Boolean).join("\n");
        try {
          const resp = await callLLM(ICP_SCORING_PROMPT, text, settings.openrouterApiKey, settings.preferredModel);
          const parsed = JSON.parse(resp.trim());
          await prisma.contact.update({ where: { id: c.id }, data: { profileFit: parsed.fit || "MEDIUM", fitRationale: parsed.rationale || null } });
          results.push(`${c.name}: ${parsed.fit} — ${parsed.rationale}`);
        } catch { results.push(`${c.name}: scoring failed`); }
      }

      await logActivity(userId, "score_contact", { level: "success", message: `Scored ${results.length} contacts` });
      return { success: true, data: results, message: `Scored ${results.length} contacts:\n${results.join("\n")}` };
    }

    case "prepare_invites": {
      if (!settings?.openrouterApiKey) return { success: false, message: "OpenRouter not configured." };
      const maxBatch = (args.count as number) || 10;
      const contacts = await prisma.contact.findMany({ where: { userId, status: "TO_CONTACT" }, orderBy: [{ profileFit: "asc" }, { createdAt: "asc" }], take: maxBatch });
      if (contacts.length === 0) return { success: true, message: "No contacts ready for invites." };

      const systemPrompt = getConnectionNotePrompt(settings.calendarBookingUrl);
      const batch = await prisma.inviteBatch.create({ data: { userId } });
      const items = [];

      for (const c of contacts) {
        const userPrompt = [`Name: ${c.name}`, c.position && `Position: ${c.position}`, c.company && `Company: ${c.company}`, c.fitRationale && `Fit: ${c.fitRationale}`].filter(Boolean).join("\n");
        let msg = "";
        try {
          msg = (await callLLM(systemPrompt, userPrompt, settings.openrouterApiKey, settings.preferredModel, { temperature: 0.8, maxTokens: 200 })).trim().substring(0, 200);
        } catch {
          msg = `${c.name.split(" ")[0]} — would love to connect about arenas.fi's $100M Sky Protocol facility. Open to a quick call?`.substring(0, 300);
        }
        const item = await prisma.inviteBatchItem.create({ data: { batchId: batch.id, contactId: c.id, draftMessage: msg } });
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

      let sent = 0, failed = 0;
      for (const item of items) {
        const contact = await prisma.contact.findUnique({ where: { id: item.contactId } });
        if (!contact) continue;

        // Get provider_id — look up via Unipile if we only have slug
        let providerId = contact.linkedinProfileId || contact.linkedinEntityUrn || "";
        if (!providerId && contact.linkedinSlug) {
          try {
            const profile = await linkedin.getProfile(contact.linkedinSlug);
            providerId = profile?.provider_id || profile?.id || "";
            if (providerId) await prisma.contact.update({ where: { id: contact.id }, data: { linkedinProfileId: providerId } });
          } catch { providerId = contact.linkedinSlug; }
        }
        if (!providerId) { failed++; continue; }

        try {
          await linkedin.sendInvitation(providerId, (item.editedMessage || item.draftMessage).substring(0, 200));
          await prisma.inviteBatchItem.update({ where: { id: item.id }, data: { sent: true, sentAt: new Date(), sendResult: "success" } });
          await prisma.contact.update({ where: { id: contact.id }, data: { status: "INVITED", inviteSentDate: new Date(), connectionMessage: item.editedMessage || item.draftMessage } });
          sent++;
          await logActivity(userId, "send_invite", { level: "success", message: `Invite sent to ${contact.name}`, contactId: contact.id });
        } catch (e) {
          failed++;
          await prisma.inviteBatchItem.update({ where: { id: item.id }, data: { sent: true, sendResult: "failed" } });
          await logActivity(userId, "send_invite", { level: "error", message: `Failed: ${contact.name} — ${(e as Error).message}`, success: false });
        }
      }

      return { success: true, data: { sent, failed }, message: `Sent ${sent} invites, ${failed} failed.` };
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

      const delayDays = settings.followupDelayDays || 3;
      const cutoff = new Date(Date.now() - delayDays * 24 * 60 * 60 * 1000);
      const due = await prisma.contact.findMany({ where: { userId, status: "CONNECTED", connectedDate: { lte: cutoff }, followupSentDate: null } });
      if (due.length === 0) return { success: true, message: "No contacts due for follow-up." };

      const systemPrompt = getFollowupPrompt(settings.calendarBookingUrl);
      let sent = 0;
      for (const c of due) {
        const userPrompt = [`Name: ${c.name}`, c.position && `Position: ${c.position}`, c.company && `Company: ${c.company}`].filter(Boolean).join("\n");
        try {
          const msg = (await callLLM(systemPrompt, userPrompt, settings.openrouterApiKey, settings.preferredModel, { temperature: 0.7, maxTokens: 300 })).trim();
          await linkedin.sendMessage([c.linkedinProfileId!], msg);
          await prisma.contact.update({ where: { id: c.id }, data: { status: "FOLLOWED_UP", followupSentDate: new Date() } });
          sent++;
          await logActivity(userId, "send_followup", { level: "success", message: `Follow-up sent to ${c.name}` });
        } catch (e) {
          await logActivity(userId, "send_followup", { level: "error", message: `Follow-up failed for ${c.name}: ${(e as Error).message}`, success: false });
        }
      }
      return { success: true, message: `Sent ${sent}/${due.length} follow-ups.` };
    }

    case "run_full_cycle": {
      const r1 = await executeTool("check_connections_and_inbox", {}, userId);
      const r2 = await executeTool("send_followups", {}, userId);
      return { success: true, message: `Daily cycle complete:\n• ${r1.message}\n• ${r2.message}` };
    }

    default:
      return { success: false, message: `Unknown tool: ${name}` };
  }
}
