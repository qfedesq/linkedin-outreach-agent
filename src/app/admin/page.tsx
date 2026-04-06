"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users, Activity, Send, UserCheck, MessageSquare, TrendingUp, AlertTriangle,
  Download, Brain, DollarSign, Clock, Megaphone, CheckCircle, XCircle,
} from "lucide-react";

interface UserStat {
  email: string;
  name: string;
  linkedin: boolean;
  openrouter: boolean;
  campaigns: number;
  contacts: number;
  invites: number;
  connections: number;
  responses: number;
  followups: number;
  chatMsgs: number;
  tokens: number;
  cost: number;
}

interface AdminData {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  totalCampaigns: number;
  totalInvites: number;
  totalConnections: number;
  totalResponses: number;
  contactsByStage: { stage: string; count: number }[];
  contactsByUser: { user: string; count: number }[];
  tokenUsage: { month: string; tokens: number }[];
  usageTime: { totalHours: number; avgPerUser: number };
  topUsersByTime: { user: string; hours: number }[];
  users: UserStat[];
  ratios: { inviteAcceptanceRate: string; responseRate: string; avgTokensPerUser: number };
  totalCost: number;
  knowledge: Array<{ userEmail: string; category: string; content: string; source: string; createdAt: string }>;
  alerts: string[];
}

export default function AdminPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("month");
  const [showActiveOnly, setShowActiveOnly] = useState(false);

  useEffect(() => {
    setLoading(true);
    if (session?.user?.email === "federico.ledesma@protofire.io") {
      fetch(`/api/admin/stats?period=${period}`)
        .then(r => r.json())
        .then(setData)
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [session, period]);

  if (!session) return <div className="flex items-center justify-center h-screen text-muted-foreground">Loading session...</div>;
  if (session.user?.email !== "federico.ledesma@protofire.io") {
    return <div className="flex items-center justify-center h-screen text-destructive font-bold">403 Forbidden</div>;
  }
  if (loading) return <div className="flex items-center justify-center h-screen text-muted-foreground">Loading admin data...</div>;
  if (!data) return <div className="flex items-center justify-center h-screen text-destructive">Error loading data</div>;

  const filteredUsers = showActiveOnly
    ? data.users.filter(u => u.contacts > 0 || u.invites > 0 || u.chatMsgs > 0)
    : data.users;

  const exportCSV = () => {
    const headers = ["Email", "Name", "LinkedIn", "OpenRouter", "Campaigns", "Contacts", "Invites", "Connections", "Responses", "Follow-ups", "Chat Msgs", "Tokens", "Cost"];
    const rows = data.users.map(u => [
      u.email, u.name || "", u.linkedin ? "Yes" : "No", u.openrouter ? "Yes" : "No",
      u.campaigns, u.contacts, u.invites, u.connections, u.responses, u.followups,
      u.chatMsgs, u.tokens, `$${u.cost.toFixed(4)}`,
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `admin-stats-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">Platform overview for @protofire.io</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="text-sm border border-border rounded-lg px-3 py-1.5 bg-card"
          >
            <option value="month">Last 30 days</option>
            <option value="quarter">Last 90 days</option>
          </select>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-1" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <div className="space-y-1">
                {data.alerts.map((a, i) => (
                  <p key={i} className="text-sm text-foreground">{a}</p>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <KPICard icon={Users} label="Total Users" value={data.totalUsers} />
        <KPICard icon={Activity} label="Active Users" value={data.activeUsers} accent />
        <KPICard icon={XCircle} label="Inactive" value={data.inactiveUsers} />
        <KPICard icon={Megaphone} label="Campaigns" value={data.totalCampaigns} />
        <KPICard icon={Send} label="Invites Sent" value={data.totalInvites} />
        <KPICard icon={UserCheck} label="Connections" value={data.totalConnections} />
        <KPICard icon={MessageSquare} label="Responses" value={data.totalResponses} />
        <KPICard icon={Clock} label="Total Hours" value={data.usageTime.totalHours} />
        <KPICard icon={Brain} label="Avg Tokens/User" value={data.ratios.avgTokensPerUser} />
        <KPICard icon={DollarSign} label="Total Cost" value={`$${data.totalCost.toFixed(2)}`} />
      </div>

      {/* Ratios */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Invite Acceptance Rate</p>
              <p className="text-2xl font-bold mt-1">{data.ratios.inviteAcceptanceRate}</p>
            </div>
            <TrendingUp className="w-8 h-8 text-primary/20" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Response Rate</p>
              <p className="text-2xl font-bold mt-1">{data.ratios.responseRate}</p>
            </div>
            <MessageSquare className="w-8 h-8 text-primary/20" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Avg Hours/User</p>
              <p className="text-2xl font-bold mt-1">{data.usageTime.avgPerUser}h</p>
            </div>
            <Clock className="w-8 h-8 text-primary/20" />
          </CardContent>
        </Card>
      </div>

      {/* User Details Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">User Details</CardTitle>
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={showActiveOnly}
                onChange={e => setShowActiveOnly(e.target.checked)}
                className="rounded border-border"
              />
              Active only
            </label>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 pr-4 text-xs text-muted-foreground font-bold">User</th>
                  <th className="pb-2 pr-3 text-xs text-muted-foreground font-bold text-center">LinkedIn</th>
                  <th className="pb-2 pr-3 text-xs text-muted-foreground font-bold text-center">OpenRouter</th>
                  <th className="pb-2 pr-3 text-xs text-muted-foreground font-bold text-center">Campaigns</th>
                  <th className="pb-2 pr-3 text-xs text-muted-foreground font-bold text-center">Contacts</th>
                  <th className="pb-2 pr-3 text-xs text-muted-foreground font-bold text-center">Invites</th>
                  <th className="pb-2 pr-3 text-xs text-muted-foreground font-bold text-center">Connections</th>
                  <th className="pb-2 pr-3 text-xs text-muted-foreground font-bold text-center">Responses</th>
                  <th className="pb-2 pr-3 text-xs text-muted-foreground font-bold text-center">Follow-ups</th>
                  <th className="pb-2 pr-3 text-xs text-muted-foreground font-bold text-center">Chat Msgs</th>
                  <th className="pb-2 pr-3 text-xs text-muted-foreground font-bold text-center">Tokens</th>
                  <th className="pb-2 text-xs text-muted-foreground font-bold text-center">Cost</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => (
                  <tr key={u.email} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    <td className="py-2.5 pr-4">
                      <div>
                        <p className="font-medium text-foreground">{u.name || u.email.split("@")[0]}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-center">
                      <StatusBadge ok={u.linkedin} />
                    </td>
                    <td className="py-2.5 pr-3 text-center">
                      <StatusBadge ok={u.openrouter} />
                    </td>
                    <td className="py-2.5 pr-3 text-center font-mono">{u.campaigns}</td>
                    <td className="py-2.5 pr-3 text-center font-mono font-bold">{u.contacts}</td>
                    <td className="py-2.5 pr-3 text-center font-mono">{u.invites}</td>
                    <td className="py-2.5 pr-3 text-center font-mono">{u.connections}</td>
                    <td className="py-2.5 pr-3 text-center font-mono">{u.responses}</td>
                    <td className="py-2.5 pr-3 text-center font-mono">{u.followups}</td>
                    <td className="py-2.5 pr-3 text-center font-mono">{u.chatMsgs}</td>
                    <td className="py-2.5 pr-3 text-center font-mono">{u.tokens > 0 ? `${(u.tokens / 1000).toFixed(1)}k` : "0"}</td>
                    <td className="py-2.5 text-center font-mono">{u.cost > 0 ? `$${u.cost.toFixed(4)}` : "$0"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pipeline by Stage */}
      {data.contactsByStage.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Pipeline by Stage</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {data.contactsByStage.map(s => (
                <div key={s.stage} className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                  <span className="text-xs text-muted-foreground">{s.stage}</span>
                  <Badge variant="outline" className="font-mono">{s.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Knowledge Base — All Users */}
      {data.knowledge && data.knowledge.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="w-4 h-4" />
                Knowledge Base — All Users ({data.knowledge.length} entries)
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.knowledge.map((k, i) => (
                <div key={i} className="border border-border/50 rounded-lg p-3 hover:bg-accent/20 transition-colors">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Badge variant="outline" className="text-[10px]">{k.category}</Badge>
                    <span className="text-[10px] text-muted-foreground">{k.userEmail}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{new Date(k.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-xs text-foreground/80 leading-relaxed">{k.content}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KPICard({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: string | number; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`w-4 h-4 ${accent ? "text-primary" : "text-muted-foreground"}`} />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className={`text-xl font-bold font-mono ${accent ? "text-primary" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ ok }: { ok: boolean }) {
  return ok
    ? <CheckCircle className="w-4 h-4 text-green-500 inline-block" />
    : <XCircle className="w-4 h-4 text-muted-foreground/40 inline-block" />;
}
