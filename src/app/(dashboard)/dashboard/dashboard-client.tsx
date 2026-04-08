"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Send, Loader2, Users, UserCheck, Inbox, Calendar, Copy, Check,
  ChevronRight, ChevronDown, ThumbsUp, ThumbsDown, MessageSquare,
  Zap, Settings, ExternalLink, Clock, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DynamicWidgetGrid, type DynamicWidgetConfig } from "@/components/dynamic-widget-renderer";

/* ─────────────── Types ─────────────── */

interface Segment {
  type: "thinking" | "text";
  steps?: string[];
  content?: string;
  done: boolean;
  elapsedMs?: number;
  tokens?: number;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  segments?: Segment[];
}

interface Stats {
  total: number;
  toContact: number;
  invited: number;
  connected: number;
  replied: number;
  meetings: number;
}

interface PriorityItem {
  contactId: string;
  contactName: string;
  company: string | null;
  priorityScore: number;
  whyNow: string;
  nextBestAction: string;
}

interface Suggestion {
  text: string;
  message: string;
  tag?: string;
  tagColor?: string;
}

interface CampaignSummary {
  id: string;
  name: string;
  isActive: boolean;
  icpDefinition?: string | null;
  description?: string | null;
}

/* ─────────────── Suggestions ─────────────── */

function getSuggestions(stats: Stats): Suggestion[] {
  const s: Array<Suggestion & { priority: number }> = [];

  if (stats.replied > 0) {
    s.push({ text: `Reply strategy for ${stats.replied} contact${stats.replied > 1 ? "s" : ""} who replied`, message: "List contacts who replied and draft a reply strategy for each one", tag: "Replies", tagColor: "text-red-500 bg-red-500/10", priority: 100 });
  }
  if (stats.meetings > 0) {
    s.push({ text: `Meeting brief for ${stats.meetings} booked call${stats.meetings > 1 ? "s" : ""}`, message: "Find my meeting-booked contacts and prepare a full meeting brief with background, objections, and talk track for each", tag: "Meeting", tagColor: "text-purple-500 bg-purple-500/10", priority: 95 });
  }
  if (stats.connected > 0) {
    s.push({ text: `Send follow-ups to ${stats.connected} connected contact${stats.connected > 1 ? "s" : ""}`, message: "Send follow-up messages to all connected contacts who haven't received one yet", tag: "Follow-up", tagColor: "text-blue-500 bg-blue-500/10", priority: 85 });
  }
  if (stats.invited > 0) {
    s.push({ text: `Check ${stats.invited} pending invite${stats.invited > 1 ? "s" : ""} for acceptance`, message: "Check connections and inbox — show me which invites were accepted and if anyone replied", tag: "Check", tagColor: "text-amber-500 bg-amber-500/10", priority: 80 });
  }
  if (stats.toContact > 0) {
    s.push({ text: `Score ${stats.toContact} contact${stats.toContact > 1 ? "s" : ""} waiting in queue`, message: "Score all unscored contacts and then prepare invites for the HIGH fit ones", tag: "Score", tagColor: "text-sky-500 bg-sky-500/10", priority: 75 });
  }
  if (stats.total >= 5) {
    s.push({ text: "Prioritize pipeline by expected value", message: "Prioritize the pipeline by expected value and give me the top 5 actions to take right now with clear next steps", tag: "Ops", tagColor: "text-teal-500 bg-teal-500/10", priority: 70 });
  }
  if (stats.total >= 5) {
    s.push({ text: "Build account map — buying committee coverage", message: "Build the account map for this campaign and show me buying-committee coverage per company with suggested next moves", tag: "Ops", tagColor: "text-teal-500 bg-teal-500/10", priority: 65 });
  }
  if (stats.total >= 10) {
    s.push({ text: "Reactivate stale contacts", message: "Find contacts with no activity in 30+ days and generate reactivation angles and draft messages for each", tag: "Reactivate", tagColor: "text-orange-500 bg-orange-500/10", priority: 60 });
  }
  if (stats.total >= 5) {
    s.push({ text: "Design a message A/B experiment", message: "Design a structured message A/B experiment for this campaign to improve reply rates — create 2 variants with different angles", tag: "Experiment", tagColor: "text-indigo-500 bg-indigo-500/10", priority: 50 });
  }
  if (stats.total === 0) {
    s.push({ text: "Discover 25 prospects to get started", message: "Let's start — search LinkedIn for 25 prospects matching my ICP and assign them to the active campaign", tag: "Start", tagColor: "text-green-500 bg-green-500/10", priority: 90 });
  } else {
    s.push({ text: "Discover more prospects", message: "Discover 20 more prospects for the active campaign — search LinkedIn by job title and location matching my ICP", tag: "Discover", tagColor: "text-green-500 bg-green-500/10", priority: 30 });
  }
  if (stats.total > 0) {
    s.push({ text: "Run the full daily cycle", message: "Run the full daily cycle: check connections, send follow-ups, scan inbox", tag: "Cycle", tagColor: "text-muted-foreground bg-muted/40", priority: 20 });
  }
  s.push({ text: "What should we do next?", message: "What should we do next? Give me a prioritized action plan based on the current pipeline state.", priority: 10 });
  return s.sort((a, b) => b.priority - a.priority).slice(0, 8);
}

/* ─────────────── Main component ─────────────── */

// sessionStorage key for chat history per campaign
function chatStorageKey(cid?: string) { return `chat_msgs_${cid ?? "global"}`; }
function readCachedMessages(cid?: string): Message[] {
  try {
    const raw = typeof window !== "undefined" ? sessionStorage.getItem(chatStorageKey(cid)) : null;
    return raw ? (JSON.parse(raw) as Message[]) : [];
  } catch { return []; }
}
function writeCachedMessages(cid: string | undefined, msgs: Message[]) {
  try { sessionStorage.setItem(chatStorageKey(cid), JSON.stringify(msgs.slice(-60))); } catch {}
}

export default function DashboardPage({ campaignId }: { campaignId?: string }) {
  // Restore from sessionStorage instantly — prevents flash of empty chat on navigation back
  const [messages, setMessages] = useState<Message[]>(() => readCachedMessages(campaignId));
  const [historyLoading, setHistoryLoading] = useState(true);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [liveSegments, setLiveSegments] = useState<Segment[]>([]);
  const [history, setHistory] = useState<Array<{ role: string; content: string }>>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, toContact: 0, invited: 0, connected: 0, replied: 0, meetings: 0 });
  const [priorities, setPriorities] = useState<PriorityItem[]>([]);
  const [ratings, setRatings] = useState<Map<number, "up" | "down">>(new Map());
  const [feedbackOpen, setFeedbackOpen] = useState<number | null>(null);
  const [feedbackWrong, setFeedbackWrong] = useState("");
  const [feedbackExpected, setFeedbackExpected] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);
  const [widgetContext, setWidgetContext] = useState<{ label: string } | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [campaignData, setCampaignData] = useState<CampaignSummary | null>(null);
  const [panelWidth, setPanelWidth] = useState(360);
  const [widgets, setWidgets] = useState<DynamicWidgetConfig[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initializedRef = useRef(false);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(360);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  useEffect(scrollToBottom, [messages, liveSegments, scrollToBottom]);

  // Resize panel drag logic
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = panelWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  }, [panelWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = dragStartXRef.current - e.clientX;
      const next = Math.max(260, Math.min(640, dragStartWidthRef.current + delta));
      setPanelWidth(next);
    };
    const onUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const cq = campaignId ? `&campaignId=${campaignId}` : "";
      const statuses = ["TO_CONTACT", "INVITED", "CONNECTED", "REPLIED", "MEETING_BOOKED"];
      const results = await Promise.all(
        statuses.map(s => fetch(`/api/contacts?status=${s}&limit=1${cq}`).then(r => r.json()).then(d => ({ s, n: d.total || 0 })))
      );
      const total = await fetch(`/api/contacts?limit=1${cq}`).then(r => r.json()).then(d => d.total || 0);
      const m: Record<string, number> = {};
      results.forEach(r => m[r.s] = r.n);
      setStats({ total, toContact: m.TO_CONTACT || 0, invited: m.INVITED || 0, connected: m.CONNECTED || 0, replied: m.REPLIED || 0, meetings: m.MEETING_BOOKED || 0 });
    } catch {}
  }, [campaignId]);

  const fetchPriorities = useCallback(async () => {
    try {
      const params = campaignId ? `?campaignId=${campaignId}&limit=4` : "?limit=4";
      const res = await fetch(`/api/pipeline/priorities${params}`);
      const data = await res.json();
      setPriorities(data.priorities || []);
    } catch {}
  }, [campaignId]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const timeout = setTimeout(() => {
      void fetchStats();
      void fetchPriorities();
      if (campaignId) {
        fetch(`/api/campaigns/${campaignId}`)
          .then(r => r.json())
          .then(d => d.campaign && setCampaignData(d.campaign))
          .catch(() => {});
      } else {
        fetch("/api/campaigns")
          .then(r => r.json())
          .then(d => setCampaigns(d.campaigns || []))
          .catch(() => {});
      }
      fetch(`/api/chat${campaignId ? `?campaignId=${campaignId}` : ""}`)
        .then(r => r.json())
        .then(data => {
          const freshMsgs: Message[] = data.history?.length > 0
            ? data.history.map((m: { role: string; content: string }) => ({ role: m.role as "user" | "assistant", content: m.content }))
            : [];
          if (data.history?.length > 0) {
            setMessages(freshMsgs);
            setHistory(data.history);
            // Persist to sessionStorage so navigation back restores instantly
            writeCachedMessages(campaignId, freshMsgs);
          }
          // Only show greeting when there's no conversation history yet
          if (data.greeting && freshMsgs.length === 0) {
            setMessages([{ role: "assistant", content: data.greeting }]);
          }
          setHistoryLoading(false);
          // Fetch custom widgets for this dashboard
          const wParams = campaignId ? `?campaignId=${campaignId}` : "";
          fetch(`/api/widgets${wParams}`)
            .then(r => r.json())
            .then(d => setWidgets(d.widgets || []))
            .catch(() => {});
        })
        .catch(() => { setHistoryLoading(false); });
    }, 0);
    return () => clearTimeout(timeout);
  }, [campaignId, fetchPriorities, fetchStats]);

  const openAI = useCallback((label: string) => {
    setWidgetContext({ label });
    setPanelOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const sendMessage = async (text?: string) => {
    const rawMsg = text || input.trim();
    if (!rawMsg || loading) return;
    const contextMsg = widgetContext ? `[Context: ${widgetContext.label}]\n\n${rawMsg}` : rawMsg;
    setWidgetContext(null);
    setInput("");
    setMessages(prev => {
      const next = [...prev, { role: "user" as const, content: rawMsg }];
      writeCachedMessages(campaignId, next);
      return next;
    });
    setLoading(true);
    setLiveSegments([]);

    const startTime = Date.now();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: contextMsg, history, campaignId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        toast.error(err.error || "Failed");
        setMessages(prev => [...prev, { role: "assistant", content: `Error: ${err.error}` }]);
        setLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) { setLoading(false); return; }

      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";
      let streamTokens = 0;
      let segs: Segment[] = [];

      const pushSeg = (s: Segment) => { segs = [...segs, s]; };
      const replaceLast = (s: Segment) => { segs = [...segs.slice(0, -1), s]; };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const { type, data } = JSON.parse(line.substring(6));
            switch (type) {
              case "thinking": {
                const last = segs[segs.length - 1];
                if (last?.type === "thinking" && !last.done) {
                  replaceLast({ ...last, steps: [...(last.steps || []), data] });
                } else {
                  pushSeg({ type: "thinking", steps: [data], done: false });
                }
                setLiveSegments([...segs]);
                break;
              }
              case "content": {
                fullContent += data;
                const last = segs[segs.length - 1];
                if (last?.type === "thinking" && !last.done) replaceLast({ ...last, done: true });
                const last2 = segs[segs.length - 1];
                if (last2?.type === "text") {
                  replaceLast({ ...last2, content: (last2.content || "") + data });
                } else {
                  pushSeg({ type: "text", content: data, done: false });
                }
                setLiveSegments([...segs]);
                break;
              }
              case "clear": {
                fullContent = "";
                segs = segs.filter(s => s.type === "thinking").map(s => ({ ...s, done: true }));
                setLiveSegments([...segs]);
                break;
              }
              case "done": {
                try { const p = JSON.parse(data); if (p.tokens) streamTokens = p.tokens; } catch {}
                break;
              }
              case "error":
                toast.error(data);
                if (!fullContent) fullContent = data;
                break;
            }
          } catch { /* skip */ }
        }
      }

      if (!fullContent) {
        fullContent = segs.filter(s => s.type === "text").map(s => s.content || "").join("");
      }

      const elapsedMs = Date.now() - startTime;

      // Mark all done, attach timing+tokens to last thinking segment
      let finalSegments: Segment[] = segs.map(s => ({ ...s, done: true }));
      const lastThinkIdx = [...finalSegments].map((s, i) => s.type === "thinking" ? i : -1).filter(x => x >= 0).at(-1);
      if (lastThinkIdx !== undefined) {
        finalSegments[lastThinkIdx] = { ...finalSegments[lastThinkIdx], elapsedMs, tokens: streamTokens || undefined };
      }

      if (fullContent) {
        setMessages(prev => {
          const next = [...prev, { role: "assistant" as const, content: fullContent, segments: finalSegments }];
          writeCachedMessages(campaignId, next);
          return next;
        });
        setHistory(prev => [...prev, { role: "user", content: rawMsg }, { role: "assistant", content: fullContent }].slice(-30));
      }
      setLoading(false);
      setLiveSegments([]);

      if (fullContent) { fetchStats(); fetchPriorities(); }
    } catch { toast.error("Connection failed"); setLoading(false); setLiveSegments([]); }

    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleRate = async (msgIdx: number, content: string, rating: "up" | "down") => {
    if (ratings.has(msgIdx)) return;
    setRatings(prev => new Map(prev).set(msgIdx, rating));
    if (rating === "down") {
      setFeedbackOpen(msgIdx); setFeedbackWrong(""); setFeedbackExpected("");
    } else {
      await fetch("/api/chat/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageContent: content, rating: "up" }) });
    }
  };

  const submitFeedback = async (msgIdx: number, content: string) => {
    await fetch("/api/chat/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageContent: content, rating: "down", wrongText: feedbackWrong, expectedText: feedbackExpected }) });
    setFeedbackOpen(null); setFeedbackWrong(""); setFeedbackExpected("");
    toast.success("Feedback saved — the agent will learn from this");
  };

  const handleDeleteWidget = async (widgetId: string) => {
    await fetch(`/api/widgets?id=${widgetId}`, { method: "DELETE" });
    setWidgets(prev => prev.filter(w => w.id !== widgetId));
  };

  const suggestions = getSuggestions(stats);

  return (
    <div className="flex flex-row h-[calc(100vh-48px)] -mx-6 -mt-6 -mb-6 overflow-hidden">

      {/* ───── LEFT: Dashboard ───── */}
      <div className="flex-1 min-w-0 overflow-y-auto p-6 space-y-5">

        {/* Row 1 — KPI MetricCards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard label="Total Contacts" value={stats.total} icon={Users} onAskAI={() => openAI("Pipeline Stats")} />
          <MetricCard label="Invited" value={stats.invited} icon={Send} onAskAI={() => openAI("Invited Contacts")} />
          <MetricCard label="Connected" value={stats.connected} icon={UserCheck} onAskAI={() => openAI("Connected Contacts")} />
          <MetricCard label="Meetings" value={stats.meetings} icon={Calendar} onAskAI={() => openAI("Meetings Booked")} />
        </div>

        {/* Row 2 — Campaign card (global list OR campaign info) + Priorities */}
        <div className="grid grid-cols-2 gap-3">

          {/* Left card: global = campaigns list, campaign = campaign info */}
          {campaignId ? (
            <CampaignInfoCard campaign={campaignData} campaignId={campaignId} onAskAI={() => openAI("Campaign Settings")} />
          ) : (
            <CampaignsListCard campaigns={campaigns} onAskAI={() => openAI("Campaigns")} />
          )}

          {/* Right card: Priority contacts */}
          <Card size="sm" className="group/card-widget">
            <CardHeader className="border-b border-border/50 pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Top Priorities</CardTitle>
                <button onClick={() => openAI("Priority Contacts")} className="opacity-0 group-hover/card-widget:opacity-100 transition-opacity text-[10px] font-medium text-primary bg-primary/10 hover:bg-primary/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Zap className="h-2.5 w-2.5" />Ask AI
                </button>
              </div>
            </CardHeader>
            <CardContent className="pt-2 pb-1 space-y-0.5">
              {priorities.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">Run pipeline prioritization to see top contacts</p>
              ) : (
                priorities.map(item => (
                  <button key={item.contactId} onClick={() => { setPanelOpen(true); sendMessage(`Why is ${item.contactName} a priority and what should we do next?`); }}
                    className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-accent/40 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{item.contactName}{item.company ? ` · ${item.company}` : ""}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{item.whyNow}</p>
                      </div>
                      <span className="shrink-0 font-mono text-xs font-semibold text-foreground">{item.priorityScore}</span>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Row 3 — Suggested Actions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Suggested Actions</p>
            {messages.length > 0 && !panelOpen && (
              <button onClick={() => setPanelOpen(true)} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />{messages.length} messages in AI chat →
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => { setPanelOpen(true); sendMessage(s.message); }}
                className="text-left text-xs px-3 py-2.5 rounded-lg border border-border hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground flex flex-col gap-1">
                <span>{s.text}</span>
                {s.tag && <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full self-start ${s.tagColor}`}>{s.tag}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Row 4 — Dynamic widgets (agent-created) */}
        {widgets.length > 0 && (
          <DynamicWidgetGrid
            widgets={widgets}
            campaignId={campaignId}
            onDelete={handleDeleteWidget}
          />
        )}
      </div>

      {/* ───── Resize handle ───── */}
      {panelOpen && (
        <div
          onMouseDown={handleResizeStart}
          className="w-[5px] shrink-0 relative group cursor-col-resize hover:bg-primary/20 transition-colors z-10"
          title="Drag to resize"
        >
          {/* Visual grip dots */}
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 flex flex-col items-center justify-center gap-[3px] opacity-0 group-hover:opacity-100 transition-opacity">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="w-[3px] h-[3px] rounded-full bg-muted-foreground/60" />
            ))}
          </div>
        </div>
      )}

      {/* ───── RIGHT: AI Panel ───── */}
      {panelOpen ? (
        <div className="shrink-0 flex flex-col border-l border-border bg-card/20" style={{ width: panelWidth }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 h-10 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold text-foreground">AI Assistant</span>
              {campaignId && campaignData && (
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded truncate max-w-[100px]">{campaignData.name}</span>
              )}
              {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </div>
            <button onClick={() => setPanelOpen(false)} className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Collapse">
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
            {/* Loading skeleton — shown only on first mount while fetching from DB */}
            {historyLoading && messages.length === 0 && (
              <div className="space-y-3 pt-2 animate-pulse">
                <div className="h-3 w-3/4 rounded bg-muted" />
                <div className="h-3 w-1/2 rounded bg-muted" />
                <div className="flex justify-end"><div className="h-7 w-2/3 rounded-2xl bg-muted" /></div>
                <div className="h-3 w-4/5 rounded bg-muted" />
                <div className="h-3 w-3/5 rounded bg-muted" />
              </div>
            )}
            {messages.length === 0 && !loading && !historyLoading && (
              <div className="space-y-1.5 pt-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Quick actions</p>
                {suggestions.slice(0, 4).map((s, i) => (
                  <button key={i} onClick={() => sendMessage(s.message)}
                    className="w-full text-left text-xs px-3 py-2 rounded-lg border border-border hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground flex flex-col gap-0.5">
                    <span>{s.text}</span>
                    {s.tag && <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full self-start ${s.tagColor}`}>{s.tag}</span>}
                  </button>
                ))}
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={cn("group", msg.role === "user" ? "flex justify-end" : "")}>
                {msg.role === "user" ? (
                  <div className="flex items-start gap-1.5 max-w-[85%]">
                    <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-3 py-2 text-xs">{msg.content}</div>
                    <CopyButton text={msg.content} />
                  </div>
                ) : (
                  <div className="space-y-1">
                    {msg.segments && msg.segments.length > 0 ? (
                      msg.segments.map((seg, si) =>
                        seg.type === "thinking" ? (
                          <ExecutionCard key={si} steps={seg.steps || []} done={seg.done} elapsedMs={seg.elapsedMs} tokens={seg.tokens} />
                        ) : (
                          <div key={si} className="text-xs text-foreground leading-relaxed prose-agent" dangerouslySetInnerHTML={{ __html: fmtMd(seg.content || "") }} />
                        )
                      )
                    ) : (
                      <div className="text-xs text-foreground leading-relaxed prose-agent" dangerouslySetInnerHTML={{ __html: fmtMd(msg.content) }} />
                    )}
                    <div className="flex items-start gap-1.5"><CopyButton text={msg.content} /></div>
                    <div className="flex items-center gap-1 pt-0.5 pl-0.5">
                      {ratings.get(i) === undefined ? (
                        <>
                          <button onClick={() => handleRate(i, msg.content, "up")} className="opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 rounded flex items-center justify-center text-muted-foreground/50 hover:text-green-500 hover:bg-green-500/10"><ThumbsUp className="h-3 w-3" /></button>
                          <button onClick={() => handleRate(i, msg.content, "down")} className="opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 rounded flex items-center justify-center text-muted-foreground/50 hover:text-red-500 hover:bg-red-500/10"><ThumbsDown className="h-3 w-3" /></button>
                        </>
                      ) : ratings.get(i) === "up" ? (
                        <span className="flex items-center gap-1 text-[10px] text-green-500"><ThumbsUp className="h-3 w-3" /></span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-red-500"><ThumbsDown className="h-3 w-3" /></span>
                      )}
                    </div>
                    {feedbackOpen === i && (
                      <div className="mt-2 p-2.5 rounded-xl border border-border bg-card space-y-2">
                        <p className="text-xs font-medium">What was wrong?</p>
                        <textarea value={feedbackWrong} onChange={e => setFeedbackWrong(e.target.value)} placeholder="Describe what was incorrect..." className="w-full resize-none bg-transparent border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 min-h-[48px]" rows={2} />
                        <p className="text-xs font-medium">What did you expect?</p>
                        <textarea value={feedbackExpected} onChange={e => setFeedbackExpected(e.target.value)} placeholder="Describe the ideal response..." className="w-full resize-none bg-transparent border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 min-h-[48px]" rows={2} />
                        <div className="flex gap-1.5">
                          <Button size="sm" className="h-6 text-xs px-2" onClick={() => submitFeedback(i, msg.content)} disabled={!feedbackWrong.trim() && !feedbackExpected.trim()}>Submit</Button>
                          <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => { setFeedbackOpen(null); setRatings(prev => { const n = new Map(prev); n.delete(i); return n; }); }}>Cancel</Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Live streaming */}
            {loading && (
              <div className="space-y-1">
                {liveSegments.length === 0 && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /><span>Thinking...</span>
                  </div>
                )}
                {liveSegments.map((seg, i) => {
                  const isLastSeg = i === liveSegments.length - 1;
                  if (seg.type === "thinking") {
                    return <ExecutionCard key={i} steps={seg.steps || []} done={false} />;
                  }
                  return (
                    <div key={i} className="text-xs text-foreground leading-relaxed prose-agent">
                      <span dangerouslySetInnerHTML={{ __html: fmtMd(seg.content || "") }} />
                      {isLastSeg && <span className="inline-block w-[2px] h-[12px] bg-foreground/70 animate-pulse ml-0.5 align-middle" />}
                    </div>
                  );
                })}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border px-3 py-2.5 shrink-0">
            {widgetContext && (
              <div className="flex items-center gap-1 mb-2">
                <span className="text-[10px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full flex items-center gap-1.5">
                  ✦ {widgetContext.label}
                  <button onClick={() => setWidgetContext(null)} className="text-primary/70 hover:text-primary leading-none">×</button>
                </span>
              </div>
            )}
            <div className="flex gap-1.5 items-end">
              <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
                placeholder={widgetContext ? `Ask about ${widgetContext.label}...` : "Message the agent..."}
                disabled={loading}
                className="flex-1 resize-none bg-transparent border border-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 min-h-[36px] max-h-[100px]"
                rows={1} />
              <Button onClick={() => sendMessage()} disabled={loading || !input.trim()} size="icon" className="h-8 w-8 rounded-xl shrink-0">
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* Collapsed strip */
        <div className="w-10 shrink-0 flex flex-col items-center border-l border-border bg-card/20 py-3">
          <button onClick={() => setPanelOpen(true)} className="relative p-1.5 hover:bg-muted rounded-lg transition-colors" title="Open AI Assistant">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            {(messages.length > 0 || loading) && <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-blue-500" />}
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────── MetricCard ─────────────── */

function MetricCard({ label, value, icon: Icon, onAskAI }: {
  label: string; value: number;
  icon: React.ComponentType<{ className?: string }>;
  onAskAI: () => void;
}) {
  return (
    <Card size="sm" className="relative group/metric">
      <CardContent className="pt-3 pb-3">
        <div className="flex items-center justify-between mb-2">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <button onClick={onAskAI} className="opacity-0 group-hover/metric:opacity-100 transition-opacity text-[10px] font-medium text-primary bg-primary/10 hover:bg-primary/20 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Zap className="h-2.5 w-2.5" />Ask AI
          </button>
        </div>
        <p className="text-2xl font-mono font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}

/* ─────────────── CampaignsListCard (global view) ─────────────── */

function CampaignsListCard({ campaigns, onAskAI }: { campaigns: CampaignSummary[]; onAskAI: () => void }) {
  return (
    <Card size="sm" className="group/card-widget">
      <CardHeader className="border-b border-border/50 pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Campaigns</CardTitle>
          <button onClick={onAskAI} className="opacity-0 group-hover/card-widget:opacity-100 transition-opacity text-[10px] font-medium text-primary bg-primary/10 hover:bg-primary/20 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Zap className="h-2.5 w-2.5" />Ask AI
          </button>
        </div>
      </CardHeader>
      <CardContent className="pt-2 pb-1 space-y-1">
        {campaigns.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No campaigns yet</p>
        ) : (
          campaigns.slice(0, 5).map(c => (
            <div key={c.id} className="flex items-center justify-between gap-2 py-1.5 group/row">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`shrink-0 h-1.5 w-1.5 rounded-full ${c.isActive ? "bg-green-500" : "bg-muted-foreground/30"}`} />
                <span className="text-xs text-foreground truncate">{c.name}</span>
              </div>
              <Link href={`/dashboard/${c.id}`} className="shrink-0 text-[10px] text-muted-foreground hover:text-primary opacity-0 group-hover/row:opacity-100 transition-opacity">
                Open →
              </Link>
            </div>
          ))
        )}
        {campaigns.length > 5 && <p className="text-[10px] text-muted-foreground pt-1">+{campaigns.length - 5} more</p>}
      </CardContent>
    </Card>
  );
}

/* ─────────────── CampaignInfoCard (campaign view) ─────────────── */

function CampaignInfoCard({ campaign, campaignId, onAskAI }: { campaign: CampaignSummary | null; campaignId: string; onAskAI: () => void }) {
  return (
    <Card size="sm" className="group/card-widget">
      <CardHeader className="border-b border-border/50 pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Campaign</CardTitle>
          <div className="flex items-center gap-1.5">
            <button onClick={onAskAI} className="opacity-0 group-hover/card-widget:opacity-100 transition-opacity text-[10px] font-medium text-primary bg-primary/10 hover:bg-primary/20 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Zap className="h-2.5 w-2.5" />Ask AI
            </button>
            <Link href={`/campaigns/${campaignId}`} className="opacity-0 group-hover/card-widget:opacity-100 transition-opacity text-muted-foreground hover:text-foreground">
              <Settings className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-3 pb-2 space-y-2">
        {!campaign ? (
          <p className="text-xs text-muted-foreground">Loading...</p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${campaign.isActive ? "bg-green-500" : "bg-muted-foreground/40"}`} />
              <p className="text-sm font-semibold text-foreground truncate">{campaign.name}</p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${campaign.isActive ? "text-green-600 bg-green-500/10" : "text-muted-foreground bg-muted/50"}`}>
                {campaign.isActive ? "Active" : "Paused"}
              </span>
            </div>
            {campaign.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">{campaign.description}</p>
            )}
            {campaign.icpDefinition && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">ICP</p>
                <p className="text-xs text-foreground/80 line-clamp-3 leading-relaxed">{campaign.icpDefinition.substring(0, 180)}{campaign.icpDefinition.length > 180 ? "…" : ""}</p>
              </div>
            )}
            <Link href={`/campaigns/${campaignId}`} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors mt-1">
              <ExternalLink className="h-3 w-3" />Edit campaign settings
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ─────────────── ExecutionCard (replaces TaskGroup + LiveTaskGroup) ─────────────── */

function ExecutionCard({ steps, done, elapsedMs, tokens }: {
  steps: string[];
  done: boolean;
  elapsedMs?: number;
  tokens?: number;
}) {
  const [expanded, setExpanded] = useState(!done); // live = expanded; done = collapsed
  const groups = groupSteps(steps);
  const doneCount = done ? groups.length : Math.max(0, groups.length - 1);

  // When segment transitions to done, collapse
  useEffect(() => { if (done) setExpanded(false); }, [done]);

  const hasFooter = done && (elapsedMs !== undefined || tokens !== undefined);

  return (
    <div className="mb-2 rounded-lg border border-border/60 bg-card/40 overflow-hidden text-xs">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-accent/30 transition-colors"
      >
        <span className="text-muted-foreground font-medium">
          {done
            ? `${groups.length} step${groups.length !== 1 ? "s" : ""} completed`
            : groups.length > 0
              ? groups[groups.length - 1].label + "..."
              : "Processing..."}
        </span>
        <span className="flex items-center gap-1.5 shrink-0 ml-2">
          {!done && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </span>
      </button>

      {/* Step rows */}
      {expanded && (
        <div className="border-t border-border/40">
          {groups.map((g, gi) => {
            const isDone = done || gi < groups.length - 1;
            const isLive = !done && gi === groups.length - 1;
            const callCount = g.steps.filter(s => s.toLowerCase().includes("executing:") || s.includes("✓") || s.includes("✅")).length;
            return (
              <div key={gi} className="flex items-center gap-2.5 px-3 py-1.5 border-b border-border/20 last:border-0">
                {/* Status icon */}
                <span className={cn("shrink-0 h-4 w-4 rounded flex items-center justify-center", isDone ? "bg-green-500/15" : isLive ? "bg-muted" : "bg-muted/50")}>
                  {isDone
                    ? <Check className="h-2.5 w-2.5 text-green-500" />
                    : isLive
                      ? <Loader2 className="h-2.5 w-2.5 text-muted-foreground animate-spin" />
                      : <span className="h-[2px] w-3 bg-muted-foreground/40 rounded" />}
                </span>
                {/* Label */}
                <span className={cn("flex-1 truncate", isDone ? "text-foreground" : isLive ? "text-foreground" : "text-muted-foreground")}>
                  {g.label}
                </span>
                {/* Call count badge */}
                {callCount > 0 && (
                  <span className="shrink-0 text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded font-mono">
                    {callCount} {callCount === 1 ? "call" : "calls"}
                  </span>
                )}
                {/* Status badge */}
                <span className={cn("shrink-0 text-[10px] font-medium", isDone ? "text-green-500" : isLive ? "text-amber-500" : "text-muted-foreground")}>
                  {isDone ? "Done" : isLive ? "Running" : "—"}
                </span>
              </div>
            );
          })}

          {/* Footer: elapsed + tokens */}
          {hasFooter && (
            <div className="flex items-center gap-3 px-3 py-1.5 bg-muted/20 text-[10px] text-muted-foreground border-t border-border/20">
              {elapsedMs !== undefined && (
                <span className="flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />{(elapsedMs / 1000).toFixed(1)}s
                </span>
              )}
              {tokens !== undefined && tokens > 0 && (
                <span className="flex items-center gap-1">
                  <Sparkles className="h-2.5 w-2.5" />{tokens.toLocaleString()} tokens
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────── Helpers ─────────────── */

function groupSteps(steps: string[]): Array<{ label: string; steps: string[] }> {
  const groups: Array<{ label: string; steps: string[] }> = [];
  let current: { label: string; steps: string[] } | null = null;
  for (const s of steps) {
    const label = getStepGroup(s);
    if (!current || current.label !== label) { current = { label, steps: [s] }; groups.push(current); }
    else current.steps.push(s);
  }
  return groups;
}

function getStepGroup(step: string): string {
  const lower = step.toLowerCase();
  if (lower.includes("executing: discover") || lower.includes("searching linkedin")) return "Discovering prospects";
  if (lower.includes("executing: score") || lower.includes("scoring")) return "Scoring contacts";
  if (lower.includes("executing: prepare") || lower.includes("preparing")) return "Preparing invites";
  if (lower.includes("executing: send invite") || lower.includes("sending invite")) return "Sending invites";
  if (lower.includes("executing: send followup") || lower.includes("sending follow")) return "Sending follow-ups";
  if (lower.includes("executing: check") || lower.includes("checking")) return "Checking connections";
  if (lower.includes("cooldown") || lower.includes("auto-waiting") || lower.includes("waiting")) return "Waiting for cooldown";
  if (lower.includes("executing: diagnose") || lower.includes("diagnosing")) return "Diagnosing error";
  if (lower.includes("executing: get") || lower.includes("pipeline") || lower.includes("usage")) return "Fetching data";
  if (lower.includes("executing: learn") || lower.includes("knowledge")) return "Updating knowledge";
  if (lower.includes("executing: list") || lower.includes("campaigns")) return "Listing campaigns";
  if (lower.includes("thinking") || lower.includes("analyzing")) return "Analyzing";
  if (lower.includes("generating summary")) return "Generating response";
  return "Processing";
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} }}
      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1 w-6 h-6 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground/50 hover:text-foreground" title="Copy">
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

// ─────────────────────── Markdown renderer ───────────────────────
// Converts agent markdown to clean HTML — handles tables as cards, not pipe-text.

function inlineMd(t: string): string {
  return t
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function parseTable(lines: string[]): string {
  // lines[0] = header row, lines[1] = separator row (---), lines[2..] = data rows
  const parseRow = (line: string) =>
    line.split("|").map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);

  const headers = parseRow(lines[0]);
  const rows = lines.slice(2).map(parseRow);

  const thCells = headers.map(h => `<th>${inlineMd(h)}</th>`).join("");
  const trRows = rows.map(r => {
    const tds = headers.map((_, i) => `<td>${inlineMd(r[i] ?? "")}</td>`).join("");
    return `<tr>${tds}</tr>`;
  }).join("");

  return `<table class="md-table"><thead><tr>${thCells}</tr></thead><tbody>${trRows}</tbody></table>`;
}

function fmtMd(t: string): string {
  const lines = t.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Table detection ──────────────────────────────────────────
    if (line.trim().startsWith("|") && lines[i + 1]?.trim().match(/^\|[-| :]+\|$/)) {
      const tableLines: string[] = [line];
      // separator row
      tableLines.push(lines[i + 1]);
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      out.push(parseTable(tableLines));
      continue;
    }

    // ── Horizontal rule / section separator ─────────────────────
    if (line.trim() === "---") {
      out.push('<hr class="md-hr"/>');
      i++; continue;
    }

    // ── Next step callout ────────────────────────────────────────
    if (/^💡\s*\*?\*?Next step/i.test(line.trim()) || /^---\s*$/.test(line.trim()) && /💡/.test(lines[i + 1] ?? "")) {
      // Collect next-step block (everything on the same line + continuation)
      const content = line.replace(/^💡\s*/, "");
      out.push(`<div class="md-nextstep">💡 ${inlineMd(content)}</div>`);
      i++; continue;
    }

    // ── Headings ─────────────────────────────────────────────────
    if (/^### (.+)/.test(line)) { out.push(`<h4>${inlineMd(line.replace(/^### /, ""))}</h4>`); i++; continue; }
    if (/^## (.+)/.test(line))  { out.push(`<h3>${inlineMd(line.replace(/^## /, ""))}</h3>`); i++; continue; }
    if (/^# (.+)/.test(line))   { out.push(`<h2>${inlineMd(line.replace(/^# /, ""))}</h2>`); i++; continue; }

    // ── Bullet list ───────────────────────────────────────────────
    if (/^[*-] (.+)/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[*-] (.+)/.test(lines[i])) {
        items.push(`<li>${inlineMd(lines[i].replace(/^[*-] /, ""))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // ── Numbered list ─────────────────────────────────────────────
    if (/^\d+\. (.+)/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. (.+)/.test(lines[i])) {
        items.push(`<li>${inlineMd(lines[i].replace(/^\d+\. /, ""))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    // ── Empty line ────────────────────────────────────────────────
    if (line.trim() === "") { out.push("<br/>"); i++; continue; }

    // ── Plain paragraph ───────────────────────────────────────────
    out.push(`<p>${inlineMd(line)}</p>`);
    i++;
  }

  return out.join("");
}
