"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Send, Loader2, Bot, User, Sparkles, Users, UserCheck, Inbox, Calendar, Wrench, Copy, Check, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message { role: "user" | "assistant"; content: string; thinking?: string[] }
interface Stats { total: number; invited: number; connected: number; replied: number; meetings: number }

const SUGGESTIONS = [
  "What should we do next?",
  "Show me the pipeline",
  "Discover 20 CEOs in UK",
  "Score all unscored contacts",
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

      // Read SSE stream
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
                if (!fullContent) fullContent = "⚠️ " + data;
                break;
              case "done":
                break;
            }
          } catch { /* skip */ }
        }
      }

      // Finalize message
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
      {/* Stats header */}
      <div className="flex items-center h-10 px-6 border-b border-border bg-card/50 gap-6 shrink-0">
        {statItems.map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <s.icon className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono text-xs font-bold">{s.value}</span>
            <span className="text-[10px] text-muted-foreground">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6">
        <div className="max-w-3xl mx-auto py-4 space-y-4">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Sparkles className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-lg font-bold mb-1">Outreach Agent</h2>
              <p className="text-xs text-muted-foreground mb-6 max-w-sm">Tell me what to do. I execute in real-time.</p>
              <div className="grid grid-cols-2 gap-2 w-full max-w-md">
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => sendMessage(s)} className="text-left text-[11px] p-2.5 rounded-lg border border-border hover:bg-accent transition-colors text-muted-foreground hover:text-foreground">{s}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i}>
              <div className={cn("flex gap-2.5 group", msg.role === "user" ? "justify-end" : "")}>
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div className={cn("max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed relative", msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border border-border")}>
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0 [&_strong]:text-foreground [&_code]:text-[11px] [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded" dangerouslySetInnerHTML={{ __html: fmtMd(msg.content) }} />
                  ) : <span>{msg.content}</span>}
                </div>
                <CopyButton text={msg.content} />
                {msg.role === "user" && (
                  <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5"><User className="h-3.5 w-3.5 text-muted-foreground" /></div>
                )}
              </div>
              {/* Thinking steps trail — collapsed by default */}
              {msg.thinking && msg.thinking.length > 0 && (
                <ThinkingSteps steps={msg.thinking} />
              )}
            </div>
          ))}

          {/* Live streaming content */}
          {loading && (
            <div>
              {/* Thinking steps (live) */}
              {thinkingSteps.length > 0 && (
                <div className="ml-8 mb-2 space-y-0.5">
                  {thinkingSteps.map((s, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[10px] text-primary/60 font-mono animate-in fade-in">
                      <Wrench className="h-2.5 w-2.5" /><span>{s}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Streaming response */}
              <div className="flex gap-2.5">
                <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-primary animate-pulse" />
                </div>
                <div className="max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed bg-card border border-border">
                  {streamingContent ? (
                    <div className="prose prose-sm prose-invert max-w-none [&_p]:my-1 [&_strong]:text-foreground" dangerouslySetInnerHTML={{ __html: fmtMd(streamingContent) }} />
                  ) : (
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" />Working...
                    </span>
                  )}
                  <span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5" />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-border bg-background px-6 py-2.5 shrink-0">
        <div className="max-w-3xl mx-auto flex gap-2">
          <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Tell the agent what to do... (Enter to send)" disabled={loading}
            className="flex-1 resize-none bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/40 min-h-[36px] max-h-[100px]" rows={1} />
          <Button onClick={() => sendMessage()} disabled={loading || !input.trim()} size="icon" className="h-9 w-9 shrink-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ThinkingSteps({ steps }: { steps: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ml-8 mt-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors font-mono"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Wrench className="h-2.5 w-2.5" />
        <span>{steps.length} steps</span>
      </button>
      {open && (
        <div className="mt-1 space-y-0.5 pl-1 border-l border-border/30 ml-1.5">
          {steps.map((s, j) => (
            <div key={j} className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 font-mono pl-2">
              <span className="truncate">{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <button
      onClick={handleCopy}
      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5 w-6 h-6 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function fmtMd(t: string): string {
  return t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>").replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>").replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^- (.+)$/gm, "<li>$1</li>").replace(/(<li>[\s\S]*?<\/li>)+/g, m => `<ul>${m}</ul>`)
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    .replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br/>").replace(/^/, "<p>").replace(/$/, "</p>");
}
