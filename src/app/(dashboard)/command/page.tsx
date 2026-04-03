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
  Activity, CheckCircle, XCircle, Info,
  Play, Search, Loader2, Users, Send, Inbox, UserCheck,
  Sparkles, RefreshCw, MessageSquare,
} from "lucide-react";

interface LogEntry {
  id: string; action: string; request: string | null;
  success: boolean; errorCode: string | null; duration: number | null; createdAt: string;
}

const AC: Record<string, string> = {
  apify_scrape: "bg-orange-100 text-orange-700", linkedin_search: "bg-blue-100 text-blue-700",
  enrich_contacts: "bg-indigo-100 text-indigo-700", score_contact: "bg-amber-100 text-amber-700",
  send_invite: "bg-purple-100 text-purple-700", check_connection: "bg-cyan-100 text-cyan-700",
  generate_followup: "bg-emerald-100 text-emerald-700", send_message: "bg-pink-100 text-pink-700",
  scan_inbox: "bg-teal-100 text-teal-700", test_linkedin: "bg-gray-100 text-gray-700",
};

function Ico({ s, e }: { s: boolean; e: string | null }) {
  if (!s && e) return <XCircle className="h-3 w-3 text-red-500 shrink-0" />;
  return <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />;
}

function fmtTime(d: string) { return new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }

const JOBS = ["CEO", "Co-Founder", "CFO", "Head of Capital Markets", "VP Lending", "Managing Director"];
const LOCS = ["United Kingdom", "United States", "Europe", "Singapore"];

export default function CommandCenter() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [uptime, setUptime] = useState(0);
  const [stats, setStats] = useState({ total: 0, toContact: 0, invited: 0, connected: 0, followedUp: 0, replied: 0 });

  // Discovery
  const [jobTitle, setJobTitle] = useState("CEO");
  const [location, setLocation] = useState("United Kingdom");
  const [scraping, setScraping] = useState(false);
  const [scrapeMsg, setScrapeMsg] = useState("");

  // Pipeline actions
  const [enriching, setEnriching] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [preparingInvites, setPreparingInvites] = useState(false);
  const [checkingConns, setCheckingConns] = useState(false);
  const [preparingFollowups, setPreparingFollowups] = useState(false);
  const [scanningInbox, setScanningInbox] = useState(false);
  const [runningCycle, setRunningCycle] = useState(false);
  const [cyclePhase, setCyclePhase] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    try { const r = await fetch("/api/logs?limit=60"); const d = await r.json(); setLogs(d.logs || []); } catch {}
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const statuses = ["TO_CONTACT", "INVITED", "CONNECTED", "FOLLOWED_UP", "REPLIED"];
      const results = await Promise.all(
        statuses.map(s => fetch(`/api/contacts?status=${s}&limit=1`).then(r => r.json()).then(d => ({ s, n: d.total })))
      );
      const total = await fetch("/api/contacts?limit=1").then(r => r.json()).then(d => d.total);
      const m: Record<string, number> = {};
      results.forEach(r => m[r.s] = r.n);
      setStats({ total, toContact: m.TO_CONTACT || 0, invited: m.INVITED || 0, connected: m.CONNECTED || 0, followedUp: m.FOLLOWED_UP || 0, replied: m.REPLIED || 0 });
    } catch {}
  }, []);

  useEffect(() => { fetchLogs(); fetchStats(); const i = setInterval(() => { fetchLogs(); fetchStats(); }, 5000); return () => clearInterval(i); }, [fetchLogs, fetchStats]);
  useEffect(() => { const i = setInterval(() => setUptime(u => u + 1), 1000); return () => clearInterval(i); }, []);

  // --- Actions ---
  const startScrape = async () => {
    setScraping(true); setScrapeMsg("Starting Apify...");
    try {
      const r = await fetch("/api/discover/apify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keywords: jobTitle, geography: location, maxResults: 25 }) });
      const d = await r.json();
      if (d.error) { toast.error(d.error); setScraping(false); return; }
      const { runId, datasetId } = d;
      for (let i = 0; i < 36; i++) {
        await new Promise(r => setTimeout(r, 10000));
        setScrapeMsg(`Running... ${(i + 1) * 10}s`);
        fetchLogs();
        const p = await fetch(`/api/discover/apify?runId=${runId}&datasetId=${datasetId}`);
        const pd = await p.json();
        if (pd.status === "SUCCEEDED" || pd.total > 0) {
          toast.success(`${pd.created} new contacts saved!`);
          setScrapeMsg(`Done! ${pd.created} new`);
          fetchStats(); fetchLogs(); setScraping(false); return;
        }
        if (pd.status === "FAILED" || pd.status === "ABORTED") {
          toast.error("Actor failed"); setScrapeMsg("Failed"); setScraping(false); return;
        }
      }
      toast.warning("Timed out"); setScrapeMsg("Timed out");
    } catch { toast.error("Error"); setScrapeMsg("Error"); }
    setScraping(false);
  };

  const enrichContacts = async () => {
    setEnriching(true);
    try {
      const r = await fetch("/api/contacts?status=TO_CONTACT&limit=50");
      const d = await r.json();
      const ids = (d.contacts || []).filter((c: { linkedinProfileId: string | null }) => !c.linkedinProfileId).map((c: { id: string }) => c.id);
      if (ids.length === 0) { toast.info("No contacts to enrich"); setEnriching(false); return; }
      toast.info(`Enriching ${ids.length} contacts...`);
      await fetch("/api/contacts/enrich", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactIds: ids.slice(0, 10) }) });
      fetchLogs(); toast.success("Enrichment complete");
    } catch { toast.error("Enrichment failed"); }
    setEnriching(false);
  };

  const scoreContacts = async () => {
    setScoring(true);
    try {
      const r = await fetch("/api/contacts?status=TO_CONTACT&limit=50");
      const d = await r.json();
      const ids = (d.contacts || []).filter((c: { fitRationale: string | null }) => !c.fitRationale).map((c: { id: string }) => c.id);
      if (ids.length === 0) { toast.info("No contacts to score"); setScoring(false); return; }
      toast.info(`Scoring ${ids.length} contacts...`);
      await fetch("/api/discover/score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactIds: ids.slice(0, 10) }) });
      fetchLogs(); fetchStats(); toast.success("Scoring complete");
    } catch { toast.error("Scoring failed"); }
    setScoring(false);
  };

  const prepareInvites = async () => {
    setPreparingInvites(true);
    try {
      const r = await fetch("/api/invites/prepare", { method: "POST" });
      const d = await r.json();
      if (d.error) { toast.error(d.error); } else { toast.success(`Prepared ${d.items?.length || 0} invites — go to Invites page to review`); }
      fetchLogs();
    } catch { toast.error("Failed"); }
    setPreparingInvites(false);
  };

  const checkConnections = async () => {
    setCheckingConns(true);
    try {
      const r = await fetch("/api/followups/check-connections", { method: "POST" });
      const d = await r.json();
      toast.success(`Checked ${d.checked} — ${d.newConnections} new connections`);
      fetchLogs(); fetchStats();
    } catch { toast.error("Failed"); }
    setCheckingConns(false);
  };

  const prepareFollowups = async () => {
    setPreparingFollowups(true);
    try {
      const r = await fetch("/api/followups/prepare", { method: "POST" });
      const d = await r.json();
      if (d.drafts?.length > 0) { toast.success(`${d.drafts.length} follow-up drafts ready — go to Follow-ups to review`); }
      else { toast.info("No contacts due for follow-up"); }
      fetchLogs();
    } catch { toast.error("Failed"); }
    setPreparingFollowups(false);
  };

  const scanInbox = async () => {
    setScanningInbox(true);
    try {
      const r = await fetch("/api/inbox/scan", { method: "POST" });
      const d = await r.json();
      toast.success(`Scanned ${d.scanned || 0} conversations — ${d.matches?.length || 0} replies`);
      fetchLogs(); fetchStats();
    } catch { toast.error("Failed"); }
    setScanningInbox(false);
  };

  const runFullCycle = async () => {
    setRunningCycle(true);
    try {
      setCyclePhase("1/4 Check connections"); await fetch("/api/followups/check-connections", { method: "POST" }); fetchLogs();
      setCyclePhase("2/4 Prepare follow-ups"); await fetch("/api/followups/prepare", { method: "POST" }); fetchLogs();
      setCyclePhase("3/4 Scan inbox"); await fetch("/api/inbox/scan", { method: "POST" }); fetchLogs();
      setCyclePhase("4/4 Done!"); fetchStats(); toast.success("Daily cycle complete");
    } catch { toast.error("Cycle failed"); setCyclePhase("Failed"); }
    setRunningCycle(false);
  };

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Activity className="h-6 w-6" />Command Center</h1>
          <p className="text-muted-foreground text-sm">Full pipeline: Discover → Enrich → Score → Invite → Follow-up → Reply</p>
        </div>
        <div className="font-mono text-lg text-muted-foreground">{fmt(uptime)}</div>
      </div>

      {/* Pipeline Stats */}
      <div className="grid grid-cols-6 gap-2">
        {[
          { label: "Total", n: stats.total, icon: Users, color: "" },
          { label: "To Contact", n: stats.toContact, icon: Search, color: "text-gray-500" },
          { label: "Invited", n: stats.invited, icon: Send, color: "text-blue-500" },
          { label: "Connected", n: stats.connected, icon: UserCheck, color: "text-green-500" },
          { label: "Followed Up", n: stats.followedUp, icon: MessageSquare, color: "text-yellow-500" },
          { label: "Replied", n: stats.replied, icon: Inbox, color: "text-purple-500" },
        ].map(s => (
          <Card key={s.label}><CardContent className="p-2 text-center">
            <s.icon className={`h-3 w-3 mx-auto mb-0.5 ${s.color}`} />
            <p className="text-lg font-bold">{s.n}</p>
            <p className="text-[9px] text-muted-foreground">{s.label}</p>
          </CardContent></Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* LEFT: Pipeline Actions (3 cols) */}
        <div className="lg:col-span-3 space-y-3">
          {/* Step 1: Discover */}
          <Card>
            <CardHeader className="py-2 px-4"><CardTitle className="text-sm flex items-center gap-2"><Badge className="bg-orange-100 text-orange-700 text-[10px]">1</Badge>Discover Prospects</CardTitle></CardHeader>
            <CardContent className="px-4 pb-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px]">Job Title</Label>
                  <Input value={jobTitle} onChange={e => setJobTitle(e.target.value)} className="h-7 text-xs" />
                  <div className="flex flex-wrap gap-1 mt-1">{JOBS.map(j => <Badge key={j} variant="outline" className="text-[9px] cursor-pointer hover:bg-accent px-1 py-0" onClick={() => setJobTitle(j)}>{j}</Badge>)}</div>
                </div>
                <div>
                  <Label className="text-[10px]">Location</Label>
                  <div className="flex flex-wrap gap-1 mt-1">{LOCS.map(l => <Badge key={l} variant={location === l ? "default" : "outline"} className="text-[9px] cursor-pointer px-1 py-0" onClick={() => setLocation(l)}>{l.replace("United ","")}</Badge>)}</div>
                </div>
              </div>
              <Button onClick={startScrape} disabled={scraping} size="sm" className="w-full h-7 text-xs">
                {scraping ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" />{scrapeMsg}</> : <><Search className="mr-1 h-3 w-3" />Run Apify Scrape</>}
              </Button>
            </CardContent>
          </Card>

          {/* Steps 2-3: Enrich + Score */}
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardHeader className="py-2 px-4"><CardTitle className="text-sm flex items-center gap-2"><Badge className="bg-indigo-100 text-indigo-700 text-[10px]">2</Badge>Enrich</CardTitle></CardHeader>
              <CardContent className="px-4 pb-3">
                <Button onClick={enrichContacts} disabled={enriching} size="sm" className="w-full h-7 text-xs" variant="outline">
                  {enriching ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                  Enrich Profiles
                </Button>
                <p className="text-[9px] text-muted-foreground mt-1">Fetch LinkedIn profileId for invites</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-2 px-4"><CardTitle className="text-sm flex items-center gap-2"><Badge className="bg-amber-100 text-amber-700 text-[10px]">3</Badge>Score</CardTitle></CardHeader>
              <CardContent className="px-4 pb-3">
                <Button onClick={scoreContacts} disabled={scoring} size="sm" className="w-full h-7 text-xs" variant="outline">
                  {scoring ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
                  ICP Score
                </Button>
                <p className="text-[9px] text-muted-foreground mt-1">LLM rates HIGH/MED/LOW fit</p>
              </CardContent>
            </Card>
          </div>

          {/* Step 4: Prepare Invites */}
          <Card>
            <CardHeader className="py-2 px-4"><CardTitle className="text-sm flex items-center gap-2"><Badge className="bg-purple-100 text-purple-700 text-[10px]">4</Badge>Prepare Invites</CardTitle></CardHeader>
            <CardContent className="px-4 pb-3">
              <Button onClick={prepareInvites} disabled={preparingInvites} size="sm" className="w-full h-7 text-xs" variant="outline">
                {preparingInvites ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
                Generate Connection Notes (LLM)
              </Button>
              <p className="text-[9px] text-muted-foreground mt-1">Creates batch with personalized 300-char notes → review in Invites page</p>
            </CardContent>
          </Card>

          {/* Steps 5-7: Post-invite */}
          <div className="grid grid-cols-3 gap-2">
            <Card>
              <CardHeader className="py-2 px-3"><CardTitle className="text-xs flex items-center gap-1"><Badge className="bg-cyan-100 text-cyan-700 text-[9px]">5</Badge>Connections</CardTitle></CardHeader>
              <CardContent className="px-3 pb-2">
                <Button onClick={checkConnections} disabled={checkingConns} size="sm" className="w-full h-7 text-[10px]" variant="outline">
                  {checkingConns ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-2 px-3"><CardTitle className="text-xs flex items-center gap-1"><Badge className="bg-emerald-100 text-emerald-700 text-[9px]">6</Badge>Follow-ups</CardTitle></CardHeader>
              <CardContent className="px-3 pb-2">
                <Button onClick={prepareFollowups} disabled={preparingFollowups} size="sm" className="w-full h-7 text-[10px]" variant="outline">
                  {preparingFollowups ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquare className="h-3 w-3" />}
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-2 px-3"><CardTitle className="text-xs flex items-center gap-1"><Badge className="bg-teal-100 text-teal-700 text-[9px]">7</Badge>Inbox</CardTitle></CardHeader>
              <CardContent className="px-3 pb-2">
                <Button onClick={scanInbox} disabled={scanningInbox} size="sm" className="w-full h-7 text-[10px]" variant="outline">
                  {scanningInbox ? <Loader2 className="h-3 w-3 animate-spin" /> : <Inbox className="h-3 w-3" />}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Full Cycle */}
          <Card className="border-primary/30">
            <CardContent className="p-3">
              <Button onClick={runFullCycle} disabled={runningCycle} size="sm" className="w-full">
                {runningCycle ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{cyclePhase}</> : <><Play className="mr-2 h-4 w-4" />Run Full Daily Cycle</>}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: Live Feed (2 cols) */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="py-2 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                Live Feed
                <span className="text-[10px] font-normal text-muted-foreground ml-auto">{logs.length} events</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[560px]" ref={scrollRef}>
                <div className="divide-y">
                  {logs.map(e => (
                    <div key={e.id} className="px-3 py-1.5 hover:bg-muted/30">
                      <div className="flex items-start gap-1.5">
                        <Ico s={e.success} e={e.errorCode} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 mb-0.5">
                            <Badge variant="secondary" className={`text-[8px] px-1 py-0 ${AC[e.action] || "bg-gray-100"}`}>{e.action.replace(/_/g, " ")}</Badge>
                            {e.duration && <span className="text-[8px] text-muted-foreground font-mono">{e.duration > 1000 ? `${(e.duration/1000).toFixed(1)}s` : `${e.duration}ms`}</span>}
                            <span className="text-[8px] text-muted-foreground ml-auto">{fmtTime(e.createdAt)}</span>
                          </div>
                          <p className="text-[11px] leading-snug">{e.request}</p>
                          {e.errorCode && <p className="text-[9px] text-red-500">{e.errorCode}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                  {logs.length === 0 && <div className="py-8 text-center text-muted-foreground text-xs">No activity yet</div>}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
