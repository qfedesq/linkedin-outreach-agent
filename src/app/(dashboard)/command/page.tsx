"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Activity,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  Play,
  Search,
  Loader2,
  Users,
  Send,
  Inbox,
  UserCheck,
} from "lucide-react";

interface LogEntry {
  id: string;
  action: string;
  request: string | null;
  success: boolean;
  errorCode: string | null;
  duration: number | null;
  createdAt: string;
}

const ACTION_COLORS: Record<string, string> = {
  linkedin_search: "bg-blue-100 text-blue-700",
  apify_scrape: "bg-orange-100 text-orange-700",
  test_linkedin: "bg-indigo-100 text-indigo-700",
  send_invite: "bg-purple-100 text-purple-700",
  check_connection: "bg-cyan-100 text-cyan-700",
  scan_inbox: "bg-teal-100 text-teal-700",
  score_contact: "bg-amber-100 text-amber-700",
  run_start: "bg-green-100 text-green-700",
};

function LevelIcon({ success, error }: { success: boolean; error: string | null }) {
  if (!success && error) return <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />;
  if (success) return <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />;
  return <Info className="h-3.5 w-3.5 text-blue-500 shrink-0" />;
}

function formatTime(d: string) {
  return new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const JOB_PRESETS = ["CEO", "Co-Founder", "CFO", "Head of Capital Markets", "VP Lending", "Managing Director"];
const LOCATIONS = ["United Kingdom", "United States", "Europe", "Singapore"];

export default function CommandCenterPage() {
  // --- State ---
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [uptime, setUptime] = useState(0);
  const [stats, setStats] = useState({ contacts: 0, invited: 0, connected: 0, replied: 0 });

  // Discovery
  const [jobTitle, setJobTitle] = useState("CEO");
  const [location, setLocation] = useState("United Kingdom");
  const [scraping, setScraping] = useState(false);
  const [scrapeStatus, setScrapeStatus] = useState("");

  // Run
  const [running, setRunning] = useState(false);
  const [runPhase, setRunPhase] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);

  // --- Data fetching ---
  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/logs?limit=50");
      const data = await res.json();
      setLogs(data.logs || []);
    } catch { /* */ }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/contacts?limit=1");
      const data = await res.json();
      setStats((prev) => ({ ...prev, contacts: data.total || 0 }));
    } catch { /* */ }
  }, []);

  useEffect(() => {
    fetchLogs();
    fetchStats();
    const interval = setInterval(() => { fetchLogs(); fetchStats(); }, 4000);
    return () => clearInterval(interval);
  }, [fetchLogs, fetchStats]);

  useEffect(() => {
    const interval = setInterval(() => setUptime((u) => u + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // --- Actions ---
  const startScrape = async () => {
    setScraping(true);
    setScrapeStatus("Starting Apify actor...");
    try {
      const res = await fetch("/api/discover/apify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: jobTitle, geography: location, maxResults: 25 }),
      });
      const data = await res.json();
      if (data.error) { toast.error(data.error); setScraping(false); return; }

      const { runId, datasetId } = data;
      setScrapeStatus(`Actor running (ID: ${runId?.substring(0, 8)}...)...`);

      // Poll every 10 seconds
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 10000));
        setScrapeStatus(`Polling... (${(i + 1) * 10}s elapsed)`);
        fetchLogs();

        const pollRes = await fetch(`/api/discover/apify?runId=${runId}&datasetId=${datasetId}`);
        const pollData = await pollRes.json();

        if (pollData.status === "SUCCEEDED" || pollData.total > 0) {
          toast.success(`Found ${pollData.created} new contacts! (${pollData.total} total, ${pollData.skipped} skipped)`);
          setScrapeStatus(`Done! ${pollData.created} new contacts`);
          fetchStats();
          fetchLogs();
          setScraping(false);
          return;
        }
        if (pollData.status === "FAILED" || pollData.status === "ABORTED") {
          toast.error("Apify run failed");
          setScrapeStatus("Failed");
          setScraping(false);
          return;
        }
      }
      toast.warning("Apify run timed out — check Live Watch for results");
      setScrapeStatus("Timed out");
    } catch (e) {
      toast.error("Scrape failed");
      setScrapeStatus("Error");
    }
    setScraping(false);
  };

  const runDailyCycle = async () => {
    setRunning(true);
    setRunPhase("Starting...");
    try {
      await fetch("/api/run/start", { method: "POST" });
      fetchLogs();

      setRunPhase("Phase 1: Checking connections...");
      await fetch("/api/followups/check-connections", { method: "POST" });
      fetchLogs();

      setRunPhase("Phase 2: Checking follow-ups...");
      const dueRes = await fetch("/api/followups/due");
      const dueData = await dueRes.json();
      fetchLogs();

      if ((dueData.contacts || []).length > 0) {
        setRunPhase(`Phase 2: Generating ${dueData.contacts.length} follow-ups...`);
        // Follow-up generation would go here
      }

      setRunPhase("Phase 3: Scanning inbox...");
      await fetch("/api/inbox/scan", { method: "POST" });
      fetchLogs();

      setRunPhase("Complete!");
      toast.success("Daily run complete");
    } catch {
      toast.error("Run failed");
      setRunPhase("Failed");
    }
    setRunning(false);
  };

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            Command Center
          </h1>
          <p className="text-muted-foreground">Discover, execute, and monitor — all in one place</p>
        </div>
        <div className="text-right">
          <span className="text-xs text-muted-foreground">Session</span>
          <p className="font-mono text-lg">{fmt(uptime)}</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        <Card><CardContent className="p-3 text-center">
          <Users className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
          <p className="text-xl font-bold">{stats.contacts}</p>
          <p className="text-[10px] text-muted-foreground">Contacts</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <Send className="h-4 w-4 mx-auto mb-1 text-blue-500" />
          <p className="text-xl font-bold">{stats.invited}</p>
          <p className="text-[10px] text-muted-foreground">Invited</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <UserCheck className="h-4 w-4 mx-auto mb-1 text-green-500" />
          <p className="text-xl font-bold">{stats.connected}</p>
          <p className="text-[10px] text-muted-foreground">Connected</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <Inbox className="h-4 w-4 mx-auto mb-1 text-purple-500" />
          <p className="text-xl font-bold">{stats.replied}</p>
          <p className="text-[10px] text-muted-foreground">Replied</p>
        </CardContent></Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* LEFT: Actions */}
        <div className="space-y-4">
          {/* Discover */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="h-4 w-4" /> Discover Prospects
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Job Title</Label>
                  <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="CEO" className="h-8 text-sm" />
                  <div className="flex flex-wrap gap-1 mt-1">
                    {JOB_PRESETS.map((p) => (
                      <Badge key={p} variant="outline" className="text-[10px] cursor-pointer hover:bg-accent px-1.5 py-0" onClick={() => setJobTitle(p)}>{p}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Location</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {LOCATIONS.map((l) => (
                      <Badge key={l} variant={location === l ? "default" : "outline"} className="text-[10px] cursor-pointer px-1.5 py-0" onClick={() => setLocation(l)}>
                        {l.replace("United ", "")}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              <Button onClick={startScrape} disabled={scraping} size="sm" className="w-full">
                {scraping ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Search className="mr-2 h-3 w-3" />}
                {scraping ? scrapeStatus : "Run Scrape"}
              </Button>
            </CardContent>
          </Card>

          {/* Daily Run */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Play className="h-4 w-4" /> Daily Cycle
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button onClick={runDailyCycle} disabled={running} size="sm" className="w-full">
                {running ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Play className="mr-2 h-3 w-3" />}
                {running ? runPhase : "Run Daily Cycle"}
              </Button>
              <p className="text-[10px] text-muted-foreground mt-1">Check connections → Follow-ups → Scan inbox</p>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: Live Feed */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              Live Feed
              <span className="text-xs font-normal text-muted-foreground ml-auto">{logs.length} events</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[420px]" ref={scrollRef}>
              <div className="divide-y">
                {logs.map((entry) => (
                  <div key={entry.id} className="px-3 py-2 hover:bg-muted/30">
                    <div className="flex items-start gap-2">
                      <LevelIcon success={entry.success} error={entry.errorCode} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Badge variant="secondary" className={`text-[9px] px-1 py-0 ${ACTION_COLORS[entry.action] || "bg-gray-100"}`}>
                            {entry.action.replace(/_/g, " ")}
                          </Badge>
                          {entry.duration && <span className="text-[9px] text-muted-foreground font-mono">{entry.duration > 1000 ? `${(entry.duration / 1000).toFixed(1)}s` : `${entry.duration}ms`}</span>}
                          <span className="text-[9px] text-muted-foreground ml-auto">{formatTime(entry.createdAt)}</span>
                        </div>
                        <p className="text-xs leading-snug">{entry.request}</p>
                        {entry.errorCode && <p className="text-[10px] text-red-500">{entry.errorCode}</p>}
                      </div>
                    </div>
                  </div>
                ))}
                {logs.length === 0 && (
                  <div className="py-8 text-center text-muted-foreground text-sm">
                    No activity yet. Run a scrape or daily cycle.
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
