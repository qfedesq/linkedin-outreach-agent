"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Send, Loader2, Users, UserCheck, Inbox, Calendar, Copy, Check,
  ChevronRight, ChevronDown, ThumbsUp, ThumbsDown, MessageSquare, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Segment {
  type: "thinking" | "text";
  steps?: string[];
  content?: string;
  done: boolean;
}
interface Message { role: "user" | "assistant"; content: string; segments?: Segment[] }
interface Stats { total: number; toContact: number; invited: number; connected: number; replied: number; meetings: number }
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

function getSuggestions(stats: Stats): Suggestion[] {
  const s: Array<Suggestion & { priority: number }> = [];

  // ── Urgent: replies need a strategy NOW ─────────────────────────────────
  if (stats.replied > 0) {
    s.push({
      text: `Reply strategy for ${stats.replied} contact${stats.replied > 1 ? "s" : ""} who replied`,
      message: "List contacts who replied and draft a reply strategy for each one",
      tag: "Replies", tagColor: "text-red-500 bg-red-500/10",
      priority: 100,
    });
  }

  // ── Urgent: meeting booked — prep the brief ──────────────────────────────
  if (stats.meetings > 0) {
    s.push({
      text: `Meeting brief for ${stats.meetings} booked call${stats.meetings > 1 ? "s" : ""}`,
      message: "Find my meeting-booked contacts and prepare a full meeting brief with background, objections, and talk track for each",
      tag: "Meeting", tagColor: "text-purple-500 bg-purple-500/10",
      priority: 95,
    });
  }

  // ── High: connected contacts need follow-ups ─────────────────────────────
  if (stats.connected > 0) {
    s.push({
      text: `Send follow-ups to ${stats.connected} connected contact${stats.connected > 1 ? "s" : ""}`,
      message: "Send follow-up messages to all connected contacts who haven't received one yet",
      tag: "Follow-up", tagColor: "text-blue-500 bg-blue-500/10",
      priority: 85,
    });
  }

  // ── High: pending invites to check ──────────────────────────────────────
  if (stats.invited > 0) {
    s.push({
      text: `Check ${stats.invited} pending invite${stats.invited > 1 ? "s" : ""} for acceptance`,
      message: "Check connections and inbox — show me which invites were accepted and if anyone replied",
      tag: "Check", tagColor: "text-amber-500 bg-amber-500/10",
      priority: 80,
    });
  }

  // ── Pipeline ops: only if there's enough data ────────────────────────────
  if (stats.total >= 5) {
    s.push({
      text: "Prioritize pipeline by expected value",
      message: "Prioritize the pipeline by expected value and give me the top 5 actions to take right now with clear next steps",
      tag: "Ops", tagColor: "text-teal-500 bg-teal-500/10",
      priority: 70,
    });
  }

  if (stats.total >= 5) {
    s.push({
      text: "Build account map — buying committee coverage",
      message: "Build the account map for this campaign and show me buying-committee coverage per company with suggested next moves",
      tag: "Ops", tagColor: "text-teal-500 bg-teal-500/10",
      priority: 65,
    });
  }

  if (stats.total >= 10) {
    s.push({
      text: "Reactivate stale contacts",
      message: "Find contacts with no activity in 30+ days and generate reactivation angles and draft messages for each",
      tag: "Reactivate", tagColor: "text-orange-500 bg-orange-500/10",
      priority: 60,
    });
  }

  if (stats.total >= 5) {
    s.push({
      text: "Design a message A/B experiment",
      message: "Design a structured message A/B experiment for this campaign to improve reply rates — create 2 variants with different angles",
      tag: "Experiment", tagColor: "text-indigo-500 bg-indigo-500/10",
      priority: 50,
    });
  }

  if (stats.total >= 5) {
    s.push({
      text: "Show message experiments",
      message: "List all saved message experiments for this campaign and summarize their results",
      tag: "Experiment", tagColor: "text-indigo-500 bg-indigo-500/10",
      priority: 40,
    });
  }

  // ── Discover: empty pipeline → highest priority ──────────────────────────
  if (stats.total === 0) {
    s.push({
      text: "Discover 25 prospects to get started",
      message: "Let's start — search LinkedIn for 25 prospects matching my ICP and assign them to the active campaign",
      tag: "Start", tagColor: "text-green-500 bg-green-500/10",
      priority: 90,
    });
  } else {
    s.push({
      text: "Discover more prospects",
      message: "Discover 20 more prospects for the active campaign — search LinkedIn by job title and location matching my ICP",
      tag: "Discover", tagColor: "text-green-500 bg-green-500/10",
      priority: 30,
    });
  }

  // ── Score unscored contacts ──────────────────────────────────────────────
  if (stats.toContact > 0) {
    s.push({
      text: `Score ${stats.toContact} contact${stats.toContact > 1 ? "s" : ""} waiting in queue`,
      message: "Score all unscored contacts and then prepare invites for the HIGH fit ones",
      tag: "Score", tagColor: "text-sky-500 bg-sky-500/10",
      priority: 75,
    });
  }

  // ── Daily cycle ──────────────────────────────────────────────────────────
  if (stats.total > 0) {
    s.push({
      text: "Run the full daily cycle",
      message: "Run the full daily cycle: check connections, send follow-ups, scan inbox",
      tag: "Cycle", tagColor: "text-muted-foreground bg-muted/40",
      priority: 20,
    });
  }

  // ── Fallback ─────────────────────────────────────────────────────────────
  s.push({
    text: "What should we do next?",
    message: "What should we do next? Give me a prioritized action plan based on the current pipeline state.",
    priority: 10,
  });

  return s.sort((a, b) => b.priority - a.priority).slice(0, 8);
}

export default function ChatPage({ campaignId }: { campaignId?: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
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
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string; isActive: boolean }>>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initializedRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  useEffect(scrollToBottom, [messages, liveSegments, scrollToBottom]);

  const fetchStats = useCallback(async () => {
    try {
      const statuses = ["TO_CONTACT","INVITED","CONNECTED","REPLIED","MEETING_BOOKED"];
      const results = await Promise.all(statuses.map(s => fetch(`/api/contacts?status=${s}&limit=1`).then(r => r.json()).then(d => ({ s, n: d.total || 0 }))));
      const total = await fetch("/api/contacts?limit=1").then(r => r.json()).then(d => d.total || 0);
      const m: Record<string, number> = {};
      results.forEach(r => m[r.s] = r.n);
      setStats({ total, toContact: m.TO_CONTACT || 0, invited: m.INVITED || 0, connected: m.CONNECTED || 0, replied: m.REPLIED || 0, meetings: m.MEETING_BOOKED || 0 });
    } catch {}
  }, []);

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
      fetch("/api/campaigns").then(r => r.json()).then(d => setCampaigns(d.campaigns || [])).catch(() => {});
      fetch(`/api/chat${campaignId ? `?campaignId=${campaignId}` : ""}`).then(r => r.json()).then(data => {
        if (data.history?.length > 0) {
          setMessages(data.history.map((m: { role: string; content: string }) => ({ role: m.role as "user" | "assistant", content: m.content })));
          setHistory(data.history);
        }
        if (data.greeting) setMessages(prev => [...prev, { role: "assistant", content: data.greeting }]);
      }).catch(() => {});
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
    setMessages(prev => [...prev, { role: "user", content: rawMsg }]);
    setLoading(true);
    setLiveSegments([]);

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
      // Local mutable copy — synced to React state on every event
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
                // Collapse any open thinking segment
                const last = segs[segs.length - 1];
                if (last?.type === "thinking" && !last.done) {
                  replaceLast({ ...last, done: true });
                }
                // Append to open text segment or start a new one
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
                // Keep only thinking segments (marked done); drop text segments so the
                // real final response starts fresh instead of appending to old content
                segs = segs.filter(s => s.type === "thinking").map(s => ({ ...s, done: true }));
                setLiveSegments([...segs]);
                break;
              }
              case "error":
                toast.error(data);
                if (!fullContent) fullContent = data;
                break;
              case "done":
                break;
            }
          } catch { /* skip */ }
        }
      }

      // Fallback: if fullContent is empty (stream cut), recover from text segments
      if (!fullContent) {
        fullContent = segs.filter(s => s.type === "text").map(s => s.content || "").join("");
      }

      const finalSegments = segs.map(s => ({ ...s, done: true }));

      // Commit everything in ONE synchronous block so React 18 batches into a single render.
      // setMessages + setLoading + setLiveSegments all fire together → no blank-screen flash.
      if (fullContent) {
        setMessages(prev => [...prev, { role: "assistant", content: fullContent, segments: finalSegments }]);
        setHistory(prev => [...prev, { role: "user", content: rawMsg }, { role: "assistant", content: fullContent }].slice(-30));
      }
      setLoading(false);
      setLiveSegments([]);

      if (fullContent) {
        fetchStats();
        fetchPriorities();
      }
    } catch { toast.error("Connection failed"); setLoading(false); setLiveSegments([]); }

    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleRate = async (msgIdx: number, content: string, rating: "up" | "down") => {
    if (ratings.has(msgIdx)) return; // already rated
    setRatings(prev => new Map(prev).set(msgIdx, rating));
    if (rating === "down") {
      setFeedbackOpen(msgIdx);
      setFeedbackWrong("");
      setFeedbackExpected("");
    } else {
      // Thumbs up: save silently
      await fetch("/api/chat/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageContent: content, rating: "up" }),
      });
    }
  };

  const submitFeedback = async (msgIdx: number, content: string) => {
    await fetch("/api/chat/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageContent: content, rating: "down", wrongText: feedbackWrong, expectedText: feedbackExpected }),
    });
    setFeedbackOpen(null);
    setFeedbackWrong("");
    setFeedbackExpected("");
    toast.success("Feedback saved — the agent will learn from this");
  };

  const suggestions = getSuggestions(stats);

  return (
    <div className="flex flex-row h-[calc(100vh-48px)] -mx-6 -mt-6 -mb-6 overflow-hidden">

      {/* ───────── LEFT: Dashboard ───────── */}
      <div className="flex-1 min-w-0 overflow-y-auto p-6 space-y-5">

        {/* Row 1 — KPI MetricCards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard label="Total Contacts" value={stats.total} icon={Users}
            onAskAI={() => openAI("Pipeline Stats")} />
          <MetricCard label="Invited" value={stats.invited} icon={Send}
            onAskAI={() => openAI("Invited Contacts")} />
          <MetricCard label="Connected" value={stats.connected} icon={UserCheck}
            onAskAI={() => openAI("Connected Contacts")} />
          <MetricCard label="Meetings" value={stats.meetings} icon={Calendar}
            onAskAI={() => openAI("Meetings Booked")} />
        </div>

        {/* Row 2 — Campaigns + Priority Contacts */}
        <div className="grid grid-cols-2 gap-3">

          {/* Campaign list */}
          <Card size="sm" className="group/card-widget">
            <CardHeader className="border-b border-border/50 pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Campaigns</CardTitle>
                <button
                  onClick={() => openAI("Campaigns")}
                  className="opacity-0 group-hover/card-widget:opacity-100 transition-opacity text-[10px] font-medium text-primary bg-primary/10 hover:bg-primary/20 px-2 py-0.5 rounded-full flex items-center gap-1"
                >
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
                    <Link
                      href={`/chat/${c.id}`}
                      className="shrink-0 text-[10px] text-muted-foreground hover:text-primary opacity-0 group-hover/row:opacity-100 transition-opacity"
                    >
                      Open →
                    </Link>
                  </div>
                ))
              )}
              {campaigns.length > 5 && (
                <p className="text-[10px] text-muted-foreground pt-1">+{campaigns.length - 5} more</p>
              )}
            </CardContent>
          </Card>

          {/* Priority contacts */}
          <Card size="sm" className="group/card-widget">
            <CardHeader className="border-b border-border/50 pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Top Priorities</CardTitle>
                <button
                  onClick={() => openAI("Priority Contacts")}
                  className="opacity-0 group-hover/card-widget:opacity-100 transition-opacity text-[10px] font-medium text-primary bg-primary/10 hover:bg-primary/20 px-2 py-0.5 rounded-full flex items-center gap-1"
                >
                  <Zap className="h-2.5 w-2.5" />Ask AI
                </button>
              </div>
            </CardHeader>
            <CardContent className="pt-2 pb-1 space-y-1">
              {priorities.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">Run pipeline prioritization to see top contacts</p>
              ) : (
                priorities.map(item => (
                  <button
                    key={item.contactId}
                    onClick={() => { setPanelOpen(true); sendMessage(`Why is ${item.contactName} a priority and what should we do next?`); }}
                    className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-accent/40 transition-colors group/pitem"
                  >
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
              <button
                onClick={() => setPanelOpen(true)}
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <MessageSquare className="h-3 w-3" />
                {messages.length} messages in AI chat →
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => { setPanelOpen(true); sendMessage(s.message); }}
                className="text-left text-xs px-3 py-2.5 rounded-lg border border-border hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground flex flex-col gap-1"
              >
                <span>{s.text}</span>
                {s.tag && (
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full self-start ${s.tagColor}`}>{s.tag}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ───────── RIGHT: AI Panel ───────── */}
      {panelOpen ? (
        <div className="w-[360px] shrink-0 flex flex-col border-l border-border bg-card/20">

          {/* Panel header */}
          <div className="flex items-center justify-between px-4 h-10 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">AI Assistant</span>
              {(loading || liveSegments.length > 0) && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
            </div>
            <button
              onClick={() => setPanelOpen(false)}
              className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Collapse panel"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
            {messages.length === 0 && !loading && (
              <div className="space-y-1.5 pt-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Quick actions</p>
                {suggestions.slice(0, 4).map((s, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(s.message)}
                    className="w-full text-left text-xs px-3 py-2 rounded-lg border border-border hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground flex flex-col gap-0.5"
                  >
                    <span>{s.text}</span>
                    {s.tag && (
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full self-start ${s.tagColor}`}>{s.tag}</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={cn("group", msg.role === "user" ? "flex justify-end" : "")}>
                {msg.role === "user" ? (
                  <div className="flex items-start gap-1.5 max-w-[85%]">
                    <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-3 py-2 text-xs">
                      {msg.content}
                    </div>
                    <CopyButton text={msg.content} />
                  </div>
                ) : (
                  <div className="space-y-1">
                    {msg.segments && msg.segments.length > 0 ? (
                      msg.segments.map((seg, si) =>
                        seg.type === "thinking" ? (
                          <TaskGroup key={si} steps={seg.steps || []} />
                        ) : (
                          <div key={si} className="text-xs text-foreground leading-relaxed max-w-none prose-agent" dangerouslySetInnerHTML={{ __html: fmtMd(seg.content || "") }} />
                        )
                      )
                    ) : (
                      <div className="text-xs text-foreground leading-relaxed max-w-none prose-agent" dangerouslySetInnerHTML={{ __html: fmtMd(msg.content) }} />
                    )}
                    <div className="flex items-start gap-1.5">
                      <CopyButton text={msg.content} />
                    </div>
                    {/* Rating buttons */}
                    <div className="flex items-center gap-1 pt-0.5 pl-0.5">
                      {ratings.get(i) === undefined ? (
                        <>
                          <button
                            onClick={() => handleRate(i, msg.content, "up")}
                            className="opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 rounded flex items-center justify-center text-muted-foreground/50 hover:text-green-500 hover:bg-green-500/10"
                          >
                            <ThumbsUp className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleRate(i, msg.content, "down")}
                            className="opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 rounded flex items-center justify-center text-muted-foreground/50 hover:text-red-500 hover:bg-red-500/10"
                          >
                            <ThumbsDown className="h-3 w-3" />
                          </button>
                        </>
                      ) : ratings.get(i) === "up" ? (
                        <span className="flex items-center gap-1 text-[10px] text-green-500"><ThumbsUp className="h-3 w-3" /></span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-red-500"><ThumbsDown className="h-3 w-3" /></span>
                      )}
                    </div>
                    {feedbackOpen === i && (
                      <div className="mt-2 p-2.5 rounded-xl border border-border bg-card space-y-2">
                        <p className="text-xs font-medium text-foreground">What was wrong?</p>
                        <textarea
                          value={feedbackWrong}
                          onChange={e => setFeedbackWrong(e.target.value)}
                          placeholder="Describe what was incorrect..."
                          className="w-full resize-none bg-transparent border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 min-h-[48px]"
                          rows={2}
                        />
                        <p className="text-xs font-medium text-foreground">What did you expect?</p>
                        <textarea
                          value={feedbackExpected}
                          onChange={e => setFeedbackExpected(e.target.value)}
                          placeholder="Describe the ideal response..."
                          className="w-full resize-none bg-transparent border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 min-h-[48px]"
                          rows={2}
                        />
                        <div className="flex gap-1.5">
                          <Button size="sm" className="h-6 text-xs px-2" onClick={() => submitFeedback(i, msg.content)} disabled={!feedbackWrong.trim() && !feedbackExpected.trim()}>
                            Submit
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => { setFeedbackOpen(null); setRatings(prev => { const n = new Map(prev); n.delete(i); return n; }); }}>
                            Cancel
                          </Button>
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
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Thinking...</span>
                  </div>
                )}
                {liveSegments.map((seg, i) => {
                  const isLastSeg = i === liveSegments.length - 1;
                  if (seg.type === "thinking") {
                    return seg.done
                      ? <TaskGroup key={i} steps={seg.steps || []} />
                      : <LiveTaskGroup key={i} steps={seg.steps || []} />;
                  }
                  return (
                    <div key={i} className="text-xs text-foreground leading-relaxed prose-agent">
                      <span dangerouslySetInnerHTML={{ __html: fmtMd(seg.content || "") }} />
                      {isLastSeg && (
                        <span className="inline-block w-[2px] h-[12px] bg-foreground/70 animate-pulse ml-0.5 align-middle" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-border px-3 py-2.5 shrink-0">
            {widgetContext && (
              <div className="flex items-center gap-1 mb-2">
                <span className="text-[10px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full flex items-center gap-1.5">
                  ✦ {widgetContext.label}
                  <button
                    onClick={() => setWidgetContext(null)}
                    className="text-primary/70 hover:text-primary leading-none"
                  >
                    ×
                  </button>
                </span>
              </div>
            )}
            <div className="flex gap-1.5 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={widgetContext ? `Ask about ${widgetContext.label}...` : "Message the agent..."}
                disabled={loading}
                className="flex-1 resize-none bg-transparent border border-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 min-h-[36px] max-h-[100px]"
                rows={1}
              />
              <Button onClick={() => sendMessage()} disabled={loading || !input.trim()} size="icon" className="h-8 w-8 rounded-xl shrink-0">
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* Collapsed strip */
        <div className="w-10 shrink-0 flex flex-col items-center border-l border-border bg-card/20 py-3 gap-2">
          <button
            onClick={() => setPanelOpen(true)}
            className="relative p-1.5 hover:bg-muted rounded-lg transition-colors"
            title="Open AI Assistant"
          >
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            {(messages.length > 0 || loading) && (
              <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-blue-500" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}

/* ===== MetricCard ===== */
function MetricCard({ label, value, icon: Icon, onAskAI }: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  onAskAI: () => void;
}) {
  return (
    <Card size="sm" className="relative group/metric">
      <CardContent className="pt-3 pb-3">
        <div className="flex items-center justify-between mb-2">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <button
            onClick={onAskAI}
            className="opacity-0 group-hover/metric:opacity-100 transition-opacity text-[10px] font-medium text-primary bg-primary/10 hover:bg-primary/20 px-2 py-0.5 rounded-full flex items-center gap-1"
          >
            <Zap className="h-2.5 w-2.5" />Ask AI
          </button>
        </div>
        <p className="text-2xl font-mono font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}

/* ===== Claude-style Task Group (collapsed after completion) ===== */
function TaskGroup({ steps }: { steps: string[] }) {
  const [open, setOpen] = useState(false);

  // Group steps into categories based on tool names
  const groups = groupSteps(steps);
  const totalSteps = steps.length;

  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span className="font-medium">{summarizeGroups(groups)}</span>
        <span className="text-muted-foreground/50 ml-1">{totalSteps} steps</span>
      </button>
      {open && (
        <div className="ml-2 mt-1 border-l-2 border-border pl-3 space-y-0.5">
          {steps.map((s, j) => (
            <div key={j} className="text-xs text-muted-foreground leading-relaxed py-0.5">
              {cleanStep(s)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ===== Live Task Group (expanded, shows progress in real-time) ===== */
function LiveTaskGroup({ steps }: { steps: string[] }) {
  const groups = groupSteps(steps);

  return (
    <div className="mb-2 space-y-1">
      {groups.map((g, i) => (
        <div key={i}>
          <div className="flex items-center gap-1.5 text-xs py-0.5">
            {i < groups.length - 1 ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
            )}
            <span className="font-medium text-foreground">{g.label}</span>
            {g.steps.length > 1 && (
              <span className="text-muted-foreground/50">{g.steps.length} steps</span>
            )}
          </div>
          {/* Show last few steps of active group, all of completed groups */}
          <div className="ml-2 border-l-2 border-border pl-3">
            {(i === groups.length - 1 ? g.steps.slice(-4) : g.steps.slice(-2)).map((s, j) => (
              <div key={j} className="text-xs text-muted-foreground leading-relaxed py-0.5">
                {cleanStep(s)}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ===== Helpers ===== */

function groupSteps(steps: string[]): Array<{ label: string; steps: string[] }> {
  const groups: Array<{ label: string; steps: string[] }> = [];
  let current: { label: string; steps: string[] } | null = null;

  for (const s of steps) {
    const label = getStepGroup(s);
    if (!current || current.label !== label) {
      current = { label, steps: [s] };
      groups.push(current);
    } else {
      current.steps.push(s);
    }
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

function summarizeGroups(groups: Array<{ label: string; steps: string[] }>): string {
  const labels = [...new Set(groups.map(g => g.label))];
  if (labels.length <= 2) return labels.join(", then ");
  return `${labels[0]} and ${labels.length - 1} more tasks`;
}

function cleanStep(step: string): string {
  // Remove emojis and excessive markers
  return step
    .replace(/^[^\w\s]*\s*/, "") // leading emojis/symbols
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "") // non-ascii (emojis)
    .replace(/^\s*(Executing|executing):\s*/i, "")
    .replace(/^\s*(Thinking\.\.\.\s*\(step \d+\))/i, "Step $1")
    .trim();
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  return (
    <button
      onClick={handleCopy}
      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1 w-6 h-6 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground/50 hover:text-foreground"
      title="Copy"
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function fmtMd(t: string): string {
  return t
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^## (.+)$/gm, "<h3>$1</h3>")
    .replace(/^# (.+)$/gm, "<h2>$1</h2>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*?<\/li>)+/g, m => `<ul>${m}</ul>`)
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br/>")
    .replace(/^/, "<p>")
    .replace(/$/, "</p>");
}
