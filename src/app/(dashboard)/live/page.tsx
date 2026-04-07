"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Activity,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  Bug,
  RefreshCw,
} from "lucide-react";

interface LogEntry {
  id: string;
  action: string;
  request: string | null;
  response: string | null;
  success: boolean;
  errorCode: string | null;
  duration: number | null;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  linkedin_search: "LinkedIn Search",
  apify_scrape: "Apify Scrape",
  test_linkedin: "LinkedIn Test",
  test_apify: "Apify Test",
  test_openrouter: "OpenRouter Test",
  send_invite: "Send Invite",
  send_message: "Send Message",
  check_connection: "Check Connection",
  fetch_profile: "Fetch Profile",
  scan_inbox: "Scan Inbox",
  score_contact: "ICP Score",
  generate_message: "Generate Message",
  run_start: "Run Started",
  run_phase: "Run Phase",
};

const ACTION_COLORS: Record<string, string> = {
  linkedin_search: "bg-blue-100 text-blue-700",
  apify_scrape: "bg-orange-100 text-orange-700",
  test_linkedin: "bg-indigo-100 text-indigo-700",
  send_invite: "bg-purple-100 text-purple-700",
  send_message: "bg-pink-100 text-pink-700",
  check_connection: "bg-cyan-100 text-cyan-700",
  scan_inbox: "bg-teal-100 text-teal-700",
  score_contact: "bg-amber-100 text-amber-700",
  generate_message: "bg-emerald-100 text-emerald-700",
};

function getLevel(entry: LogEntry): string {
  if (!entry.success && entry.errorCode) return "error";
  if (entry.request?.includes("[warning]") || entry.request?.includes("warning")) return "warning";
  if (entry.request?.includes("[debug]") || entry.request?.includes("debug")) return "debug";
  if (entry.success) return "success";
  return "info";
}

function LevelIcon({ level }: { level: string }) {
  switch (level) {
    case "success": return <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />;
    case "error": return <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
    case "warning": return <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />;
    case "debug": return <Bug className="h-4 w-4 text-gray-400 shrink-0" />;
    default: return <Info className="h-4 w-4 text-blue-500 shrink-0" />;
  }
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function timeSince(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export default function LiveWatchPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const [uptime, setUptime] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState({ total: 0, success: 0, errors: 0, active: "" });

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/logs?limit=100");
      const data = await res.json();
      const newLogs = (data.logs || []) as LogEntry[];
      setLogs(newLogs);
      setLastFetched(new Date().toISOString());

      const success = newLogs.filter((l) => l.success).length;
      const errors = newLogs.filter((l) => !l.success && l.errorCode).length;
      const latest = newLogs[0];
      setStats({
        total: data.total || 0,
        success,
        errors,
        active: latest ? `${ACTION_LABELS[latest.action] || latest.action}` : "Idle",
      });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void fetchLogs();
    }, 0);
    return () => clearTimeout(timeout);
  }, [fetchLogs]);

  // Auto-refresh every 3 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  // Uptime counter
  useEffect(() => {
    const interval = setInterval(() => setUptime((u) => u + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0; // newest first
    }
  }, [logs]);

  const formatUptime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            Live Watch
          </h1>
          <p className="text-muted-foreground">Real-time execution monitor</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Session uptime</p>
            <p className="font-mono text-lg">{formatUptime(uptime)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
            <Label className="text-xs">{autoRefresh ? "Live" : "Paused"}</Label>
          </div>
          <Button variant="outline" size="sm" onClick={fetchLogs}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total Events</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{stats.success}</p>
            <p className="text-xs text-muted-foreground">Successful</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-red-600">{stats.errors}</p>
            <p className="text-xs text-muted-foreground">Errors</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1.5">
              {autoRefresh && <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />}
              <p className="text-sm font-medium truncate">{stats.active}</p>
            </div>
            <p className="text-xs text-muted-foreground">Last Activity</p>
          </CardContent>
        </Card>
      </div>

      {/* Live feed */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            {autoRefresh && <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />}
            Execution Feed
            {lastFetched && (
              <span className="text-xs font-normal text-muted-foreground ml-auto">
                Updated {timeSince(lastFetched)}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]" ref={scrollRef}>
            <div className="divide-y">
              {logs.map((entry) => {
                const level = getLevel(entry);
                const message = entry.request || entry.action;
                return (
                  <div key={entry.id} className="px-4 py-2.5 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start gap-3">
                      <LevelIcon level={level} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <Badge
                            variant="secondary"
                            className={`text-[10px] px-1.5 py-0 ${ACTION_COLORS[entry.action] || "bg-gray-100 text-gray-700"}`}
                          >
                            {ACTION_LABELS[entry.action] || entry.action}
                          </Badge>
                          {entry.duration && (
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {entry.duration > 1000 ? `${(entry.duration / 1000).toFixed(1)}s` : `${entry.duration}ms`}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {formatTime(entry.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm text-foreground leading-snug">{message}</p>
                        {entry.response && entry.response !== "null" && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {entry.response.substring(0, 150)}
                          </p>
                        )}
                        {entry.errorCode && (
                          <p className="text-xs text-red-500 mt-0.5">{entry.errorCode}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {logs.length === 0 && (
                <div className="py-12 text-center text-muted-foreground">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p>No activity yet. Run a search or daily cycle to see live events.</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
