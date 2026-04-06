"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Send, Loader2, Users, UserCheck, Inbox, Calendar, Copy, Check, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message { role: "user" | "assistant"; content: string; thinking?: string[] }
interface Stats { total: number; invited: number; connected: number; replied: number; meetings: number }

const SUGGESTIONS = [
  "What should we do next?",
  "Show me the pipeline",
  "Discover 20 prospects",
  "Score unscored contacts",
  "Prepare invites for HIGH fit",
  "Run the daily cycle",
];

export default function ChatPage({ campaignId }: { campaignId?: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [thinkingSteps, setThinkingSteps] = useState<string[]>([]);
  const [history, setHistory] = useState<Array<{ role: string; content: string }>>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, invited: 0, connected: 0, replied: 0, meetings: 0 });
  const [initialized, setInitialized] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  useEffect(scrollToBottom, [messages, streamingContent, thinkingSteps, scrollToBottom]);

  const fetchStats = useCallback(async () => {
    try {
      const statuses = ["INVITED","CONNECTED","REPLIED","MEETING_BOOKED"];
      const results = await Promise.all(statuses.map(s => fetch(`/api/contacts?status=${s}&limit=1`).then(r => r.json()).then(d => ({ s, n: d.total || 0 }))));
      const total = await fetch("/api/contacts?limit=1").then(r => r.json()).then(d => d.total || 0);
      const m: Record<string, number> = {};
      results.forEach(r => m[r.s] = r.n);
      setStats({ total, invited: m.INVITED || 0, connected: m.CONNECTED || 0, replied: m.REPLIED || 0, meetings: m.MEETING_BOOKED || 0 });
    } catch {}
  }, []);

  useEffect(() => {
    if (initialized) return;
    setInitialized(true);
    fetchStats();
    fetch(`/api/chat${campaignId ? `?campaignId=${campaignId}` : ""}`).then(r => r.json()).then(data => {
      if (data.history?.length > 0) {
        setMessages(data.history.map((m: { role: string; content: string }) => ({ role: m.role as "user" | "assistant", content: m.content })));
        setHistory(data.history);
      }
      if (data.greeting) setMessages(prev => [...prev, { role: "assistant", content: data.greeting }]);
    }).catch(() => {});
  }, [initialized, fetchStats]);

  const sendMessage = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: msg }]);
    setLoading(true);
    setStreamingContent("");
    setThinkingSteps([]);

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
      const steps: string[] = [];

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
              case "thinking":
                steps.push(data);
                setThinkingSteps([...steps]);
                break;
              case "content":
                fullContent += data;
                setStreamingContent(fullContent);
                break;
              case "clear":
                fullContent = "";
                setStreamingContent("");
                break;
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
        setMessages(prev => [...prev, { role: "assistant", content: fullContent, thinking: steps.length > 0 ? steps : undefined }]);
        setHistory(prev => [...prev, { role: "user", content: msg }, { role: "assistant", content: fullContent }].slice(-30));
        fetchStats();
      }
    } catch { toast.error("Connection failed"); }

    setLoading(false);
    setStreamingContent("");
    setThinkingSteps([]);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const statItems = [
    { label: "Contacts", value: stats.total, icon: Users },
    { label: "Invited", value: stats.invited, icon: Send },
    { label: "Connected", value: stats.connected, icon: UserCheck },
    { label: "Replied", value: stats.replied, icon: Inbox },
    { label: "Meetings", value: stats.meetings, icon: Calendar },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-48px)] -mx-6 -mt-6">
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
              <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => sendMessage(s)} className="text-left text-sm px-3 py-2 rounded-lg border border-border hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground">{s}</button>
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
                  {/* Thinking steps — collapsed by default after response */}
                  {msg.thinking && msg.thinking.length > 0 && (
                    <TaskGroup steps={msg.thinking} />
                  )}
                  {/* Response */}
                  <div className="flex items-start gap-2">
                    <div className="text-sm text-foreground leading-relaxed max-w-none prose-agent" dangerouslySetInnerHTML={{ __html: fmtMd(msg.content) }} />
                    <CopyButton text={msg.content} />
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Live streaming */}
          {loading && (
            <div className="space-y-1">
              {/* Live thinking steps */}
              {thinkingSteps.length > 0 && (
                <LiveTaskGroup steps={thinkingSteps} />
              )}

              {/* Streaming response */}
              {streamingContent ? (
                <div className="text-sm text-foreground leading-relaxed prose-agent">
                  <span dangerouslySetInnerHTML={{ __html: fmtMd(streamingContent) }} />
                  <span className="inline-block w-[2px] h-[14px] bg-foreground/70 animate-pulse ml-0.5 align-middle" />
                </div>
              ) : !thinkingSteps.length ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Thinking...</span>
                </div>
              ) : null}
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
