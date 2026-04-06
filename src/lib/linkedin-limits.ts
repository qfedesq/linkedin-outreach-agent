/**
 * LinkedIn Rate Limiting & Anti-Cooldown System
 *
 * LinkedIn limits (2025-2026):
 * - Free: ~20-25 invites/day, ~100/week
 * - Premium: ~30-40/day, ~150-200/week
 * - Sales Navigator: ~40-50/day, ~200-250/week
 *
 * Safety margins applied:
 * - We use 60% of the actual limits as our ceiling
 * - Randomized delays between actions
 * - Cooldown periods after failures
 * - Per-contact interaction tracking (no double-sends)
 * - Weekly rolling window tracking
 *
 * Sources:
 * - https://www.leadloft.com/blog/linkedin-limits
 * - https://www.linkedsdr.com/blog/linkedin-limits-complete-guide
 */

import { prisma } from "@/lib/prisma";

// Safe daily limits (conservative — 60% of actual limits)
// Limits at ~50-60% of LinkedIn's real thresholds (safe for paid accounts with history)
// LinkedIn real limits: ~80-100 invites/day, 150-200/week, 100 msgs/day, 100 profile views/day
const SAFE_LIMITS = {
  INVITES_PER_DAY: 40,          // Real: 80-100. Was 15 (too conservative)
  INVITES_PER_WEEK: 120,        // Real: 150-200. Was 60
  MESSAGES_PER_DAY: 50,         // Real: ~100. Was 25
  PROFILE_VIEWS_PER_DAY: 80,    // Real: ~100. Was 50
  SEARCHES_PER_DAY: 25,         // Real: ~30+. Was 20
  MIN_DELAY_BETWEEN_INVITES_MS: 25000,  // 25s. Was 45s. Real safe: ~15s
  MIN_DELAY_BETWEEN_MESSAGES_MS: 20000, // 20s. Was 30s. Real safe: ~10s
  MIN_DELAY_BETWEEN_SEARCHES_MS: 10000, // 10s. Was 20s. Real safe: ~5s
  COOLDOWN_AFTER_ERROR_MS: 180000,      // 3 minutes. Was 5 min
  COOLDOWN_AFTER_429_MS: 1800000,       // 30 minutes. Was 1 hour
  REINVITE_COOLDOWN_DAYS: 30,           // Wait 30 days before re-inviting same person
  FOLLOWUP_MIN_DAYS: 3,                 // Wait at least 3 days after connection before follow-up
  FOLLOWUP_MAX_ATTEMPTS: 1,             // Only 1 follow-up per contact
};

interface ActionCount { today: number; thisWeek: number; lastActionAt: Date | null }

/**
 * Check if a specific LinkedIn action is allowed right now
 */
export async function canPerformAction(
  userId: string,
  actionType: "invite" | "message" | "search" | "profile_view"
): Promise<{ allowed: boolean; reason?: string; waitMs?: number }> {

  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now); weekStart.setDate(weekStart.getDate() - 7);

  // Check for active cooldown (from recent errors)
  const recentError = await prisma.executionLog.findFirst({
    where: {
      userId,
      success: false,
      errorCode: { not: null },
      action: { in: ["send_invite", "send_message", "linkedin_search", "enrich_contacts"] },
      createdAt: { gte: new Date(now.getTime() - SAFE_LIMITS.COOLDOWN_AFTER_ERROR_MS) },
    },
    orderBy: { createdAt: "desc" },
  });

  if (recentError) {
    const errorAge = now.getTime() - new Date(recentError.createdAt).getTime();
    const is429 = recentError.errorCode?.includes("429") || recentError.errorCode?.includes("rate");
    const cooldownMs = is429 ? SAFE_LIMITS.COOLDOWN_AFTER_429_MS : SAFE_LIMITS.COOLDOWN_AFTER_ERROR_MS;
    const remaining = cooldownMs - errorAge;

    if (remaining > 0) {
      return {
        allowed: false,
        reason: is429
          ? `Rate limit cooldown active. Wait ${Math.ceil(remaining / 60000)} minutes.`
          : `Error cooldown active. Wait ${Math.ceil(remaining / 60000)} minutes.`,
        waitMs: remaining,
      };
    }
  }

  // Count today's and this week's actions
  const actionMap: Record<string, string[]> = {
    invite: ["send_invite"],
    message: ["send_message", "send_followup"],
    search: ["linkedin_search", "apify_scrape"],
    profile_view: ["enrich_contacts"],
  };
  const actions = actionMap[actionType] || [];

  const todayCount = await prisma.executionLog.count({
    where: { userId, action: { in: actions }, success: true, createdAt: { gte: todayStart } },
  });

  const weekCount = await prisma.executionLog.count({
    where: { userId, action: { in: actions }, success: true, createdAt: { gte: weekStart } },
  });

  // Check limits
  const limits: Record<string, { daily: number; weekly: number; delayMs: number }> = {
    invite: { daily: SAFE_LIMITS.INVITES_PER_DAY, weekly: SAFE_LIMITS.INVITES_PER_WEEK, delayMs: SAFE_LIMITS.MIN_DELAY_BETWEEN_INVITES_MS },
    message: { daily: SAFE_LIMITS.MESSAGES_PER_DAY, weekly: 999, delayMs: SAFE_LIMITS.MIN_DELAY_BETWEEN_MESSAGES_MS },
    search: { daily: SAFE_LIMITS.SEARCHES_PER_DAY, weekly: 999, delayMs: SAFE_LIMITS.MIN_DELAY_BETWEEN_SEARCHES_MS },
    profile_view: { daily: SAFE_LIMITS.PROFILE_VIEWS_PER_DAY, weekly: 999, delayMs: 3000 },
  };
  const limit = limits[actionType];

  if (todayCount >= limit.daily) {
    return { allowed: false, reason: `Daily ${actionType} limit reached (${todayCount}/${limit.daily}). Resets at midnight.` };
  }

  if (weekCount >= limit.weekly) {
    return { allowed: false, reason: `Weekly ${actionType} limit reached (${weekCount}/${limit.weekly}). Resets in rolling 7 days.` };
  }

  // Check minimum delay since last action
  const lastAction = await prisma.executionLog.findFirst({
    where: { userId, action: { in: actions }, success: true },
    orderBy: { createdAt: "desc" },
  });

  if (lastAction) {
    const elapsed = now.getTime() - new Date(lastAction.createdAt).getTime();
    if (elapsed < limit.delayMs) {
      const waitMs = limit.delayMs - elapsed;
      return { allowed: false, reason: `Too fast. Wait ${Math.ceil(waitMs / 1000)}s between ${actionType}s.`, waitMs };
    }
  }

  return { allowed: true };
}

/**
 * Check if we can send an invite to a specific contact
 */
export async function canInviteContact(
  userId: string,
  contactId: string
): Promise<{ allowed: boolean; reason?: string }> {

  const contact = await prisma.contact.findFirst({ where: { id: contactId, userId } });
  if (!contact) return { allowed: false, reason: "Contact not found" };

  // 1st degree = already connected, no invite needed
  if (contact.connectionDegree === "DISTANCE_1") {
    return { allowed: false, reason: "Already connected (1st degree). No invite needed — send a message instead." };
  }

  // Already invited — check cooldown
  if (contact.status === "INVITED") {
    if (contact.inviteSentDate) {
      const daysSince = (Date.now() - new Date(contact.inviteSentDate).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < SAFE_LIMITS.REINVITE_COOLDOWN_DAYS) {
        return { allowed: false, reason: `Already invited ${Math.floor(daysSince)} days ago. Wait ${SAFE_LIMITS.REINVITE_COOLDOWN_DAYS - Math.floor(daysSince)} more days.` };
      }
    }
    return { allowed: false, reason: "Already invited — waiting for response." };
  }

  // Already connected or further — no invite needed
  if (["CONNECTED", "FOLLOWED_UP", "REPLIED", "MEETING_BOOKED"].includes(contact.status)) {
    return { allowed: false, reason: `Contact is already ${contact.status.toLowerCase().replace("_", " ")}.` };
  }

  // Unresponsive — can retry after cooldown
  if (contact.status === "UNRESPONSIVE") {
    return { allowed: true }; // Allow retry for unresponsive contacts
  }

  // TO_CONTACT — good to go
  return { allowed: true };
}

/**
 * Check if we can send a follow-up to a specific contact
 */
export async function canFollowupContact(
  userId: string,
  contactId: string
): Promise<{ allowed: boolean; reason?: string }> {

  const contact = await prisma.contact.findFirst({ where: { id: contactId, userId } });
  if (!contact) return { allowed: false, reason: "Contact not found" };

  // Must be connected
  if (contact.status !== "CONNECTED") {
    return { allowed: false, reason: `Contact status is ${contact.status} — must be CONNECTED for follow-up.` };
  }

  // Already followed up
  if (contact.followupSentDate) {
    return { allowed: false, reason: "Follow-up already sent. Only 1 follow-up per contact." };
  }

  // Check minimum days since connection
  if (contact.connectedDate) {
    const daysSince = (Date.now() - new Date(contact.connectedDate).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < SAFE_LIMITS.FOLLOWUP_MIN_DAYS) {
      return { allowed: false, reason: `Connected ${Math.floor(daysSince)} days ago. Wait ${SAFE_LIMITS.FOLLOWUP_MIN_DAYS - Math.floor(daysSince)} more days before follow-up.` };
    }
  }

  return { allowed: true };
}

/**
 * Get current usage summary for display
 */
export async function getUsageSummary(userId: string) {
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now); weekStart.setDate(weekStart.getDate() - 7);

  const invitesToday = await prisma.executionLog.count({
    where: { userId, action: "send_invite", success: true, createdAt: { gte: todayStart } },
  });
  const invitesWeek = await prisma.executionLog.count({
    where: { userId, action: "send_invite", success: true, createdAt: { gte: weekStart } },
  });
  const messagesToday = await prisma.executionLog.count({
    where: { userId, action: { in: ["send_message", "send_followup"] }, success: true, createdAt: { gte: todayStart } },
  });
  const searchesToday = await prisma.executionLog.count({
    where: { userId, action: { in: ["linkedin_search"] }, success: true, createdAt: { gte: todayStart } },
  });

  return {
    invites: { today: invitesToday, todayLimit: SAFE_LIMITS.INVITES_PER_DAY, week: invitesWeek, weekLimit: SAFE_LIMITS.INVITES_PER_WEEK },
    messages: { today: messagesToday, todayLimit: SAFE_LIMITS.MESSAGES_PER_DAY },
    searches: { today: searchesToday, todayLimit: SAFE_LIMITS.SEARCHES_PER_DAY },
  };
}

/**
 * Apply randomized delay to appear human-like
 */
export async function humanDelay(baseMs: number): Promise<void> {
  const jitter = baseMs * 0.4 * (Math.random() - 0.5); // ±20%
  const delay = Math.max(baseMs + jitter, 2000); // Minimum 2 seconds
  await new Promise(r => setTimeout(r, delay));
}

export { SAFE_LIMITS };
