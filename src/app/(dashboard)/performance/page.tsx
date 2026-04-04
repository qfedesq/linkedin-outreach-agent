"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TrendingUp, Target, MessageSquare, Users, Calendar } from "lucide-react";

interface PerfData {
  funnel: Record<string, number>;
  rates: { inviteRate: number; acceptRate: number; replyRate: number; meetingRate: number };
  messages: { totalSent: number; totalAccepted: number; overallRate: number; topAccepted: string[]; recentRejected: string[] };
  topProfiles: Array<{ name: string; company: string; fit: string; message: string }>;
  fitDistribution: Record<string, number>;
  fitPerformance: Record<string, { sent: number; accepted: number; rate: number }>;
  recentActivity: Array<{ action: string; request: string; success: boolean; createdAt: string }>;
}

function RateBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground font-medium">{label}</span>
        <span className={cn("font-mono font-bold", color)}>{value}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color.replace("text-", "bg-"))} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

export default function PerformancePage() {
  const [data, setData] = useState<PerfData | null>(null);
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    fetch("/api/campaigns").then(r => r.json()).then(d => setCampaigns(d.campaigns || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const params = campaignFilter !== "all" ? `?campaignId=${campaignFilter}` : "";
    fetch(`/api/performance${params}`).then(r => r.json()).then(setData).catch(() => {});
  }, [campaignFilter]);

  if (!data) return <div className="py-20 text-center text-muted-foreground">Loading performance data...</div>;

  const funnel = data.funnel;
  const funnelSteps = [
    { key: "total", label: "Contacts", color: "bg-foreground/10" },
    { key: "INVITED", label: "Invited", color: "bg-primary/30" },
    { key: "CONNECTED", label: "Connected", color: "bg-warning/30" },
    { key: "FOLLOWED_UP", label: "Followed Up", color: "bg-tertiary/30" },
    { key: "REPLIED", label: "Replied", color: "bg-success/30" },
    { key: "MEETING_BOOKED", label: "Meetings", color: "bg-primary/50" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><TrendingUp className="h-6 w-6" />Performance</h1>
        <p className="text-sm text-muted-foreground">Campaign analytics and learning insights</p>
      </div>
      <Select value={campaignFilter} onValueChange={(v) => { if (v) setCampaignFilter(v); }}>
        <SelectTrigger className="w-48"><SelectValue placeholder="All campaigns" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All campaigns</SelectItem>
          {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>

      {/* Conversion Funnel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Conversion Funnel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex h-14 rounded overflow-hidden">
            {funnelSteps.map((step, i) => {
              const count = funnel[step.key] || 0;
              const maxCount = funnel.total || 1;
              const width = Math.max(count / maxCount * 100, count > 0 ? 5 : 1);
              return (
                <div key={step.key} className={cn("h-full flex items-center justify-center border-r border-background/30 transition-all", step.color)} style={{ width: `${width}%` }}>
                  {width > 8 && <span className="font-mono text-xs font-bold">{count}</span>}
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-6 gap-2">
            {funnelSteps.map(step => (
              <div key={step.key} className="text-center">
                <p className="font-mono text-lg font-bold">{funnel[step.key] || 0}</p>
                <p className="text-[10px] text-muted-foreground uppercase font-bold">{step.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Conversion Rates */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4" />Conversion Rates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <RateBar label="Outreach Rate (contacts → invited)" value={data.rates.inviteRate} color="text-primary" />
            <RateBar label="Accept Rate (invited → connected)" value={data.rates.acceptRate} color="text-warning" />
            <RateBar label="Reply Rate (connected → replied)" value={data.rates.replyRate} color="text-success" />
            <RateBar label="Meeting Rate (replied → booked)" value={data.rates.meetingRate} color="text-tertiary" />
          </CardContent>
        </Card>

        {/* ICP Fit Performance */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" />Performance by ICP Fit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(["HIGH", "MEDIUM", "LOW"] as const).map(fit => {
                const perf = data.fitPerformance[fit];
                const colors = { HIGH: "text-success", MEDIUM: "text-warning", LOW: "text-muted-foreground" };
                return (
                  <div key={fit} className="flex items-center gap-4">
                    <Badge variant="secondary" className={cn("w-16 justify-center text-[10px]",
                      fit === "HIGH" ? "bg-success/10 text-success" :
                      fit === "MEDIUM" ? "bg-warning/10 text-warning" :
                      "bg-muted text-muted-foreground"
                    )}>{fit}</Badge>
                    <div className="flex-1">
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full", colors[fit].replace("text-", "bg-"))} style={{ width: `${perf?.rate || 0}%` }} />
                      </div>
                    </div>
                    <div className="text-right w-24">
                      <span className={cn("font-mono text-sm font-bold", colors[fit])}>{perf?.rate || 0}%</span>
                      <span className="text-[10px] text-muted-foreground ml-1">({perf?.accepted || 0}/{perf?.sent || 0})</span>
                    </div>
                  </div>
                );
              })}
              <div className="pt-2 border-t border-border">
                <p className="text-[10px] text-muted-foreground uppercase font-bold mb-2">Distribution</p>
                <div className="flex gap-4">
                  {(["HIGH", "MEDIUM", "LOW"] as const).map(fit => (
                    <div key={fit} className="text-center">
                      <p className="font-mono font-bold">{data.fitDistribution[fit]}</p>
                      <p className="text-[10px] text-muted-foreground">{fit}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Message Performance */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Message Performance
            <Badge variant="outline" className="ml-2 text-[10px]">
              {data.messages.totalSent} sent / {data.messages.totalAccepted} accepted ({data.messages.overallRate}%)
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.messages.topAccepted.length > 0 ? (
            <div className="space-y-3">
              <p className="text-[10px] text-success uppercase font-bold tracking-wider">Top Performing Messages (led to connections)</p>
              {data.messages.topAccepted.map((msg, i) => (
                <div key={i} className="p-3 bg-success/5 border border-success/20 rounded text-xs leading-relaxed">
                  {msg}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No message performance data yet. Send invites to start tracking which messages get accepted.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Top Converting Profiles */}
      {data.topProfiles.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Calendar className="h-4 w-4" />Top Converting Profiles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.topProfiles.slice(0, 10).map((p, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <span className="text-xs font-bold w-6 text-muted-foreground">{i + 1}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground">{p.company}</p>
                  </div>
                  <Badge variant="secondary" className={cn("text-[10px]",
                    p.fit === "HIGH" ? "bg-success/10 text-success" :
                    p.fit === "MEDIUM" ? "bg-warning/10 text-warning" :
                    "bg-muted"
                  )}>{p.fit}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
