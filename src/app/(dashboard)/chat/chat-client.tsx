"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Send, Loader2, Users, UserCheck, Inbox, Calendar, Copy, Check, ChevronRight, ChevronDown, ThumbsUp, ThumbsDown } from "lucide-react";
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

  const sendMessage = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: msg }]);
    setLoading(true);
    setLiveSegments([]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, history, campaignId }),
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
                // Mark all thinking as done; drop any partial text segments
                segs = segs.map(s => ({ ...s, done: true }));
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

      if (fullContent) {
        const finalSegments = segs.map(s => ({ ...s, done: true }));
        setMessages(prev => [...prev, { role: "assistant", content: fullContent, segments: finalSegments }]);
        setHistory(prev => [...prev, { role: "user", content: msg }, { role: "assistant", content: fullContent }].slice(-30));
        fetchStats();
        fetchPriorities();
      }
    } catch { toast.error("Connection failed"); }

    setLoading(false);
    setLiveSegments([]);
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

  const statItems = [
    { label: "Contacts", value: stats.total, icon: Users },
    { label: "Invited", value: stats.invited, icon: Send },
    { label: "Connected", value: stats.connected, icon: UserCheck },
    { label: "Replied", value: stats.replied, icon: Inbox },
    { label: "Meetings", value: stats.meetings, icon: Calendar },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-48px)] -mx-6 -mt-6 -mb-6">
      {/* Stats bar */}
      <div className="flex items-center h-9 px-6 border-b border-border bg-card/30 gap-5 shrink-0">
        {statItems.map(s => (
          <div key={s.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <s.icon className="h-3 w-3" />
            <span className="font-mono font-semibold text-foreground">{s.value}</span>
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <h2 className="text-base font-semibold text-foreground mb-1">Outreach Agent</h2>
              <p className="text-sm text-muted-foreground mb-8">Tell me what to do. I execute in real-time.</p>
              {priorities.length > 0 && (
                <div className="w-full max-w-lg mb-6 rounded-xl border border-border bg-card/60 p-4 text-left">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">What should we do today?</p>
                      <p className="text-sm text-foreground font-medium">Highest expected-value moves right now</p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => sendMessage("Prioritize the pipeline by expected value and tell me the top actions")}>
                      Refresh
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {priorities.map((item) => (
                      <button
                        key={item.contactId}
                        onClick={() => sendMessage(`Why is ${item.contactName} a priority and what should we do next?`)}
                        className="w-full text-left rounded-lg border border-border px-3 py-2 hover:bg-accent/40 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">{item.contactName}{item.company ? ` · ${item.company}` : ""}</p>
                            <p className="text-xs text-muted-foreground">{item.whyNow}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="font-mono text-sm font-semibold text-foreground">{item.priorityScore}</p>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.nextBestAction.replaceAll("_", " ")}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
                {getSuggestions(stats).map((s, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(s.message)}
                    className="text-left text-sm px-3 py-2.5 rounded-lg border border-border hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground flex flex-col gap-1"
                  >
                    <span>{s.text}</span>
                    {s.tag && (
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full self-start ${s.tagColor}`}>{s.tag}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={cn("group", msg.role === "user" ? "flex justify-end" : "")}>
              {msg.role === "user" ? (
                <div className="flex items-start gap-2 max-w-[80%]">
                  <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm">
                    {msg.content}
                  </div>
                  <CopyButton text={msg.content} />
                </div>
              ) : (
                <div className="space-y-1">
                  {/* Interleaved segments — thinking groups + text blocks in order */}
                  {msg.segments && msg.segments.length > 0 ? (
                    msg.segments.map((seg, si) =>
                      seg.type === "thinking" ? (
                        <TaskGroup key={si} steps={seg.steps || []} />
                      ) : (
                        <div key={si} className="text-sm text-foreground leading-relaxed max-w-none prose-agent" dangerouslySetInnerHTML={{ __html: fmtMd(seg.content || "") }} />
                      )
                    )
                  ) : (
                    <div className="text-sm text-foreground leading-relaxed max-w-none prose-agent" dangerouslySetInnerHTML={{ __html: fmtMd(msg.content) }} />
                  )}
                  {/* Copy button aligned to last text segment */}
                  <div className="flex items-start gap-2">
                    <CopyButton text={msg.content} />
                  </div>
                  {/* Rating buttons */}
                  <div className="flex items-center gap-1 pt-0.5 pl-0.5">
                    {ratings.get(i) === undefined ? (
                      <>
                        <button
                          onClick={() => handleRate(i, msg.content, "up")}
                          className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 rounded flex items-center justify-center text-muted-foreground/50 hover:text-green-500 hover:bg-green-500/10"
                          title="Good response"
                        >
                          <ThumbsUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleRate(i, msg.content, "down")}
                          className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 rounded flex items-center justify-center text-muted-foreground/50 hover:text-red-500 hover:bg-red-500/10"
                          title="Bad response"
                        >
                          <ThumbsDown className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : ratings.get(i) === "up" ? (
                      <span className="flex items-center gap-1 text-[10px] text-green-500"><ThumbsUp className="h-3 w-3" /></span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-red-500"><ThumbsDown className="h-3 w-3" /></span>
                    )}
                  </div>
                  {/* Inline feedback form for thumbs down */}
                  {feedbackOpen === i && (
                    <div className="mt-2 p-3 rounded-xl border border-border bg-card space-y-2 max-w-xl">
                      <p className="text-xs font-medium text-foreground">What was wrong with this response?</p>
                      <textarea
                        value={feedbackWrong}
                        onChange={e => setFeedbackWrong(e.target.value)}
                        placeholder="Describe what was incorrect or unhelpful..."
                        className="w-full resize-none bg-transparent border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 min-h-[56px]"
                        rows={2}
                      />
                      <p className="text-xs font-medium text-foreground">What did you expect instead?</p>
                      <textarea
                        value={feedbackExpected}
                        onChange={e => setFeedbackExpected(e.target.value)}
                        placeholder="Describe the ideal response or action..."
                        className="w-full resize-none bg-transparent border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 min-h-[56px]"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" className="h-7 text-xs" onClick={() => submitFeedback(i, msg.content)} disabled={!feedbackWrong.trim() && !feedbackExpected.trim()}>
                          Submit feedback
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setFeedbackOpen(null); setRatings(prev => { const n = new Map(prev); n.delete(i); return n; }); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Live streaming — interleaved segments in order of occurrence */}
          {loading && (
            <div className="space-y-1">
              {liveSegments.length === 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
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
                  <div key={i} className="text-sm text-foreground leading-relaxed prose-agent">
                    <span dangerouslySetInnerHTML={{ __html: fmtMd(seg.content || "") }} />
                    {isLastSeg && (
                      <span className="inline-block w-[2px] h-[14px] bg-foreground/70 animate-pulse ml-0.5 align-middle" />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-border bg-background px-6 py-3 shrink-0">
        <div className="max-w-3xl mx-auto flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message the agent..."
            disabled={loading}
            className="flex-1 resize-none bg-transparent border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 min-h-[40px] max-h-[120px]"
            rows={1}
          />
          <Button onClick={() => sendMessage()} disabled={loading || !input.trim()} size="icon" className="h-10 w-10 rounded-xl shrink-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
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
      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1 w-7 h-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground/50 hover:text-foreground"
      title="Copy"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
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
