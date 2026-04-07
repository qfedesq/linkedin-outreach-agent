import { prisma } from "@/lib/prisma";
import {
  callLLM,
  getExperimentDesignPrompt,
  getMeetingBriefPrompt,
  getReactivationPrompt,
  getReplyStrategyPrompt,
  type CampaignContext,
} from "@/lib/llm";

type PriorityAction =
  | "reply_now"
  | "book_meeting"
  | "send_followup"
  | "prepare_reactivation"
  | "prepare_invite"
  | "score_contact"
  | "review_account";

type ReplyIntent = "positive" | "neutral" | "objection" | "referral" | "not_now" | "not_relevant";

interface RevenueSettings {
  openrouterApiKey?: string | null;
  preferredModel?: string | null;
}

interface ContactContext {
  id: string;
  name: string;
  position: string | null;
  company: string | null;
  profileFit: string;
  fitRationale: string | null;
  status: string;
  notes: string | null;
  connectionMessage: string | null;
  inviteSentDate: Date | null;
  connectedDate: Date | null;
  followupSentDate: Date | null;
  campaignId: string | null;
  updatedAt: Date;
  createdAt: Date;
}

export interface PriorityResult {
  contactId: string;
  contactName: string;
  company: string | null;
  campaignId: string | null;
  campaignName: string | null;
  status: string;
  fit: string;
  priorityScore: number;
  whyNow: string;
  nextBestAction: PriorityAction;
  accountKey: string;
}

export interface AccountMapResult {
  accountKey: string;
  company: string;
  campaignId: string | null;
  campaignName: string | null;
  contactCount: number;
  warmContacts: number;
  repliedContacts: number;
  seniorityCoverage: string[];
  statusMix: Record<string, number>;
  missingPersonas: string[];
  accountHealth: "cold" | "warming" | "engaged" | "meeting";
  nextRecommendedMove: string;
  contacts: Array<{
    id: string;
    name: string;
    position: string | null;
    status: string;
    fit: string;
  }>;
}

export interface ReplyStrategyResult {
  intent: ReplyIntent;
  strategy: string;
  draft: string;
  cta: string;
  riskFlags: string[];
}

export interface ReactivationResult {
  contactId: string;
  name: string;
  company: string | null;
  status: string;
  staleDays: number;
  reactivationReason: string;
  angle: string;
  draft: string;
}

export interface MeetingBriefResult {
  contactId: string;
  contactName: string;
  campaignName: string | null;
  executiveSummary: string;
  likelyPains: string[];
  objectionMap: string[];
  talkTrack: string[];
  cta: string;
  timeline: string[];
}

export interface ExperimentResult {
  id: string;
  campaignId: string | null;
  campaignName: string | null;
  goal: string;
  audienceFilter: string | null;
  hypothesis: string;
  successMetric: string;
  status: string;
  suggestedSampleSize: string;
  variants: Array<{ name: string; angle: string; message: string }>;
  createdAt: Date;
}

const DEFAULT_PRIORITY_LIMIT = 10;
const DEFAULT_EXPERIMENT_VARIANTS = 3;
const DEFAULT_STALE_DAYS = 21;
const PERSONA_COVERAGE_RULES = [
  { key: "founder_ceo", label: "Founder / CEO", test: /(founder|ceo|co-founder|managing director)/i },
  { key: "finance", label: "Finance Leader", test: /(cfo|finance|capital markets|treasury)/i },
  { key: "ops", label: "Revenue / Lending Operator", test: /(head|vp|director).*(lending|origination|partnership|revenue)/i },
];

function daysBetween(date: Date | null | undefined) {
  if (!date) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24)));
}

function normalizeCompany(company: string | null | undefined) {
  const raw = (company || "").trim();
  if (!raw) return "unknown-account";
  return raw
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|gmbh|sa|plc)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

function inferSeniority(position: string | null) {
  const text = (position || "").toLowerCase();
  if (!text) return { label: "Unknown", score: 5 };
  if (/(founder|ceo|chief|president|co-founder|managing director)/i.test(text)) return { label: "Executive", score: 30 };
  if (/(vp|vice president|head of|general manager)/i.test(text)) return { label: "VP / Head", score: 24 };
  if (/(director|principal)/i.test(text)) return { label: "Director", score: 18 };
  if (/(manager|lead)/i.test(text)) return { label: "Manager", score: 12 };
  return { label: "Contributor", score: 8 };
}

function fitScore(fit: string) {
  if (fit === "HIGH") return 25;
  if (fit === "MEDIUM") return 14;
  return 6;
}

function stageScore(contact: ContactContext) {
  switch (contact.status) {
    case "MEETING_BOOKED":
      return 50;
    case "REPLIED":
      return 42;
    case "CONNECTED":
      return 32 + Math.min(daysBetween(contact.connectedDate), 10);
    case "FOLLOWED_UP":
      return 20 + Math.min(daysBetween(contact.followupSentDate), 10);
    case "INVITED":
      return 16 + Math.min(daysBetween(contact.inviteSentDate), 10);
    case "UNRESPONSIVE":
      return 14 + Math.min(daysBetween(contact.updatedAt), 12);
    case "TO_CONTACT":
    default:
      return 10;
  }
}

function inferNextAction(contact: ContactContext): PriorityAction {
  if (contact.status === "REPLIED") return "reply_now";
  if (contact.status === "MEETING_BOOKED") return "book_meeting";
  if (contact.status === "CONNECTED" || contact.status === "FOLLOWED_UP") return "send_followup";
  if (contact.status === "UNRESPONSIVE") return "prepare_reactivation";
  if (!contact.fitRationale) return "score_contact";
  return "prepare_invite";
}

function heuristicReplyIntent(messageText: string): ReplyIntent {
  const text = messageText.toLowerCase();
  if (/(not relevant|not a fit|not interested)/i.test(text)) return "not_relevant";
  if (/(not now|later|q[1-4]|next quarter|circle back)/i.test(text)) return "not_now";
  if (/(talk to|speak with|reach out to|contact )/i.test(text)) return "referral";
  if (/(but|however|concern|question|how does|what about|problem)/i.test(text)) return "objection";
  if (/(yes|sure|sounds good|happy to|let's|book|available)/i.test(text)) return "positive";
  return "neutral";
}

function fallbackReplyStrategy(messageText: string): ReplyStrategyResult {
  const intent = heuristicReplyIntent(messageText);
  const defaults: Record<ReplyIntent, ReplyStrategyResult> = {
    positive: {
      intent,
      strategy: "Acknowledge the positive signal and move quickly toward a concrete next step.",
      draft: "Great to hear. Happy to keep this simple. Would it be easiest if I send over 2 time options for a quick call?",
      cta: "Propose a short meeting.",
      riskFlags: ["Do not over-explain the product."],
    },
    neutral: {
      intent,
      strategy: "Keep momentum with one clear question and low pressure.",
      draft: "Thanks for the reply. Curious if this is even loosely relevant for your team right now, or if there is someone else who owns this area?",
      cta: "Ask one qualifying question.",
      riskFlags: ["Avoid sending a long paragraph."],
    },
    objection: {
      intent,
      strategy: "Address the objection directly and reduce perceived effort.",
      draft: "Makes sense. I do not want to force this if timing is off. If helpful, I can send a two-line summary of where we tend to be relevant, and you can tell me if it is worth revisiting.",
      cta: "Offer a lighter-weight next step.",
      riskFlags: ["Do not argue with the objection."],
    },
    referral: {
      intent,
      strategy: "Acknowledge the referral and ask for the shortest handoff possible.",
      draft: "Appreciate that. Would you be open to pointing me to the best person on your side for this, or I can reach out directly if you prefer?",
      cta: "Ask for the shortest possible intro or referral.",
      riskFlags: ["Do not lose momentum with a generic thank you only."],
    },
    not_now: {
      intent,
      strategy: "Respect timing and secure permission for a future touchpoint.",
      draft: "Totally fair. I will not crowd your inbox. Is there a better window for me to circle back, or should I reconnect in a few weeks with anything new that is relevant?",
      cta: "Agree on a future timing signal.",
      riskFlags: ["Do not keep pushing for a meeting now."],
    },
    not_relevant: {
      intent,
      strategy: "Disqualify cleanly or redirect if there is a better owner.",
      draft: "Understood, thanks for the clarity. If there is someone else closer to this area I should speak with, I am happy to reach out there. Otherwise I will close the loop on my side.",
      cta: "Invite a redirect or close gracefully.",
      riskFlags: ["Do not force another pitch."],
    },
  };
  return defaults[intent];
}

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function getUserKnowledge(userId: string) {
  const knowledge = await prisma.agentKnowledge.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return knowledge.map((item) => `- [${item.category}] ${item.content}`).join("\n");
}

async function getCampaignLookup(userId: string) {
  const campaigns = await prisma.campaign.findMany({ where: { userId } });
  return new Map(campaigns.map((campaign) => [campaign.id, campaign]));
}

async function getUserSettings(userId: string): Promise<RevenueSettings> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { settings: true },
  });
  return user?.settings || {};
}

function buildCampaignContext(
  campaign: {
    name: string;
    description: string | null;
    strategyNotes: string | null;
    calendarUrl: string | null;
  } | null | undefined,
): CampaignContext {
  return {
    campaignName: campaign?.name || "General Outreach",
    campaignDescription: campaign?.description || undefined,
    strategyNotes: campaign?.strategyNotes || undefined,
    calendarUrl: campaign?.calendarUrl || undefined,
  };
}

async function tryStructuredLlm<T>(
  userId: string,
  prompt: string,
  payload: string,
  fallback: T,
): Promise<T> {
  const settings = await getUserSettings(userId);
  if (!settings.openrouterApiKey || !settings.preferredModel) return fallback;

  try {
    const response = await callLLM(
      prompt,
      payload,
      settings.openrouterApiKey,
      settings.preferredModel,
      { maxTokens: 900, temperature: 0.5 },
    );
    return safeJsonParse<T>(response, fallback);
  } catch {
    return fallback;
  }
}

async function saveInsight(
  userId: string,
  contactId: string,
  campaignId: string | null,
  kind: string,
  summary: string,
  payloadJson: unknown,
) {
  return prisma.contactInsight.create({
    data: {
      userId,
      contactId,
      campaignId,
      kind,
      summary,
      payloadJson: payloadJson as object,
    },
  }).catch(() => null);
}

export async function prioritizePipelineByExpectedValue(
  userId: string,
  options?: { campaignId?: string | null; limit?: number; includeReasons?: boolean },
) {
  const limit = options?.limit || DEFAULT_PRIORITY_LIMIT;
  const campaigns = await getCampaignLookup(userId);
  const contacts = await prisma.contact.findMany({
    where: {
      userId,
      ...(options?.campaignId ? { campaignId: options.campaignId } : {}),
      status: { in: ["TO_CONTACT", "INVITED", "CONNECTED", "FOLLOWED_UP", "REPLIED", "MEETING_BOOKED", "UNRESPONSIVE"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });

  if (contacts.length === 0) {
    return {
      priorities: [] as PriorityResult[],
      message: "No contacts yet. The highest-ROI move is to discover prospects first.",
    };
  }

  const acceptByCampaign = new Map<string, number>();
  const totalByCampaign = new Map<string, number>();
  for (const contact of contacts) {
    const key = contact.campaignId || "none";
    totalByCampaign.set(key, (totalByCampaign.get(key) || 0) + 1);
    if (["CONNECTED", "FOLLOWED_UP", "REPLIED", "MEETING_BOOKED"].includes(contact.status)) {
      acceptByCampaign.set(key, (acceptByCampaign.get(key) || 0) + 1);
    }
  }

  const priorities = contacts.map((contact) => {
    const campaign = contact.campaignId ? campaigns.get(contact.campaignId) || null : null;
    const seniority = inferSeniority(contact.position);
    const fit = fitScore(contact.profileFit);
    const stage = stageScore(contact);
    const freshness = Math.max(0, 10 - daysBetween(contact.updatedAt));
    const timingBonus = (() => {
      if (contact.status === "REPLIED") return 22;
      if (contact.status === "CONNECTED" && daysBetween(contact.connectedDate) >= 3) return 18;
      if (contact.status === "FOLLOWED_UP" && daysBetween(contact.followupSentDate) >= 7) return 16;
      if (contact.status === "INVITED" && daysBetween(contact.inviteSentDate) >= 14) return 10;
      if (contact.status === "UNRESPONSIVE" && daysBetween(contact.updatedAt) >= 30) return 12;
      return 0;
    })();

    const perfKey = contact.campaignId || "none";
    const perfBoost = Math.round(((acceptByCampaign.get(perfKey) || 0) / Math.max(totalByCampaign.get(perfKey) || 1, 1)) * 15);
    const score = seniority.score + fit + stage + freshness + timingBonus + perfBoost;
    const nextBestAction = inferNextAction(contact as ContactContext);

    const whyBits = [
      contact.profileFit === "HIGH" ? "high ICP fit" : `${contact.profileFit.toLowerCase()} fit`,
      seniority.label.toLowerCase(),
      contact.status.toLowerCase().replaceAll("_", " "),
    ];
    if (contact.status === "REPLIED") whyBits.push("active conversation");
    if (contact.status === "CONNECTED" && daysBetween(contact.connectedDate) >= 3) whyBits.push("follow-up window is open");
    if (contact.status === "UNRESPONSIVE" && daysBetween(contact.updatedAt) >= 30) whyBits.push("eligible for smart reactivation");

    return {
      contactId: contact.id,
      contactName: contact.name,
      company: contact.company,
      campaignId: contact.campaignId,
      campaignName: campaign?.name || null,
      status: contact.status,
      fit: contact.profileFit,
      priorityScore: score,
      whyNow: whyBits.join(" | "),
      nextBestAction,
      accountKey: normalizeCompany(contact.company),
    } satisfies PriorityResult;
  });

  const top = priorities.sort((a, b) => b.priorityScore - a.priorityScore).slice(0, limit);

  await Promise.all(
    top.map((item) =>
      saveInsight(
        userId,
        item.contactId,
        item.campaignId,
        "priority_score",
        `${item.contactName}: ${item.whyNow}`,
        item,
      ),
    ),
  );

  const hotReplies = top.filter((item) => item.nextBestAction === "reply_now").length;
  const hotFollowups = top.filter((item) => item.nextBestAction === "send_followup").length;
  const message =
    hotReplies > 0
      ? `Top priority is handling ${hotReplies} active reply${hotReplies > 1 ? "ies" : ""}. After that, ${hotFollowups} follow-up opportunities are already warm.`
      : `Top priority list ready. Best immediate moves: ${top.slice(0, 3).map((item) => `${item.contactName} (${item.nextBestAction.replaceAll("_", " ")})`).join(", ")}.`;

  return { priorities: top, message };
}

export async function buildAccountMap(
  userId: string,
  options?: { campaignId?: string | null; company?: string | null; limit?: number },
) {
  const campaigns = await getCampaignLookup(userId);
  const contacts = await prisma.contact.findMany({
    where: {
      userId,
      ...(options?.campaignId ? { campaignId: options.campaignId } : {}),
      ...(options?.company ? { company: { contains: options.company } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 400,
  });

  const buckets = new Map<string, ContactContext[]>();
  for (const contact of contacts as ContactContext[]) {
    const key = normalizeCompany(contact.company);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(contact);
  }

  const accounts: AccountMapResult[] = [];
  for (const [accountKey, accountContacts] of buckets) {
    const first = accountContacts[0];
    const campaign = first.campaignId ? campaigns.get(first.campaignId) || null : null;
    const statusMix = accountContacts.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});
    const seniorityCoverage = [...new Set(accountContacts.map((item) => inferSeniority(item.position).label))];
    const matchedCoverage = PERSONA_COVERAGE_RULES.filter((rule) =>
      accountContacts.some((item) => rule.test.test(item.position || "")),
    ).map((rule) => rule.label);
    const missingPersonas = PERSONA_COVERAGE_RULES
      .filter((rule) => !matchedCoverage.includes(rule.label))
      .map((rule) => rule.label);
    const repliedContacts = accountContacts.filter((item) => ["REPLIED", "MEETING_BOOKED"].includes(item.status)).length;
    const warmContacts = accountContacts.filter((item) => ["CONNECTED", "FOLLOWED_UP", "REPLIED", "MEETING_BOOKED"].includes(item.status)).length;
    const accountHealth =
      repliedContacts > 0 ? "meeting" :
      warmContacts > 0 ? "engaged" :
      statusMix.INVITED ? "warming" :
      "cold";
    const nextRecommendedMove =
      repliedContacts > 0
        ? "Handle the active thread and convert it into a concrete meeting ask."
        : warmContacts > 0
          ? "Expand coverage inside the account while a warm contact already exists."
          : missingPersonas.length > 0
            ? `Find ${missingPersonas[0]} at this account to improve buying-committee coverage.`
            : "Prepare a strong first invite for the best-fit stakeholder in this account.";

    accounts.push({
      accountKey,
      company: first.company || "Unknown Company",
      campaignId: first.campaignId,
      campaignName: campaign?.name || null,
      contactCount: accountContacts.length,
      warmContacts,
      repliedContacts,
      seniorityCoverage,
      statusMix,
      missingPersonas,
      accountHealth,
      nextRecommendedMove,
      contacts: accountContacts.slice(0, 8).map((item) => ({
        id: item.id,
        name: item.name,
        position: item.position,
        status: item.status,
        fit: item.profileFit,
      })),
    });
  }

  accounts.sort((a, b) => (b.repliedContacts * 10 + b.warmContacts * 5 + b.contactCount) - (a.repliedContacts * 10 + a.warmContacts * 5 + a.contactCount));
  return {
    accounts: accounts.slice(0, options?.limit || DEFAULT_PRIORITY_LIMIT),
    message: accounts.length === 0
      ? "No accounts found with the current filters."
      : `Mapped ${accounts.length} account${accounts.length > 1 ? "s" : ""}. Strongest coverage starts with ${accounts[0].company}.`,
  };
}

export async function draftReplyStrategy(
  userId: string,
  options: { contactId?: string | null; campaignId?: string | null; messageText?: string | null },
) {
  let contact: ContactContext | null = null;
  if (options.contactId) {
    contact = await prisma.contact.findFirst({
      where: { id: options.contactId, userId },
    }) as ContactContext | null;
  }

  const campaigns = await getCampaignLookup(userId);
  const campaign = options.campaignId
    ? campaigns.get(options.campaignId) || null
    : contact?.campaignId
      ? campaigns.get(contact.campaignId) || null
      : null;
  const knowledge = await getUserKnowledge(userId);
  const messageText = options.messageText || contact?.notes || "";

  if (!messageText.trim() && !contact) {
    return {
      result: fallbackReplyStrategy(""),
      message: "No inbound reply text found. Pass message_text or select a replied contact.",
    };
  }

  const fallback = fallbackReplyStrategy(messageText);
  const llmResult = await tryStructuredLlm<ReplyStrategyResult>(
    userId,
    getReplyStrategyPrompt(buildCampaignContext(campaign), knowledge),
    [
      `Contact: ${contact?.name || "Unknown"}`,
      `Company: ${contact?.company || "Unknown"}`,
      `Role: ${contact?.position || "Unknown"}`,
      `Status: ${contact?.status || "Unknown"}`,
      `Fit rationale: ${contact?.fitRationale || "None"}`,
      `Latest notes: ${contact?.notes || "None"}`,
      `Inbound message: ${messageText || "Not provided"}`,
    ].join("\n"),
    fallback,
  );

  if (contact) {
    await saveInsight(
      userId,
      contact.id,
      contact.campaignId,
      "reply_strategy",
      `${llmResult.intent}: ${llmResult.strategy}`,
      llmResult,
    );
  }

  return {
    result: llmResult,
    message: `Reply strategy ready: ${llmResult.intent} — ${llmResult.strategy}`,
  };
}

export async function runMessageExperiment(
  userId: string,
  options: { campaignId: string; experimentGoal?: string | null; audienceFilter?: string | null; variantCount?: number | null },
) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: options.campaignId, userId },
  });
  if (!campaign) {
    return { experiment: null, message: "Campaign not found." };
  }

  const contacts = await prisma.contact.findMany({
    where: { userId, campaignId: campaign.id },
    take: 100,
    orderBy: { createdAt: "desc" },
    select: { id: true, profileFit: true, position: true, company: true, status: true },
  });
  const fitSummary = contacts.reduce<Record<string, number>>((acc, item) => {
    acc[item.profileFit] = (acc[item.profileFit] || 0) + 1;
    return acc;
  }, {});
  const audienceFilter = options.audienceFilter || "All campaign contacts";
  const goal = options.experimentGoal || "increase_accept_rate";
  const desiredVariantCount = Math.max(2, Math.min(options.variantCount || DEFAULT_EXPERIMENT_VARIANTS, 4));
  const knowledge = await getUserKnowledge(userId);

  const fallback = {
    hypothesis: `A clearer campaign-specific hook will improve ${goal.replaceAll("_", " ")} for ${campaign.name}.`,
    successMetric: goal === "increase_reply_rate" ? "Reply rate" : "Accept rate",
    suggestedSampleSize: "30 contacts total, split evenly across variants",
    variants: Array.from({ length: desiredVariantCount }, (_, index) => ({
      name: String.fromCharCode(65 + index),
      angle: index === 0 ? "Direct value" : index === 1 ? "Problem-led" : "Social-proof / signal-led",
      message:
        index === 0
          ? `Thought this might be relevant for ${campaign.name}. Open to a quick exchange on where this tends to help teams like yours?`
          : index === 1
            ? `Curious if solving ${campaign.description || "this problem"} is on your radar this quarter. Happy to share the shortest version if useful.`
            : `Noticed your role in ${campaign.name}. We are seeing this come up often with similar teams, so worth a quick note to compare.`,
    })),
  };

  const designed = await tryStructuredLlm<{
    hypothesis: string;
    successMetric: string;
    suggestedSampleSize: string;
    variants: Array<{ name: string; angle: string; message: string }>;
  }>(
    userId,
    getExperimentDesignPrompt(buildCampaignContext(campaign), knowledge),
    [
      `Goal: ${goal}`,
      `Audience filter: ${audienceFilter}`,
      `Target variant count: ${desiredVariantCount}`,
      `Contact count: ${contacts.length}`,
      `Fit summary: ${JSON.stringify(fitSummary)}`,
      `Recent roles: ${contacts.slice(0, 8).map((item) => item.position || "Unknown").join(" | ")}`,
    ].join("\n"),
    fallback,
  );

  const experiment = await prisma.messageExperiment.create({
    data: {
      userId,
      campaignId: campaign.id,
      goal,
      audienceFilter,
      hypothesis: designed.hypothesis,
      variantsJson: designed.variants.slice(0, desiredVariantCount),
      successMetric: designed.successMetric,
      status: "DRAFT",
    },
  });

  return {
    experiment: {
      id: experiment.id,
      campaignId: campaign.id,
      campaignName: campaign.name,
      goal,
      audienceFilter,
      hypothesis: designed.hypothesis,
      successMetric: designed.successMetric,
      status: experiment.status,
      suggestedSampleSize: designed.suggestedSampleSize,
      variants: designed.variants.slice(0, desiredVariantCount),
      createdAt: experiment.createdAt,
    } satisfies ExperimentResult,
    message: `Experiment ready for ${campaign.name}: ${designed.hypothesis}`,
  };
}

export async function listMessageExperiments(userId: string, campaignId?: string | null) {
  const campaigns = await getCampaignLookup(userId);
  const experiments = await prisma.messageExperiment.findMany({
    where: { userId, ...(campaignId ? { campaignId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  return experiments.map((item) => ({
    id: item.id,
    campaignId: item.campaignId,
    campaignName: item.campaignId ? campaigns.get(item.campaignId)?.name || null : null,
    goal: item.goal,
    audienceFilter: item.audienceFilter,
    hypothesis: item.hypothesis,
    successMetric: item.successMetric,
    status: item.status,
    suggestedSampleSize: "See experiment details",
    variants: Array.isArray(item.variantsJson) ? (item.variantsJson as Array<{ name: string; angle: string; message: string }>) : [],
    createdAt: item.createdAt,
  })) satisfies ExperimentResult[];
}

export async function reactivateStalePipeline(
  userId: string,
  options?: { campaignId?: string | null; daysStale?: number; limit?: number },
) {
  const staleDays = options?.daysStale || DEFAULT_STALE_DAYS;
  const campaigns = await getCampaignLookup(userId);
  const contacts = await prisma.contact.findMany({
    where: {
      userId,
      ...(options?.campaignId ? { campaignId: options.campaignId } : {}),
      status: { in: ["INVITED", "CONNECTED", "FOLLOWED_UP", "UNRESPONSIVE"] },
    },
    orderBy: { updatedAt: "asc" },
    take: 200,
  });
  const knowledge = await getUserKnowledge(userId);

  const stale = contacts.filter((contact) => {
    if (contact.status === "INVITED") return daysBetween(contact.inviteSentDate || contact.updatedAt) >= staleDays;
    if (contact.status === "CONNECTED") return daysBetween(contact.connectedDate || contact.updatedAt) >= 3;
    if (contact.status === "FOLLOWED_UP") return daysBetween(contact.followupSentDate || contact.updatedAt) >= staleDays;
    if (contact.status === "UNRESPONSIVE") return daysBetween(contact.updatedAt) >= Math.max(staleDays, 30);
    return false;
  });

  const results: ReactivationResult[] = [];
  for (const contact of stale.slice(0, options?.limit || DEFAULT_PRIORITY_LIMIT)) {
    const campaign = contact.campaignId ? campaigns.get(contact.campaignId) || null : null;
    const staleFor = (() => {
      if (contact.status === "INVITED") return daysBetween(contact.inviteSentDate || contact.updatedAt);
      if (contact.status === "CONNECTED") return daysBetween(contact.connectedDate || contact.updatedAt);
      if (contact.status === "FOLLOWED_UP") return daysBetween(contact.followupSentDate || contact.updatedAt);
      return daysBetween(contact.updatedAt);
    })();

    const fallback = {
      reactivationReason: `${contact.name} has been idle for ${staleFor} days and still fits the campaign.`,
      angle: contact.status === "UNRESPONSIVE" ? "Reopen with a fresh angle instead of repeating the original pitch." : "Reconnect around timing and relevance rather than repeating the same ask.",
      draft: `Quick follow-up here in case timing is better now. Happy to share the shortest possible version of why this could be relevant for ${contact.company || "your team"} if useful.`,
    };

    const generated = await tryStructuredLlm<{
      reactivationReason: string;
      angle: string;
      draft: string;
    }>(
      userId,
      getReactivationPrompt(buildCampaignContext(campaign), knowledge),
      [
        `Contact: ${contact.name}`,
        `Company: ${contact.company || "Unknown"}`,
        `Role: ${contact.position || "Unknown"}`,
        `Status: ${contact.status}`,
        `Fit: ${contact.profileFit}`,
        `Fit rationale: ${contact.fitRationale || "None"}`,
        `Stale days: ${staleFor}`,
        `Notes: ${contact.notes || "None"}`,
      ].join("\n"),
      fallback,
    );

    const item: ReactivationResult = {
      contactId: contact.id,
      name: contact.name,
      company: contact.company,
      status: contact.status,
      staleDays: staleFor,
      reactivationReason: generated.reactivationReason,
      angle: generated.angle,
      draft: generated.draft,
    };
    results.push(item);
    await saveInsight(userId, contact.id, contact.campaignId, "reactivation_angle", `${contact.name}: ${generated.angle}`, item);
  }

  return {
    contacts: results,
    message: results.length === 0
      ? "No stale contacts are ready for reactivation right now."
      : `Found ${results.length} stale contact${results.length > 1 ? "s" : ""} worth reactivating.`,
  };
}

export async function prepareMeetingBrief(userId: string, contactId: string) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, userId },
  }) as ContactContext | null;
  if (!contact) return { brief: null, message: "Contact not found." };

  const campaign = contact.campaignId
    ? await prisma.campaign.findFirst({ where: { id: contact.campaignId, userId } })
    : null;
  const knowledge = await getUserKnowledge(userId);
  const relatedInsights = await prisma.contactInsight.findMany({
    where: { userId, contactId },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const timeline = [
    contact.inviteSentDate ? `Invite sent: ${contact.inviteSentDate.toISOString().slice(0, 10)}` : null,
    contact.connectedDate ? `Connected: ${contact.connectedDate.toISOString().slice(0, 10)}` : null,
    contact.followupSentDate ? `Follow-up sent: ${contact.followupSentDate.toISOString().slice(0, 10)}` : null,
    `Current status: ${contact.status}`,
  ].filter(Boolean) as string[];

  const fallback = {
    executiveSummary: `${contact.name} is a ${contact.position || "contact"} at ${contact.company || "an unknown company"} and currently sits at ${contact.status.toLowerCase().replaceAll("_", " ")} in the campaign.`,
    likelyPains: [
      "Current capital or growth priorities may be misaligned with existing financing options.",
      "The team likely wants lower-friction ways to evaluate relevance before committing time.",
    ],
    objectionMap: [
      "Timing may not be right yet.",
      "They may ask whether this is relevant for their exact lending or capital structure.",
    ],
    talkTrack: [
      "Open with the reason the contact was prioritized.",
      "Pressure-test whether the campaign problem is real for their team today.",
      "Close on a clear next step if there is signal.",
    ],
    cta: campaign?.calendarUrl ? "Get agreement for a follow-up call using the campaign calendar." : "Secure a concrete next step or follow-up call.",
  };

  const generated = await tryStructuredLlm<{
    executiveSummary: string;
    likelyPains: string[];
    objectionMap: string[];
    talkTrack: string[];
    cta: string;
  }>(
    userId,
    getMeetingBriefPrompt(buildCampaignContext(campaign), knowledge),
    [
      `Contact: ${contact.name}`,
      `Company: ${contact.company || "Unknown"}`,
      `Role: ${contact.position || "Unknown"}`,
      `Fit: ${contact.profileFit}`,
      `Fit rationale: ${contact.fitRationale || "None"}`,
      `Notes: ${contact.notes || "None"}`,
      `Connection message: ${contact.connectionMessage || "None"}`,
      `Timeline: ${timeline.join(" | ")}`,
      `Recent insights: ${relatedInsights.map((item) => `${item.kind}: ${item.summary}`).join(" | ") || "None"}`,
    ].join("\n"),
    fallback,
  );

  const brief: MeetingBriefResult = {
    contactId: contact.id,
    contactName: contact.name,
    campaignName: campaign?.name || null,
    executiveSummary: generated.executiveSummary,
    likelyPains: generated.likelyPains,
    objectionMap: generated.objectionMap,
    talkTrack: generated.talkTrack,
    cta: generated.cta,
    timeline,
  };

  await saveInsight(userId, contact.id, contact.campaignId, "meeting_brief", generated.executiveSummary, brief);
  return {
    brief,
    message: `Meeting brief ready for ${contact.name}.`,
  };
}
